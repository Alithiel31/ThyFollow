// src/controllers/googleHealthWebhook.controller.test.ts
// Vérifie la porte d'entrée du webhook Google Health : seule une
// notification portant le bon channelToken pour un abonnement connu
// déclenche une synchro (voir controllers/googleHealth.controller.ts pour
// la génération du channelToken lors de la connexion).
import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const prismaMock = {
  googleHealthConnection: { findFirst: vi.fn() },
};

vi.mock('../lib/prisma.js', () => ({ prisma: prismaMock }));

const syncDailyMetricsBySubscriptionMock = vi.fn();
vi.mock('../lib/googleHealthSync.js', () => ({
  syncDailyMetricsBySubscription: (...args: unknown[]) => syncDailyMetricsBySubscriptionMock(...args),
}));

async function buildApp() {
  vi.resetModules();
  const { default: router } = await import('../routers/googleHealthWebhook.router.js');
  const { errorHandler } = await import('../middleware/errorHandler.js');

  const app = express();
  app.use(express.json());
  app.use('/api/webhooks/google-health', router);
  app.use(errorHandler);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  syncDailyMetricsBySubscriptionMock.mockResolvedValue(undefined);
});

describe('GET /api/webhooks/google-health', () => {
  it('echoes back the verification challenge', async () => {
    const app = await buildApp();

    const res = await request(app).get('/api/webhooks/google-health?challenge=abc123');

    expect(res.status).toBe(200);
    expect(res.text).toBe('abc123');
  });
});

describe('POST /api/webhooks/google-health', () => {
  it('rejects a notification for an unknown subscription', async () => {
    prismaMock.googleHealthConnection.findFirst.mockResolvedValue(null);
    const app = await buildApp();

    const res = await request(app)
      .post('/api/webhooks/google-health')
      .send({ subscriptionId: 'sub-1', channelToken: 'wrong' });

    expect(res.status).toBe(403);
    expect(syncDailyMetricsBySubscriptionMock).not.toHaveBeenCalled();
  });

  it('rejects a notification with a mismatched channelToken', async () => {
    prismaMock.googleHealthConnection.findFirst.mockResolvedValue({
      userId: 'user-1',
      webhookSubscriptionId: 'sub-1',
      webhookChannelToken: 'correct-token',
    });
    const app = await buildApp();

    const res = await request(app)
      .post('/api/webhooks/google-health')
      .send({ subscriptionId: 'sub-1', channelToken: 'wrong-token' });

    expect(res.status).toBe(403);
    expect(syncDailyMetricsBySubscriptionMock).not.toHaveBeenCalled();
  });

  it('accepts and triggers a sync for a valid notification', async () => {
    prismaMock.googleHealthConnection.findFirst.mockResolvedValue({
      userId: 'user-1',
      webhookSubscriptionId: 'sub-1',
      webhookChannelToken: 'correct-token',
    });
    const app = await buildApp();

    const res = await request(app)
      .post('/api/webhooks/google-health')
      .send({ subscriptionId: 'sub-1', channelToken: 'correct-token', dates: ['2026-08-16'] });

    expect(res.status).toBe(202);
    await vi.waitFor(() => {
      expect(syncDailyMetricsBySubscriptionMock).toHaveBeenCalledWith('sub-1', ['2026-08-16']);
    });
  });

  it('rejects a malformed payload', async () => {
    const app = await buildApp();

    const res = await request(app).post('/api/webhooks/google-health').send({ nonsense: true });

    expect(res.status).toBe(400);
  });
});
