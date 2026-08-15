// src/pages/ProfilePage.tsx
import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Save, LogOut } from 'lucide-react';
import { authApi, profileApi, securityApi } from '../lib/api';
import { useAuthStore } from '../lib/store';
import { GoogleIcon } from '../components/GoogleIcon';
import { DIAGNOSIS_LABEL_KEYS, THYROID_STATUS_LABEL_KEYS, type AuthEventType, type UserProfile } from '../types';
import styles from './ProfilePage.module.css';

export function ProfilePage() {
  const { t } = useTranslation();
  const { user, token, logout, setAuth } = useAuthStore();
  const qc = useQueryClient();
  const [form, setForm] = useState<Partial<UserProfile>>({});
  const [dirty, setDirty] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const [linking, setLinking] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const isGoogleLinked = user?.oauthAccounts?.some((a) => a.provider === 'google') ?? false;

  // ── Retour du flux de liaison Google : oidc.controller.ts redirige ici
  // avec ?googleLinked=1 ou ?googleLinkError=(conflict|1) après le passage
  // par l'écran de consentement Google (voir handleGoogleLinkCallback).
  useEffect(() => {
    const linked = searchParams.get('googleLinked');
    const error = searchParams.get('googleLinkError');
    if (!linked && !error) return;

    if (linked) {
      toast.success(t('profile.linkedAccounts.linkedSuccess'));
      // Le JWT ne change pas ici : on rafraîchit juste `user` pour que
      // `oauthAccounts` reflète le nouveau lien.
      if (token) authApi.me().then(({ data }) => setAuth(data, token));
    } else if (error === 'conflict') {
      toast.error(t('profile.linkedAccounts.linkConflict'));
    } else {
      toast.error(t('profile.linkedAccounts.linkError'));
    }

    searchParams.delete('googleLinked');
    searchParams.delete('googleLinkError');
    setSearchParams(searchParams, { replace: true });
  }, []); // eslint-disable-line

  const handleLinkGoogle = async () => {
    setLinking(true);
    try {
      const { data } = await authApi.linkGoogle();
      // Navigation plein-page volontaire : le backend a déjà posé le cookie
      // de flux OIDC via cet appel XHR, il ne reste qu'à envoyer le
      // navigateur vers Google (voir api.ts / oidc.controller.ts).
      window.location.href = data.url;
    } catch {
      toast.error(t('profile.linkedAccounts.linkError'));
      setLinking(false);
    }
  };

  const handleUnlinkGoogle = async () => {
    setUnlinking(true);
    try {
      await authApi.unlinkGoogle();
      toast.success(t('profile.linkedAccounts.unlinkedSuccess'));
      if (token) {
        const { data } = await authApi.me();
        setAuth(data, token);
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? t('profile.linkedAccounts.unlinkError');
      toast.error(msg);
    } finally {
      setUnlinking(false);
    }
  };

  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: () => profileApi.get().then((r) => r.data),
  });

  // ── Activité récente (traçabilité des connexions Google, voir
  // backend authEvents.ts) : n'échoue jamais silencieusement l'affichage du
  // reste du profil si la requête échoue (pas de gestion d'erreur dédiée).
  const { data: securityEvents } = useQuery({
    queryKey: ['securityEvents'],
    queryFn: () => securityApi.events().then((r) => r.data),
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
        {/* Avatar cerclé d'un dégradé bleu → orange (maquette) */}
        <div className={styles.avatar}>
          <span className={styles.avatarInner}>{user?.name?.charAt(0).toUpperCase()}</span>
        </div>
        <div>
          <h1 className={styles.title}>{user?.name}</h1>
          <p className={styles.email}>{user?.email}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        {/* ── Diagnosis */}
        <Section title={t('profile.diagnosisSection')} marker={{ shape: 'square', color: 'var(--accent)' }}>
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
        <Section title={t('profile.targetsSection')} marker={{ shape: 'circle', color: 'var(--lav)' }}>
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
        <Section title={t('profile.preferencesSection')}>
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

      {/* ── Comptes liés (hors <form> : n'a rien à voir avec l'enregistrement
          du profil ci-dessus, et ne doit pas déclencher son onSubmit). */}
      <Section title={t('profile.linkedAccounts.title')}>
        <div className={styles.linkedAccountRow}>
          <div className={styles.linkedAccountInfo}>
            <GoogleIcon size={22} />
            <div>
              <div>{t('profile.linkedAccounts.google')}</div>
              <div className={`${styles.linkedAccountStatus} ${isGoogleLinked ? styles.linked : ''}`}>
                {isGoogleLinked ? t('profile.linkedAccounts.linked') : t('profile.linkedAccounts.notLinked')}
              </div>
            </div>
          </div>
          {isGoogleLinked ? (
            <button
              type="button"
              className={`${styles.smallBtn} ${styles.smallBtnDanger}`}
              onClick={handleUnlinkGoogle}
              disabled={unlinking}
            >
              {unlinking ? t('profile.linkedAccounts.unlinking') : t('profile.linkedAccounts.unlink')}
            </button>
          ) : (
            <button type="button" className={styles.smallBtn} onClick={handleLinkGoogle} disabled={linking}>
              {linking ? t('profile.linkedAccounts.linking') : t('profile.linkedAccounts.link')}
            </button>
          )}
        </div>
      </Section>

      {securityEvents && securityEvents.length > 0 && (
        <Section title={t('profile.securityEvents.title')}>
          {securityEvents.map((event) => (
            <div key={event.id} className={styles.eventRow}>
              <span className={`${styles.eventLabel} ${event.type.endsWith('FAILED') || event.type === 'LINK_CONFLICT' ? styles.eventFailed : ''}`}>
                {t(`profile.securityEvents.types.${event.type as AuthEventType}`)}
              </span>
              <span className={styles.eventMeta}>{new Date(event.createdAt).toLocaleString()}</span>
            </div>
          ))}
        </Section>
      )}

      <button type="button" className={styles.logoutBtn} onClick={logout}>
        <LogOut size={16} />
        {t('common.logout')}
      </button>
    </div>
  );
}

/* Pastille géométrique colorée du titre de section (maquette Profil) */
function Section({ title, children, marker }: {
  title: string; children: React.ReactNode;
  marker?: { shape: 'square' | 'circle'; color: string };
}) {
  return (
    <div className={styles.section}>
      <h2 className={styles.sectionTitle}>
        {marker && (
          <span
            aria-hidden="true"
            style={{
              width: 8, height: 8, display: 'inline-block', flexShrink: 0,
              background: marker.color,
              borderRadius: marker.shape === 'circle' ? '50%' : 2,
            }}
          />
        )}
        {title}
      </h2>
      <div className={styles.sectionBody}>{children}</div>
    </div>
  );
}
