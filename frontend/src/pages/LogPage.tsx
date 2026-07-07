// src/pages/LogPage.tsx
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  ChevronLeft, ChevronRight, Check, Save, Pill,
  Sparkles, Activity, Dumbbell, Moon, Ruler, FileText, FileDown,
} from 'lucide-react';
import { entriesApi } from '../lib/api';
import { toISODate, formatDate, SYMPTOM_LABELS } from '../lib/utils';
import { addDays, subDays, parseISO } from 'date-fns';
import type { DailyEntry } from '../types';
import styles from './LogPage.module.css';

type ScoreField = keyof Pick<DailyEntry,
  'energyLevel' | 'moodScore' | 'anxietyLevel' | 'brainFogLevel' |
  'coldSensitivity' | 'heatSensitivity' | 'hairLoss' | 'drySkin' |
  'constipation' | 'bloating' | 'muscleWeakness' | 'jointPain' |
  'neckPain' | 'swelling' | 'tremors' | 'sleepQuality'
>;

const SECTIONS = [
  {
    title: 'Bien-être général',
    icon: Sparkles,
    fields: ['energyLevel', 'moodScore', 'anxietyLevel', 'brainFogLevel'] as ScoreField[],
  },
  {
    title: 'Symptômes thyroïdiens',
    icon: Activity,
    fields: ['coldSensitivity', 'heatSensitivity', 'hairLoss', 'drySkin', 'neckPain', 'swelling', 'tremors'] as ScoreField[],
  },
  {
    title: 'Digestif & musculaire',
    icon: Dumbbell,
    fields: ['constipation', 'bloating', 'muscleWeakness', 'jointPain'] as ScoreField[],
  },
  {
    title: 'Sommeil',
    icon: Moon,
    fields: ['sleepQuality'] as ScoreField[],
  },
];

export function LogPage() {
  const { date: dateParam } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

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
      toast.success('Journal enregistré !');
      qc.invalidateQueries({ queryKey: ['entry', date] });
      qc.invalidateQueries({ queryKey: ['analytics'] });
      setDirty(false);
    },
    onError: () => toast.error('Erreur lors de la sauvegarde'),
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
          {date === today && <span className={styles.todayBadge}>Aujourd'hui</span>}
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
          <FileDown size={15} /> Exporter un rapport
        </button>
      </div>

      {showExport && (
        <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && setShowExport(false)}>
          <div className={styles.exportModal}>
            <h2 className={styles.exportTitle}><FileDown size={18} /> Rapport de période</h2>
            <p className={styles.exportHint}>
              Moyennes du journal, observance et analyses sur la période choisie —
              à imprimer, enregistrer en PDF ou exporter en CSV.
            </p>
            <div className={styles.exportGrid}>
              <label className={styles.exportField}>
                <span>Du</span>
                <input type="date" value={exportFrom} max={exportTo}
                  onChange={(e) => setExportFrom(e.target.value)} />
              </label>
              <label className={styles.exportField}>
                <span>Au</span>
                <input type="date" value={exportTo} min={exportFrom} max={today}
                  onChange={(e) => setExportTo(e.target.value)} />
              </label>
            </div>
            <div className={styles.exportActions}>
              <button className={styles.exportCancel} onClick={() => setShowExport(false)}>Annuler</button>
              <button className={styles.exportGo}
                onClick={() => navigate(`/report?from=${exportFrom}&to=${exportTo}`)}>
                Générer le rapport
              </button>
            </div>
          </div>
        </div>
      )}

      {isFuture ? (
        <div className={styles.futureMsg}>Vous ne pouvez pas remplir un journal futur.</div>
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
                {form.medicationTaken ? 'Médicament pris' : 'Médicament pris ?'}
              </p>
              <p className={styles.medPillSub}>Touchez pour marquer</p>
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
                    label={SYMPTOM_LABELS[field] ?? field}
                    value={form[field] as number | null | undefined}
                    onChange={(v) => setScore(field, v)}
                  />
                ))}
              </div>
            </div>
          ))}

          {/* ── Physical metrics */}
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}><Ruler size={16} strokeWidth={1.8} /> Mesures</h2>
            <div className={styles.metricsGrid}>
              <MetricInput label="Poids (kg)" value={form.weight ?? ''}
                onChange={(v) => setField('weight', v ? parseFloat(v) : null)}
                placeholder="62.5" step="0.1" />
              <MetricInput label="Température (°C)" value={form.bodyTemperature ?? ''}
                onChange={(v) => setField('bodyTemperature', v ? parseFloat(v) : null)}
                placeholder="36.6" step="0.1" />
              <MetricInput label="Rythme cardiaque" value={form.heartRate ?? ''}
                onChange={(v) => setField('heartRate', v ? parseInt(v) : null)}
                placeholder="72" step="1" />
              <MetricInput label="Heures de sommeil" value={form.sleepHours ?? ''}
                onChange={(v) => setField('sleepHours', v ? parseFloat(v) : null)}
                placeholder="7.5" step="0.5" />
            </div>
          </div>

          {/* ── Notes */}
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}><FileText size={16} strokeWidth={1.8} /> Notes</h2>
            <textarea
              className={styles.textarea}
              value={form.notes ?? ''}
              onChange={(e) => setField('notes', e.target.value || null)}
              placeholder="Comment vous sentez-vous aujourd'hui ? Quelque chose de particulier à noter ?"
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
            {mutation.isPending ? 'Enregistrement…' : dirty ? 'Enregistrer les modifications' : 'Enregistré'}
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
