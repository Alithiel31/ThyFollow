// src/pages/ProfilePage.tsx
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { User, Save, Target, Settings, LogOut } from 'lucide-react';
import { profileApi } from '../lib/api';
import { useAuthStore } from '../lib/store';
import { DIAGNOSIS_LABEL_KEYS, THYROID_STATUS_LABEL_KEYS, type UserProfile } from '../types';
import styles from './ProfilePage.module.css';

export function ProfilePage() {
  const { t } = useTranslation();
  const { user, logout } = useAuthStore();
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
      toast.success(t('profile.updated'));
      qc.invalidateQueries({ queryKey: ['profile'] });
      setDirty(false);
    },
    onError: () => toast.error(t('profile.updateError')),
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
        <Section title={t('profile.diagnosisSection')} icon={<User size={16} strokeWidth={1.8} />}>
          <div className={styles.grid2}>
            <div className={styles.field}>
              <label className={styles.label}>{t('profile.diagnosisType')}</label>
              <select className={styles.input} value={form.diagnosisType ?? ''} onChange={set('diagnosisType') as (e: React.ChangeEvent<HTMLSelectElement>) => void}>
                <option value="">{t('common.notSpecified')}</option>
                {DIAGNOSIS_LABEL_KEYS.map((k) => <option key={k} value={k}>{t(`diagnosis.${k}`)}</option>)}
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>{t('profile.diagnosisDate')}</label>
              <input className={styles.input} type="date"
                value={form.diagnosisDate ? (form.diagnosisDate as string).split('T')[0] : ''}
                onChange={set('diagnosisDate')} />
            </div>
          </div>
          <div className={styles.grid2}>
            <div className={styles.field}>
              <label className={styles.label}>{t('profile.thyroidStatus')}</label>
              <select className={styles.input} value={form.thyroidStatus ?? ''} onChange={set('thyroidStatus') as (e: React.ChangeEvent<HTMLSelectElement>) => void}>
                <option value="">{t('common.notSpecified')}</option>
                {THYROID_STATUS_LABEL_KEYS.map((k) => <option key={k} value={k}>{t(`thyroidStatus.${k}`)}</option>)}
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>{t('profile.endocrinologistName')}</label>
              <input className={styles.input} placeholder={t('profile.endocrinologistPlaceholder')}
                value={form.endocrinologistName ?? ''}
                onChange={set('endocrinologistName')} />
            </div>
          </div>
        </Section>

        {/* ── Target ranges */}
        <Section title={t('profile.targetsSection')} icon={<Target size={16} strokeWidth={1.8} />}>
          <p className={styles.hint}>{t('profile.targetsHint')}</p>
          <div className={styles.grid3}>
            <div className={styles.field}>
              <label className={styles.label}>{t('profile.tshMin')}</label>
              <input className={styles.input} type="number" step="0.01" placeholder="0.40"
                value={form.targetTSH_min ?? ''} onChange={set('targetTSH_min')} />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>{t('profile.tshMax')}</label>
              <input className={styles.input} type="number" step="0.01" placeholder="4.00"
                value={form.targetTSH_max ?? ''} onChange={set('targetTSH_max')} />
            </div>
            <div></div>
            <div className={styles.field}>
              <label className={styles.label}>{t('profile.ft4Min')}</label>
              <input className={styles.input} type="number" step="0.1" placeholder="12.0"
                value={form.targetFT4_min ?? ''} onChange={set('targetFT4_min')} />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>{t('profile.ft4Max')}</label>
              <input className={styles.input} type="number" step="0.1" placeholder="22.0"
                value={form.targetFT4_max ?? ''} onChange={set('targetFT4_max')} />
            </div>
            <div></div>
            <div className={styles.field}>
              <label className={styles.label}>{t('profile.ft3Min')}</label>
              <input className={styles.input} type="number" step="0.1" placeholder="3.5"
                value={form.targetFT3_min ?? ''} onChange={set('targetFT3_min')} />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>{t('profile.ft3Max')}</label>
              <input className={styles.input} type="number" step="0.1" placeholder="6.5"
                value={form.targetFT3_max ?? ''} onChange={set('targetFT3_max')} />
            </div>
          </div>
        </Section>

        {/* ── Preferences */}
        <Section title={t('profile.preferencesSection')} icon={<Settings size={16} strokeWidth={1.8} />}>
          <div className={styles.grid2}>
            <div className={styles.field}>
              <label className={styles.label}>{t('profile.weightUnit')}</label>
              <select className={styles.input} value={form.weightUnit ?? 'KG'} onChange={set('weightUnit') as (e: React.ChangeEvent<HTMLSelectElement>) => void}>
                <option value="KG">{t('profile.weightUnitKg')}</option>
                <option value="LBS">{t('profile.weightUnitLbs')}</option>
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>{t('profile.temperatureUnit')}</label>
              <select className={styles.input} value={form.temperatureUnit ?? 'CELSIUS'} onChange={set('temperatureUnit') as (e: React.ChangeEvent<HTMLSelectElement>) => void}>
                <option value="CELSIUS">{t('profile.temperatureUnitCelsius')}</option>
                <option value="FAHRENHEIT">{t('profile.temperatureUnitFahrenheit')}</option>
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
          {updateMut.isPending ? t('profile.saveButton.saving') : dirty ? t('profile.saveButton.dirty') : t('profile.saveButton.saved')}
        </button>
      </form>

      <button type="button" className={styles.logoutBtn} onClick={logout}>
        <LogOut size={16} />
        {t('common.logout')}
      </button>
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
