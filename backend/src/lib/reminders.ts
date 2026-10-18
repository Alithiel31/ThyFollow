// src/lib/reminders.ts
// Rappels par email (journal du jour, prises de médicament, bilan sanguin,
// rendez-vous) selon les réglages NotificationSetting de chaque utilisateur.
// Une boucle dans le processus backend passe toutes les 5 minutes ; chaque
// rappel a une clé (ex. "med:2026-10-18:08:00") inscrite dans ReminderLog
// AVANT l'envoi : l'unicité (userId, key) garantit qu'il ne part qu'une fois,
// même après un redémarrage ou avec deux instances du backend.
import { Prisma, type AppointmentType, type DosageUnit, type MedFrequency } from '@prisma/client';
import type { TFunction } from 'i18next';
import { config } from '../config.js';
import i18next from './i18n.js';
import { logger } from './logger.js';
import { prisma } from './prisma.js';
import { isEmailConfigured, sendReminderEmail, type ReminderEmail } from './resend.js';

const TICK_MS = 5 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
// Un rappel à heure fixe part dans l'heure qui suit (backend arrêté plus
// longtemps : le rappel est sauté plutôt qu'envoyé en retard).
const SEND_WINDOW_MIN = 60;
// Bilan et rendez-vous n'ont pas d'heure : envoyés en journée seulement.
const DAYTIME_START_MIN = 9 * 60;
const DAYTIME_END_MIN = 21 * 60;
// Au-delà, les clés sont purgées. Un bilan toujours en retard est donc relancé tous les 90 jours.
const LOG_RETENTION_DAYS = 90;

export interface LocalNow {
  // "YYYY-MM-DD" dans le fuseau de l'utilisateur
  date: string;
  // Minutes écoulées depuis minuit, heure locale
  minutes: number;
}

export function localNow(now: Date, timeZone: string): LocalNow {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '00';
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  };
}

// "HH:MM" → minutes depuis minuit, ou null si invalide
export function parseTime(value: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

export function isDueAt(time: string, nowMinutes: number): boolean {
  const target = parseTime(time);
  return target !== null && nowMinutes >= target && nowMinutes < target + SEND_WINDOW_MIN;
}

export function isDaytime(nowMinutes: number): boolean {
  return nowMinutes >= DAYTIME_START_MIN && nowMinutes < DAYTIME_END_MIN;
}

// Nombre de jours entre deux dates "YYYY-MM-DD"
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);
}

// Le médicament est-il à prendre ce jour-là ? (cadence comptée depuis la date de début)
export function isMedicationDay(
  med: { frequency: MedFrequency; startDate: Date; endDate: Date | null },
  date: string
): boolean {
  const start = med.startDate.toISOString().slice(0, 10);
  if (date < start) return false;
  if (med.endDate && date > med.endDate.toISOString().slice(0, 10)) return false;
  const elapsed = daysBetween(start, date);
  switch (med.frequency) {
    case 'DAILY':
      return true;
    case 'EVERY_OTHER_DAY':
      return elapsed % 2 === 0;
    case 'WEEKLY':
      return elapsed % 7 === 0;
    default:
      return false; // AS_NEEDED : pas d'horaire, pas de rappel
  }
}

const UNIT_LABELS: Partial<Record<DosageUnit, string>> = { MCG: 'µg', MG: 'mg', IU: 'UI', ML: 'mL' };

function medicationLabel(med: { name: string; dosage: number; dosageUnit: DosageUnit }): string {
  const unit = UNIT_LABELS[med.dosageUnit];
  return unit ? `${med.name} ${med.dosage} ${unit}` : med.name;
}

interface PendingReminder {
  key: string;
  email: ReminderEmail;
}

type SettingWithUser = Prisma.NotificationSettingGetPayload<{
  include: { user: { select: { id: true; email: true; name: true; profile: { select: { timezone: true } } } } };
}>;

function buildEmail(
  t: TFunction,
  name: string,
  kind: 'dailyLog' | 'medication' | 'lab' | 'appointment',
  ctaPath: string,
  vars: Record<string, string>,
  lines: string[] = [],
  items?: string[]
): ReminderEmail {
  return {
    subject: t(`reminders.${kind}.subject`, vars),
    greeting: t('reminders.greeting', { name }),
    lines: [t(`reminders.${kind}.body`, vars), ...lines],
    items,
    cta: t(`reminders.${kind}.cta`),
    ctaPath,
    footer: t('reminders.footer'),
    settingsLabel: t('reminders.settingsLink'),
  };
}

// Rappels dus maintenant pour un utilisateur (sans les envoyer)
export async function pendingReminders(setting: SettingWithUser, now: Date): Promise<PendingReminder[]> {
  const { user } = setting;
  const timeZone = user.profile?.timezone ?? 'Europe/Paris';
  const local = localNow(now, timeZone);
  const lang = setting.language.startsWith('en') ? 'en' : 'fr';
  const t = i18next.getFixedT(lang);
  const today = new Date(local.date);
  const pending: PendingReminder[] = [];

  if (setting.dailyLogReminder && isDueAt(setting.dailyLogTime, local.minutes)) {
    const entry = await prisma.dailyEntry.findUnique({
      where: { userId_date: { userId: user.id, date: today } },
      select: { id: true },
    });
    if (!entry) {
      pending.push({ key: `log:${local.date}`, email: buildEmail(t, user.name, 'dailyLog', `/log/${local.date}`, {}) });
    }
  }

  if (setting.medicationReminder) {
    const meds = await prisma.medication.findMany({
      where: { userId: user.id, active: true },
      select: {
        name: true,
        dosage: true,
        dosageUnit: true,
        frequency: true,
        startDate: true,
        endDate: true,
        intakeTimes: true,
        intakes: { where: { date: today }, select: { time: true } },
      },
    });
    // Un seul email par créneau, listant les médicaments pas encore validés
    const slots = new Map<string, string[]>();
    for (const med of meds) {
      if (!isMedicationDay(med, local.date)) continue;
      const taken = new Set(med.intakes.map((intake) => intake.time));
      for (const time of med.intakeTimes) {
        if (taken.has(time) || !isDueAt(time, local.minutes)) continue;
        slots.set(time, [...(slots.get(time) ?? []), medicationLabel(med)]);
      }
    }
    for (const [time, labels] of slots) {
      pending.push({
        key: `med:${local.date}:${time}`,
        email: buildEmail(t, user.name, 'medication', '/medications', { time }, [], labels),
      });
    }
  }

  if (setting.labResultReminder && isDaytime(local.minutes)) {
    const last = await prisma.labResult.findFirst({
      where: { userId: user.id },
      orderBy: { date: 'desc' },
      select: { date: true },
    });
    if (last) {
      const lastDate = last.date.toISOString().slice(0, 10);
      if (daysBetween(lastDate, local.date) >= setting.labReminderWeeks * 7) {
        const date = new Intl.DateTimeFormat(lang, { dateStyle: 'long', timeZone: 'UTC' }).format(last.date);
        pending.push({
          key: `lab:${lastDate}`,
          email: buildEmail(t, user.name, 'lab', '/lab-results', { date, weeks: String(setting.labReminderWeeks) }),
        });
      }
    }
  }

  if (setting.appointmentReminder && isDaytime(local.minutes)) {
    const appointments = await prisma.appointment.findMany({
      where: { userId: user.id, reminder: true, status: 'UPCOMING', date: { gt: now } },
      orderBy: { date: 'asc' },
      take: 20,
      select: { id: true, date: true, type: true, doctorName: true, location: true, reminderDays: true },
    });
    for (const appt of appointments) {
      if (appt.date.getTime() - now.getTime() > appt.reminderDays * DAY_MS) continue;
      const date = new Intl.DateTimeFormat(lang, { dateStyle: 'full', timeStyle: 'short', timeZone }).format(appt.date);
      const type = t(`reminders.appointmentTypes.${appt.type satisfies AppointmentType}`);
      const extra = [
        ...(appt.doctorName ? [t('reminders.appointment.withDoctor', { doctor: appt.doctorName })] : []),
        ...(appt.location ? [t('reminders.appointment.at', { location: appt.location })] : []),
      ];
      pending.push({
        // La date fait partie de la clé : un rendez-vous déplacé est rappelé à nouveau
        key: `appt:${appt.id}:${appt.date.toISOString()}`,
        email: buildEmail(t, user.name, 'appointment', '/appointments', { date, type }, extra),
      });
    }
  }

  return pending;
}

// Réserve la clé puis envoie ; la réservation est rendue si l'envoi échoue.
async function deliver(userId: string, to: string, reminder: PendingReminder): Promise<boolean> {
  try {
    await prisma.reminderLog.create({ data: { userId, key: reminder.key } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return false; // déjà envoyé
    throw err;
  }
  let sent = false;
  try {
    sent = await sendReminderEmail(to, reminder.email);
  } finally {
    if (!sent) await prisma.reminderLog.deleteMany({ where: { userId, key: reminder.key } });
  }
  return sent;
}

// Un passage : envoie tous les rappels dus. Retourne le nombre d'emails envoyés.
export async function runReminders(now = new Date()): Promise<number> {
  const settings = await prisma.notificationSetting.findMany({
    where: {
      OR: [
        { dailyLogReminder: true },
        { medicationReminder: true },
        { labResultReminder: true },
        { appointmentReminder: true },
      ],
      user: { emailVerified: true },
    },
    include: { user: { select: { id: true, email: true, name: true, profile: { select: { timezone: true } } } } },
  });

  let sent = 0;
  for (const setting of settings) {
    try {
      for (const reminder of await pendingReminders(setting, now)) {
        if (await deliver(setting.userId, setting.user.email, reminder)) sent += 1;
      }
    } catch (err) {
      // Un utilisateur en erreur (fuseau invalide...) ne bloque pas les autres
      logger.error('Rappels : échec pour un utilisateur', err instanceof Error ? err.message : 'unknown');
    }
  }

  await prisma.reminderLog.deleteMany({
    where: { sentAt: { lt: new Date(now.getTime() - LOG_RETENTION_DAYS * DAY_MS) } },
  });
  return sent;
}

let timer: NodeJS.Timeout | null = null;
let running = false;

export function startReminderScheduler(): void {
  if (timer || !config.remindersEnabled) return;
  if (!isEmailConfigured()) {
    logger.warn('RESEND_API_KEY manquant : rappels par email désactivés');
    return;
  }
  const tick = async () => {
    if (running) return; // passage précédent pas encore terminé
    running = true;
    try {
      const sent = await runReminders();
      if (sent > 0) logger.info(`Rappels : ${sent} email(s) envoyé(s)`);
    } catch (err) {
      logger.error('Rappels : passage échoué', err instanceof Error ? err.message : 'unknown');
    } finally {
      running = false;
    }
  };
  timer = setInterval(tick, TICK_MS);
  timer.unref();
  void tick();
}
