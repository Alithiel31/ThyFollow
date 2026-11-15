// src/controllers/health.controller.test.ts
import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const prismaMock = { $queryRaw: vi.fn() };
vi.mock('../lib/prisma.js', () => ({ prisma: prismaMock }));

const { healthController, isDatabaseReachable } = await import('./health.controller.js');

function buildApp() {
  const app = express();
  app.get('/health', healthController.check);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('GET /health', () => {
  it('answers 200 ok when the database answers', async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);

    const res = await request(buildApp()).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', db: 'ok' });
    expect(res.body.timestamp).toEqual(expect.any(String));
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('answers 503 degraded when the database query fails', async () => {
    prismaMock.$queryRaw.mockRejectedValue(new Error('connection refused'));

    const res = await request(buildApp()).get('/health');

    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ status: 'degraded', db: 'unreachable' });
  });

  it('gives up when the database does not answer within 2 s', async () => {
    // Requête qui ne se résout jamais : seul le délai de garde peut conclure.
    // Testé sans HTTP : les timers simulés bloqueraient aussi supertest.
    prismaMock.$queryRaw.mockReturnValue(new Promise(() => {}));
    vi.useFakeTimers();

    const pending = isDatabaseReachable();
    await vi.advanceTimersByTimeAsync(2_100);

    await expect(pending).resolves.toBe(false);
  });
});
