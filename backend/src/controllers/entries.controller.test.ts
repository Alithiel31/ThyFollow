// src/controllers/entries.controller.test.ts
// Vérifie la règle de non-régression centrale de la synchro Google Health :
// POST /api/entries (utilisé aussi bien par la saisie manuelle dans LogPage
// que, indirectement, par lib/googleHealthSync.ts) ne doit jamais repasser
// un champ synchronisé (weight/heartRate/sleepHours) en source MANUAL sauf
// si sa valeur change réellement — voir le commentaire sur
// SYNCABLE_FIELDS/buildManualSourceOverrides dans entries.controller.ts.
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const prismaMock = {
  dailyEntry: { findUnique: vi.fn(), upsert: vi.fn(), count: vi.fn(), delete: vi.fn(), findMany: vi.fn() },
};

vi.mock('../lib/prisma.js', () => ({ prisma: prismaMock }));

const JWT_SECRET = 'test-secret-at-least-32-characters-long-ok';
const USER_ID = 'user-1';
const DATE = '2026-08-16';

async function buildApp() {
  vi.resetModules();
  const { default: i18next, middleware } = await import('../lib/i18n.js');
  const { default: entriesRouter } = await import('../routers/entries.router.js');
  const { errorHandler } = await import('../middleware/errorHandler.js');

  const app = express();
  app.use(express.json());
  app.use(middleware.handle(i18next));
  app.use('/api/entries', entriesRouter);
  app.use(errorHandler);
  return app;
}

function authHeader(): string {
  return `Bearer ${jwt.sign({ userId: USER_ID }, JWT_SECRET, { expiresIn: '1h' })}`;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.JWT_SECRET = JWT_SECRET;
  prismaMock.dailyEntry.upsert.mockImplementation(({ create, update }) => Promise.resolve({ id: 'entry-1', ...(create ?? update) }));
});

describe('POST /api/entries — provenance Google Health', () => {
  it('does not flip weightSource back to MANUAL when the resubmitted weight is unchanged', async () => {
    prismaMock.dailyEntry.findUnique.mockResolvedValue({ weight: 62.5, heartRate: 72, sleepHours: 7.5 });
    const app = await buildApp();

    await request(app)
      .post('/api/entries')
      .set('Authorization', authHeader())
      // Le formulaire LogPage renvoie tout l'état, y compris le poids
      // synchronisé qu'on n'a pas touché.
      .send({ date: DATE, weight: 62.5, moodScore: 4 });

    const call = prismaMock.dailyEntry.upsert.mock.calls[0][0];
    expect(call.update.weightSource).toBeUndefined();
  });

  it('flips weightSource to MANUAL when the user actually changes a Google-synced value', async () => {
    prismaMock.dailyEntry.findUnique.mockResolvedValue({ weight: 62.5, heartRate: 72, sleepHours: 7.5 });
    const app = await buildApp();

    await request(app)
      .post('/api/entries')
      .set('Authorization', authHeader())
      .send({ date: DATE, weight: 64 });

    const call = prismaMock.dailyEntry.upsert.mock.calls[0][0];
    expect(call.update.weightSource).toBe('MANUAL');
  });

  it('marks a first-time manual entry as MANUAL', async () => {
    prismaMock.dailyEntry.findUnique.mockResolvedValue(null);
    const app = await buildApp();

    await request(app)
      .post('/api/entries')
      .set('Authorization', authHeader())
      .send({ date: DATE, weight: 70 });

    const call = prismaMock.dailyEntry.upsert.mock.calls[0][0];
    expect(call.create.weightSource).toBe('MANUAL');
  });
});
