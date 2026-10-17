// src/pages/MedicationsPage.tsx
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Plus, Pill, Trash2, ToggleLeft, ToggleRight, CheckCircle2, Circle, X, History } from 'lucide-react';
import { medApi, labApi } from '../lib/api';
import { useAuthStore } from '../lib/store';
import { formatDate, toISODate, tshStatus } from '../lib/utils';
import {
  periodAtDay, formatSchedule, dosesForDate, labsDuringPeriod, weeksSinceDoseChange, STABILIZATION_WEEKS,
} from '../lib/doseCycle';
import type { DoseSlot, Medication, MedicationIntake } from '../types';
import styles from './MedicationsPage.module.css';

// Heure proposée pour une prise ajoutée : la première de cette liste pas encore utilisée.
const DEFAULT_TIMES = ['20:00', '12:00', '18:00', '22:00', '08:00', '14:00', '06:00', '23:00'];
const MAX_SLOTS = 8;
const MAX_CYCLE_DAYS = 14;

const EMPTY: Partial<Medication> = {
  name: '', brand: '', dosageUnit: 'MCG', frequency: 'DAILY',
  startDate: new Date().toISOString().split('T')[0],
  active: true, showOnChart: true, instructions: '', notes: '',
};

// Posologie en cours d'édition : une ligne par créneau, une valeur (texte du champ) par jour
// du cycle. Une case vide vaut « pas de prise ce jour-là ».
interface Schedule {
  length: number;
  rows: { time: string; doses: string[] }[];
}

const EMPTY_SCHEDULE: Schedule = { length: 1, rows: [{ time: '07:00', doses: [''] }] };

const scheduleFromSlots = (slots: DoseSlot[]): Schedule => ({
  length: slots[0].doses.length,
  rows: slots.map((s) => ({ time: s.time ?? '', doses: s.doses.map(String) })),
});

const slotsFromSchedule = (schedule: Schedule): DoseSlot[] => schedule.rows.map((r) => ({
  time: r.time || null,
  doses: r.doses.map((v) => (v === '' ? 0 : parseFloat(v))),
}));

// Même règle que le serveur : au moins une dose chaque jour du cycle, aucune négative.
const isScheduleValid = (slots: DoseSlot[]) =>
  slots.every((s) => s.doses.every((d) => Number.isFinite(d) && d >= 0))
  && slots[0].doses.every((_, day) => slots.some((s) => s.doses[day] > 0));

export function MedicationsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<Medication | null>(null);
  const [form, setForm] = useState<Partial<Medication>>(EMPTY);
  const [schedule, setSchedule] = useState<Schedule>(EMPTY_SCHEDULE);
  const [initialSlots, setInitialSlots] = useState<DoseSlot[] | null>(null);
  const today = toISODate(new Date());
  const [effectiveDate, setEffectiveDate] = useState(today);

  const FREQ_LABELS: Record<Medication['frequency'], string> = {
    DAILY: t('medications.frequency.DAILY'),
    EVERY_OTHER_DAY: t('medications.frequency.EVERY_OTHER_DAY'),
    WEEKLY: t('medications.frequency.WEEKLY'),
    AS_NEEDED: t('medications.frequency.AS_NEEDED'),
  };

  const UNIT_LABELS: Record<Medication['dosageUnit'], string> = {
    MCG: t('medications.dosageUnits.MCG'),
    MG: t('medications.dosageUnits.MG'),
    IU: t('medications.dosageUnits.IU'),
    TABLET: t('medications.dosageUnits.TABLET'),
    DROP: t('medications.dosageUnits.DROP'),
    ML: t('medications.dosageUnits.ML'),
    OTHER: t('medications.dosageUnits.OTHER'),
  };

  const { data: meds = [], isLoading } = useQuery({
    queryKey: ['medications'],
    queryFn: () => medApi.list().then((r) => r.data),
  });

  const { data: intakes = [] } = useQuery({
    queryKey: ['medication-intakes', today],
    queryFn: () => medApi.listIntakes(today).then((r) => r.data),
  });

  const createMut = useMutation({
    mutationFn: (d: Partial<Medication> & { name: string; startDate: string; slots: DoseSlot[] }) => medApi.create(d),
    onSuccess: () => { toast.success(t('medications.added')); qc.invalidateQueries({ queryKey: ['medications'] }); resetForm(); },
    onError: () => toast.error(t('medications.error')),
  });

  // Une posologie modifiée n'écrase pas l'ancienne : elle devient une nouvelle période à
  // partir de la date d'effet (ou remplace la période qui commence déjà ce jour-là).
  const updateMut = useMutation({
    mutationFn: async ({ med, data, period }: {
      med: Medication; data: Partial<Medication>; period?: { startDate: string; slots: DoseSlot[] };
    }) => {
      await medApi.update(med.id, data);
      if (!period) return;
      const sameDay = med.dosePeriods.find((p) => p.startDate.slice(0, 10) === period.startDate);
      if (sameDay) await medApi.updateDosePeriod(med.id, sameDay.id, { slots: period.slots });
      else await medApi.addDosePeriod(med.id, period);
    },
    onSuccess: () => { toast.success(t('medications.updated')); qc.invalidateQueries({ queryKey: ['medications'] }); resetForm(); },
    onError: () => toast.error(t('medications.error')),
  });

  const toggleMut = useMutation({
    mutationFn: (m: Medication) => medApi.update(m.id, { active: !m.active }),
    onSuccess: () => { toast.success(t('medications.updated')); qc.invalidateQueries({ queryKey: ['medications'] }); },
    onError: () => toast.error(t('medications.error')),
  });

  // Historique : chaque appel renvoie le médicament à jour, affiché tel quel dans le formulaire.
  const onHistoryChange = (med: Medication) => {
    setEditItem(med);
    qc.invalidateQueries({ queryKey: ['medications'] });
  };

  const deleteMut = useMutation({
    mutationFn: (id: string) => medApi.delete(id),
    onSuccess: () => { toast.success(t('medications.deleted')); qc.invalidateQueries({ queryKey: ['medications'] }); },
    onError: () => toast.error(t('medications.error')),
  });

  const takeMut = useMutation({
    mutationFn: ({ id, time }: { id: string; time: string }) => medApi.markTaken(id, today, time),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['medication-intakes', today] }),
    onError: () => toast.error(t('medications.error')),
  });

  const untakeMut = useMutation({
    mutationFn: ({ id, time }: { id: string; time: string }) => medApi.markUntaken(id, today, time),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['medication-intakes', today] }),
    onError: () => toast.error(t('medications.error')),
  });

  const resetForm = () => {
    setShowForm(false); setEditItem(null); setForm(EMPTY);
    setSchedule(EMPTY_SCHEDULE); setInitialSlots(null); setEffectiveDate(today);
  };

  const openEdit = (m: Medication) => {
    setEditItem(m);
    setForm({ ...m, startDate: m.startDate.split('T')[0], endDate: m.endDate?.split('T')[0] ?? '' });
    // La posologie affichée est celle en vigueur aujourd'hui (à défaut, la plus récente).
    const current = periodAtDay(m.dosePeriods, today) ?? m.dosePeriods[m.dosePeriods.length - 1];
    setSchedule(current ? scheduleFromSlots(current.slots) : EMPTY_SCHEDULE);
    setInitialSlots(current?.slots ?? null);
    setEffectiveDate(today);
    setShowForm(true);
  };

  const toggleActive = (m: Medication) => toggleMut.mutate(m);

  const slots = slotsFromSchedule(schedule);
  // En édition, une posologie différente de celle en vigueur demande une date d'effet.
  const scheduleChanged = editItem !== null && JSON.stringify(slots) !== JSON.stringify(initialSlots);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.startDate) return toast.error(t('medications.missingFields'));
    if (!isScheduleValid(slots)) return toast.error(t('medications.scheduleEditor.invalid'));
    // Pas de dosage ni d'intakeTimes : le serveur les recalcule depuis les périodes.
    const data: Partial<Medication> = {
      name: form.name, brand: form.brand, dosageUnit: form.dosageUnit, frequency: form.frequency,
      startDate: form.startDate, endDate: form.endDate, active: form.active,
      showOnChart: Boolean(form.showOnChart) && form.dosageUnit === 'MCG',
      instructions: form.instructions, notes: form.notes,
    };
    if (editItem) {
      if (scheduleChanged && !effectiveDate) return toast.error(t('medications.missingFields'));
      updateMut.mutate({
        med: editItem, data,
        period: scheduleChanged ? { startDate: effectiveDate, slots } : undefined,
      });
    } else {
      createMut.mutate({ ...data, name: form.name, startDate: form.startDate, slots });
    }
  };

  const set = (key: keyof Medication) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const val = e.target.type === 'number' ? (e.target.value ? parseFloat(e.target.value) : undefined) : e.target.value;
    setForm((f) => ({ ...f, [key]: val }));
  };

  // Le graphique TSH n'affiche que des µg : changer d'unité décoche la case.
  const setUnit = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const dosageUnit = e.target.value as Medication['dosageUnit'];
    setForm((f) => ({ ...f, dosageUnit, showOnChart: dosageUnit === 'MCG' ? f.showOnChart : false }));
  };

  const activeMeds = meds.filter((m) => m.active);
  const inactiveMeds = meds.filter((m) => !m.active);
  const unitLabel = UNIT_LABELS[form.dosageUnit ?? 'MCG'];

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>{t('medications.title')}</h1>
          <p className={styles.sub}>{t('medications.subtitle')}</p>
        </div>
        <button className={styles.addBtn} onClick={() => { resetForm(); setShowForm(true); }}>
          <Plus size={16} /> {t('medications.add')}
        </button>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && resetForm()}>
          <div className={styles.modal}>
            <h2 className={styles.modalTitle}>
              <Pill size={18} />
              {editItem ? t('medications.editTitle') : t('medications.newTitle')}
            </h2>
            <form onSubmit={handleSubmit} className={styles.form}>
              <div className={styles.grid2}>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor="med-name">{t('medications.name')}</label>
                  <input id="med-name" className={styles.input} placeholder={t('medications.namePlaceholder')} value={form.name ?? ''} onChange={set('name')} required />
                </div>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor="med-brand">{t('medications.brand')}</label>
                  <input id="med-brand" className={styles.input} placeholder={t('medications.brandPlaceholder')} value={form.brand ?? ''} onChange={set('brand')} />
                </div>
              </div>

              <div className={styles.grid2}>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor="med-unit">{t('medications.scheduleEditor.unit')}</label>
                  <select id="med-unit" className={styles.input} value={form.dosageUnit ?? 'MCG'} onChange={setUnit}>
                    {Object.entries(UNIT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor="med-start-date">{t('medications.startDate')}</label>
                  <input id="med-start-date" className={styles.input} type="date" value={form.startDate ?? ''} onChange={set('startDate')} required />
                </div>
              </div>

              <div className={styles.field}>
                <span className={styles.label}>{t('medications.scheduleEditor.title')}</span>
                <ScheduleEditor value={schedule} onChange={setSchedule} unitLabel={unitLabel} idPrefix="med" />
              </div>

              {scheduleChanged && (
                <div className={styles.field}>
                  <label className={styles.label} htmlFor="med-effective-date">{t('medications.scheduleEditor.effectiveDate')}</label>
                  <input id="med-effective-date" className={styles.input} type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} required />
                  <p className={styles.hint}>{t('medications.scheduleEditor.effectiveHint')}</p>
                </div>
              )}

              <div className={styles.checks}>
                <label className={styles.check}>
                  <input
                    type="checkbox" checked={form.frequency === 'AS_NEEDED'}
                    onChange={(e) => setForm((f) => ({ ...f, frequency: e.target.checked ? 'AS_NEEDED' : 'DAILY' }))}
                  />
                  {t('medications.scheduleEditor.asNeeded')}
                </label>
                <label className={styles.check}>
                  <input
                    type="checkbox" checked={Boolean(form.showOnChart) && form.dosageUnit === 'MCG'}
                    disabled={form.dosageUnit !== 'MCG'}
                    onChange={(e) => setForm((f) => ({ ...f, showOnChart: e.target.checked }))}
                  />
                  {t('medications.scheduleEditor.showOnChart')}
                  {form.dosageUnit !== 'MCG' && <span className={styles.hint}> · {t('medications.scheduleEditor.showOnChartHint')}</span>}
                </label>
              </div>

              {editItem && (
                <DoseHistory med={editItem} unitLabel={unitLabel} today={today} onChange={onHistoryChange} />
              )}

              <div className={styles.field}>
                <label className={styles.label} htmlFor="med-instructions">{t('medications.instructions')}</label>
                <input id="med-instructions" className={styles.input} placeholder={t('medications.instructionsPlaceholder')} value={form.instructions ?? ''} onChange={set('instructions')} />
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="med-notes">{t('medications.notes')}</label>
                <textarea id="med-notes" className={styles.textarea} rows={2} value={form.notes ?? ''} onChange={set('notes')} placeholder={t('medications.notesPlaceholder')} />
              </div>

              <div className={styles.formActions}>
                <button type="button" className={styles.cancelBtn} onClick={resetForm}>{t('common.cancel')}</button>
                <button type="submit" className={styles.submitBtn} disabled={createMut.isPending || updateMut.isPending}>
                  {createMut.isPending || updateMut.isPending ? t('medications.submitting') : editItem ? t('common.update') : t('common.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className={styles.loader}><div className="spinner" /></div>
      ) : meds.length === 0 ? (
        <div className={styles.empty}>
          <Pill size={40} strokeWidth={1} />
          <p>{t('medications.empty')}</p>
          <button className={styles.addBtn} onClick={() => setShowForm(true)}>{t('medications.addFirst')}</button>
        </div>
      ) : (
        <>
          {activeMeds.length > 0 && (
            <section>
              <h2 className={styles.sectionLabel}>{t('medications.activeSection')}</h2>
              <div className={styles.list}>
                {activeMeds.map((m) => (
                  <MedCard
                    key={m.id} med={m} freqLabels={FREQ_LABELS} unitLabels={UNIT_LABELS} intakes={intakes} today={today}
                    onEdit={openEdit} onDelete={(id) => { if (confirm(t('medications.deleteConfirm'))) deleteMut.mutate(id); }}
                    onToggle={toggleActive}
                    onTake={(id, time) => takeMut.mutate({ id, time })}
                    onUntake={(id, time) => untakeMut.mutate({ id, time })}
                  />
                ))}
              </div>
            </section>
          )}
          {inactiveMeds.length > 0 && (
            <section style={{ marginTop: '28px' }}>
              <h2 className={styles.sectionLabel} style={{ color: 'var(--text-muted)' }}>{t('medications.pastSection')}</h2>
              <div className={styles.list}>
                {inactiveMeds.map((m) => (
                  <MedCard
                    key={m.id} med={m} freqLabels={FREQ_LABELS} unitLabels={UNIT_LABELS} intakes={intakes} today={today}
                    onEdit={openEdit} onDelete={(id) => { if (confirm(t('medications.deleteConfirm'))) deleteMut.mutate(id); }}
                    onToggle={toggleActive}
                    onTake={(id, time) => takeMut.mutate({ id, time })}
                    onUntake={(id, time) => untakeMut.mutate({ id, time })}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

// Éditeur de posologie. Mode simple : une ligne « heure + dose » par prise. Mode « dose
// différente selon les jours » : une grille créneaux × jours du cycle (jour 1 = date de début).
function ScheduleEditor({ value, onChange, unitLabel, idPrefix, required = true }: {
  value: Schedule;
  onChange: (s: Schedule) => void;
  unitLabel: string;
  idPrefix: string;
  required?: boolean; // validation native du formulaire englobant
}) {
  const { t } = useTranslation();
  const perDay = value.length > 1;

  const resize = (length: number): Schedule => ({
    length,
    rows: value.rows.map((r) => ({ ...r, doses: Array.from({ length }, (_, i) => r.doses[i] ?? '') })),
  });
  const setRow = (index: number, row: Partial<Schedule['rows'][number]>) =>
    onChange({ ...value, rows: value.rows.map((r, i) => (i === index ? { ...r, ...row } : r)) });
  const setDose = (index: number, day: number, dose: string) =>
    setRow(index, { doses: value.rows[index].doses.map((d, i) => (i === day ? dose : d)) });
  const addRow = () => {
    const used = new Set(value.rows.map((r) => r.time));
    const time = DEFAULT_TIMES.find((x) => !used.has(x)) ?? '';
    onChange({ ...value, rows: [...value.rows, { time, doses: Array(value.length).fill('') }] });
  };
  const removeRow = (index: number) => onChange({ ...value, rows: value.rows.filter((_, i) => i !== index) });

  return (
    <div className={styles.schedule}>
      {value.rows.map((row, i) => (
        <div key={i} className={styles.slotRow}>
          <input
            aria-label={t('medications.scheduleEditor.time', { index: i + 1 })} className={styles.input} type="time"
            value={row.time} onChange={(e) => setRow(i, { time: e.target.value })}
          />
          {!perDay && (
            <div className={styles.doseField}>
              <input
                id={i === 0 ? `${idPrefix}-dosage` : undefined}
                aria-label={t('medications.scheduleEditor.dose', { index: i + 1 })} className={styles.input}
                type="number" step="any" min="0" placeholder="75" required={required}
                value={row.doses[0]} onChange={(e) => setDose(i, 0, e.target.value)}
              />
              <span className={styles.unit}>{unitLabel}</span>
            </div>
          )}
          {value.rows.length > 1 && (
            <button type="button" className={styles.iconBtn} onClick={() => removeRow(i)} title={t('medications.scheduleEditor.removeSlot')} aria-label={t('medications.scheduleEditor.removeSlot')}>
              <X size={16} />
            </button>
          )}
        </div>
      ))}

      {perDay && (
        <div className={styles.cycleGridWrap}>
          <table className={styles.cycleGrid}>
            <thead>
              <tr>
                <th />
                {Array.from({ length: value.length }, (_, d) => <th key={d}>{t('medications.scheduleEditor.day', { day: d + 1 })}</th>)}
                <th />
              </tr>
            </thead>
            <tbody>
              {value.rows.map((row, i) => (
                <tr key={i}>
                  <th>{row.time || '—'}</th>
                  {row.doses.map((dose, d) => (
                    <td key={d}>
                      <input
                        aria-label={t('medications.scheduleEditor.dayCell', { day: d + 1, index: i + 1 })}
                        className={styles.cellInput} type="number" step="any" min="0"
                        value={dose} onChange={(e) => setDose(i, d, e.target.value)}
                      />
                    </td>
                  ))}
                  <td>
                    <button type="button" className={styles.linkBtn} onClick={() => setRow(i, { doses: row.doses.map(() => row.doses[0]) })}>
                      {t('medications.scheduleEditor.sameEveryDay')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className={styles.hint}>{t('medications.scheduleEditor.gridHint', { unit: unitLabel })}</p>
        </div>
      )}

      <div className={styles.scheduleActions}>
        {value.rows.length < MAX_SLOTS && (
          <button type="button" className={styles.linkBtn} onClick={addRow}>
            <Plus size={14} /> {t('medications.scheduleEditor.addSlot')}
          </button>
        )}
        <label className={styles.check}>
          <input type="checkbox" checked={perDay} onChange={(e) => onChange(resize(e.target.checked ? 2 : 1))} />
          {t('medications.scheduleEditor.perDay')}
        </label>
        {perDay && (
          <select
            aria-label={t('medications.scheduleEditor.cycleLength')} className={styles.inputSmall}
            value={value.length} onChange={(e) => onChange(resize(parseInt(e.target.value, 10)))}
          >
            {Array.from({ length: MAX_CYCLE_DAYS - 1 }, (_, i) => i + 2).map((n) => (
              <option key={n} value={n}>{t('medications.scheduleEditor.cycleDays', { count: n })}</option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}

// Historique des posologies d'un médicament : chaque période, et l'ajout d'une période passée.
function DoseHistory({ med, unitLabel, today, onChange }: {
  med: Medication;
  unitLabel: string;
  today: string;
  onChange: (med: Medication) => void;
}) {
  const { t, i18n } = useTranslation();
  const profile = useAuthStore((s) => s.user?.profile);
  const [adding, setAdding] = useState(false);
  const [pastDate, setPastDate] = useState('');
  const [pastSchedule, setPastSchedule] = useState<Schedule>(EMPTY_SCHEDULE);
  const current = periodAtDay(med.dosePeriods, today);
  // Pour un médicament du graphique TSH : les TSH mesurées pendant chaque période. Même
  // requête (et même cache) que la page Analyses.
  const { data: labs = [] } = useQuery({
    queryKey: ['lab-results'],
    queryFn: () => labApi.list().then((r) => r.data),
    enabled: med.showOnChart,
  });
  const periods = med.dosePeriods
    .map((p, i) => ({ ...p, labs: labsDuringPeriod(p, med.dosePeriods[i + 1]?.startDate ?? null, labs) }))
    .reverse(); // la plus récente en premier

  const addMut = useMutation({
    mutationFn: () => medApi.addDosePeriod(med.id, { startDate: pastDate, slots: slotsFromSchedule(pastSchedule) }),
    onSuccess: (res) => {
      toast.success(t('medications.history.added'));
      setAdding(false); setPastDate(''); setPastSchedule(EMPTY_SCHEDULE);
      onChange(res.data);
    },
    onError: () => toast.error(t('medications.error')),
  });

  const deleteMut = useMutation({
    mutationFn: (periodId: string) => medApi.deleteDosePeriod(med.id, periodId),
    onSuccess: (res) => { toast.success(t('medications.history.deleted')); onChange(res.data); },
    onError: () => toast.error(t('medications.error')),
  });

  const submitPast = () => {
    if (!pastDate) return toast.error(t('medications.missingFields'));
    if (!isScheduleValid(slotsFromSchedule(pastSchedule))) return toast.error(t('medications.scheduleEditor.invalid'));
    addMut.mutate();
  };

  return (
    <section className={styles.history}>
      <h3 className={styles.historyTitle}><History size={14} /> {t('medications.history.title')}</h3>
      <ul className={styles.historyList}>
        {periods.map((p) => (
          <li key={p.id} className={styles.historyItem}>
            <div>
              <div className={styles.historyDate}>
                {t('medications.history.since', { date: formatDate(p.startDate) })}
                {p.id === current?.id && <span className={styles.currentTag}>{t('medications.history.current')}</span>}
              </div>
              <div className={styles.historySchedule}>{formatSchedule(p.slots, unitLabel, t)}</div>
              {med.showOnChart && (
                <div className={styles.historyLabs} data-testid={`period-labs-${p.id}`}>
                  {p.labs.length === 0 ? t('medications.history.noLabs') : (
                    <>
                      {t('medications.history.tsh')}{' '}
                      {[...p.labs].sort((a, b) => a.date.localeCompare(b.date)).map((l, i) => {
                        const unstable = (weeksSinceDoseChange([med], l.date.slice(0, 10)) ?? Infinity) < STABILIZATION_WEEKS;
                        return (
                          <span key={l.id}>
                            {i > 0 && ' · '}
                            <span
                              className={unstable ? styles.labUnstable : undefined}
                              style={{ color: tshStatus(l.tsh!, profile?.targetTSH_min, profile?.targetTSH_max).color }}
                              title={unstable ? t('medications.history.unstable', { weeks: STABILIZATION_WEEKS }) : undefined}
                            >
                              {l.tsh!.toLocaleString(i18n.language)}
                            </span>
                            <span className={styles.labDate}> ({formatDate(l.date)})</span>
                          </span>
                        );
                      })}
                    </>
                  )}
                </div>
              )}
            </div>
            {periods.length > 1 && (
              <button
                type="button" className={styles.iconBtn} title={t('medications.history.delete')} aria-label={t('medications.history.delete')}
                onClick={() => { if (confirm(t('medications.history.deleteConfirm'))) deleteMut.mutate(p.id); }}
              >
                <Trash2 size={14} />
              </button>
            )}
          </li>
        ))}
      </ul>

      {adding ? (
        <div className={styles.historyForm}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="past-start-date">{t('medications.history.startDate')}</label>
            <input id="past-start-date" className={styles.input} type="date" max={today} value={pastDate} onChange={(e) => setPastDate(e.target.value)} />
          </div>
          <ScheduleEditor value={pastSchedule} onChange={setPastSchedule} unitLabel={unitLabel} idPrefix="past" required={false} />
          <div className={styles.scheduleActions}>
            <button type="button" className={styles.cancelBtn} onClick={() => setAdding(false)}>{t('common.cancel')}</button>
            <button type="button" className={styles.submitBtn} onClick={submitPast} disabled={addMut.isPending}>{t('medications.history.add')}</button>
          </div>
        </div>
      ) : (
        <button type="button" className={styles.linkBtn} onClick={() => setAdding(true)}>
          <Plus size={14} /> {t('medications.history.addPast')}
        </button>
      )}
    </section>
  );
}

function MedCard({ med, freqLabels, unitLabels, intakes, today, onEdit, onDelete, onToggle, onTake, onUntake }: {
  med: Medication;
  freqLabels: Record<Medication['frequency'], string>;
  unitLabels: Record<Medication['dosageUnit'], string>;
  intakes: MedicationIntake[];
  today: string;
  onEdit: (m: Medication) => void;
  onDelete: (id: string) => void;
  onToggle: (m: Medication) => void;
  onTake: (id: string, time: string) => void;
  onUntake: (id: string, time: string) => void;
}) {
  const { t } = useTranslation();
  const takenTimes = new Set(intakes.filter((i) => i.medicationId === med.id).map((i) => i.time));
  const unitLabel = unitLabels[med.dosageUnit];
  const period = periodAtDay(med.dosePeriods, today) ?? med.dosePeriods[med.dosePeriods.length - 1];
  // Créneaux à heure fixe du jour ; ceux à 0 aujourd'hui (jour sans prise du cycle) sont masqués.
  const timedToday = dosesForDate(med, today).filter((d): d is { time: string; dose: number } => d.time !== null);
  const dueToday = timedToday.filter((d) => d.dose > 0);
  const singleTime = period?.slots.length === 1 ? period.slots[0].time : null;

  return (
    <div className={`${styles.medCard} ${!med.active ? styles.medCardInactive : ''}`} onClick={() => onEdit(med)}>
      <div className={styles.medIcon}><Pill size={18} /></div>
      <div className={styles.medInfo}>
        <div className={styles.medName}>
          {med.name}{' '}
          <span className={styles.medDose}>{period ? formatSchedule(period.slots, unitLabel, t) : `${med.dosage} ${unitLabel}`}</span>
        </div>
        {med.brand && <div className={styles.medBrand}>{med.brand}</div>}
        <div className={styles.medMeta}>
          {[
            med.frequency === 'AS_NEEDED' ? freqLabels.AS_NEEDED : null,
            singleTime,
            med.instructions,
          ].filter(Boolean).join(' · ')}
        </div>
        <div className={styles.medDate}>{t('medications.since', { date: formatDate(med.startDate) })}</div>

        {med.active && timedToday.length > 0 && (
          <div className={styles.doseChecklist} onClick={(e) => e.stopPropagation()}>
            {dueToday.length === 0 && <span className={styles.noIntakeToday}>{t('medications.noIntakeToday')}</span>}
            {dueToday.map(({ time, dose }) => {
              const taken = takenTimes.has(time);
              return (
                <button
                  key={time}
                  type="button"
                  className={`${styles.doseBtn} ${taken ? styles.doseBtnTaken : ''}`}
                  onClick={() => (taken ? onUntake(med.id, time) : onTake(med.id, time))}
                >
                  {taken ? <CheckCircle2 size={14} /> : <Circle size={14} />}
                  {time} — {t('medications.schedule.dose', { dose, unitLabel })} · {taken ? t('medications.doseTaken') : t('medications.doseNotTaken')}
                </button>
              );
            })}
          </div>
        )}
      </div>
      <div className={styles.medActions} onClick={(e) => e.stopPropagation()}>
        <button className={styles.iconBtn} onClick={() => onToggle(med)} title={med.active ? t('medications.deactivate') : t('medications.reactivate')}>
          {med.active ? <ToggleRight size={20} style={{ color: 'var(--teal)' }} /> : <ToggleLeft size={20} />}
        </button>
        <button className={styles.iconBtn} onClick={() => onDelete(med.id)} title={t('medications.delete')}>
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
}
