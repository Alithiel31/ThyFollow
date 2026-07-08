// src/pages/LabResultsPage.tsx
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Plus, Trash2, FlaskConical, TrendingUp } from 'lucide-react';
import { labApi } from '../lib/api';
import { formatDate, tshStatus } from '../lib/utils';
import { LAB_RANGES, type LabResult } from '../types';
import { useAuthStore } from '../lib/store';
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine, CartesianGrid
} from 'recharts';
import { parseISO, format } from 'date-fns';
import { fr, enUS } from 'date-fns/locale';
import styles from './LabResultsPage.module.css';

const EMPTY_FORM: Partial<LabResult> = {
  date: '', lab: '', orderedBy: '', tsh: undefined, ft4: undefined, ft3: undefined,
  antiTPO: undefined, antiTG: undefined, ferritin: undefined,
  vitaminD: undefined, vitaminB12: undefined, notes: '',
};

export function LabResultsPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<LabResult | null>(null);
  const [form, setForm] = useState<Partial<LabResult>>(EMPTY_FORM);
  const dateLocale = i18n.language?.startsWith('en') ? enUS : fr;

  const { data: results = [], isLoading } = useQuery({
    queryKey: ['lab-results'],
    queryFn: () => labApi.list().then((r) => r.data),
  });

  const createMut = useMutation({
    mutationFn: (d: Partial<LabResult> & { date: string }) => labApi.create(d),
    onSuccess: () => { toast.success(t('labResults.added')); qc.invalidateQueries({ queryKey: ['lab-results'] }); resetForm(); },
    onError: () => toast.error(t('labResults.error')),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<LabResult> }) => labApi.update(id, data),
    onSuccess: () => { toast.success(t('labResults.updated')); qc.invalidateQueries({ queryKey: ['lab-results'] }); resetForm(); },
    onError: () => toast.error(t('labResults.error')),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => labApi.delete(id),
    onSuccess: () => { toast.success(t('labResults.deleted')); qc.invalidateQueries({ queryKey: ['lab-results'] }); },
    onError: () => toast.error(t('labResults.error')),
  });

  const resetForm = () => { setShowForm(false); setEditItem(null); setForm(EMPTY_FORM); };

  const openEdit = (r: LabResult) => {
    setEditItem(r);
    setForm({ ...r, date: r.date.split('T')[0] });
    setShowForm(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.date) return toast.error(t('labResults.dateRequired'));
    const payload = { ...form, date: form.date };
    const clean = Object.fromEntries(
      Object.entries(payload).map(([k, v]) => [k, v === '' ? null : v])
    ) as Partial<LabResult> & { date: string };

    if (editItem) updateMut.mutate({ id: editItem.id, data: clean });
    else createMut.mutate(clean);
  };

  const set = (key: keyof LabResult) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const val = e.target.type === 'number' ? (e.target.value ? parseFloat(e.target.value) : undefined) : e.target.value;
    setForm((f) => ({ ...f, [key]: val }));
  };

  // Chart data: TSH over time
  const chartData = [...results]
    .filter((r) => r.tsh != null)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((r) => ({
      date: format(parseISO(r.date), 'd MMM yy', { locale: dateLocale }),
      tsh: r.tsh,
      ft4: r.ft4,
    }));

  const profile = user?.profile;

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>{t('labResults.title')}</h1>
          <p className={styles.sub}>{t('labResults.subtitle')}</p>
        </div>
        <button className={styles.addBtn} onClick={() => { setEditItem(null); setForm(EMPTY_FORM); setShowForm(true); }}>
          <Plus size={16} /> {t('labResults.add')}
        </button>
      </div>

      {/* TSH Chart */}
      {chartData.length > 1 && (
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <TrendingUp size={16} />
            <span>{t('labResults.tshEvolution')}</span>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
              <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12, color: 'var(--text)', boxShadow: 'var(--shadow)' }} />
              <ReferenceLine y={profile?.targetTSH_min ?? LAB_RANGES.tsh.min} stroke="var(--success)" strokeOpacity={0.35} strokeDasharray="4 4" />
              <ReferenceLine y={profile?.targetTSH_max ?? LAB_RANGES.tsh.max} stroke="var(--success)" strokeOpacity={0.35} strokeDasharray="4 4" label={{ value: t('labResults.targetZone'), position: 'right', fontSize: 10, fill: 'var(--success)' }} />
              <Line type="monotone" dataKey="tsh" stroke="var(--chart-1)" strokeWidth={2.5} dot={{ r: 4, fill: 'var(--chart-1)', strokeWidth: 0 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
          <p className={styles.chartNote}>{t('labResults.chartNote', { min: profile?.targetTSH_min ?? LAB_RANGES.tsh.min, max: profile?.targetTSH_max ?? LAB_RANGES.tsh.max })}</p>
        </div>
      )}

      {/* Form modal */}
      {showForm && (
        <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && resetForm()}>
          <div className={styles.modal}>
            <h2 className={styles.modalTitle}>
              <FlaskConical size={18} />
              {editItem ? t('labResults.editTitle') : t('labResults.newTitle')}
            </h2>
            <form onSubmit={handleSubmit} className={styles.form}>
              <div className={styles.grid2}>
                <Field label={t('labResults.date')}>
                  <input className={styles.input} type="date" value={form.date as string ?? ''} onChange={set('date')} required />
                </Field>
                <Field label={t('labResults.lab')}>
                  <input className={styles.input} placeholder={t('labResults.labPlaceholder')} value={form.lab ?? ''} onChange={set('lab')} />
                </Field>
              </div>
              <Field label={t('labResults.orderedBy')}>
                <input className={styles.input} placeholder={t('labResults.orderedByPlaceholder')} value={form.orderedBy ?? ''} onChange={set('orderedBy')} />
              </Field>

              <div className={styles.formSection}>{t('labResults.mainMarkers')}</div>
              <div className={styles.grid3}>
                <NumField label={`TSH (${LAB_RANGES.tsh.unit})`} field="tsh" form={form} set={set} step="0.01" placeholder="1.50" />
                <NumField label={`FT4 (${LAB_RANGES.ft4.unit})`} field="ft4" form={form} set={set} step="0.1" placeholder="15.0" />
                <NumField label={`FT3 (${LAB_RANGES.ft3.unit})`} field="ft3" form={form} set={set} step="0.1" placeholder="4.5" />
              </div>

              <div className={styles.formSection}>{t('labResults.autoimmuneMarkers')}</div>
              <div className={styles.grid3}>
                <NumField label={t('labResults.antiTPO')} field="antiTPO" form={form} set={set} step="1" placeholder="< 34" />
                <NumField label={t('labResults.antiTG')} field="antiTG" form={form} set={set} step="1" placeholder="—" />
                <NumField label={t('labResults.antiTSHR')} field="antiTSHR" form={form} set={set} step="0.1" placeholder="—" />
              </div>

              <div className={styles.formSection}>{t('labResults.deficiencyMarkers')}</div>
              <div className={styles.grid3}>
                <NumField label={t('labResults.ferritin')} field="ferritin" form={form} set={set} step="0.1" placeholder="80" />
                <NumField label={t('labResults.vitaminD')} field="vitaminD" form={form} set={set} step="0.1" placeholder="75" />
                <NumField label={t('labResults.vitaminB12')} field="vitaminB12" form={form} set={set} step="0.1" placeholder="300" />
              </div>

              <Field label={t('labResults.notes')}>
                <textarea className={styles.textarea} rows={3} value={form.notes ?? ''} onChange={set('notes')} placeholder={t('labResults.notesPlaceholder')} />
              </Field>

              <div className={styles.formActions}>
                <button type="button" className={styles.cancelBtn} onClick={resetForm}>{t('common.cancel')}</button>
                <button type="submit" className={styles.submitBtn} disabled={createMut.isPending || updateMut.isPending}>
                  {createMut.isPending || updateMut.isPending ? t('labResults.submitting') : editItem ? t('common.update') : t('common.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Results list */}
      {isLoading ? (
        <div className={styles.loader}><div className="spinner" /></div>
      ) : results.length === 0 ? (
        <div className={styles.empty}>
          <FlaskConical size={40} strokeWidth={1} />
          <p>{t('labResults.empty')}</p>
          <button className={styles.addBtn} onClick={() => setShowForm(true)}>{t('labResults.addFirst')}</button>
        </div>
      ) : (
        <div className={styles.list}>
          {results.map((r) => {
            const tshInfo = r.tsh != null ? tshStatus(r.tsh, profile?.targetTSH_min, profile?.targetTSH_max) : null;
            return (
              <div key={r.id} className={styles.resultCard} onClick={() => openEdit(r)}>
                <div className={styles.resultDate}>{formatDate(r.date)}</div>
                {r.lab && <div className={styles.resultLab}>{r.lab}</div>}
                <div className={styles.markers}>
                  {r.tsh != null && (
                    <Marker label="TSH" value={r.tsh} unit="mUI/L" color={tshInfo?.color} bg={tshInfo?.bg} badge={tshInfo?.label} />
                  )}
                  {r.ft4 != null && <Marker label="FT4" value={r.ft4} unit="pmol/L" />}
                  {r.ft3 != null && <Marker label="FT3" value={r.ft3} unit="pmol/L" />}
                  {r.antiTPO != null && (
                    <Marker label="Anti-TPO" value={r.antiTPO} unit="UI/mL"
                      color={r.antiTPO > LAB_RANGES.antiTPO.max ? 'var(--rose)' : 'var(--teal)'} />
                  )}
                </div>
                {r.notes && <p className={styles.resultNotes}>{r.notes}</p>}
                <button className={styles.deleteBtn}
                  onClick={(e) => { e.stopPropagation(); if (confirm(t('labResults.deleteConfirm'))) deleteMut.mutate(r.id); }}>
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={styles.field}>
      <label className={styles.label}>{label}</label>
      {children}
    </div>
  );
}

function NumField({ label, field, form, set, step, placeholder }: {
  label: string; field: keyof LabResult;
  form: Partial<LabResult>;
  set: (k: keyof LabResult) => (e: React.ChangeEvent<HTMLInputElement>) => void;
  step: string; placeholder: string;
}) {
  return (
    <Field label={label}>
      <input className={styles.input} type="number" step={step} placeholder={placeholder}
        value={(form[field] as number | undefined) ?? ''}
        onChange={set(field) as (e: React.ChangeEvent<HTMLInputElement>) => void} />
    </Field>
  );
}

function Marker({ label, value, unit, color, bg, badge }: {
  label: string; value: number; unit: string; color?: string; bg?: string; badge?: string;
}) {
  return (
    <div className={styles.marker}>
      <span className={styles.markerLabel}>{label}</span>
      <span className={styles.markerValue} style={{ color: color ?? 'var(--text)' }}>
        {value} <span className={styles.markerUnit}>{unit}</span>
      </span>
      {badge && <span className={styles.markerBadge} style={{ color, background: bg ?? 'var(--bg-raised)' }}>{badge}</span>}
    </div>
  );
}
