// src/graphql/dataloaders.test.ts
// Preuve unitaire, isolée d'Express/Apollo, que createLoaders batche bien
// plusieurs `.load()` émis dans le même tick en un seul appel Prisma — c'est
// le cœur de l'argument anti-N+1 documenté dans dataloaders.ts.
import { describe, it, expect, vi } from 'vitest';
import { createLoaders } from './dataloaders.js';
import type { PrismaClient } from '@prisma/client';

function buildPrismaMock() {
  return {
    medicationIntake: { findMany: vi.fn().mockResolvedValue([]) },
    symptomLog: { findMany: vi.fn().mockResolvedValue([]) },
  } as unknown as PrismaClient;
}

describe('createLoaders — intakesByMedicationId', () => {
  it('batches concurrent loads for different medications into a single findMany call', async () => {
    const prisma = buildPrismaMock();
    (prisma.medicationIntake.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'i1', medicationId: 'm1', date: new Date('2026-08-01'), time: '08:00', takenAt: new Date() },
      { id: 'i2', medicationId: 'm2', date: new Date('2026-08-01'), time: '08:00', takenAt: new Date() },
    ]);
    const loaders = createLoaders(prisma);

    const [m1Intakes, m2Intakes] = await Promise.all([
      loaders.intakesByMedicationId.load('m1'),
      loaders.intakesByMedicationId.load('m2'),
    ]);

    expect(prisma.medicationIntake.findMany).toHaveBeenCalledTimes(1);
    expect((prisma.medicationIntake.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0].where.medicationId.in).toEqual([
      'm1',
      'm2',
    ]);
    expect(m1Intakes).toHaveLength(1);
    expect(m2Intakes).toHaveLength(1);
  });

  it('returns an empty array for a medication with no intakes, without dropping other results', async () => {
    const prisma = buildPrismaMock();
    (prisma.medicationIntake.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'i1', medicationId: 'm1', date: new Date('2026-08-01'), time: '08:00', takenAt: new Date() },
    ]);
    const loaders = createLoaders(prisma);

    const [m1Intakes, m2Intakes] = await Promise.all([
      loaders.intakesByMedicationId.load('m1'),
      loaders.intakesByMedicationId.load('m2'),
    ]);

    expect(m1Intakes).toHaveLength(1);
    expect(m2Intakes).toEqual([]);
  });
});

describe('createLoaders — symptomLogsByEntryId', () => {
  it('batches concurrent loads for different entries into a single findMany call', async () => {
    const prisma = buildPrismaMock();
    (prisma.symptomLog.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 's1', entryId: 'e1', symptomId: 'sym1', severity: 3, note: null, symptom: { id: 'sym1', name: 'Fatigue' } },
    ]);
    const loaders = createLoaders(prisma);

    await Promise.all([loaders.symptomLogsByEntryId.load('e1'), loaders.symptomLogsByEntryId.load('e2')]);

    expect(prisma.symptomLog.findMany).toHaveBeenCalledTimes(1);
    expect((prisma.symptomLog.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0].where.entryId.in).toEqual(['e1', 'e2']);
  });
});
