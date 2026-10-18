// src/controllers/profileNotifications.test.ts
// Réglages des rappels par email (GET/PUT /api/profile/notifications).
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

const JWT_SECRET = 'test-secret-at-least-32-characters-long-ok';
const ME = 'user-1';

let settings: Record<string, unknown> | null;
let timezone: string | null;

const prismaMock = {
  notificationSetting: {
    findUnique: vi.fn(async () => settings),
    upsert: vi.fn(async ({ create, update }: { create: Record<string, unknown>; update: Record<string, unknown> }) => {
      settings = settings ? { ...settings, ...update } : create;
      return settings;
    }),
  },
  userProfile: {
    upsert: vi.fn(async ({ update }: { update: { timezone: string } }) => {
      timezone = update.timezone;
    }),
  },
  $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
};
vi.mock('../lib/prisma.js', () => ({ prisma: prismaMock }));
vi.mock('../lib/resend.js', () => ({ isEmailConfigured: () => true }));
vi.mock('../lib/session.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/session.js')>()),
  verifySessionToken: async (token: string) => {
    try {
      return (jwt.verify(token, JWT_SECRET) as { userId: string }).userId;
    } catch {
      return null;
    }
  },
}));

async function buildApp() {
  vi.resetModules();
  const { default: i18next, middleware } = await import('../lib/i18n.js');
  const { default: profileRouter } = await import('../routers/profile.router.js');
  const { errorHandler } = await import('../middleware/errorHandler.js');
  const app = express();
  app.use(express.json());
  app.use(middleware.handle(i18next));
  app.use('/api/profile', profileRouter);
  app.use(errorHandler);
  return app;
}

const auth = `Bearer ${jwt.sign({ userId: ME }, JWT_SECRET, { expiresIn: '1h' })}`;
const valid = {
  dailyLogReminder: true,
  dailyLogTime: '21:30',
  medicationReminder: true,
  labResultReminder: false,
  labReminderWeeks: 8,
  appointmentReminder: true,
};

beforeAll(() => {
  process.env.JWT_SECRET = JWT_SECRET;
});

beforeEach(() => {
  vi.clearAllMocks();
  settings = null;
  timezone = null;
});

describe('/api/profile/notifications', () => {
  it('sans réglage enregistré, tous les rappels sont désactivés', async () => {
    const app = await buildApp();
    const res = await request(app).get('/api/profile/notifications').set('Authorization', auth);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ dailyLogReminder: false, medicationReminder: false, labResultReminder: false, appointmentReminder: false, emailEnabled: true });
  });

  it('enregistre les réglages, la langue de la requête et le fuseau du navigateur', async () => {
    const app = await buildApp();
    const res = await request(app)
      .put('/api/profile/notifications')
      .set('Authorization', auth)
      .set('Accept-Language', 'en-US')
      .send({ ...valid, timezone: 'America/Montreal' });
    expect(res.status).toBe(200);
    expect(settings).toMatchObject({ ...valid, language: 'en', userId: ME });
    expect(timezone).toBe('America/Montreal');
  });

  it('rejette une heure, une fréquence ou un fuseau invalides', async () => {
    const app = await buildApp();
    for (const body of [{ ...valid, dailyLogTime: '24:00' }, { ...valid, labReminderWeeks: 0 }, { ...valid, timezone: 'Mars/Olympus' }]) {
      const res = await request(app).put('/api/profile/notifications').set('Authorization', auth).send(body);
      expect(res.status).toBe(400);
    }
    expect(settings).toBeNull();
  });
});
