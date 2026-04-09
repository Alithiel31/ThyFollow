// src/pages/MedicationsPage.tsx
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Plus, Pill, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';
import { medApi } from '../lib/api';
import { formatDate } from '../lib/utils';
import type { Medication } from '../types';
import styles from './MedicationsPage.module.css';

const FREQ_LABELS: Record<Medication['frequency'], string> = {
  DAILY: 'Quotidien',
  EVERY_OTHER_DAY: 'Un jour sur deux',
  WEEKLY: 'Hebdomadaire',
  AS_NEEDED: 'Si besoin',
};

const EMPTY: Partial<Medication> = {
  name: '', brand: '', dosageMcg: undefined, frequency: 'DAILY',
  intakeTime: '07:00', startDate: new Date().toISOString().split('T')[0],
  active: true, instructions: '', notes: '',
};

export function MedicationsPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<Medication | null>(null);
  const [form, setForm] = useState<Partial<Medication>>(EMPTY);

  const { data: meds = [], isLoading } = useQuery({
    queryKey: ['medications'],
    queryFn: () => medApi.list().then((r) => r.data),
  });

  const createMut = useMutation({
    mutationFn: (d: Partial<Medication> & { name: string; dosageMcg: number; startDate: string }) => medApi.create(d),
    onSuccess: () => { toast.success('Médicament ajouté'); qc.invalidateQueries({ queryKey: ['medications'] }); resetForm(); },
    onError: () => toast.error('Erreur'),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Medication> }) => medApi.update(id, data),
    onSuccess: () => { toast.success('Mis à jour'); qc.invalidateQueries({ queryKey: ['medications'] }); resetForm(); },
    onError: () => toast.error('Erreur'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => medApi.delete(id),
    onSuccess: () => { toast.success('Supprimé'); qc.invalidateQueries({ queryKey: ['medications'] }); },
    onError: () => toast.error('Erreur'),
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
    if (!form.name || !form.dosageMcg || !form.startDate) return toast.error('Champs obligatoires manquants');
    const payload = { ...form } as Partial<Medication> & { name: string; dosageMcg: number; startDate: string };
    if (editItem) updateMut.mutate({ id: editItem.id, data: payload });
    else createMut.mutate(payload);
  };

  const set = (key: keyof Medication) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const val = e.target.type === 'number' ? (e.target.value ? parseFloat(e.target.value) : undefined) : e.target.value;
    setForm((f) => ({ ...f, [key]: val }));
  };

  const activeMeds = meds.filter((m) => m.active);
  const inactiveMeds = meds.filter((m) => !m.active);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Médicaments</h1>
          <p className={styles.sub}>Gérez vos traitements thyroïdiens</p>
        </div>
        <button className={styles.addBtn} onClick={() => { resetForm(); setShowForm(true); }}>
          <Plus size={16} /> Ajouter
        </button>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && resetForm()}>
          <div className={styles.modal}>
            <h2 className={styles.modalTitle}>
              <Pill size={18} />
              {editItem ? 'Modifier le médicament' : 'Nouveau médicament'}
            </h2>
            <form onSubmit={handleSubmit} className={styles.form}>
              <div className={styles.grid2}>
                <div className={styles.field}>
                  <label className={styles.label}>Nom du médicament *</label>
                  <input className={styles.input} placeholder="Levothyrox" value={form.name ?? ''} onChange={set('name')} required />
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>Marque / Générique</label>
                  <input className={styles.input} placeholder="Euthyrox, L-Thyroxine…" value={form.brand ?? ''} onChange={set('brand')} />
                </div>
              </div>

              <div className={styles.grid2}>
                <div className={styles.field}>
                  <label className={styles.label}>Dosage (µg) *</label>
                  <input className={styles.input} type="number" step="12.5" placeholder="75" value={form.dosageMcg ?? ''} onChange={set('dosageMcg')} required />
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>Fréquence</label>
                  <select className={styles.input} value={form.frequency ?? 'DAILY'} onChange={set('frequency') as (e: React.ChangeEvent<HTMLSelectElement>) => void}>
                    {Object.entries(FREQ_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
              </div>

              <div className={styles.grid2}>
                <div className={styles.field}>
                  <label className={styles.label}>Heure de prise</label>
                  <input className={styles.input} type="time" value={form.intakeTime ?? '07:00'} onChange={set('intakeTime')} />
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>Date de début *</label>
                  <input className={styles.input} type="date" value={form.startDate ?? ''} onChange={set('startDate')} required />
                </div>
              </div>

              <div className={styles.field}>
                <label className={styles.label}>Instructions</label>
                <input className={styles.input} placeholder="À jeun, 30 min avant le repas" value={form.instructions ?? ''} onChange={set('instructions')} />
              </div>

              <div className={styles.field}>
                <label className={styles.label}>Notes</label>
                <textarea className={styles.textarea} rows={2} value={form.notes ?? ''} onChange={set('notes')} placeholder="Observations personnelles…" />
              </div>

              <div className={styles.formActions}>
                <button type="button" className={styles.cancelBtn} onClick={resetForm}>Annuler</button>
                <button type="submit" className={styles.submitBtn} disabled={createMut.isPending || updateMut.isPending}>
                  {createMut.isPending || updateMut.isPending ? 'Enregistrement…' : editItem ? 'Mettre à jour' : 'Enregistrer'}
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
          <p>Aucun médicament enregistré</p>
          <button className={styles.addBtn} onClick={() => setShowForm(true)}>Ajouter mon premier traitement</button>
        </div>
      ) : (
        <>
          {activeMeds.length > 0 && (
            <section>
              <h2 className={styles.sectionLabel}>Traitements actifs</h2>
              <div className={styles.list}>
                {activeMeds.map((m) => <MedCard key={m.id} med={m} onEdit={openEdit} onDelete={(id) => { if (confirm('Supprimer ?')) deleteMut.mutate(id); }} onToggle={toggleActive} />)}
              </div>
            </section>
          )}
          {inactiveMeds.length > 0 && (
            <section style={{ marginTop: '28px' }}>
              <h2 className={styles.sectionLabel} style={{ color: 'var(--text-muted)' }}>Traitements passés</h2>
              <div className={styles.list}>
                {inactiveMeds.map((m) => <MedCard key={m.id} med={m} onEdit={openEdit} onDelete={(id) => { if (confirm('Supprimer ?')) deleteMut.mutate(id); }} onToggle={toggleActive} />)}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function MedCard({ med, onEdit, onDelete, onToggle }: {
  med: Medication;
  onEdit: (m: Medication) => void;
  onDelete: (id: string) => void;
  onToggle: (m: Medication) => void;
}) {
  return (
    <div className={`${styles.medCard} ${!med.active ? styles.medCardInactive : ''}`} onClick={() => onEdit(med)}>
      <div className={styles.medIcon}><Pill size={18} /></div>
      <div className={styles.medInfo}>
        <div className={styles.medName}>{med.name} <span className={styles.medDose}>{med.dosageMcg} µg</span></div>
        {med.brand && <div className={styles.medBrand}>{med.brand}</div>}
        <div className={styles.medMeta}>
          {FREQ_LABELS[med.frequency]}
          {med.intakeTime && ` · ${med.intakeTime}`}
          {med.instructions && ` · ${med.instructions}`}
        </div>
        <div className={styles.medDate}>Depuis le {formatDate(med.startDate)}</div>
      </div>
      <div className={styles.medActions} onClick={(e) => e.stopPropagation()}>
        <button className={styles.iconBtn} onClick={() => onToggle(med)} title={med.active ? 'Désactiver' : 'Réactiver'}>
          {med.active ? <ToggleRight size={20} style={{ color: 'var(--teal)' }} /> : <ToggleLeft size={20} />}
        </button>
        <button className={styles.iconBtn} onClick={() => onDelete(med.id)} title="Supprimer">
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
}
