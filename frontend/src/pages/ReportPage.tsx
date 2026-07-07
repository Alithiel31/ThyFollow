// src/pages/ReportPage.tsx — rapport de synthèse imprimable (PDF via le
// navigateur). Route hors AppShell : pas de sidebar sur le papier.
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Printer, Download, Activity } from 'lucide-react';
import { analyticsApi } from '../lib/api';
import { useAuthStore } from '../lib/store';
import { formatDate, SYMPTOM_LABELS } from '../lib/utils';
import { LAB_RANGES } from '../types';
import type { ReportData } from '../types';
import styles from './ReportPage.module.css';

const FREQ_LABELS: Record<string, string> = {
  DAILY: 'quotidien', EVERY_OTHER_DAY: 'un jour sur deux',
  WEEKLY: 'hebdomadaire', AS_NEEDED: 'si besoin',
};

function buildCSV(report: ReportData): string {
  const rows: string[][] = [
    ['Indicateur', 'Valeur'],
    ['Période début', report.period.from.slice(0, 10)],
    ['Période fin', report.period.to.slice(0, 10)],
    ['Jours renseignés', String(report.totalEntries)],
    ['Observance médicament (%)', report.medicationAdherence != null ? String(report.medicationAdherence) : ''],
  ];
  for (const [key, value] of Object.entries(report.scores)) {
    rows.push([`Moyenne ${SYMPTOM_LABELS[key] ?? key} (1-5)`, value != null ? String(value) : '']);
  }
  rows.push(
    ['Poids moyen (kg)', report.physical.weight != null ? String(report.physical.weight) : ''],
    ['Température moyenne (°C)', report.physical.bodyTemperature != null ? String(report.physical.bodyTemperature) : ''],
    ['Rythme cardiaque moyen', report.physical.heartRate != null ? String(report.physical.heartRate) : ''],
    ['Sommeil moyen (h)', report.physical.sleepHours != null ? String(report.physical.sleepHours) : ''],
  );
  for (const lab of report.labResults) {
    if (lab.tsh != null) rows.push([`TSH ${lab.date.slice(0, 10)} (mUI/L)`, String(lab.tsh)]);
    if (lab.ft4 != null) rows.push([`FT4 ${lab.date.slice(0, 10)} (pmol/L)`, String(lab.ft4)]);
    if (lab.ft3 != null) rows.push([`FT3 ${lab.date.slice(0, 10)} (pmol/L)`, String(lab.ft3)]);
  }
  // ; comme séparateur : Excel FR l'attend, et BOM UTF-8 pour les accents
  return '﻿' + rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(';')).join('\r\n');
}

function downloadCSV(report: ReportData): void {
  const blob = new Blob([buildCSV(report)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `thyrotrack-rapport-${report.period.from.slice(0, 10)}-${report.period.to.slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function ReportPage() {
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

  if (!from || !to) return <div className={styles.state}>Période manquante.</div>;
  if (isLoading) return <div className={styles.state}><div className="spinner" /></div>;
  if (isError || !report) return <div className={styles.state}>Impossible de charger le rapport.</div>;

  const scoreEntries = Object.entries(report.scores).filter(([, v]) => v != null);

  return (
    <div className={styles.page}>
      {/* Barre d'actions — masquée à l'impression */}
      <div className={styles.toolbar}>
        <button className={styles.toolBtn} onClick={() => navigate(-1)}>
          <ArrowLeft size={16} /> Retour
        </button>
        <div className={styles.toolbarRight}>
          <button className={styles.toolBtn} onClick={() => downloadCSV(report)}>
            <Download size={16} /> CSV
          </button>
          <button className={`${styles.toolBtn} ${styles.toolBtnPrimary}`} onClick={() => window.print()}>
            <Printer size={16} /> Imprimer / PDF
          </button>
        </div>
      </div>

      {/* Document */}
      <div className={styles.sheet}>
        <header className={styles.header}>
          <div className={styles.brand}>
            <Activity size={18} /> ThyroTrack
          </div>
          <h1 className={styles.title}>Rapport de suivi thyroïdien</h1>
          <p className={styles.meta}>
            {user?.name} — du {formatDate(from)} au {formatDate(to)}
            {' · '}{report.totalEntries} jour{report.totalEntries > 1 ? 's' : ''} renseigné{report.totalEntries > 1 ? 's' : ''}
          </p>
        </header>

        {report.medicationAdherence != null && (
          <section className={styles.section}>
            <h2>Observance du traitement</h2>
            <p className={styles.bigValue}>{report.medicationAdherence} %</p>
          </section>
        )}

        {scoreEntries.length > 0 && (
          <section className={styles.section}>
            <h2>Moyennes des symptômes (échelle 1–5)</h2>
            <table className={styles.table}>
              <tbody>
                {scoreEntries.map(([key, value]) => (
                  <tr key={key}>
                    <td>{SYMPTOM_LABELS[key] ?? key}</td>
                    <td className={styles.num}>{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <section className={styles.section}>
          <h2>Mesures physiques (moyennes)</h2>
          <table className={styles.table}>
            <tbody>
              <tr><td>Poids</td><td className={styles.num}>{report.physical.weight ?? '—'} kg</td></tr>
              <tr><td>Température</td><td className={styles.num}>{report.physical.bodyTemperature ?? '—'} °C</td></tr>
              <tr><td>Rythme cardiaque</td><td className={styles.num}>{report.physical.heartRate ?? '—'} bpm</td></tr>
              <tr><td>Sommeil</td><td className={styles.num}>{report.physical.sleepHours ?? '—'} h</td></tr>
            </tbody>
          </table>
        </section>

        {report.labResults.length > 0 && (
          <section className={styles.section}>
            <h2>Analyses de la période</h2>
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
            <h2>Traitement en cours</h2>
            <ul className={styles.medList}>
              {report.activeMedications.map((m, i) => (
                <li key={i}>
                  {m.name}{m.brand ? ` (${m.brand})` : ''} — {m.dosageMcg} µg, {FREQ_LABELS[m.frequency]}
                  {m.intakeTime ? ` à ${m.intakeTime}` : ''}
                </li>
              ))}
            </ul>
          </section>
        )}

        <footer className={styles.footer}>
          Généré par ThyroTrack le {formatDate(new Date())} — données déclaratives saisies par le patient,
          à interpréter avec un professionnel de santé.
        </footer>
      </div>
    </div>
  );
}
