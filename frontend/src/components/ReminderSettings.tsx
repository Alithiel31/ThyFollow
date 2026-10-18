// src/components/ReminderSettings.tsx — réglages des rappels par email
// (journal, prises de médicament, bilan sanguin, rendez-vous), section du Profil.
// Tous désactivés tant que l'utilisateur ne les a pas activés lui-même.
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { notificationsApi } from '../lib/api';
import type { NotificationSettings } from '../types';
import styles from '../pages/ProfilePage.module.css';

type Settings = Omit<NotificationSettings, 'emailEnabled'>;
type ToggleKey = 'dailyLogReminder' | 'medicationReminder' | 'labResultReminder' | 'appointmentReminder';

const TOGGLES: ToggleKey[] = ['dailyLogReminder', 'medicationReminder', 'labResultReminder', 'appointmentReminder'];

export function ReminderSettings({ email }: { email?: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['notificationSettings'],
    queryFn: () => notificationsApi.get().then((r) => r.data),
  });
  const [form, setForm] = useState<Settings | null>(null);
  const [dirty, setDirty] = useState(false);

  // Recopie les réglages chargés dans le formulaire (même principe que ProfilePage)
  const [synced, setSynced] = useState(data);
  if (data !== synced) {
    setSynced(data);
    if (data) {
      setForm({
        dailyLogReminder: data.dailyLogReminder,
        dailyLogTime: data.dailyLogTime,
        medicationReminder: data.medicationReminder,
        labResultReminder: data.labResultReminder,
        labReminderWeeks: data.labReminderWeeks,
        appointmentReminder: data.appointmentReminder,
      });
    }
  }

  const saveMut = useMutation({
    mutationFn: (settings: Settings) =>
      notificationsApi.update({ ...settings, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
    onSuccess: ({ data: saved }) => {
      toast.success(t('profile.reminders.saved'));
      qc.setQueryData(['notificationSettings'], saved);
      setDirty(false);
    },
    onError: () => toast.error(t('profile.reminders.error')),
  });

  if (!data || !form) return null;

  const update = (patch: Partial<Settings>) => {
    setForm({ ...form, ...patch });
    setDirty(true);
  };

  return (
    <>
      {!data.emailEnabled && <p className={styles.hint}>{t('profile.reminders.emailDisabled')}</p>}
      <p className={styles.hint}>{t('profile.reminders.intro', { email })}</p>

      {TOGGLES.map((key) => (
        <div key={key}>
          <label className={styles.linkedAccountRow}>
            <div>
              <div>{t(`profile.reminders.${key}.label`)}</div>
              <div className={styles.linkedAccountStatus}>{t(`profile.reminders.${key}.hint`)}</div>
            </div>
            <input
              type="checkbox"
              role="switch"
              aria-label={t(`profile.reminders.${key}.label`)}
              checked={form[key]}
              disabled={!data.emailEnabled}
              onChange={(e) => update({ [key]: e.target.checked })}
            />
          </label>
          {key === 'dailyLogReminder' && form.dailyLogReminder && (
            <div className={styles.field}>
              <label className={styles.label} htmlFor="reminder-log-time">{t('profile.reminders.dailyLogTime')}</label>
              <input
                id="reminder-log-time"
                className={styles.input}
                type="time"
                value={form.dailyLogTime}
                onChange={(e) => e.target.value && update({ dailyLogTime: e.target.value })}
              />
            </div>
          )}
          {key === 'labResultReminder' && form.labResultReminder && (
            <div className={styles.field}>
              <label className={styles.label} htmlFor="reminder-lab-weeks">{t('profile.reminders.labWeeks')}</label>
              <input
                id="reminder-lab-weeks"
                className={styles.input}
                type="number"
                min={1}
                max={52}
                value={form.labReminderWeeks}
                onChange={(e) => update({ labReminderWeeks: Math.min(52, Math.max(1, Number(e.target.value) || 1)) })}
              />
            </div>
          )}
        </div>
      ))}

      <button
        type="button"
        className={styles.smallBtn}
        disabled={!dirty || saveMut.isPending || !data.emailEnabled}
        onClick={() => saveMut.mutate(form)}
      >
        {saveMut.isPending ? t('profile.saveButton.saving') : t('profile.reminders.save')}
      </button>
    </>
  );
}
