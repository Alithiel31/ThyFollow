// src/pages/ReportPage.tsx — rapport de synthèse imprimable (PDF via le
// navigateur). Route hors AppShell : pas de sidebar sur le papier.
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { ArrowLeft, Printer, Download, Activity } from 'lucide-react';
import { analyticsApi } from '../lib/api';
import { useAuthStore } from '../lib/store';
import { formatDate, symptomLabel } from '../lib/utils';
import { LAB_RANGES } from '../types';
import type { ReportData } from '../types';
import styles from './ReportPage.module.css';

function freqLabel(t: TFunction, freq: string): string {
  return t(`medications.frequency.${freq}`, { defaultValue: freq }).toLowerCase();
}

function buildCSV(report: ReportData, t: TFunction): string {
  const rows: string[][] = [
    [t('report.csv.indicator'), t('report.csv.value')],
    [t('report.csv.periodStart'), report.period.from.slice(0, 10)],
    [t('report.csv.periodEnd'), report.period.to.slice(0, 10)],
    [t('report.csv.daysLogged'), String(report.totalEntries)],
    [t('report.csv.medicationAdherence'), report.medicationAdherence != null ? String(report.medicationAdherence) : ''],
  ];
  for (const [key, value] of Object.entries(report.scores)) {
    rows.push([t('report.csv.averageScore', { symptom: symptomLabel(key) }), value != null ? String(value) : '']);
  }
  rows.push(
    [t('report.csv.averageWeight'), report.physical.weight != null ? String(report.physical.weight) : ''],
    [t('report.csv.averageTemperature'), report.physical.bodyTemperature != null ? String(report.physical.bodyTemperature) : ''],
    [t('report.csv.averageHeartRate'), report.physical.heartRate != null ? String(report.physical.heartRate) : ''],
    [t('report.csv.averageSleep'), report.physical.sleepHours != null ? String(report.physical.sleepHours) : ''],
  );
  for (const lab of report.labResults) {
    if (lab.tsh != null) rows.push([`TSH ${lab.date.slice(0, 10)} (mUI/L)`, String(lab.tsh)]);
    if (lab.ft4 != null) rows.push([`FT4 ${lab.date.slice(0, 10)} (pmol/L)`, String(lab.ft4)]);
    if (lab.ft3 != null) rows.push([`FT3 ${lab.date.slice(0, 10)} (pmol/L)`, String(lab.ft3)]);
  }
  // ; comme séparateur : Excel FR l'attend, et BOM UTF-8 pour les accents
  return '﻿' + rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(';')).join('\r\n');
}

function downloadCSV(report: ReportData, t: TFunction): void {
  const blob = new Blob([buildCSV(report, t)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `thyrotrack-rapport-${report.period.from.slice(0, 10)}-${report.period.to.slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function ReportPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';

  const { data: report, isLoading, isError } = useQuery({
    queryKey: ['report', from, to],
    queryFn: () => analyticsApi.report(from, to).then((r) => r.data),
    enabled: Boolean(from && to),
  });

  if (!from || !to) return <div className={styles.state}>{t('report.missingPeriod')}</div>;
  if (isLoading) return <div className={styles.state}><div className="spinner" /></div>;
  if (isError || !report) return <div className={styles.state}>{t('report.loadError')}</div>;

  const scoreEntries = Object.entries(report.scores).filter(([, v]) => v != null);

  return (
    <div className={styles.page}>
      {/* Barre d'actions — masquée à l'impression */}
      <div className={styles.toolbar}>
        <button className={styles.toolBtn} onClick={() => navigate(-1)}>
          <ArrowLeft size={16} /> {t('report.back')}
        </button>
        <div className={styles.toolbarRight}>
          <button className={styles.toolBtn} onClick={() => downloadCSV(report, t)}>
            <Download size={16} /> {t('report.csvButton')}
          </button>
          <button className={`${styles.toolBtn} ${styles.toolBtnPrimary}`} onClick={() => window.print()}>
            <Printer size={16} /> {t('report.printButton')}
          </button>
        </div>
      </div>

      {/* Document */}
      <div className={styles.sheet}>
        <header className={styles.header}>
          <div className={styles.brand}>
            <Activity size={18} /> {t('app.name')}
          </div>
          <h1 className={styles.title}>{t('report.docTitle')}</h1>
          <p className={styles.meta}>
            {t('report.meta', {
              count: report.totalEntries,
              name: user?.name,
              from: formatDate(from),
              to: formatDate(to),
            })}
          </p>
        </header>

        {report.medicationAdherence != null && (
          <section className={styles.section}>
            <h2>{t('report.medicationAdherenceSection')}</h2>
            <p className={styles.bigValue}>{report.medicationAdherence} %</p>
          </section>
        )}

        {scoreEntries.length > 0 && (
          <section className={styles.section}>
            <h2>{t('report.scoresSection')}</h2>
            <table className={styles.table}>
              <tbody>
                {scoreEntries.map(([key, value]) => (
                  <tr key={key}>
                    <td>{symptomLabel(key)}</td>
                    <td className={styles.num}>{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <section className={styles.section}>
          <h2>{t('report.physicalSection')}</h2>
          <table className={styles.table}>
            <tbody>
              <tr><td>{t('report.weight')}</td><td className={styles.num}>{report.physical.weight ?? '—'} kg</td></tr>
              <tr><td>{t('report.temperature')}</td><td className={styles.num}>{report.physical.bodyTemperature ?? '—'} °C</td></tr>
              <tr><td>{t('report.heartRate')}</td><td className={styles.num}>{report.physical.heartRate ?? '—'} bpm</td></tr>
              <tr><td>{t('report.sleep')}</td><td className={styles.num}>{report.physical.sleepHours ?? '—'} h</td></tr>
            </tbody>
          </table>
        </section>

        {report.labResults.length > 0 && (
          <section className={styles.section}>
            <h2>{t('report.labResultsSection')}</h2>
            <table className={styles.table}>
              <thead>
                <tr><th>Date</th><th>TSH ({LAB_RANGES.tsh.unit})</th><th>FT4 ({LAB_RANGES.ft4.unit})</th><th>FT3 ({LAB_RANGES.ft3.unit})</th><th>Anti-TPO</th></tr>
              </thead>
              <tbody>
                {report.labResults.map((lab) => (
                  <tr key={lab.id}>
                    <td>{formatDate(lab.date, 'd MMM yyyy')}</td>
                    <td className={styles.num}>{lab.tsh ?? '—'}</td>
                    <td className={styles.num}>{lab.ft4 ?? '—'}</td>
                    <td className={styles.num}>{lab.ft3 ?? '—'}</td>
                    <td className={styles.num}>{lab.antiTPO ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {report.activeMedications.length > 0 && (
          <section className={styles.section}>
            <h2>{t('report.medicationsSection')}</h2>
            <ul className={styles.medList}>
              {report.activeMedications.map((m, i) => (
                <li key={i}>
                  {t('report.medicationLine', {
                    name: m.name,
                    brand: m.brand ? ` (${m.brand})` : '',
                    dose: m.dosageMcg,
                    freq: freqLabel(t, m.frequency),
                    intakeTime: m.intakeTime ? t('report.intakeTimeSuffix', { time: m.intakeTime }) : '',
                  })}
                </li>
              ))}
            </ul>
          </section>
        )}

        <footer className={styles.footer}>
          {t('report.footer', { date: formatDate(new Date()) })}
        </footer>
      </div>
    </div>
  );
}
