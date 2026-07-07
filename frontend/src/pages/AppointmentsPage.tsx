// src/pages/AppointmentsPage.tsx
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Plus, Calendar, Trash2, Check, CalendarPlus,
  Stethoscope, Syringe, Microscope, Waves, Radiation, HeartPulse,
} from 'lucide-react';
import { downloadICS, googleCalendarUrl } from '../lib/calendar';
import { apptApi } from '../lib/api';
import { formatDate } from '../lib/utils';
import type { Appointment, AppointmentType } from '../types';
import styles from './AppointmentsPage.module.css';

const TYPE_LABELS: Record<AppointmentType, string> = {
  ENDOCRINOLOGIST: 'Endocrinologue',
  GENERAL_PRACTITIONER: 'Médecin généraliste',
  ULTRASOUND: 'Échographie thyroïdienne',
  BLOOD_TEST: 'Prise de sang',
  SCINTIGRAPHY: 'Scintigraphie',
  BIOPSY: 'Biopsie / Ponction',
  OTHER: 'Autre',
};

const TYPE_ICONS: Record<AppointmentType, typeof Calendar> = {
  ENDOCRINOLOGIST: Stethoscope,
  GENERAL_PRACTITIONER: HeartPulse,
  ULTRASOUND: Waves,
  BLOOD_TEST: Syringe,
  SCINTIGRAPHY: Radiation,
  BIOPSY: Microscope,
  OTHER: Calendar,
};

const STATUS_LABELS = { UPCOMING: 'À venir', COMPLETED: 'Terminé', CANCELLED: 'Annulé' };

const EMPTY: Partial<Appointment> = {
  date: '', type: 'ENDOCRINOLOGIST', doctorName: '',
  location: '', notes: '', reminder: true, status: 'UPCOMING',
};

export function AppointmentsPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<Appointment | null>(null);
  const [form, setForm] = useState<Partial<Appointment>>(EMPTY);
  const [filter, setFilter] = useState<'UPCOMING' | 'COMPLETED' | 'ALL'>('UPCOMING');

  const { data: appts = [], isLoading } = useQuery({
    queryKey: ['appointments'],
    queryFn: () => apptApi.list().then((r) => r.data),
  });

  const createMut = useMutation({
    mutationFn: (d: Partial<Appointment> & { date: string; type: AppointmentType }) => apptApi.create(d),
    onSuccess: () => { toast.success('Rendez-vous ajouté'); qc.invalidateQueries({ queryKey: ['appointments'] }); resetForm(); },
    onError: () => toast.error('Erreur'),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Appointment> }) => apptApi.update(id, data),
    onSuccess: () => { toast.success('Mis à jour'); qc.invalidateQueries({ queryKey: ['appointments'] }); resetForm(); },
    onError: () => toast.error('Erreur'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => apptApi.delete(id),
    onSuccess: () => { toast.success('Supprimé'); qc.invalidateQueries({ queryKey: ['appointments'] }); },
    onError: () => toast.error('Erreur'),
  });

  const resetForm = () => { setShowForm(false); setEditItem(null); setForm(EMPTY); };

  const openEdit = (a: Appointment) => {
    setEditItem(a);
    const d = new Date(a.date);
    const local = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    setForm({ ...a, date: local });
    setShowForm(true);
  };

  const markDone = (a: Appointment) => updateMut.mutate({ id: a.id, data: { status: 'COMPLETED' } });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.date || !form.type) return toast.error('Date et type obligatoires');
    const payload = { ...form } as Partial<Appointment> & { date: string; type: AppointmentType };
    if (editItem) updateMut.mutate({ id: editItem.id, data: payload });
    else createMut.mutate(payload);
  };

  const set = (key: keyof Appointment) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value }));

  const filtered = filter === 'ALL' ? appts : appts.filter((a) => a.status === filter);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Rendez-vous</h1>
          <p className={styles.sub}>Gérez votre agenda médical thyroïdien</p>
        </div>
        <button className={styles.addBtn} onClick={() => { resetForm(); setShowForm(true); }}>
          <Plus size={16} /> Ajouter
        </button>
      </div>

      {/* Filters */}
      <div className={styles.filters}>
        {(['UPCOMING', 'ALL', 'COMPLETED'] as const).map((f) => (
          <button key={f} className={`${styles.filterBtn} ${filter === f ? styles.filterActive : ''}`}
            onClick={() => setFilter(f)}>
            {f === 'UPCOMING' ? 'À venir' : f === 'ALL' ? 'Tous' : 'Terminés'}
          </button>
        ))}
      </div>

      {/* Modal */}
      {showForm && (
        <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && resetForm()}>
          <div className={styles.modal}>
            <h2 className={styles.modalTitle}><Calendar size={18} /> {editItem ? 'Modifier' : 'Nouveau rendez-vous'}</h2>
            <form onSubmit={handleSubmit} className={styles.form}>
              <div className={styles.field}>
                <label className={styles.label}>Type de rendez-vous *</label>
                <select className={styles.input} value={form.type ?? 'ENDOCRINOLOGIST'} onChange={set('type') as (e: React.ChangeEvent<HTMLSelectElement>) => void}>
                  {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Date et heure *</label>
                <input className={styles.input} type="datetime-local" value={form.date as string ?? ''} onChange={set('date')} required />
              </div>
              <div className={styles.grid2}>
                <div className={styles.field}>
                  <label className={styles.label}>Médecin</label>
                  <input className={styles.input} placeholder="Dr. Nom" value={form.doctorName ?? ''} onChange={set('doctorName')} />
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>Lieu</label>
                  <input className={styles.input} placeholder="Cabinet, hôpital…" value={form.location ?? ''} onChange={set('location')} />
                </div>
              </div>
              {editItem && (
                <div className={styles.field}>
                  <label className={styles.label}>Statut</label>
                  <select className={styles.input} value={form.status ?? 'UPCOMING'} onChange={set('status') as (e: React.ChangeEvent<HTMLSelectElement>) => void}>
                    {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
              )}
              <div className={styles.field}>
                <label className={styles.label}>Notes</label>
                <textarea className={styles.textarea} rows={3} value={form.notes ?? ''} onChange={set('notes')} placeholder="Questions à poser, examens à apporter…" />
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

      {/* List */}
      {isLoading ? (
        <div className={styles.loader}><div className="spinner" /></div>
      ) : filtered.length === 0 ? (
        <div className={styles.empty}>
          <Calendar size={40} strokeWidth={1} />
          <p>Aucun rendez-vous {filter === 'UPCOMING' ? 'à venir' : ''}</p>
          <button className={styles.addBtn} onClick={() => setShowForm(true)}>Ajouter un rendez-vous</button>
        </div>
      ) : (
        <div className={styles.list}>
          {filtered.map((a) => (
            <div key={a.id} className={`${styles.apptCard} ${a.status === 'COMPLETED' ? styles.apptDone : ''} ${a.status === 'CANCELLED' ? styles.apptCancelled : ''}`}
              onClick={() => openEdit(a)}>
              <div className={styles.apptEmoji}>
                {(() => { const Icon = TYPE_ICONS[a.type]; return <Icon size={18} strokeWidth={1.8} />; })()}
              </div>
              <div className={styles.apptInfo}>
                <div className={styles.apptType}>{TYPE_LABELS[a.type]}</div>
                <div className={styles.apptDate}>{formatDate(a.date, "EEEE d MMMM yyyy 'à' HH'h'mm")}</div>
                {a.doctorName && <div className={styles.apptMeta}>{a.doctorName}{a.location && ` · ${a.location}`}</div>}
                {a.notes && <div className={styles.apptNotes}>{a.notes}</div>}
              </div>
              <div className={styles.apptActions} onClick={(e) => e.stopPropagation()}>
                {a.status === 'UPCOMING' && (
                  <>
                    <button className={styles.iconBtn} onClick={() => downloadICS(a, TYPE_LABELS[a.type])}
                      title="Ajouter à mon agenda (.ics)">
                      <CalendarPlus size={16} />
                    </button>
                    <a className={styles.iconBtn} href={googleCalendarUrl(a, TYPE_LABELS[a.type])}
                      target="_blank" rel="noopener noreferrer" title="Ajouter à Google Agenda">
                      <span className={styles.gcal}>G</span>
                    </a>
                    <button className={styles.doneBtn} onClick={() => markDone(a)} title="Marquer comme terminé">
                      <Check size={14} />
                    </button>
                  </>
                )}
                <span className={`${styles.statusBadge} ${styles[`status_${a.status}`]}`}>
                  {STATUS_LABELS[a.status]}
                </span>
                <button className={styles.iconBtn} onClick={() => { if (confirm('Supprimer ?')) deleteMut.mutate(a.id); }}>
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
