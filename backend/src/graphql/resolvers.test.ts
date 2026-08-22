// src/graphql/resolvers.test.ts
// Tests d'intégration sur POST /graphql, même pattern que
// controllers/entries.controller.test.ts : mock Prisma, JWT signé en dur,
// requêtes envoyées via supertest sur une app Express minimale.
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const prismaMock = {
  user: { findUniqueOrThrow: vi.fn() },
  userProfile: { findUnique: vi.fn() },
  medication: { findMany: vi.fn(), findFirst: vi.fn() },
  medicationIntake: { findMany: vi.fn(), upsert: vi.fn() },
  dailyEntry: { findMany: vi.fn(), findFirst: vi.fn() },
  symptomLog: { findMany: vi.fn(), create: vi.fn() },
  symptomLibrary: { findFirst: vi.fn() },
  labResult: { findMany: vi.fn() },
};

vi.mock('../lib/prisma.js', () => ({ prisma: prismaMock }));

const JWT_SECRET = 'test-secret-at-least-32-characters-long-ok';
const USER_ID = 'user-1';

async function buildApp() {
  vi.resetModules();
  process.env.JWT_SECRET = JWT_SECRET;
  const express = (await import('express')).default;
  const { mountGraphQL } = await import('./index.js');

  const app = express();
  app.use(express.json());
  await mountGraphQL(app);
  return app;
}

function authHeader(): string {
  return `Bearer ${jwt.sign({ userId: USER_ID }, JWT_SECRET, { expiresIn: '1h' })}`;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /graphql — me { medications { intakes } }', () => {
  it('resolves the nested query and batches intakes into a single Prisma call (no N+1)', async () => {
    prismaMock.user.findUniqueOrThrow.mockResolvedValue({ id: USER_ID, email: 'a@b.com', name: 'Alice' });
    prismaMock.medication.findMany.mockResolvedValue([
      { id: 'm1', name: 'Levothyrox', dosage: 75, dosageUnit: 'MCG', frequency: 'DAILY', intakeTimes: [], active: true },
      { id: 'm2', name: 'Vitamine D', dosage: 1000, dosageUnit: 'IU', frequency: 'WEEKLY', intakeTimes: [], active: true },
    ]);
    prismaMock.medicationIntake.findMany.mockResolvedValue([
      { id: 'i1', medicationId: 'm1', date: new Date('2026-08-01'), time: '08:00', takenAt: new Date('2026-08-01T08:00:00Z') },
      { id: 'i2', medicationId: 'm2', date: new Date('2026-08-01'), time: '09:00', takenAt: new Date('2026-08-01T09:00:00Z') },
    ]);

    const app = await buildApp();
    const res = await request(app)
      .post('/graphql')
      .set('Authorization', authHeader())
      .send({ query: 'query { me { name medications { id intakes { id time } } } }' });

    expect(res.status).toBe(200);
    expect(res.body.errors).toBeUndefined();
    expect(res.body.data.me.name).toBe('Alice');
    expect(res.body.data.me.medications).toHaveLength(2);
    expect(res.body.data.me.medications[0].intakes).toHaveLength(1);
    expect(res.body.data.me.medications[1].intakes).toHaveLength(1);
    // La preuve anti-N+1 : deux médicaments, une seule requête `findMany`
    // groupée (voir dataloaders.ts / dataloaders.test.ts).
    expect(prismaMock.medicationIntake.findMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.medicationIntake.findMany.mock.calls[0][0].where.medicationId.in).toEqual(['m1', 'm2']);
  });
});

describe('POST /graphql — authentication', () => {
  it('rejects a request with no Authorization header', async () => {
    const app = await buildApp();
    const res = await request(app).post('/graphql').send({ query: 'query { me { id } }' });

    // Une erreur levée au niveau de `context` (avant que l'exécution de la
    // query ne démarre) fait échouer toute la requête HTTP avec le statut
    // porté par `extensions.http.status` (401 ici) — à la différence d'une
    // erreur levée par un resolver, qui reste toujours en 200 (voir le test
    // Mutation.logMedicationIntake plus bas, et docs/graphql.md).
    expect(res.status).toBe(401);
    expect(res.body.errors[0].extensions.code).toBe('UNAUTHENTICATED');
    expect(prismaMock.user.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it('rejects a request with an invalid token', async () => {
    const app = await buildApp();
    const res = await request(app)
      .post('/graphql')
      .set('Authorization', 'Bearer not-a-valid-jwt')
      .send({ query: 'query { me { id } }' });

    expect(res.status).toBe(401);
    expect(res.body.errors[0].extensions.code).toBe('UNAUTHENTICATED');
  });
});

describe('POST /graphql — Mutation.logMedicationIntake', () => {
  it('rejects logging an intake for a medication that does not belong to the caller', async () => {
    prismaMock.medication.findFirst.mockResolvedValue(null);

    const app = await buildApp();
    const res = await request(app)
      .post('/graphql')
      .set('Authorization', authHeader())
      .send({
        query:
          'mutation { logMedicationIntake(medicationId: "someone-elses-med", date: "2026-08-19", time: "08:00") { id } }',
      });

    // Contrairement à une erreur de contexte (test ci-dessus), une erreur
    // levée par un resolver ne porte pas de `extensions.http.status` : le
    // statut HTTP reste 200, l'erreur n'existant que dans le corps de la
    // réponse — c'est la convention GraphQL-over-HTTP par défaut.
    expect(res.status).toBe(200);
    expect(res.body.errors[0].extensions.code).toBe('NOT_FOUND');
    expect(prismaMock.medicationIntake.upsert).not.toHaveBeenCalled();
    // La garde de propriété scope toujours la recherche à ctx.userId, comme
    // les controllers REST (voir resolvers.ts).
    expect(prismaMock.medication.findFirst.mock.calls[0][0].where).toMatchObject({ userId: USER_ID });
  });
});
