// src/pages/ProfilePage.tsx
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { User, Save, Target, Settings } from 'lucide-react';
import { profileApi } from '../lib/api';
import { useAuthStore } from '../lib/store';
import { DIAGNOSIS_LABELS, THYROID_STATUS_LABELS, type UserProfile } from '../types';
import styles from './ProfilePage.module.css';

export function ProfilePage() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const [form, setForm] = useState<Partial<UserProfile>>({});
  const [dirty, setDirty] = useState(false);

  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: () => profileApi.get().then((r) => r.data),
  });

  useEffect(() => {
    if (profile) setForm(profile);
  }, [profile]);

  const updateMut = useMutation({
    mutationFn: (data: Partial<UserProfile>) => profileApi.update(data),
    onSuccess: () => {
      toast.success('Profil mis à jour');
      qc.invalidateQueries({ queryKey: ['profile'] });
      setDirty(false);
    },
    onError: () => toast.error('Erreur lors de la mise à jour'),
  });

  const set = (key: keyof UserProfile) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const val = e.target.type === 'number' ? (e.target.value ? parseFloat(e.target.value) : undefined) : (e.target.value || null);
    setForm((f) => ({ ...f, [key]: val }));
    setDirty(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMut.mutate(form);
  };

  if (isLoading) return <div style={{ display: 'flex', justifyContent: 'center', padding: '80px' }}><div className="spinner" /></div>;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.avatar}>{user?.name?.charAt(0).toUpperCase()}</div>
        <div>
          <h1 className={styles.title}>{user?.name}</h1>
          <p className={styles.email}>{user?.email}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        {/* ── Diagnosis */}
        <Section title="Mon diagnostic" icon={<User size={16} strokeWidth={1.8} />}>
          <div className={styles.grid2}>
            <div className={styles.field}>
              <label className={styles.label}>Type de pathologie</label>
              <select className={styles.input} value={form.diagnosisType ?? ''} onChange={set('diagnosisType') as (e: React.ChangeEvent<HTMLSelectElement>) => void}>
                <option value="">Non précisé</option>
                {Object.entries(DIAGNOSIS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Date du diagnostic</label>
              <input className={styles.input} type="date"
                value={form.diagnosisDate ? (form.diagnosisDate as string).split('T')[0] : ''}
                onChange={set('diagnosisDate')} />
            </div>
          </div>
          <div className={styles.grid2}>
            <div className={styles.field}>
              <label className={styles.label}>État de la thyroïde</label>
              <select className={styles.input} value={form.thyroidStatus ?? ''} onChange={set('thyroidStatus') as (e: React.ChangeEvent<HTMLSelectElement>) => void}>
                <option value="">Non précisé</option>
                {Object.entries(THYROID_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Nom de l'endocrinologue</label>
              <input className={styles.input} placeholder="Dr. Nom Prénom"
                value={form.endocrinologistName ?? ''}
                onChange={set('endocrinologistName')} />
            </div>
          </div>
        </Section>

        {/* ── Target ranges */}
        <Section title="Plages cibles personnalisées" icon={<Target size={16} strokeWidth={1.8} />}>
          <p className={styles.hint}>Ces valeurs sont définies avec votre endocrinologue. Elles servent à coloriser vos analyses.</p>
          <div className={styles.grid3}>
            <div className={styles.field}>
              <label className={styles.label}>TSH min (mUI/L)</label>
              <input className={styles.input} type="number" step="0.01" placeholder="0.40"
                value={form.targetTSH_min ?? ''} onChange={set('targetTSH_min')} />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>TSH max (mUI/L)</label>
              <input className={styles.input} type="number" step="0.01" placeholder="4.00"
                value={form.targetTSH_max ?? ''} onChange={set('targetTSH_max')} />
            </div>
            <div></div>
            <div className={styles.field}>
              <label className={styles.label}>FT4 min (pmol/L)</label>
              <input className={styles.input} type="number" step="0.1" placeholder="12.0"
                value={form.targetFT4_min ?? ''} onChange={set('targetFT4_min')} />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>FT4 max (pmol/L)</label>
              <input className={styles.input} type="number" step="0.1" placeholder="22.0"
                value={form.targetFT4_max ?? ''} onChange={set('targetFT4_max')} />
            </div>
            <div></div>
            <div className={styles.field}>
              <label className={styles.label}>FT3 min (pmol/L)</label>
              <input className={styles.input} type="number" step="0.1" placeholder="3.5"
                value={form.targetFT3_min ?? ''} onChange={set('targetFT3_min')} />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>FT3 max (pmol/L)</label>
              <input className={styles.input} type="number" step="0.1" placeholder="6.5"
                value={form.targetFT3_max ?? ''} onChange={set('targetFT3_max')} />
            </div>
          </div>
        </Section>

        {/* ── Preferences */}
        <Section title="Préférences" icon={<Settings size={16} strokeWidth={1.8} />}>
          <div className={styles.grid2}>
            <div className={styles.field}>
              <label className={styles.label}>Unité de poids</label>
              <select className={styles.input} value={form.weightUnit ?? 'KG'} onChange={set('weightUnit') as (e: React.ChangeEvent<HTMLSelectElement>) => void}>
                <option value="KG">Kilogrammes (kg)</option>
                <option value="LBS">Livres (lbs)</option>
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Unité de température</label>
              <select className={styles.input} value={form.temperatureUnit ?? 'CELSIUS'} onChange={set('temperatureUnit') as (e: React.ChangeEvent<HTMLSelectElement>) => void}>
                <option value="CELSIUS">Celsius (°C)</option>
                <option value="FAHRENHEIT">Fahrenheit (°F)</option>
              </select>
            </div>
          </div>
        </Section>

        {/* ── Save */}
        <button
          type="submit"
          className={`${styles.saveBtn} ${dirty ? styles.saveBtnDirty : ''}`}
          disabled={updateMut.isPending || !dirty}
        >
          <Save size={16} />
          {updateMut.isPending ? 'Enregistrement…' : dirty ? 'Enregistrer les modifications' : 'Profil à jour'}
        </button>
      </form>
    </div>
  );
}

function Section({ title, children, icon }: { title: string; children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className={styles.section}>
      <h2 className={styles.sectionTitle}>{icon}{title}</h2>
      <div className={styles.sectionBody}>{children}</div>
    </div>
  );
}
