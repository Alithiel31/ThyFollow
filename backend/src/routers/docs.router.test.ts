// src/routers/docs.router.test.ts
// Vérifie que la doc Swagger UI est servie hors production et masquée en
// production (voir docs.router.ts) — pas de mock de fs/yaml : lit le vrai
// openapi.yaml, ce qui valide au passage qu'il reste parsable.
import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

async function buildApp() {
  vi.resetModules();
  const { default: docsRouter } = await import('./docs.router.js');

  const app = express();
  app.use('/api/docs', docsRouter);
  return app;
}

beforeEach(() => {
  process.env.JWT_SECRET = 'test-secret-at-least-32-characters-long-ok';
});

describe('docs.router', () => {
  it('serves the Swagger UI outside production', async () => {
    process.env.NODE_ENV = 'development';
    const app = await buildApp();

    const res = await request(app).get('/api/docs/');

    expect(res.status).toBe(200);
    expect(res.text).toContain('Swagger UI');
  });

  it('is not mounted in production', async () => {
    process.env.NODE_ENV = 'production';
    const app = await buildApp();

    const res = await request(app).get('/api/docs/');

    expect(res.status).toBe(404);
  });
});
