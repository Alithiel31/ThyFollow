// src/components/AccountData.tsx — « Mes données » (RGPD), section du Profil :
// export de toutes ses données et suppression définitive du compte.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Download, Trash2 } from 'lucide-react';
import { accountApi } from '../lib/api';
import { useAuthStore } from '../lib/store';
import styles from '../pages/ProfilePage.module.css';

function apiError(err: unknown): string | undefined {
  return (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
}

export function AccountData() {
  const { t } = useTranslation();
  const { user, logout } = useAuthStore();
  const [exporting, setExporting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [secret, setSecret] = useState('');
  const [deleting, setDeleting] = useState(false);
  const hasPassword = user?.hasPassword ?? true;

  const handleExport = async () => {
    setExporting(true);
    try {
      const { data } = await accountApi.export();
      const url = URL.createObjectURL(data);
      const link = document.createElement('a');
      link.href = url;
      link.download = `thyrotrack-export-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error(t('profile.data.exportError'));
    } finally {
      setExporting(false);
    }
  };

  const handleDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    setDeleting(true);
    try {
      await accountApi.remove(hasPassword ? { password: secret } : { confirmEmail: secret });
      toast.success(t('profile.data.deleted'));
      logout();
    } catch (err) {
      toast.error(apiError(err) ?? t('profile.data.deleteError'));
      setDeleting(false);
    }
  };

  return (
    <>
      <p className={styles.hint}>{t('profile.data.exportHint')}</p>
      <button type="button" className={styles.smallBtn} onClick={handleExport} disabled={exporting}>
        <Download size={14} /> {exporting ? t('profile.data.exporting') : t('profile.data.export')}
      </button>

      <h3 className={styles.label}>{t('profile.data.deleteTitle')}</h3>
      <p className={styles.hint}>{t('profile.data.deleteHint')}</p>
      {user?.entitlements?.proSource === 'STRIPE' && user.entitlements.pro && (
        <p className={styles.hint}>{t('profile.data.deleteSubscription')}</p>
      )}
      {!confirming ? (
        <button type="button" className={`${styles.smallBtn} ${styles.smallBtnDanger}`} onClick={() => setConfirming(true)}>
          <Trash2 size={14} /> {t('profile.data.delete')}
        </button>
      ) : (
        <form className={styles.field} onSubmit={handleDelete}>
          <label className={styles.label} htmlFor="delete-account-confirm">
            {hasPassword ? t('profile.data.confirmPassword') : t('profile.data.confirmEmail', { email: user?.email })}
          </label>
          <input
            id="delete-account-confirm"
            className={styles.input}
            type={hasPassword ? 'password' : 'email'}
            autoComplete={hasPassword ? 'current-password' : 'off'}
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" className={`${styles.smallBtn} ${styles.smallBtnDanger}`} disabled={deleting || !secret}>
              {deleting ? t('profile.data.deleting') : t('profile.data.deleteConfirm')}
            </button>
            <button type="button" className={styles.smallBtn} onClick={() => { setConfirming(false); setSecret(''); }} disabled={deleting}>
              {t('common.cancel')}
            </button>
          </div>
        </form>
      )}
    </>
  );
}
