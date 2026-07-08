// src/pages/RegisterPage.tsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Activity, MailCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { authApi } from '../lib/api';
import styles from './AuthPage.module.css';

export function RegisterPage() {
  const { t } = useTranslation();
  const [form, setForm] = useState({ name: '', email: '', password: '', birthDate: '' });
  const [loading, setLoading] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await authApi.register(form);
      setSentTo(form.email);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? t('auth.register.genericError');
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  // ── Compte créé : on invite à confirmer l'email plutôt que de connecter
  // directement (le compte est bloqué tant que l'email n'est pas vérifié).
  if (sentTo) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.logoRow}>
            <div className={styles.logoIcon}><Activity size={20} /></div>
            <span className={styles.logoText}>{t('app.name')}</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', margin: '8px 0 20px' }}>
            <MailCheck size={40} strokeWidth={1.5} />
          </div>

          <h1 className={styles.title}>{t('auth.register.checkEmailTitle')}</h1>
          <p className={styles.subtitle}>{t('auth.register.checkEmailSubtitle', { email: sentTo })}</p>

          <p className={styles.switchText}>
            <Link to="/login" className={styles.switchLink}>{t('auth.register.signIn')}</Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logoRow}>
          <div className={styles.logoIcon}><Activity size={20} /></div>
          <span className={styles.logoText}>{t('app.name')}</span>
        </div>

        <h1 className={styles.title}>{t('auth.register.title')}</h1>
        <p className={styles.subtitle}>{t('auth.register.subtitle')}</p>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label className={styles.label}>{t('auth.register.fullName')}</label>
            <input className={styles.input} value={form.name} onChange={set('name')}
              placeholder={t('auth.register.fullNamePlaceholder')} required minLength={2} />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>{t('auth.register.email')}</label>
            <input className={styles.input} type="email" value={form.email} onChange={set('email')}
              placeholder="vous@exemple.com" required />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>{t('auth.register.password')}</label>
            <input className={styles.input} type="password" value={form.password} onChange={set('password')}
              placeholder={t('auth.register.passwordPlaceholder')} required minLength={8} />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>{t('auth.register.birthDate')} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>{t('auth.register.optional')}</span></label>
            <input className={styles.input} type="date" value={form.birthDate} onChange={set('birthDate')} />
          </div>

          <button className={styles.btn} type="submit" disabled={loading}>
            {loading ? t('auth.register.submitting') : t('auth.register.submit')}
          </button>
        </form>

        <p className={styles.switchText}>
          {t('auth.register.alreadyAccount')}{' '}
          <Link to="/login" className={styles.switchLink}>{t('auth.register.signIn')}</Link>
        </p>
      </div>
    </div>
  );
}
