// src/lib/reminders.test.ts
// Calcul des rappels dus (fuseau, fenêtre d'envoi, cadence des médicaments)
// et envoi unique par clé, avec Prisma et Resend mockés.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const sendReminderEmail = vi.fn<(to: string, email: { items?: string[] }) => Promise<boolean>>(async () => true);
vi.mock('./resend.js', () => ({ isEmailConfigured: () => true, sendReminderEmail }));

let sentKeys: string[];
const prismaMock = {
  notificationSetting: { findMany: vi.fn() },
  dailyEntry: { findUnique: vi.fn(async () => null) },
  medication: { findMany: vi.fn(async () => []) },
  labResult: { findFirst: vi.fn(async () => null) },
  appointment: { findMany: vi.fn(async () => []) },
  reminderLog: {
    create: vi.fn(async ({ data }: { data: { key: string } }) => {
      if (sentKeys.includes(data.key)) {
        const { Prisma } = await import('@prisma/client');
        throw new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: 'test' });
      }
      sentKeys.push(data.key);
    }),
    deleteMany: vi.fn(async ({ where }: { where: { key?: string } }) => {
      if (where.key) sentKeys = sentKeys.filter((k) => k !== where.key);
      return { count: 0 };
    }),
  },
};
vi.mock('./prisma.js', () => ({ prisma: prismaMock }));

const { localNow, isDueAt, isMedicationDay, runReminders } = await import('./reminders.js');

const setting = (overrides: Record<string, unknown> = {}) => ({
  id: 's1',
  userId: 'u1',
  dailyLogReminder: false,
  dailyLogTime: '20:00',
  medicationReminder: false,
  labResultReminder: false,
  labReminderWeeks: 12,
  appointmentReminder: false,
  language: 'fr',
  user: { id: 'u1', email: 'a@example.com', name: 'Alice', profile: { timezone: 'Europe/Paris' } },
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  sentKeys = [];
  sendReminderEmail.mockResolvedValue(true);
});

describe('calculs', () => {
  it('localNow donne la date et l’heure dans le fuseau de l’utilisateur', () => {
    // 22:30 UTC le 18 octobre = 00:30 le 19 à Paris (UTC+2), 18:30 le 18 à New York
    const now = new Date('2026-10-18T22:30:00Z');
    expect(localNow(now, 'Europe/Paris')).toEqual({ date: '2026-10-19', minutes: 30 });
    expect(localNow(now, 'America/New_York')).toEqual({ date: '2026-10-18', minutes: 18 * 60 + 30 });
  });

  it('un rappel à heure fixe part dans l’heure qui suit, pas avant ni après', () => {
    expect(isDueAt('08:00', 7 * 60 + 59)).toBe(false);
    expect(isDueAt('08:00', 8 * 60)).toBe(true);
    expect(isDueAt('08:00', 8 * 60 + 59)).toBe(true);
    expect(isDueAt('08:00', 9 * 60)).toBe(false);
    expect(isDueAt('25:00', 8 * 60)).toBe(false);
  });

  it('cadence des médicaments comptée depuis la date de début', () => {
    const startDate = new Date('2026-10-01T00:00:00Z');
    expect(isMedicationDay({ frequency: 'DAILY', startDate, endDate: null }, '2026-10-18')).toBe(true);
    expect(isMedicationDay({ frequency: 'EVERY_OTHER_DAY', startDate, endDate: null }, '2026-10-03')).toBe(true);
    expect(isMedicationDay({ frequency: 'EVERY_OTHER_DAY', startDate, endDate: null }, '2026-10-04')).toBe(false);
    expect(isMedicationDay({ frequency: 'WEEKLY', startDate, endDate: null }, '2026-10-08')).toBe(true);
    expect(isMedicationDay({ frequency: 'WEEKLY', startDate, endDate: null }, '2026-10-09')).toBe(false);
    expect(isMedicationDay({ frequency: 'AS_NEEDED', startDate, endDate: null }, '2026-10-18')).toBe(false);
    expect(isMedicationDay({ frequency: 'DAILY', startDate, endDate: null }, '2026-09-30')).toBe(false);
    expect(isMedicationDay({ frequency: 'DAILY', startDate, endDate: new Date('2026-10-10T00:00:00Z') }, '2026-10-11')).toBe(false);
  });
});

describe('runReminders', () => {
  it('journal : rappel si rien n’est saisi ce jour-là, une seule fois', async () => {
    prismaMock.notificationSetting.findMany.mockResolvedValue([setting({ dailyLogReminder: true })]);
    const now = new Date('2026-10-18T18:10:00Z'); // 20:10 à Paris
    expect(await runReminders(now)).toBe(1);
    expect(sentKeys).toEqual(['log:2026-10-18']);
    expect(sendReminderEmail.mock.calls[0][0]).toBe('a@example.com');
    // Passage suivant, 5 minutes plus tard : déjà envoyé
    expect(await runReminders(new Date(now.getTime() + 5 * 60 * 1000))).toBe(0);
  });

  it('journal déjà rempli : pas de rappel', async () => {
    prismaMock.notificationSetting.findMany.mockResolvedValue([setting({ dailyLogReminder: true })]);
    prismaMock.dailyEntry.findUnique.mockResolvedValueOnce({ id: 'e1' } as never);
    expect(await runReminders(new Date('2026-10-18T18:10:00Z'))).toBe(0);
  });

  it('médicaments : un email par créneau, sans les prises déjà validées', async () => {
    prismaMock.notificationSetting.findMany.mockResolvedValue([setting({ medicationReminder: true })]);
    prismaMock.medication.findMany.mockResolvedValue([
      { name: 'Levothyrox', dosage: 75, dosageUnit: 'MCG', frequency: 'DAILY', startDate: new Date('2026-01-01'), endDate: null, intakeTimes: ['08:00'], intakes: [] },
      { name: 'Vitamine D', dosage: 1, dosageUnit: 'TABLET', frequency: 'DAILY', startDate: new Date('2026-01-01'), endDate: null, intakeTimes: ['08:00'], intakes: [{ time: '08:00' }] },
    ] as never);
    expect(await runReminders(new Date('2026-10-18T06:05:00Z'))).toBe(1); // 08:05 à Paris
    expect(sentKeys).toEqual(['med:2026-10-18:08:00']);
    expect(sendReminderEmail.mock.calls[0][1].items).toEqual(['Levothyrox 75 µg']);
  });

  it('bilan : rappel en journée quand le dernier date de plus de N semaines', async () => {
    prismaMock.notificationSetting.findMany.mockResolvedValue([setting({ labResultReminder: true, labReminderWeeks: 12 })]);
    prismaMock.labResult.findFirst.mockResolvedValue({ date: new Date('2026-06-01T00:00:00Z') } as never);
    // La nuit : rien
    expect(await runReminders(new Date('2026-10-18T02:00:00Z'))).toBe(0);
    expect(await runReminders(new Date('2026-10-18T10:00:00Z'))).toBe(1);
    expect(sentKeys).toEqual(['lab:2026-06-01']);
  });

  it('rendez-vous : rappel dans les N jours qui précèdent', async () => {
    prismaMock.notificationSetting.findMany.mockResolvedValue([setting({ appointmentReminder: true })]);
    const date = new Date('2026-10-20T09:00:00Z');
    prismaMock.appointment.findMany.mockResolvedValue([
      { id: 'a1', date, type: 'ENDOCRINOLOGIST', doctorName: 'Dr <b>X</b>', location: null, reminderDays: 2 },
      { id: 'a2', date: new Date('2026-11-20T09:00:00Z'), type: 'BLOOD_TEST', doctorName: null, location: null, reminderDays: 2 },
    ] as never);
    expect(await runReminders(new Date('2026-10-18T10:00:00Z'))).toBe(1);
    expect(sentKeys).toEqual([`appt:a1:${date.toISOString()}`]);
  });

  it('envoi échoué : la clé est rendue pour réessayer au passage suivant', async () => {
    prismaMock.notificationSetting.findMany.mockResolvedValue([setting({ dailyLogReminder: true })]);
    sendReminderEmail.mockResolvedValueOnce(false);
    const now = new Date('2026-10-18T18:10:00Z');
    expect(await runReminders(now)).toBe(0);
    expect(sentKeys).toEqual([]);
    expect(await runReminders(new Date(now.getTime() + 5 * 60 * 1000))).toBe(1);
  });

  it('un fuseau invalide n’empêche pas les rappels des autres utilisateurs', async () => {
    prismaMock.notificationSetting.findMany.mockResolvedValue([
      setting({ dailyLogReminder: true, userId: 'bad', user: { id: 'bad', email: 'b@example.com', name: 'B', profile: { timezone: 'Nope/Nope' } } }),
      setting({ dailyLogReminder: true }),
    ]);
    expect(await runReminders(new Date('2026-10-18T18:10:00Z'))).toBe(1);
  });
});
