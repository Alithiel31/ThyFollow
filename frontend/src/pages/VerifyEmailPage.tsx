// src/pages/VerifyEmailPage.tsx
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Activity, CheckCircle2, XCircle } from 'lucide-react';
import { authApi } from '../lib/api';
import { useAuthStore } from '../lib/store';
import styles from './AuthPage.module.css';

type Status = 'verifying' | 'success' | 'error';

export function VerifyEmailPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const token = params.get('token');
  const [status, setStatus] = useState<Status>('verifying');
  const { setAuth } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (!token) {
      setStatus('error');
      return;
    }
    authApi.verifyEmail(token)
      .then(({ data }) => {
        setAuth(data.user, data.token);
        setStatus('success');
        setTimeout(() => navigate('/dashboard'), 1500);
      })
      .catch(() => setStatus('error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logoRow}>
          <div className={styles.logoIcon}><Activity size={20} /></div>
          <span className={styles.logoText}>{t('app.name')}</span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', margin: '8px 0 20px' }}>
          {status === 'verifying' && <div className="spinner" />}
          {status === 'success' && <CheckCircle2 size={40} strokeWidth={1.5} color="var(--success)" />}
          {status === 'error' && <XCircle size={40} strokeWidth={1.5} color="var(--danger)" />}
        </div>

        <h1 className={styles.title}>
          {status === 'verifying' && t('auth.verify.pendingTitle')}
          {status === 'success' && t('auth.verify.successTitle')}
          {status === 'error' && t('auth.verify.errorTitle')}
        </h1>
        <p className={styles.subtitle}>
          {status === 'verifying' && t('auth.verify.pendingSubtitle')}
          {status === 'success' && t('auth.verify.successSubtitle')}
          {status === 'error' && t('auth.verify.errorSubtitle')}
        </p>

        {status === 'error' && (
          <p className={styles.switchText}>
            <Link to="/login" className={styles.switchLink}>{t('auth.register.signIn')}</Link>
          </p>
        )}
      </div>
    </div>
  );
}
