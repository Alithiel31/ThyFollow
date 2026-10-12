// src/pages/NotFoundPage.tsx
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Activity, Compass } from 'lucide-react';
import styles from './AuthPage.module.css';

export function NotFoundPage() {
  const { t } = useTranslation();

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logoRow}>
          <div className={styles.logoIcon}><Activity size={20} /></div>
          <span className={styles.logoText}>{t('app.name')}</span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', margin: '8px 0 20px' }}>
          <Compass size={40} strokeWidth={1.5} color="var(--text-muted)" />
        </div>

        <h1 className={styles.title}>{t('notFound.title')}</h1>
        <p className={styles.subtitle}>{t('notFound.subtitle')}</p>

        {/* "/" mène au tableau de bord si la session est ouverte, sinon RequireAuth renvoie vers /login. */}
        <p className={styles.switchText}>
          <Link to="/" className={styles.switchLink}>{t('notFound.backHome')}</Link>
        </p>
      </div>
    </div>
  );
}
