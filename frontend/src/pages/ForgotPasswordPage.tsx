// src/pages/ForgotPasswordPage.tsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Activity, MailCheck } from 'lucide-react';
import { authApi } from '../lib/api';
import styles from './AuthPage.module.css';

export function ForgotPasswordPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await authApi.forgotPassword(email);
      // Réponse générique côté backend (anti-énumération) : on affiche
      // toujours l'écran de confirmation, que le compte existe ou non.
      setSentTo(email);
    } finally {
      setLoading(false);
    }
  };

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

          <h1 className={styles.title}>{t('auth.forgotPassword.checkEmailTitle')}</h1>
          <p className={styles.subtitle}>{t('auth.forgotPassword.checkEmailSubtitle', { email: sentTo })}</p>

          <p className={styles.switchText}>
            <Link to="/login" className={styles.switchLink}>{t('auth.forgotPassword.backToLogin')}</Link>
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

        <h1 className={styles.title}>{t('auth.forgotPassword.title')}</h1>
        <p className={styles.subtitle}>{t('auth.forgotPassword.subtitle')}</p>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label className={styles.label}>{t('auth.forgotPassword.email')}</label>
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

          <button className={styles.btn} type="submit" disabled={loading}>
            {loading ? t('auth.forgotPassword.submitting') : t('auth.forgotPassword.submit')}
          </button>
        </form>

        <p className={styles.switchText}>
          <Link to="/login" className={styles.switchLink}>{t('auth.forgotPassword.backToLogin')}</Link>
        </p>
      </div>
    </div>
  );
}
