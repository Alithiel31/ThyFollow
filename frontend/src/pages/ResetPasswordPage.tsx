// src/pages/ResetPasswordPage.tsx
import { useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Activity, CheckCircle2, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { authApi } from '../lib/api';
import styles from './AuthPage.module.css';

export function ResetPasswordPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const token = params.get('token');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<'form' | 'success' | 'error'>(token ? 'form' : 'error');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      toast.error(t('auth.resetPassword.mismatchError'));
      return;
    }
    if (!token) return;

    setLoading(true);
    try {
      await authApi.resetPassword(token, password);
      setStatus('success');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? t('auth.resetPassword.genericError');
      toast.error(msg);
      // Le token peut être expiré/invalide (souvent un 400 de Zod ou une
      // ValidationError) : on bascule sur l'écran d'erreur avec lien pour en
      // redemander un, plutôt que de laisser un formulaire qui échouera à coup sûr.
      setStatus('error');
    } finally {
      setLoading(false);
    }
  };

  if (status === 'success') {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.logoRow}>
            <div className={styles.logoIcon}><Activity size={20} /></div>
            <span className={styles.logoText}>{t('app.name')}</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', margin: '8px 0 20px' }}>
            <CheckCircle2 size={40} strokeWidth={1.5} color="var(--success)" />
          </div>

          <h1 className={styles.title}>{t('auth.resetPassword.successTitle')}</h1>
          <p className={styles.subtitle}>{t('auth.resetPassword.successSubtitle')}</p>

          <p className={styles.switchText}>
            <Link to="/login" className={styles.switchLink}>{t('auth.register.signIn')}</Link>
          </p>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.logoRow}>
            <div className={styles.logoIcon}><Activity size={20} /></div>
            <span className={styles.logoText}>{t('app.name')}</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', margin: '8px 0 20px' }}>
            <XCircle size={40} strokeWidth={1.5} color="var(--danger)" />
          </div>

          <h1 className={styles.title}>{t('auth.resetPassword.errorTitle')}</h1>
          <p className={styles.subtitle}>{t('auth.resetPassword.errorSubtitle')}</p>

          <p className={styles.switchText}>
            <Link to="/forgot-password" className={styles.switchLink}>{t('auth.resetPassword.requestNewLink')}</Link>
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

        <h1 className={styles.title}>{t('auth.resetPassword.title')}</h1>
        <p className={styles.subtitle}>{t('auth.resetPassword.subtitle')}</p>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label className={styles.label}>{t('auth.resetPassword.newPassword')}</label>
            <input
              className={styles.input}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('auth.resetPassword.passwordPlaceholder')}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>{t('auth.resetPassword.confirmPassword')}</label>
            <input
              className={styles.input}
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder={t('auth.resetPassword.passwordPlaceholder')}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>

          <button className={styles.btn} type="submit" disabled={loading}>
            {loading ? t('auth.resetPassword.submitting') : t('auth.resetPassword.submit')}
          </button>
        </form>
      </div>
    </div>
  );
}
