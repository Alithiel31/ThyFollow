// src/controllers/medications.controller.test.ts
// Historique de posologie (MedicationDoseChange) : un médicament naît avec sa
// première ligne ; modifier la dose crée une ligne datée seulement si le
// changement est déclaré (`doseChange`), sinon la ligne courante est corrigée
// en place ; une ligne se supprime, sauf la plus ancienne, et la dose courante
// suit la ligne la plus récente restante.
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const prismaMock = {
  medication: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  medicationDoseChange: { upsert: vi.fn(), update: vi.fn(), delete: vi.fn() },
  // Le callback de transaction reçoit le même client simulé
  $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prismaMock)),
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
const USER_ID = 'user-1';
const MED_ID = 'med-1';

async function buildApp() {
  vi.resetModules();
  const { default: i18next, middleware } = await import('../lib/i18n.js');
  const { default: medicationsRouter } = await import('../routers/medications.router.js');
  const { errorHandler } = await import('../middleware/errorHandler.js');

  const app = express();
  app.use(express.json());
  app.use(middleware.handle(i18next));
  app.use('/api/medications', medicationsRouter);
  app.use(errorHandler);
  return app;
}

function authHeader(): string {
  return `Bearer ${jwt.sign({ userId: USER_ID }, JWT_SECRET, { expiresIn: '1h' })}`;
}

// Médicament existant : 75 µg depuis le 2026-01-10, puis 88 µg depuis le 2026-03-03
const OLDEST = { id: 'chg-1', medicationId: MED_ID, dosage: 75, dosageUnit: 'MCG', effectiveFrom: new Date('2026-01-10'), reason: null };
const LATEST = { id: 'chg-2', medicationId: MED_ID, dosage: 88, dosageUnit: 'MCG', effectiveFrom: new Date('2026-03-03'), reason: 'TSH 6,2' };

function existingMed(doseChanges = [LATEST, OLDEST]) {
  return {
    id: MED_ID,
    userId: USER_ID,
    name: 'Levothyrox',
    dosage: doseChanges[0].dosage,
    dosageUnit: doseChanges[0].dosageUnit,
    startDate: new Date('2026-01-10'),
    doseChanges,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.JWT_SECRET = JWT_SECRET;
  prismaMock.medication.create.mockImplementation(({ data }) => Promise.resolve({ id: MED_ID, ...data }));
  prismaMock.medication.update.mockImplementation(({ data }) => Promise.resolve({ id: MED_ID, ...data }));
});

describe('POST /api/medications', () => {
  it('crée le médicament avec une première ligne d’historique datée de startDate', async () => {
    const app = await buildApp();
    const res = await request(app)
      .post('/api/medications')
      .set('Authorization', authHeader())
      .send({ name: 'Levothyrox', dosage: 75, dosageUnit: 'MCG', startDate: '2026-01-10' });

    expect(res.status).toBe(201);
    const call = prismaMock.medication.create.mock.calls[0][0];
    expect(call.data.doseChanges.create).toEqual({ dosage: 75, dosageUnit: 'MCG', effectiveFrom: new Date('2026-01-10') });
  });
});

describe('PUT /api/medications/:id', () => {
  it('dose identique : aucune écriture dans l’historique', async () => {
    prismaMock.medication.findFirst.mockResolvedValue(existingMed([LATEST]));
    const app = await buildApp();
    const res = await request(app)
      .put(`/api/medications/${MED_ID}`)
      .set('Authorization', authHeader())
      .send({ dosage: 88, dosageUnit: 'MCG', notes: 'le matin' });

    expect(res.status).toBe(200);
    expect(prismaMock.medicationDoseChange.upsert).not.toHaveBeenCalled();
    expect(prismaMock.medicationDoseChange.update).not.toHaveBeenCalled();
    expect(prismaMock.medication.update.mock.calls[0][0].data.notes).toBe('le matin');
  });

  it('dose différente + doseChange : nouvelle ligne à la date demandée', async () => {
    prismaMock.medication.findFirst.mockResolvedValue(existingMed([LATEST]));
    const app = await buildApp();
    const res = await request(app)
      .put(`/api/medications/${MED_ID}`)
      .set('Authorization', authHeader())
      .send({ dosage: 100, doseChange: { effectiveFrom: '2026-05-01', reason: 'avis endocrino' } });

    expect(res.status).toBe(200);
    expect(prismaMock.medicationDoseChange.update).not.toHaveBeenCalled();
    const call = prismaMock.medicationDoseChange.upsert.mock.calls[0][0];
    expect(call.where).toEqual({ medicationId_effectiveFrom: { medicationId: MED_ID, effectiveFrom: new Date('2026-05-01') } });
    expect(call.create).toEqual({
      medicationId: MED_ID,
      dosage: 100,
      dosageUnit: 'MCG',
      effectiveFrom: new Date('2026-05-01'),
      reason: 'avis endocrino',
    });
    expect(prismaMock.medication.update.mock.calls[0][0].data.dosage).toBe(100);
  });

  it('dose différente sans doseChange : la ligne la plus récente est corrigée en place', async () => {
    prismaMock.medication.findFirst.mockResolvedValue(existingMed([LATEST]));
    const app = await buildApp();
    const res = await request(app)
      .put(`/api/medications/${MED_ID}`)
      .set('Authorization', authHeader())
      .send({ dosage: 87.5 });

    expect(res.status).toBe(200);
    expect(prismaMock.medicationDoseChange.upsert).not.toHaveBeenCalled();
    expect(prismaMock.medicationDoseChange.update).toHaveBeenCalledWith({
      where: { id: LATEST.id },
      data: { dosage: 87.5, dosageUnit: 'MCG' },
    });
  });

  it('effectiveFrom antérieure au dernier changement : 400', async () => {
    prismaMock.medication.findFirst.mockResolvedValue(existingMed([LATEST]));
    const app = await buildApp();
    const res = await request(app)
      .put(`/api/medications/${MED_ID}`)
      .set('Authorization', authHeader())
      .send({ dosage: 100, doseChange: { effectiveFrom: '2026-02-01' } });

    expect(res.status).toBe(400);
    expect(prismaMock.medicationDoseChange.upsert).not.toHaveBeenCalled();
    expect(prismaMock.medication.update).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/medications/:id/dose-changes/:changeId', () => {
  it('la ligne la plus ancienne ne se supprime pas : 409', async () => {
    prismaMock.medication.findFirst.mockResolvedValue(existingMed());
    const app = await buildApp();
    const res = await request(app)
      .delete(`/api/medications/${MED_ID}/dose-changes/${OLDEST.id}`)
      .set('Authorization', authHeader());

    expect(res.status).toBe(409);
    expect(prismaMock.medicationDoseChange.delete).not.toHaveBeenCalled();
  });

  it('supprimer la ligne la plus récente remet la dose courante à la précédente', async () => {
    prismaMock.medication.findFirst.mockResolvedValue(existingMed());
    const app = await buildApp();
    const res = await request(app)
      .delete(`/api/medications/${MED_ID}/dose-changes/${LATEST.id}`)
      .set('Authorization', authHeader());

    expect(res.status).toBe(200);
    expect(prismaMock.medicationDoseChange.delete).toHaveBeenCalledWith({ where: { id: LATEST.id } });
    expect(prismaMock.medication.update).toHaveBeenCalledWith({
      where: { id: MED_ID },
      data: { dosage: OLDEST.dosage, dosageUnit: OLDEST.dosageUnit },
    });
  });

  it('médicament d’un autre utilisateur : 404', async () => {
    // findFirst filtre par userId : un médicament d'autrui n'est pas trouvé
    prismaMock.medication.findFirst.mockResolvedValue(null);
    const app = await buildApp();
    const res = await request(app)
      .delete(`/api/medications/${MED_ID}/dose-changes/${LATEST.id}`)
      .set('Authorization', authHeader());

    expect(res.status).toBe(404);
    expect(prismaMock.medication.findFirst.mock.calls[0][0].where).toEqual({ id: MED_ID, userId: USER_ID });
    expect(prismaMock.medicationDoseChange.delete).not.toHaveBeenCalled();
  });
});
