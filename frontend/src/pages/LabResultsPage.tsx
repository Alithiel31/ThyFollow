// src/pages/LabResultsPage.tsx
import { useState, useId, useMemo, cloneElement, isValidElement, type ReactElement } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Plus, Trash2, FlaskConical, TrendingUp, FileUp } from 'lucide-react';
import { labApi } from '../lib/api';
import { formatDate, tshStatus, cn } from '../lib/utils';
import { LAB_RANGES, MARKER_DISPLAY, type LabMarkerKey, type LabResult } from '../types';
import { useAuthStore } from '../lib/store';
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine, ReferenceArea, CartesianGrid
} from 'recharts';
import { parseISO, format, subMonths } from 'date-fns';
import { fr, enUS } from 'date-fns/locale';
import { LabImport, DocumentLink } from '../components/LabImport';
import styles from './LabResultsPage.module.css';

// Marqueurs sans champ dédié dans les sections principales du formulaire : ils peuvent venir
// d'un import de PDF et doivent rester visibles et corrigeables.
const OTHER_MARKERS: LabMarkerKey[] = ['t4', 't3', 'thyroglobulin', 'magnesium', 'selenium', 'cholesterol', 'glucose', 'hemoglobin'];

// Graduations de l'axe TSH : échelle logarithmique, l'usage en endocrinologie, pour que les
// valeurs très hautes (hypothyroïdie non traitée) n'écrasent pas les variations dans la cible.
const TSH_LOG_TICKS = [0.01, 0.05, 0.1, 0.5, 1, 2, 4, 10, 20, 50, 100, 200, 500, 1000];

type ChartPeriod = '6m' | '1y' | '2y' | 'all';
const CHART_PERIODS: { key: ChartPeriod; months: number | null }[] = [
  { key: '6m', months: 6 }, { key: '1y', months: 12 }, { key: '2y', months: 24 }, { key: 'all', months: null },
];

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
  const [showImport, setShowImport] = useState(false);
  const [editItem, setEditItem] = useState<LabResult | null>(null);
  const [form, setForm] = useState<Partial<LabResult>>(EMPTY_FORM);
  const [chartPeriod, setChartPeriod] = useState<ChartPeriod | null>(null);
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

  const profile = user?.profile;
  const targetMin = profile?.targetTSH_min ?? LAB_RANGES.tsh.min;
  const targetMax = profile?.targetTSH_max ?? LAB_RANGES.tsh.max;

  // Chart data: TSH over time, positionnée sur un axe temporel réel (timestamp)
  const chartData = useMemo(() => [...results]
    .filter((r) => r.tsh != null && r.tsh > 0) // une échelle log n'accepte pas 0
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((r) => ({ ts: parseISO(r.date).getTime(), tsh: r.tsh as number })), [results]);

  // Une période n'est proposée que si elle contient au moins deux points à relier.
  const periodPoints = (months: number | null) => {
    if (months == null) return chartData;
    const from = subMonths(new Date(), months).getTime();
    return chartData.filter((d) => d.ts >= from);
  };
  const availablePeriods = CHART_PERIODS.filter((p) => periodPoints(p.months).length > 1).map((p) => p.key);
  const activePeriod: ChartPeriod = chartPeriod && availablePeriods.includes(chartPeriod)
    ? chartPeriod
    : availablePeriods.includes('1y') ? '1y' : 'all';
  const visibleData = periodPoints(CHART_PERIODS.find((p) => p.key === activePeriod)!.months);

  // Domaine log : englobe les mesures et la zone cible, avec une marge visuelle de part et d'autre.
  const tshValues = visibleData.map((d) => d.tsh);
  const yMin = Math.min(...tshValues, targetMin) / 1.5;
  const yMax = Math.max(...tshValues, targetMax) * 1.5;
  const yTicks = TSH_LOG_TICKS.filter((v) => v >= yMin && v <= yMax);

  const formatAxisDate = (ts: number) => format(ts, 'MMM yy', { locale: dateLocale });
  const formatTooltipDate = (ts: number) => format(ts, 'd MMMM yyyy', { locale: dateLocale });

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>{t('labResults.title')}</h1>
          <p className={styles.sub}>{t('labResults.subtitle')}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button className={styles.addBtn} onClick={() => setShowImport((v) => !v)}>
            <FileUp size={16} /> {t('labImport.button')}
          </button>
          <button className={styles.addBtn} onClick={() => { setEditItem(null); setForm(EMPTY_FORM); setShowForm(true); }}>
            <Plus size={16} /> {t('labResults.add')}
          </button>
        </div>
      </div>

      {showImport && <LabImport onClose={() => setShowImport(false)} />}

      {/* TSH Chart */}
      {chartData.length > 1 && (
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <TrendingUp size={16} />
            <span>{t('labResults.tshEvolution')}</span>
          </div>
          <div className={styles.periods} role="group" aria-label={t('labResults.chartPeriod')}>
            {CHART_PERIODS.map((p) => (
              <button
                key={p.key}
                type="button"
                className={cn(styles.periodBtn, activePeriod === p.key && styles.periodBtnActive)}
                aria-pressed={activePeriod === p.key}
                disabled={!availablePeriods.includes(p.key)}
                onClick={() => setChartPeriod(p.key)}
              >
                {t(`labResults.periods.${p.key}`)}
              </button>
            ))}
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={visibleData} margin={{ top: 8, right: 16, bottom: 0, left: -12 }}>
              <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
              <XAxis
                dataKey="ts" type="number" scale="time" domain={['dataMin', 'dataMax']} padding={{ left: 12, right: 12 }}
                tickFormatter={formatAxisDate} minTickGap={24}
                tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false}
              />
              <YAxis
                scale="log" domain={[yMin, yMax]} ticks={yTicks} allowDataOverflow
                tickFormatter={(v: number) => v.toLocaleString(i18n.language)}
                tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false}
              />
              <Tooltip
                labelFormatter={(ts) => formatTooltipDate(Number(ts))}
                formatter={(v) => [`${Number(v).toLocaleString(i18n.language)} ${LAB_RANGES.tsh.unit}`, LAB_RANGES.tsh.label]}
                contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12, color: 'var(--text)', boxShadow: 'var(--shadow)' }}
              />
              {/* Zone cible de la maquette : bande bleutée + pointillés accent */}
              <ReferenceArea y1={targetMin} y2={targetMax} fill="var(--accent)" fillOpacity={0.08} stroke="none" />
              <ReferenceLine y={targetMin} stroke="var(--accent)" strokeOpacity={0.35} strokeDasharray="4 4" />
              <ReferenceLine y={targetMax} stroke="var(--accent)" strokeOpacity={0.35} strokeDasharray="4 4" />
              {/* Tracé linéaire : entre deux analyses, la valeur réelle n'est pas connue. */}
              <Line
                type="linear" dataKey="tsh" stroke="var(--chart-1)" strokeWidth={2} isAnimationActive={false}
                dot={(props: { cx?: number; cy?: number; index?: number; payload?: { tsh: number } }) => (
                  <circle
                    key={props.index} cx={props.cx} cy={props.cy} r={4.5} strokeWidth={0}
                    fill={props.payload ? tshStatus(props.payload.tsh, targetMin, targetMax).color : 'var(--chart-1)'}
                  />
                )}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
          <p className={styles.chartNote}>{t('labResults.chartNote', { min: targetMin, max: targetMax })}</p>
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

              <div className={styles.formSection}>{t('labResults.otherMarkers')}</div>
              <div className={styles.grid3}>
                {OTHER_MARKERS.map((key) => {
                  const unit = MARKER_DISPLAY.find((m) => m.key === key)?.unit ?? '';
                  return (
                    <NumField key={key} label={`${t(`labResults.marker.${key}`)} (${unit})`} field={key}
                      form={form} set={set} step="0.01" placeholder="—" />
                  );
                })}
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
              <div
                key={r.id}
                className={`${styles.resultCard} ${
                  tshInfo?.status === 'high' ? styles.resultCardHigh
                  : tshInfo?.status === 'low' ? styles.resultCardLow : ''
                }`}
                onClick={() => openEdit(r)}
              >
                <div className={styles.resultDate}>{formatDate(r.date)}</div>
                {r.lab && <div className={styles.resultLab}>{r.lab}</div>}
                <div className={styles.markers}>
                  {/* Tous les marqueurs renseignés (importés ou saisis), pas seulement la thyroïde :
                      c'est ce qui dit de quoi se compose le bilan. */}
                  {MARKER_DISPLAY.filter(({ key }) => r[key] != null).map(({ key, unit }) => {
                    const label = t(`labResults.marker.${key}`);
                    const value = r[key] as number;
                    if (key === 'tsh') {
                      return <Marker key={key} label={label} value={value} unit={unit} color={tshInfo?.color} bg={tshInfo?.bg} badge={tshInfo?.label} />;
                    }
                    if (key === 'antiTPO') {
                      return <Marker key={key} label={label} value={value} unit={unit}
                        color={value > LAB_RANGES.antiTPO.max ? 'var(--rose)' : 'var(--teal)'} />;
                    }
                    return <Marker key={key} label={label} value={value} unit={unit} />;
                  })}
                  {MARKER_DISPLAY.every(({ key }) => r[key] == null) && (
                    <span className={styles.markerUnit}>{t('labResults.noValues')}</span>
                  )}
                </div>
                {r.notes && <p className={styles.resultNotes}>{r.notes}</p>}
                {r.documents?.map((d) => <DocumentLink key={d.id} documentId={d.id} />)}
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
  // Un seul id généré ici et injecté dans le contrôle enfant (input/select/
  // textarea) : associe programmatiquement le <label> à son champ pour les
  // lecteurs d'écran, sans avoir à répéter un id à chaque site d'appel.
  const id = useId();
  const control = isValidElement(children)
    ? cloneElement(children as ReactElement<{ id?: string }>, { id })
    : children;
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>{label}</label>
      {control}
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
