// src/pages/MedicationsPage.tsx
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Plus, Pill, Trash2, ToggleLeft, ToggleRight, CheckCircle2, Circle } from 'lucide-react';
import { medApi } from '../lib/api';
import { formatDate, toISODate } from '../lib/utils';
import type { Medication, MedicationIntake } from '../types';
import styles from './MedicationsPage.module.css';

const DEFAULT_TIMES = ['08:00', '14:00', '20:00', '22:00', '06:00', '12:00', '18:00', '23:00'];

const EMPTY: Partial<Medication> = {
  name: '', brand: '', dosage: undefined, dosageUnit: 'MCG', frequency: 'DAILY',
  intakeTimes: ['07:00'], startDate: new Date().toISOString().split('T')[0],
  active: true, instructions: '', notes: '',
};

export function MedicationsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<Medication | null>(null);
  const [form, setForm] = useState<Partial<Medication>>(EMPTY);
  const today = toISODate(new Date());

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
    mutationFn: (d: Partial<Medication> & { name: string; dosage: number; startDate: string }) => medApi.create(d),
    onSuccess: () => { toast.success(t('medications.added')); qc.invalidateQueries({ queryKey: ['medications'] }); resetForm(); },
    onError: () => toast.error(t('medications.error')),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Medication> }) => medApi.update(id, data),
    onSuccess: () => { toast.success(t('medications.updated')); qc.invalidateQueries({ queryKey: ['medications'] }); resetForm(); },
    onError: () => toast.error(t('medications.error')),
  });

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

  const resetForm = () => { setShowForm(false); setEditItem(null); setForm(EMPTY); };

  const openEdit = (m: Medication) => {
    setEditItem(m);
    setForm({ ...m, startDate: m.startDate.split('T')[0], endDate: m.endDate?.split('T')[0] ?? '' });
    setShowForm(true);
  };

  const toggleActive = (m: Medication) => {
    updateMut.mutate({ id: m.id, data: { active: !m.active } });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.dosage || !form.startDate) return toast.error(t('medications.missingFields'));
    const payload = { ...form } as Partial<Medication> & { name: string; dosage: number; startDate: string };
    if (editItem) updateMut.mutate({ id: editItem.id, data: payload });
    else createMut.mutate(payload);
  };

  const set = (key: keyof Medication) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const val = e.target.type === 'number' ? (e.target.value ? parseFloat(e.target.value) : undefined) : e.target.value;
    setForm((f) => ({ ...f, [key]: val }));
  };

  const setTimesPerDay = (count: number) => {
    setForm((f) => {
      const current = f.intakeTimes ?? [];
      const next = Array.from({ length: count }, (_, i) => current[i] ?? DEFAULT_TIMES[i] ?? '08:00');
      return { ...f, intakeTimes: next };
    });
  };

  const setTimeSlot = (index: number, value: string) => {
    setForm((f) => {
      const next = [...(f.intakeTimes ?? [])];
      next[index] = value;
      return { ...f, intakeTimes: next };
    });
  };

  const activeMeds = meds.filter((m) => m.active);
  const inactiveMeds = meds.filter((m) => !m.active);
  const timesPerDay = (form.intakeTimes ?? ['07:00']).length;

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
                  <label className={styles.label}>{t('medications.name')}</label>
                  <input className={styles.input} placeholder={t('medications.namePlaceholder')} value={form.name ?? ''} onChange={set('name')} required />
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>{t('medications.brand')}</label>
                  <input className={styles.input} placeholder={t('medications.brandPlaceholder')} value={form.brand ?? ''} onChange={set('brand')} />
                </div>
              </div>

              <div className={styles.grid2}>
                <div className={styles.field}>
                  <label className={styles.label}>{t('medications.dosage')}</label>
                  <div className={styles.dosageRow}>
                    <input className={styles.input} type="number" step="0.1" placeholder="75" value={form.dosage ?? ''} onChange={set('dosage')} required />
                    <select className={styles.input} value={form.dosageUnit ?? 'MCG'} onChange={set('dosageUnit') as (e: React.ChangeEvent<HTMLSelectElement>) => void}>
                      {Object.entries(UNIT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>{t('medications.frequencyLabel')}</label>
                  <select className={styles.input} value={form.frequency ?? 'DAILY'} onChange={set('frequency') as (e: React.ChangeEvent<HTMLSelectElement>) => void}>
                    {Object.entries(FREQ_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
              </div>

              <div className={styles.field}>
                <label className={styles.label}>{t('medications.timesPerDay')}</label>
                <select className={styles.input} value={timesPerDay} onChange={(e) => setTimesPerDay(parseInt(e.target.value, 10))}>
                  {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{t('medications.timesPerDayOption', { count: n })}</option>)}
                </select>
                <div className={styles.timeSlotsRow}>
                  {(form.intakeTimes ?? ['07:00']).map((time, i) => (
                    <input key={i} className={styles.input} type="time" value={time} onChange={(e) => setTimeSlot(i, e.target.value)} />
                  ))}
                </div>
              </div>

              <div className={styles.field}>
                <label className={styles.label}>{t('medications.startDate')}</label>
                <input className={styles.input} type="date" value={form.startDate ?? ''} onChange={set('startDate')} required />
              </div>

              <div className={styles.field}>
                <label className={styles.label}>{t('medications.instructions')}</label>
                <input className={styles.input} placeholder={t('medications.instructionsPlaceholder')} value={form.instructions ?? ''} onChange={set('instructions')} />
              </div>

              <div className={styles.field}>
                <label className={styles.label}>{t('medications.notes')}</label>
                <textarea className={styles.textarea} rows={2} value={form.notes ?? ''} onChange={set('notes')} placeholder={t('medications.notesPlaceholder')} />
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
                    key={m.id} med={m} freqLabels={FREQ_LABELS} unitLabels={UNIT_LABELS} intakes={intakes}
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
                    key={m.id} med={m} freqLabels={FREQ_LABELS} unitLabels={UNIT_LABELS} intakes={intakes}
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

function MedCard({ med, freqLabels, unitLabels, intakes, onEdit, onDelete, onToggle, onTake, onUntake }: {
  med: Medication;
  freqLabels: Record<Medication['frequency'], string>;
  unitLabels: Record<Medication['dosageUnit'], string>;
  intakes: MedicationIntake[];
  onEdit: (m: Medication) => void;
  onDelete: (id: string) => void;
  onToggle: (m: Medication) => void;
  onTake: (id: string, time: string) => void;
  onUntake: (id: string, time: string) => void;
}) {
  const { t } = useTranslation();
  const takenTimes = new Set(intakes.filter((i) => i.medicationId === med.id).map((i) => i.time));

  return (
    <div className={`${styles.medCard} ${!med.active ? styles.medCardInactive : ''}`} onClick={() => onEdit(med)}>
      <div className={styles.medIcon}><Pill size={18} /></div>
      <div className={styles.medInfo}>
        <div className={styles.medName}>{med.name} <span className={styles.medDose}>{med.dosage} {unitLabels[med.dosageUnit]}</span></div>
        {med.brand && <div className={styles.medBrand}>{med.brand}</div>}
        <div className={styles.medMeta}>
          {freqLabels[med.frequency]}
          {med.intakeTimes.length > 0 && ` · ${med.intakeTimes.join(', ')}`}
          {med.instructions && ` · ${med.instructions}`}
        </div>
        <div className={styles.medDate}>{t('medications.since', { date: formatDate(med.startDate) })}</div>

        {med.active && med.intakeTimes.length > 0 && (
          <div className={styles.doseChecklist} onClick={(e) => e.stopPropagation()}>
            {med.intakeTimes.map((time) => {
              const taken = takenTimes.has(time);
              return (
                <button
                  key={time}
                  type="button"
                  className={`${styles.doseBtn} ${taken ? styles.doseBtnTaken : ''}`}
                  onClick={() => (taken ? onUntake(med.id, time) : onTake(med.id, time))}
                >
                  {taken ? <CheckCircle2 size={14} /> : <Circle size={14} />}
                  {time} — {taken ? t('medications.doseTaken') : t('medications.doseNotTaken')}
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
