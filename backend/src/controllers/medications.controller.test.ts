// src/controllers/medications.controller.test.ts
// Périodes de posologie : la dose et les heures d'un médicament sont recopiées depuis la
// période en vigueur, et chaque changement crée une période au lieu d'écraser la dose.
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const prismaMock = {
  medication: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
  dosePeriod: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), count: vi.fn() },
};
vi.mock('../lib/prisma.js', () => ({ prisma: prismaMock }));

// La vérification de la version de session en base (lib/session.ts) est
// couverte par auth.controller.test.ts : ici, seule la signature du JWT compte.
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

const JWT_SECRET = 'test-secret-at-least-32-characters-long-ok';

async function buildApp() {
  vi.resetModules();
  const { default: i18next, middleware } = await import('../lib/i18n.js');
  const { default: router } = await import('../routers/medications.router.js');
  const { errorHandler } = await import('../middleware/errorHandler.js');
  const app = express();
  app.use(express.json());
  app.use(middleware.handle(i18next));
  app.use('/api/medications', router);
  app.use(errorHandler);
  return app;
}

const auth = () => `Bearer ${jwt.sign({ userId: 'user-1' }, JWT_SECRET, { expiresIn: '1h' })}`;

const MED = { id: 'med-1', userId: 'user-1', dosage: 75, dosageUnit: 'MCG', showOnChart: true, intakeTimes: ['07:00'] };
const period = (id: string, startDate: string, slots: unknown) => ({ id, medicationId: 'med-1', startDate: new Date(startDate), slots });

// Après une écriture, syncFromPeriods relit les périodes : le mock renvoie la liste fournie.
function givenPeriods(...periods: ReturnType<typeof period>[]) {
  prismaMock.dosePeriod.findMany.mockResolvedValue(periods);
  prismaMock.medication.update.mockImplementation(async ({ data }) => ({ ...MED, ...data, dosePeriods: periods }));
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.JWT_SECRET = JWT_SECRET;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-17T12:00:00Z'));
  prismaMock.medication.findFirst.mockImplementation(async ({ where }) =>
    where.id === 'med-1' && where.userId === 'user-1' ? MED : null);
  prismaMock.medication.create.mockImplementation(async ({ data }) => ({ id: 'med-new', ...data }));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('medications — création', () => {
  it('avec slots [{07:00, [75, 100]}] : une période créée, dosage = 87.5', async () => {
    const res = await request(await buildApp()).post('/api/medications').set('Authorization', auth()).send({
      name: 'Levothyrox', dosageUnit: 'MCG', startDate: '2026-10-01',
      slots: [{ time: '07:00', doses: [75, 100] }],
    });
    expect(res.status).toBe(201);
    const { data } = prismaMock.medication.create.mock.calls[0][0];
    expect(data.dosage).toBe(87.5);
    expect(data.intakeTimes).toEqual(['07:00']);
    expect(data.showOnChart).toBe(true); // coché par défaut pour les µg
    expect(data.dosePeriods).toEqual({
      create: { startDate: new Date('2026-10-01'), slots: [{ time: '07:00', doses: [75, 100] }] },
    });
  });

  it('sans slots : un créneau par heure de prise, à la dose donnée', async () => {
    await request(await buildApp()).post('/api/medications').set('Authorization', auth()).send({
      name: 'Magnésium', dosage: 1, dosageUnit: 'TABLET', intakeTimes: ['08:00', '20:00'], startDate: '2026-10-01',
    });
    const { data } = prismaMock.medication.create.mock.calls[0][0];
    expect(data.dosePeriods.create.slots).toEqual([{ time: '08:00', doses: [1] }, { time: '20:00', doses: [1] }]);
    expect(data.dosage).toBe(2);
    expect(data.showOnChart).toBe(false);
  });

  it('refuse showOnChart pour une unité autre que µg', async () => {
    const res = await request(await buildApp()).post('/api/medications').set('Authorization', auth()).send({
      name: 'Vitamine D', dosage: 1000, dosageUnit: 'IU', showOnChart: true, startDate: '2026-10-01',
    });
    expect(res.status).toBe(400);
    expect(prismaMock.medication.create).not.toHaveBeenCalled();
  });

  it('refuse une création sans dose ni slots', async () => {
    const res = await request(await buildApp()).post('/api/medications').set('Authorization', auth()).send({
      name: 'Levothyrox', startDate: '2026-10-01',
    });
    expect(res.status).toBe(400);
  });
});

describe('medications — périodes de posologie', () => {
  const first = period('p-1', '2025-01-01', [{ time: '07:00', doses: [75] }]);

  it('ajout d’une période ultérieure 50 + 25 : dosage = 75, intakeTimes = 07:00 et 20:00', async () => {
    const slots = [{ time: '07:00', doses: [50] }, { time: '20:00', doses: [25] }];
    givenPeriods(first, period('p-2', '2026-10-01', slots));
    const res = await request(await buildApp()).post('/api/medications/med-1/dose-periods')
      .set('Authorization', auth()).send({ startDate: '2026-10-01', slots });
    expect(res.status).toBe(201);
    expect(prismaMock.dosePeriod.create.mock.calls[0][0].data).toEqual({
      medicationId: 'med-1', startDate: new Date('2026-10-01'), slots,
    });
    expect(res.body.dosage).toBe(75);
    expect(res.body.intakeTimes).toEqual(['07:00', '20:00']);
  });

  it('ajout d’une période antérieure : dosage inchangé', async () => {
    givenPeriods(period('p-0', '2024-01-01', [{ time: '07:00', doses: [50] }]), first);
    const res = await request(await buildApp()).post('/api/medications/med-1/dose-periods')
      .set('Authorization', auth()).send({ startDate: '2024-01-01', slots: [{ time: '07:00', doses: [50] }] });
    expect(res.status).toBe(201);
    expect(res.body.dosage).toBe(75);
  });

  it('une période future ne change pas la dose actuelle', async () => {
    givenPeriods(first, period('p-2', '2027-01-01', [{ time: '07:00', doses: [100] }]));
    const res = await request(await buildApp()).post('/api/medications/med-1/dose-periods')
      .set('Authorization', auth()).send({ startDate: '2027-01-01', slots: [{ time: '07:00', doses: [100] }] });
    expect(res.body.dosage).toBe(75);
  });

  it('refuse des slots invalides', async () => {
    const res = await request(await buildApp()).post('/api/medications/med-1/dose-periods')
      .set('Authorization', auth()).send({ startDate: '2026-10-01', slots: [{ time: '07:00', doses: [0] }] });
    expect(res.status).toBe(400);
    expect(prismaMock.dosePeriod.create).not.toHaveBeenCalled();
  });

  it('modification d’une période : recalcule la dose', async () => {
    prismaMock.dosePeriod.findFirst.mockResolvedValue(first);
    givenPeriods(period('p-1', '2025-01-01', [{ time: '07:00', doses: [75, 100] }]));
    const res = await request(await buildApp()).put('/api/medications/med-1/dose-periods/p-1')
      .set('Authorization', auth()).send({ slots: [{ time: '07:00', doses: [75, 100] }] });
    expect(res.status).toBe(200);
    expect(prismaMock.dosePeriod.update.mock.calls[0][0]).toEqual({
      where: { id: 'p-1' }, data: { slots: [{ time: '07:00', doses: [75, 100] }] },
    });
    expect(res.body.dosage).toBe(87.5);
  });

  it('suppression de la seule période : 400', async () => {
    prismaMock.dosePeriod.findFirst.mockResolvedValue(first);
    prismaMock.dosePeriod.count.mockResolvedValue(1);
    const res = await request(await buildApp()).delete('/api/medications/med-1/dose-periods/p-1').set('Authorization', auth());
    expect(res.status).toBe(400);
    expect(prismaMock.dosePeriod.delete).not.toHaveBeenCalled();
  });

  it('suppression d’une période parmi deux : recalcule la dose', async () => {
    prismaMock.dosePeriod.findFirst.mockResolvedValue(period('p-2', '2026-10-01', [{ time: '07:00', doses: [100] }]));
    prismaMock.dosePeriod.count.mockResolvedValue(2);
    givenPeriods(first);
    const res = await request(await buildApp()).delete('/api/medications/med-1/dose-periods/p-2').set('Authorization', auth());
    expect(res.status).toBe(200);
    expect(prismaMock.dosePeriod.delete).toHaveBeenCalledWith({ where: { id: 'p-2' } });
    expect(res.body.dosage).toBe(75);
  });

  it('période d’un médicament d’un autre utilisateur : 404', async () => {
    const app = await buildApp();
    const add = await request(app).post('/api/medications/med-other/dose-periods')
      .set('Authorization', auth()).send({ startDate: '2026-10-01', slots: [{ time: '07:00', doses: [75] }] });
    const del = await request(app).delete('/api/medications/med-other/dose-periods/p-x').set('Authorization', auth());
    expect(add.status).toBe(404);
    expect(del.status).toBe(404);
    expect(prismaMock.dosePeriod.create).not.toHaveBeenCalled();
    expect(prismaMock.dosePeriod.delete).not.toHaveBeenCalled();
  });

  it('période inexistante sur son propre médicament : 404', async () => {
    prismaMock.dosePeriod.findFirst.mockResolvedValue(null);
    const res = await request(await buildApp()).put('/api/medications/med-1/dose-periods/p-x')
      .set('Authorization', auth()).send({ slots: [{ time: '07:00', doses: [75] }] });
    expect(res.status).toBe(404);
    expect(prismaMock.dosePeriod.findFirst.mock.calls[0][0].where).toEqual({ id: 'p-x', medicationId: 'med-1' });
  });
});

describe('medications — liste et modification', () => {
  it('list inclut les périodes triées par date', async () => {
    prismaMock.medication.findMany.mockResolvedValue([]);
    await request(await buildApp()).get('/api/medications').set('Authorization', auth());
    expect(prismaMock.medication.findMany.mock.calls[0][0].include).toEqual({ dosePeriods: { orderBy: { startDate: 'asc' } } });
  });

  it('la modification n’écrase plus la dose ni les heures', async () => {
    prismaMock.medication.update.mockResolvedValue(MED);
    await request(await buildApp()).put('/api/medications/med-1').set('Authorization', auth())
      .send({ name: 'Levothyrox', dosage: 100, intakeTimes: ['09:00'] });
    const { data } = prismaMock.medication.update.mock.calls[0][0];
    expect(data.name).toBe('Levothyrox');
    expect(data).not.toHaveProperty('dosage');
    expect(data).not.toHaveProperty('intakeTimes');
  });

  it('refuse de passer en unité non µg un médicament affiché sur le graphique', async () => {
    const res = await request(await buildApp()).put('/api/medications/med-1').set('Authorization', auth())
      .send({ dosageUnit: 'MG' });
    expect(res.status).toBe(400);
    expect(prismaMock.medication.update).not.toHaveBeenCalled();
  });
});
