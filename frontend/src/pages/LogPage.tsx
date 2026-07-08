// src/pages/LogPage.tsx
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
  ChevronLeft, ChevronRight, Check, Save, Pill,
  Sparkles, Activity, Dumbbell, Moon, Ruler, FileText, FileDown,
} from 'lucide-react';
import { entriesApi } from '../lib/api';
import { toISODate, formatDate, symptomLabel } from '../lib/utils';
import { addDays, subDays, parseISO } from 'date-fns';
import type { DailyEntry } from '../types';
import styles from './LogPage.module.css';

type ScoreField = keyof Pick<DailyEntry,
  'energyLevel' | 'moodScore' | 'anxietyLevel' | 'brainFogLevel' |
  'coldSensitivity' | 'heatSensitivity' | 'hairLoss' | 'drySkin' |
  'constipation' | 'bloating' | 'muscleWeakness' | 'jointPain' |
  'neckPain' | 'swelling' | 'tremors' | 'sleepQuality'
>;

function useSections(t: (k: string) => string) {
  return [
    {
      title: t('log.sections.wellbeing'),
      icon: Sparkles,
      fields: ['energyLevel', 'moodScore', 'anxietyLevel', 'brainFogLevel'] as ScoreField[],
    },
    {
      title: t('log.sections.thyroidSymptoms'),
      icon: Activity,
      fields: ['coldSensitivity', 'heatSensitivity', 'hairLoss', 'drySkin', 'neckPain', 'swelling', 'tremors'] as ScoreField[],
    },
    {
      title: t('log.sections.digestiveMuscular'),
      icon: Dumbbell,
      fields: ['constipation', 'bloating', 'muscleWeakness', 'jointPain'] as ScoreField[],
    },
    {
      title: t('log.sections.sleep'),
      icon: Moon,
      fields: ['sleepQuality'] as ScoreField[],
    },
  ];
}

export function LogPage() {
  const { t } = useTranslation();
  const { date: dateParam } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const SECTIONS = useSections(t);

  const today = toISODate(new Date());
  const date = dateParam ?? today;

  const [form, setForm] = useState<Partial<DailyEntry>>({ medicationTaken: false, tags: [] });
  const [dirty, setDirty] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [exportFrom, setExportFrom] = useState(toISODate(subDays(new Date(), 29)));
  const [exportTo, setExportTo] = useState(today);

  const { data: existing, isLoading } = useQuery({
    queryKey: ['entry', date],
    queryFn: () => entriesApi.getByDate(date).then((r) => r.data),
  });

  useEffect(() => {
    if (existing) setForm(existing);
    else setForm({ medicationTaken: false, tags: [], date });
  }, [existing, date]);

  const mutation = useMutation({
    mutationFn: (data: Partial<DailyEntry> & { date: string }) => entriesApi.upsert(data),
    onSuccess: () => {
      toast.success(t('log.saved'));
      qc.invalidateQueries({ queryKey: ['entry', date] });
      qc.invalidateQueries({ queryKey: ['analytics'] });
      setDirty(false);
    },
    onError: () => toast.error(t('log.saveError')),
  });

  const setField = <K extends keyof DailyEntry>(key: K, value: DailyEntry[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setDirty(true);
  };

  const setScore = (field: ScoreField, score: number) => {
    const current = form[field] as number | null | undefined;
    setField(field, (current === score ? null : score) as DailyEntry[typeof field]);
  };

  const handleSave = () => {
    mutation.mutate({ ...form, date } as Partial<DailyEntry> & { date: string });
  };

  const navigate_date = (dir: 1 | -1) => {
    const d = parseISO(date);
    const next = dir === 1 ? addDays(d, 1) : subDays(d, 1);
    if (toISODate(next) > today) return;
    navigate(`/log/${toISODate(next)}`);
  };

  if (isLoading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '80px' }}>
      <div className="spinner" />
    </div>
  );

  const isFuture = date > today;

  return (
    <div className={styles.page}>
      {/* ── Date nav */}
      <div className={styles.dateNav}>
        <button className={styles.navArrow} onClick={() => navigate_date(-1)}>
          <ChevronLeft size={20} />
        </button>
        <div className={styles.dateInfo}>
          <h1 className={styles.dateTitle}>{formatDate(parseISO(date), 'EEEE d MMMM yyyy')}</h1>
          {date === today && <span className={styles.todayBadge}>{t('log.today')}</span>}
        </div>
        <button
          className={styles.navArrow}
          onClick={() => navigate_date(1)}
          disabled={date >= today}
        >
          <ChevronRight size={20} />
        </button>
      </div>

      {/* ── Export de rapport */}
      <div className={styles.exportRow}>
        <button className={styles.exportBtn} onClick={() => setShowExport(true)}>
          <FileDown size={15} /> {t('log.exportReport')}
        </button>
      </div>

      {showExport && (
        <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && setShowExport(false)}>
          <div className={styles.exportModal}>
            <h2 className={styles.exportTitle}><FileDown size={18} /> {t('log.exportModal.title')}</h2>
            <p className={styles.exportHint}>
              {t('log.exportModal.hint')}
            </p>
            <div className={styles.exportGrid}>
              <label className={styles.exportField}>
                <span>{t('log.exportModal.from')}</span>
                <input type="date" value={exportFrom} max={exportTo}
                  onChange={(e) => setExportFrom(e.target.value)} />
              </label>
              <label className={styles.exportField}>
                <span>{t('log.exportModal.to')}</span>
                <input type="date" value={exportTo} min={exportFrom} max={today}
                  onChange={(e) => setExportTo(e.target.value)} />
              </label>
            </div>
            <div className={styles.exportActions}>
              <button className={styles.exportCancel} onClick={() => setShowExport(false)}>{t('common.cancel')}</button>
              <button className={styles.exportGo}
                onClick={() => navigate(`/report?from=${exportFrom}&to=${exportTo}`)}>
                {t('log.exportModal.generate')}
              </button>
            </div>
          </div>
        </div>
      )}

      {isFuture ? (
        <div className={styles.futureMsg}>{t('log.futureMessage')}</div>
      ) : (
        <>
          {/* ── Medication pill */}
          <div
            className={`${styles.medPill} ${form.medicationTaken ? styles.medPillActive : ''}`}
            onClick={() => setField('medicationTaken', !form.medicationTaken)}
          >
            <div className={styles.medPillIcon}>
              {form.medicationTaken ? <Check size={16} /> : <Pill size={16} />}
            </div>
            <div>
              <p className={styles.medPillTitle}>
                {form.medicationTaken ? t('log.medicationTaken') : t('log.medicationTakenQuestion')}
              </p>
              <p className={styles.medPillSub}>{t('log.tapToMark')}</p>
            </div>
          </div>

          {/* ── Score sections */}
          {SECTIONS.map((section) => (
            <div key={section.title} className={styles.section}>
              <h2 className={styles.sectionTitle}>
                <section.icon size={16} strokeWidth={1.8} /> {section.title}
              </h2>
              <div className={styles.scoreGrid}>
                {section.fields.map((field) => (
                  <ScoreRow
                    key={field}
                    label={symptomLabel(field)}
                    value={form[field] as number | null | undefined}
                    onChange={(v) => setScore(field, v)}
                  />
                ))}
              </div>
            </div>
          ))}

          {/* ── Physical metrics */}
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}><Ruler size={16} strokeWidth={1.8} /> {t('log.measures')}</h2>
            <div className={styles.metricsGrid}>
              <MetricInput label={t('log.weight')} value={form.weight ?? ''}
                onChange={(v) => setField('weight', v ? parseFloat(v) : null)}
                placeholder="62.5" step="0.1" />
              <MetricInput label={t('log.temperature')} value={form.bodyTemperature ?? ''}
                onChange={(v) => setField('bodyTemperature', v ? parseFloat(v) : null)}
                placeholder="36.6" step="0.1" />
              <MetricInput label={t('log.heartRate')} value={form.heartRate ?? ''}
                onChange={(v) => setField('heartRate', v ? parseInt(v) : null)}
                placeholder="72" step="1" />
              <MetricInput label={t('log.sleepHours')} value={form.sleepHours ?? ''}
                onChange={(v) => setField('sleepHours', v ? parseFloat(v) : null)}
                placeholder="7.5" step="0.5" />
            </div>
          </div>

          {/* ── Notes */}
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}><FileText size={16} strokeWidth={1.8} /> {t('log.notes')}</h2>
            <textarea
              className={styles.textarea}
              value={form.notes ?? ''}
              onChange={(e) => setField('notes', e.target.value || null)}
              placeholder={t('log.notesPlaceholder')}
              rows={4}
            />
          </div>

          {/* ── Save button */}
          <button
            className={`${styles.saveBtn} ${dirty ? styles.saveBtnDirty : ''}`}
            onClick={handleSave}
            disabled={mutation.isPending}
          >
            <Save size={16} />
            {mutation.isPending ? t('log.saveButton.saving') : dirty ? t('log.saveButton.dirty') : t('log.saveButton.saved')}
          </button>
        </>
      )}
    </div>
  );
}

// ── Sub-components

function ScoreRow({ label, value, onChange }: {
  label: string;
  value: number | null | undefined;
  onChange: (v: number) => void;
}) {
  return (
    <div className={styles.scoreRow}>
      <span className={styles.scoreLabel}>{label}</span>
      <div className={styles.scoreButtons}>
        {[1, 2, 3, 4, 5].map((s) => (
          <button
            key={s}
            className={`${styles.scoreBtn} ${value === s ? styles.scoreBtnActive : ''}`}
            onClick={() => onChange(s)}
            title={`${s}/5`}
            aria-pressed={value === s}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function MetricInput({ label, value, onChange, placeholder, step }: {
  label: string; value: number | string;
  onChange: (v: string) => void;
  placeholder: string; step: string;
}) {
  return (
    <div className={styles.metricField}>
      <label className={styles.metricLabel}>{label}</label>
      <input
        className={styles.metricInput}
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        step={step}
      />
    </div>
  );
}
