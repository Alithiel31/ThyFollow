// src/pages/LoginPage.tsx
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Activity } from 'lucide-react';
import toast from 'react-hot-toast';
import { authApi } from '../lib/api';
import { useAuthStore } from '../lib/store';
import styles from './AuthPage.module.css';

export function LoginPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const { setAuth } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setUnverifiedEmail(null);
    try {
      const { data } = await authApi.login(email, password);
      setAuth(data.user, data.token);
      navigate('/dashboard');
    } catch (err: unknown) {
      const response = (err as { response?: { data?: { error?: string; code?: string } } })?.response;
      const msg = response?.data?.error ?? t('auth.login.genericError');
      if (response?.data?.code === 'EMAIL_NOT_VERIFIED') setUnverifiedEmail(email);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!unverifiedEmail) return;
    setResending(true);
    try {
      await authApi.resendVerification(unverifiedEmail);
      toast.success(t('auth.login.resendSuccess'));
    } finally {
      setResending(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logoRow}>
          <div className={styles.logoIcon}><Activity size={20} /></div>
          <span className={styles.logoText}>{t('app.name')}</span>
        </div>

        <h1 className={styles.title}>{t('auth.login.title')}</h1>
        <p className={styles.subtitle}>{t('auth.login.subtitle')}</p>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label className={styles.label}>{t('auth.login.email')}</label>
            <input
              className={styles.input}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="vous@exemple.com"
              required
              autoComplete="email"
            />
          </div>

          <div className={styles.field}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <label className={styles.label}>{t('auth.login.password')}</label>
              <Link to="/forgot-password" className={styles.switchLink} style={{ fontSize: '0.8rem' }}>
                {t('auth.login.forgotPassword')}
              </Link>
            </div>
            <input
              className={styles.input}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
            />
          </div>

          <button className={styles.btn} type="submit" disabled={loading}>
            {loading ? t('auth.login.submitting') : t('auth.login.submit')}
          </button>
        </form>

        {unverifiedEmail && (
          <p className={styles.switchText}>
            <button type="button" className={styles.linkButton} onClick={handleResend} disabled={resending}>
              {resending ? t('auth.login.resending') : t('auth.login.resendVerification')}
            </button>
          </p>
        )}

        <p className={styles.switchText}>
          {t('auth.login.noAccount')}{' '}
          <Link to="/register" className={styles.switchLink}>{t('auth.login.createAccount')}</Link>
        </p>
      </div>
    </div>
  );
}
