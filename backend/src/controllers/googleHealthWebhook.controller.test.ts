// src/controllers/googleHealthWebhook.controller.test.ts
// Vérifie la porte d'entrée du webhook Google Health contre le contrat
// confirmé (developers.google.com/health/webhooks) : authentification par
// un secret statique renvoyé tel quel dans l'en-tête Authorization,
// négociation de validation ({"type":"verification"} → 200 si authentifié,
// 401 sinon), et réponse 204 immédiate pour une vraie notification.
import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const syncDailyMetricsByHealthUserIdMock = vi.fn();
vi.mock('../lib/googleHealthSync.js', () => ({
  syncDailyMetricsByHealthUserId: (...args: unknown[]) => syncDailyMetricsByHealthUserIdMock(...args),
}));

const WEBHOOK_SECRET = 'Bearer test-webhook-secret';

async function buildApp() {
  vi.resetModules();
  process.env.GOOGLE_HEALTH_WEBHOOK_SECRET = WEBHOOK_SECRET;
  const { default: router } = await import('../routers/googleHealthWebhook.router.js');

  const app = express();
  app.use(express.json());
  app.use('/api/webhooks/google-health', router);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/webhooks/google-health', () => {
  it('rejects a request without the configured Authorization header (unauthorized verification challenge)', async () => {
    const app = await buildApp();

    const res = await request(app).post('/api/webhooks/google-health').send({ type: 'verification' });

    expect(res.status).toBe(401);
    expect(syncDailyMetricsByHealthUserIdMock).not.toHaveBeenCalled();
  });

  it('rejects a request with a wrong Authorization header', async () => {
    const app = await buildApp();

    const res = await request(app)
      .post('/api/webhooks/google-health')
      .set('Authorization', 'Bearer wrong-secret')
      .send({ type: 'verification' });

    expect(res.status).toBe(401);
  });

  it('responds 200 to an authorized verification challenge', async () => {
    const app = await buildApp();

    const res = await request(app)
      .post('/api/webhooks/google-health')
      .set('Authorization', WEBHOOK_SECRET)
      .send({ type: 'verification' });

    expect(res.status).toBe(200);
    expect(syncDailyMetricsByHealthUserIdMock).not.toHaveBeenCalled();
  });

  it('responds 204 immediately and triggers a sync for a real notification', async () => {
    syncDailyMetricsByHealthUserIdMock.mockResolvedValue(undefined);
    const app = await buildApp();

    const res = await request(app)
      .post('/api/webhooks/google-health')
      .set('Authorization', WEBHOOK_SECRET)
      .send({
        data: {
          healthUserId: 'health-user-1',
          operation: 'UPSERT',
          dataType: 'weight',
          intervals: [{ civilIso8601TimeInterval: { startTime: '2026-03-07T17:29:00', endTime: '2026-03-07T17:34:00' } }],
        },
      });

    expect(res.status).toBe(204);
    await vi.waitFor(() => {
      expect(syncDailyMetricsByHealthUserIdMock).toHaveBeenCalledWith('health-user-1', ['2026-03-07']);
    });
  });

  it('does not call sync when the notification has no healthUserId or extractable date', async () => {
    const app = await buildApp();

    const res = await request(app)
      .post('/api/webhooks/google-health')
      .set('Authorization', WEBHOOK_SECRET)
      .send({ data: { dataType: 'weight' } });

    expect(res.status).toBe(204);
    expect(syncDailyMetricsByHealthUserIdMock).not.toHaveBeenCalled();
  });
});
