// src/controllers/billing.controller.test.ts
// Codes promo (activation, limites, prolongation) et webhook Stripe, avec
// Prisma remplacé par un faux en mémoire et Stripe mocké.
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

const JWT_SECRET = 'test-secret-at-least-32-characters-long-ok';
const USER_ID = 'user-1';
const DAY = 24 * 60 * 60 * 1000;

interface Promo { id: string; code: string; durationDays: number; maxRedemptions: number | null; redemptionCount: number; expiresAt: Date | null; active: boolean }
let promos: Promo[];
let redemptions: { codeId: string; userId: string }[];
let user: { id: string; role: 'USER' | 'ADMIN'; proUntil: Date | null; proSource: 'STRIPE' | 'PROMO' | 'GRANT' | null; freeImportsUsed: number; stripeCustomerId: string | null };

const prismaMock = {
  user: {
    findUnique: vi.fn(async () => user),
    update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => Object.assign(user, data)),
    updateMany: vi.fn(async ({ where, data }: { where: { id?: string; stripeCustomerId?: string; OR?: { id?: string; stripeCustomerId?: string }[] }; data: Record<string, unknown> }) => {
      const conditions = where.OR ?? [where];
      const matches = conditions.some((c) => (c.id ? user.id === c.id : user.stripeCustomerId === c.stripeCustomerId));
      if (!matches) return { count: 0 };
      Object.assign(user, data);
      return { count: 1 };
    }),
  },
  importUsage: { findUnique: vi.fn(async () => null) },
  promoCode: {
    findUnique: vi.fn(async ({ where }: { where: { code?: string; id?: string } }) =>
      promos.find((p) => p.code === where.code || p.id === where.id) ?? null
    ),
    updateMany: vi.fn(async ({ where }: { where: { id: string; redemptionCount?: { lt: number } } }) => {
      const p = promos.find((x) => x.id === where.id)!;
      if (where.redemptionCount && !(p.redemptionCount < where.redemptionCount.lt)) return { count: 0 };
      p.redemptionCount += 1;
      return { count: 1 };
    }),
    create: vi.fn(async ({ data }: { data: Omit<Promo, 'id' | 'redemptionCount' | 'active'> }) => {
      const row = { id: `p${promos.length + 1}`, redemptionCount: 0, active: true, ...data } as Promo;
      promos.push(row);
      return row;
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<Promo> }) =>
      Object.assign(promos.find((p) => p.id === where.id)!, data)
    ),
    findMany: vi.fn(async () => promos),
  },
  promoRedemption: {
    findUnique: vi.fn(async ({ where }: { where: { codeId_userId: { codeId: string; userId: string } } }) =>
      redemptions.find((r) => r.codeId === where.codeId_userId.codeId && r.userId === where.codeId_userId.userId) ?? null
    ),
    create: vi.fn(async ({ data }: { data: { codeId: string; userId: string } }) => {
      redemptions.push(data);
    }),
  },
  $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prismaMock)),
};
vi.mock('../lib/prisma.js', () => ({ prisma: prismaMock }));

const constructEvent = vi.fn();
const retrieveSubscription = vi.fn();
vi.mock('../lib/stripe.js', async () => {
  const actual = await vi.importActual<typeof import('../lib/stripe.js')>('../lib/stripe.js');
  return {
    ...actual,
    isStripeConfigured: () => true,
    getStripe: () => ({
      webhooks: { constructEvent },
      subscriptions: { retrieve: retrieveSubscription },
      checkout: { sessions: { create: vi.fn(async () => ({ url: 'https://checkout.stripe.test/s' })) } },
      billingPortal: { sessions: { create: vi.fn(async () => ({ url: 'https://portal.stripe.test/s' })) } },
    }),
  };
});

async function buildApp() {
  vi.resetModules();
  const { default: i18next, middleware } = await import('../lib/i18n.js');
  const { default: billingRouter } = await import('../routers/billing.router.js');
  const { default: adminRouter } = await import('../routers/adminPromo.router.js');
  const { stripeWebhookController } = await import('./stripeWebhook.controller.js');
  const { errorHandler } = await import('../middleware/errorHandler.js');
  const app = express();
  app.use(middleware.handle(i18next));
  app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), stripeWebhookController.handle);
  app.use(express.json());
  app.use('/api/billing', billingRouter);
  app.use('/api/admin/promo-codes', adminRouter);
  app.use(errorHandler);
  return app;
}

const auth = () => `Bearer ${jwt.sign({ userId: USER_ID }, JWT_SECRET, { expiresIn: '1h' })}`;

beforeAll(() => {
  process.env.JWT_SECRET = JWT_SECRET;
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
  process.env.STRIPE_SECRET_KEY = 'sk_test_x';
  process.env.STRIPE_PRICE_ID = 'price_x';
});

beforeEach(() => {
  vi.clearAllMocks();
  user = { id: USER_ID, role: 'USER', proUntil: null, proSource: null, freeImportsUsed: 3, stripeCustomerId: null };
  promos = [{ id: 'p1', code: 'FAMILLE', durationDays: 90, maxRedemptions: 2, redemptionCount: 0, expiresAt: null, active: true }];
  redemptions = [];
});

describe('POST /api/billing/redeem', () => {
  const redeem = (app: express.Express, code: string) =>
    request(app).post('/api/billing/redeem').set('Authorization', auth()).send({ code });

  it('active l’accès Pro pour la durée du code (insensible à la casse)', async () => {
    const app = await buildApp();
    const res = await redeem(app, ' famille ');
    expect(res.status).toBe(200);
    expect(res.body.entitlements.pro).toBe(true);
    expect(res.body.entitlements.proSource).toBe('PROMO');
    const days = (user.proUntil!.getTime() - Date.now()) / DAY;
    expect(days).toBeGreaterThan(89.9);
    expect(days).toBeLessThan(90.1);
    expect(promos[0].redemptionCount).toBe(1);
  });

  it('prolonge à partir de la fin de l’accès en cours', async () => {
    user.proUntil = new Date(Date.now() + 10 * DAY);
    user.proSource = 'GRANT';
    const app = await buildApp();
    await redeem(app, 'FAMILLE');
    const days = (user.proUntil!.getTime() - Date.now()) / DAY;
    expect(days).toBeGreaterThan(99.9);
  });

  it('un compte ne peut utiliser un code qu’une fois', async () => {
    const app = await buildApp();
    expect((await redeem(app, 'FAMILLE')).status).toBe(200);
    expect((await redeem(app, 'FAMILLE')).status).toBe(409);
  });

  it('même réponse pour code inconnu, désactivé, expiré ou épuisé', async () => {
    const app = await buildApp();
    promos.push(
      { id: 'p2', code: 'OFF', durationDays: 30, maxRedemptions: null, redemptionCount: 0, expiresAt: null, active: false },
      { id: 'p3', code: 'OLD', durationDays: 30, maxRedemptions: null, redemptionCount: 0, expiresAt: new Date(Date.now() - DAY), active: true },
      { id: 'p4', code: 'FULL', durationDays: 30, maxRedemptions: 1, redemptionCount: 1, expiresAt: null, active: true }
    );
    for (const code of ['NOPE', 'OFF', 'OLD', 'FULL']) {
      const res = await redeem(app, code);
      expect(res.status).toBe(400);
    }
    expect(user.proUntil).toBeNull();
  });

  it('refuse si un abonnement Stripe est déjà actif', async () => {
    user.proUntil = new Date(Date.now() + 10 * DAY);
    user.proSource = 'STRIPE';
    const app = await buildApp();
    expect((await redeem(app, 'FAMILLE')).status).toBe(409);
  });
});

describe('codes promo : administration', () => {
  it('réservé aux ADMIN', async () => {
    const app = await buildApp();
    const res = await request(app).post('/api/admin/promo-codes').set('Authorization', auth()).send({ durationDays: 30 });
    expect(res.status).toBe(403);
  });

  it('un ADMIN crée un code (généré si absent, en majuscules) et le désactive', async () => {
    user.role = 'ADMIN';
    const app = await buildApp();
    const created = await request(app).post('/api/admin/promo-codes').set('Authorization', auth()).send({ durationDays: 30, maxRedemptions: 5 });
    expect(created.status).toBe(201);
    expect(created.body.code).toMatch(/^THYRO-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    const custom = await request(app).post('/api/admin/promo-codes').set('Authorization', auth()).send({ code: 'maman', durationDays: 60 });
    expect(custom.body.code).toBe('MAMAN');
    const off = await request(app).patch(`/api/admin/promo-codes/${created.body.id}`).set('Authorization', auth()).send({ active: false });
    expect(off.body.active).toBe(false);
  });
});

describe('POST /api/webhooks/stripe', () => {
  const post = (app: express.Express, signature?: string) => {
    const req = request(app).post('/api/webhooks/stripe').set('Content-Type', 'application/json');
    if (signature) req.set('stripe-signature', signature);
    return req.send('{"id":"evt_1"}');
  };
  const subscription = (status: string, end: number, metadata: Record<string, string> = {}) => ({
    id: 'sub_1',
    metadata,
    customer: 'cus_1',
    status,
    items: { data: [{ current_period_end: end }] },
  });

  it('rejette une requête sans signature ou à la signature invalide', async () => {
    const app = await buildApp();
    expect((await post(app)).status).toBe(400);
    constructEvent.mockImplementation(() => {
      throw new Error('bad sig');
    });
    expect((await post(app, 't=1,v1=bad')).status).toBe(400);
    expect(user.proUntil).toBeNull();
  });

  it('checkout.session.completed : lie le client Stripe et ouvre l’accès jusqu’à la fin de période', async () => {
    const end = Math.floor((Date.now() + 30 * DAY) / 1000);
    constructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      data: { object: { client_reference_id: USER_ID, customer: 'cus_1', subscription: 'sub_1' } },
    });
    retrieveSubscription.mockResolvedValue(subscription('active', end));
    const app = await buildApp();
    const res = await post(app, 'sig');
    expect(res.status).toBe(200);
    expect(user.stripeCustomerId).toBe('cus_1');
    expect(user.proSource).toBe('STRIPE');
    expect(user.proUntil!.getTime()).toBe(end * 1000);
  });

  it('subscription.deleted : coupe l’accès immédiatement', async () => {
    user.stripeCustomerId = 'cus_1';
    user.proUntil = new Date(Date.now() + 20 * DAY);
    user.proSource = 'STRIPE';
    const canceled = subscription('canceled', Math.floor((Date.now() + 20 * DAY) / 1000));
    retrieveSubscription.mockResolvedValue(canceled);
    constructEvent.mockReturnValue({ type: 'customer.subscription.deleted', data: { object: canceled } });
    const app = await buildApp();
    expect((await post(app, 'sig')).status).toBe(200);
    expect(user.proUntil!.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('subscription.updated en past_due : l’accès court jusqu’à la fin de la période payée', async () => {
    user.stripeCustomerId = 'cus_1';
    const end = Math.floor((Date.now() + 5 * DAY) / 1000);
    const pastDue = subscription('past_due', end);
    retrieveSubscription.mockResolvedValue(pastDue);
    constructEvent.mockReturnValue({ type: 'customer.subscription.updated', data: { object: pastDue } });
    const app = await buildApp();
    await post(app, 'sig');
    expect(user.proUntil!.getTime()).toBe(end * 1000);
  });

  it('répond 500 (Stripe réessaiera) si le traitement échoue', async () => {
    user.stripeCustomerId = 'cus_1';
    prismaMock.user.updateMany.mockRejectedValueOnce(new Error('db down'));
    const active = subscription('active', Math.floor((Date.now() + DAY) / 1000));
    retrieveSubscription.mockResolvedValue(active);
    constructEvent.mockReturnValue({ type: 'customer.subscription.updated', data: { object: active } });
    const app = await buildApp();
    expect((await post(app, 'sig')).status).toBe(500);
  });

  it('évènement en retard : l’état courant chez Stripe l’emporte sur le payload', async () => {
    user.stripeCustomerId = 'cus_1';
    user.proUntil = new Date(Date.now() + 20 * DAY);
    user.proSource = 'STRIPE';
    // Le payload (ancien) dit « active », Stripe dit désormais « canceled »
    constructEvent.mockReturnValue({
      type: 'customer.subscription.updated',
      data: { object: subscription('active', Math.floor((Date.now() + 20 * DAY) / 1000)) },
    });
    retrieveSubscription.mockResolvedValue(subscription('canceled', Math.floor((Date.now() + 20 * DAY) / 1000)));
    const app = await buildApp();
    await post(app, 'sig');
    expect(user.proUntil!.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('subscription.created avant checkout.session.completed : rattachée par metadata.userId', async () => {
    const end = Math.floor((Date.now() + 30 * DAY) / 1000);
    const sub = subscription('active', end, { userId: USER_ID });
    retrieveSubscription.mockResolvedValue(sub);
    constructEvent.mockReturnValue({ type: 'customer.subscription.created', data: { object: sub } });
    const app = await buildApp();
    await post(app, 'sig');
    expect(user.stripeCustomerId).toBe('cus_1');
    expect(user.proUntil!.getTime()).toBe(end * 1000);
  });
});
