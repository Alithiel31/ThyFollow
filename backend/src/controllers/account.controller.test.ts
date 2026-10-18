// src/controllers/account.controller.test.ts
// Export RGPD et suppression de compte, avec Prisma et Stripe mockés.
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

const JWT_SECRET = 'test-secret-at-least-32-characters-long-ok';
const ME = 'user-1';
const PASSWORD = 'correct-horse-battery';

let user: { id: string; email: string; password: string | null; stripeCustomerId: string | null } | null;
let deleted: string[];

const prismaMock = {
  user: {
    findUnique: vi.fn(async () => user),
    delete: vi.fn(async ({ where }: { where: { id: string } }) => {
      deleted.push(`user:${where.id}`);
    }),
  },
  authEvent: {
    findMany: vi.fn(async () => [{ provider: 'google', type: 'LOGIN_SUCCESS', ip: '1.2.3.4', userAgent: 'x', createdAt: new Date() }]),
    deleteMany: vi.fn(async ({ where }: { where: { userId: string } }) => {
      deleted.push(`authEvents:${where.userId}`);
    }),
  },
  dailyEntry: { findMany: vi.fn(async () => [{ id: 'e1', date: new Date('2026-10-01'), energyLevel: 3, symptomLogs: [] }]) },
  symptomLibrary: { findMany: vi.fn(async () => []) },
  medication: { findMany: vi.fn(async () => []) },
  labResult: { findMany: vi.fn(async () => [{ id: 'l1', tsh: 2.1 }]) },
  labDocument: { findMany: vi.fn(async () => [] as unknown[]) },
  appointment: { findMany: vi.fn(async () => []) },
  pdfPassword: { findMany: vi.fn(async () => [{ label: 'Biogroup', createdAt: new Date(), lastUsedAt: null }]) },
  importUsage: { findMany: vi.fn(async () => []) },
  promoRedemption: { findMany: vi.fn(async () => []) },
  $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
};
vi.mock('../lib/prisma.js', () => ({ prisma: prismaMock }));

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

const listSubscriptions = vi.fn();
const cancelSubscription = vi.fn();
let stripeConfigured = true;
vi.mock('../lib/stripe.js', () => ({
  isStripeConfigured: () => stripeConfigured,
  getStripe: () => ({ subscriptions: { list: listSubscriptions, cancel: cancelSubscription } }),
}));

async function buildApp() {
  vi.resetModules();
  const { default: i18next, middleware } = await import('../lib/i18n.js');
  const { default: accountRouter } = await import('../routers/account.router.js');
  const { errorHandler } = await import('../middleware/errorHandler.js');
  const app = express();
  app.use(express.json());
  app.use(middleware.handle(i18next));
  app.use('/api/account', accountRouter);
  app.use(errorHandler);
  return app;
}

const token = (userId: string) => `Bearer ${jwt.sign({ userId }, JWT_SECRET, { expiresIn: '1h' })}`;

beforeAll(() => {
  process.env.JWT_SECRET = JWT_SECRET;
  process.env.PDF_ENCRYPTION_KEY = 'e'.repeat(64);
});

beforeEach(async () => {
  vi.clearAllMocks();
  deleted = [];
  stripeConfigured = true;
  user = { id: ME, email: 'alice@example.com', password: await bcrypt.hash(PASSWORD, 4), stripeCustomerId: null };
  listSubscriptions.mockResolvedValue({ data: [] });
  cancelSubscription.mockResolvedValue({});
});

describe('GET /api/account/export', () => {
  it('exige une session', async () => {
    const app = await buildApp();
    expect((await request(app).get('/api/account/export')).status).toBe(401);
  });

  it('renvoie toutes les données en pièce jointe, sans aucun secret', async () => {
    const { encryptBuffer } = await import('../lib/crypto.js');
    prismaMock.labDocument.findMany.mockResolvedValueOnce([
      { id: 'd1', labResultId: 'l1', filename: 'bilan.pdf', sizeBytes: 9, sha256: 'abc', createdAt: new Date(), dataEnc: encryptBuffer(Buffer.from('%PDF-1.7')) },
    ]);
    const app = await buildApp();
    const res = await request(app).get('/api/account/export').set('Authorization', token(ME));
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="thyrotrack-export-\d{4}-\d{2}-\d{2}\.json"/);
    expect(res.body.format).toBe('thyrotrack-export');
    expect(res.body.dailyEntries).toHaveLength(1);
    expect(res.body.labResults[0].tsh).toBe(2.1);
    expect(Buffer.from(res.body.labDocuments[0].contentBase64, 'base64').toString()).toBe('%PDF-1.7');
    expect(res.body.labDocuments[0]).not.toHaveProperty('dataEnc');
    expect(res.body.pdfPasswords[0]).toEqual(expect.not.objectContaining({ passwordEnc: expect.anything() }));
    // Le select du compte n'inclut ni mot de passe ni jetons
    const select = (prismaMock.user.findUnique.mock.calls[0] as unknown as [{ select: Record<string, unknown> }])[0].select;
    for (const secret of ['password', 'verificationToken', 'resetToken', 'tokenVersion', 'stripeCustomerId']) {
      expect(select).not.toHaveProperty(secret);
    }
  });
});

describe('DELETE /api/account', () => {
  it('refuse un mauvais mot de passe en 403 (pas 401, qui déconnecterait)', async () => {
    const app = await buildApp();
    const res = await request(app).delete('/api/account').set('Authorization', token(ME)).send({ password: 'wrong' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('INVALID_PASSWORD');
    expect(deleted).toEqual([]);
  });

  it('supprime le compte et ses traces de connexion avec le bon mot de passe', async () => {
    const app = await buildApp();
    const res = await request(app).delete('/api/account').set('Authorization', token(ME)).send({ password: PASSWORD });
    expect(res.status).toBe(204);
    expect(deleted).toEqual([`authEvents:${ME}`, `user:${ME}`]);
  });

  it('compte Google sans mot de passe : exige l’email recopié', async () => {
    user!.password = null;
    const app = await buildApp();
    const bad = await request(app).delete('/api/account').set('Authorization', token(ME)).send({ confirmEmail: 'other@example.com' });
    expect(bad.status).toBe(403);
    expect(bad.body.code).toBe('INVALID_EMAIL_CONFIRMATION');
    const ok = await request(app).delete('/api/account').set('Authorization', token(ME)).send({ confirmEmail: ' Alice@Example.com ' });
    expect(ok.status).toBe(204);
  });

  it('résilie les abonnements Stripe encore facturables avant de supprimer', async () => {
    user!.stripeCustomerId = 'cus_1';
    listSubscriptions.mockResolvedValue({ data: [{ id: 'sub_active', status: 'active' }, { id: 'sub_old', status: 'canceled' }] });
    const app = await buildApp();
    const res = await request(app).delete('/api/account').set('Authorization', token(ME)).send({ password: PASSWORD });
    expect(res.status).toBe(204);
    expect(cancelSubscription).toHaveBeenCalledTimes(1);
    expect(cancelSubscription).toHaveBeenCalledWith('sub_active');
  });

  it('ne supprime rien si la résiliation Stripe échoue', async () => {
    user!.stripeCustomerId = 'cus_1';
    listSubscriptions.mockRejectedValue(new Error('stripe down'));
    const app = await buildApp();
    const res = await request(app).delete('/api/account').set('Authorization', token(ME)).send({ password: PASSWORD });
    expect(res.status).toBe(503);
    expect(deleted).toEqual([]);
  });

  it('ne supprime rien si Stripe n’est plus configuré alors qu’un client existe', async () => {
    user!.stripeCustomerId = 'cus_1';
    stripeConfigured = false;
    const app = await buildApp();
    const res = await request(app).delete('/api/account').set('Authorization', token(ME)).send({ password: PASSWORD });
    expect(res.status).toBe(503);
    expect(deleted).toEqual([]);
  });
});
