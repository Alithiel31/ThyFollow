// src/components/ProPanel.tsx
// Accès Pro : écran « passer Pro » (paiement Stripe ou code promo), état
// d'abonnement et compteur d'imports. L'autorité est le serveur (402/429 sur
// l'import) : ces composants ne font qu'expliquer et orienter.
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Sparkles, X } from 'lucide-react';
import axios from 'axios';
import { billingApi } from '../lib/api';
import { importsSummary, useRefreshUser } from '../lib/entitlements';
import type { Entitlements } from '../types';
import styles from './LabImport.module.css';

export function ProPaywall({ entitlements, onClose }: { entitlements: Entitlements; onClose?: () => void }) {
  const { t } = useTranslation();
  const refreshUser = useRefreshUser();
  const [redirecting, setRedirecting] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const subscribe = async () => {
    setRedirecting(true);
    try {
      const { data } = await billingApi.checkout();
      window.location.assign(data.url);
    } catch {
      toast.error(t('pro.checkoutError'));
      setRedirecting(false);
    }
  };

  const redeem = async (e: FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    try {
      await billingApi.redeem(code.trim());
      await refreshUser();
      toast.success(t('pro.redeemed'));
      setCode('');
    } catch (err) {
      const message = axios.isAxiosError(err) ? (err.response?.data as { error?: string } | undefined)?.error : undefined;
      toast.error(message ?? t('pro.errors.generic'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={styles.panel} aria-label={t('pro.title')}>
      <div className={styles.panelHeader}>
        <div>
          <h2 className={styles.panelTitle}>
            <Sparkles size={16} aria-hidden="true" /> {t('pro.title')}
          </h2>
          <p className={styles.panelSub}>{t('pro.lead')}</p>
          <p className={styles.note}>{importsSummary(entitlements, t)}</p>
        </div>
        {onClose && (
          <button type="button" className={styles.iconBtn} onClick={onClose} aria-label={t('labImport.close')}>
            <X size={16} />
          </button>
        )}
      </div>

      <div className={styles.passwordBox}>
        {entitlements.billingEnabled && (
          <button type="button" className={styles.primaryBtn} disabled={redirecting} onClick={subscribe}>
            {redirecting ? t('pro.redirecting') : t('pro.subscribe')}
          </button>
        )}
        <form onSubmit={redeem} className={styles.passwordBox}>
          <label className={styles.label} htmlFor="promo-code">{t('pro.orCode')}</label>
          <input
            id="promo-code" className={styles.input} autoComplete="off" autoCapitalize="characters"
            placeholder={t('pro.codePlaceholder')} aria-label={t('pro.codeLabel')}
            value={code} onChange={(e) => setCode(e.target.value)}
          />
          <button type="submit" className={styles.secondaryBtn} disabled={busy || !code.trim()}>
            {t('pro.redeem')}
          </button>
        </form>
      </div>
    </section>
  );
}

// Résumé d'abonnement pour le profil.
export function ProStatus({ entitlements }: { entitlements: Entitlements }) {
  const { t, i18n } = useTranslation();
  const [busy, setBusy] = useState(false);

  const manage = async () => {
    setBusy(true);
    try {
      const { data } = await billingApi.portal();
      window.location.assign(data.url);
    } catch {
      toast.error(t('pro.status.manageError'));
      setBusy(false);
    }
  };

  const until = entitlements.proUntil
    ? new Date(entitlements.proUntil).toLocaleDateString(i18n.language)
    : null;

  return (
    <div className={styles.passwordBox}>
      <p className={styles.note}>
        {entitlements.pro
          ? until && entitlements.proSource
            ? `${t('pro.status.activeUntil', { date: until })} (${t(`pro.status.source.${entitlements.proSource}`)})`
            : t('pro.status.activeAdmin')
          : t('pro.status.free')}
      </p>
      <p className={styles.note}>{importsSummary(entitlements, t)}</p>
      {entitlements.proSource === 'STRIPE' && entitlements.pro && (
        <button type="button" className={styles.secondaryBtn} disabled={busy} onClick={manage}>
          {t('pro.status.manage')}
        </button>
      )}
    </div>
  );
}
