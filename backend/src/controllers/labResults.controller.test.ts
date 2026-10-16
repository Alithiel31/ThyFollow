// src/controllers/labResults.controller.test.ts
// Le carnet doit exposer les ids des PDF rattachés (bouton « Télécharger »
// de LabResultsPage), et rien d'autre du document (jamais dataEnc).
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const prismaMock = { labResult: { findMany: vi.fn(), findFirst: vi.fn() } };
vi.mock('../lib/prisma.js', () => ({ prisma: prismaMock }));

const JWT_SECRET = 'test-secret-at-least-32-characters-long-ok';

async function buildApp() {
  vi.resetModules();
  const { default: i18next, middleware } = await import('../lib/i18n.js');
  const { default: router } = await import('../routers/labResults.router.js');
  const { errorHandler } = await import('../middleware/errorHandler.js');
  const app = express();
  app.use(express.json());
  app.use(middleware.handle(i18next));
  app.use('/api/lab-results', router);
  app.use(errorHandler);
  return app;
}

const auth = () => `Bearer ${jwt.sign({ userId: 'user-1' }, JWT_SECRET, { expiresIn: '1h' })}`;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.JWT_SECRET = JWT_SECRET;
});

describe('lab results — documents rattachés', () => {
  it('list demande uniquement les ids des documents', async () => {
    prismaMock.labResult.findMany.mockResolvedValue([{ id: 'lab-1', documents: [{ id: 'doc-1' }] }]);
    const res = await request(await buildApp()).get('/api/lab-results').set('Authorization', auth());
    expect(res.body[0].documents).toEqual([{ id: 'doc-1' }]);
    expect(prismaMock.labResult.findMany.mock.calls[0][0].include).toEqual({ documents: { select: { id: true } } });
  });

  it('getById demande uniquement les ids des documents', async () => {
    prismaMock.labResult.findFirst.mockResolvedValue({ id: 'lab-1', documents: [] });
    await request(await buildApp()).get('/api/lab-results/lab-1').set('Authorization', auth());
    expect(prismaMock.labResult.findFirst.mock.calls[0][0].include).toEqual({ documents: { select: { id: true } } });
  });
});
