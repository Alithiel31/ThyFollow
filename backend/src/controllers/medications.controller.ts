// src/controllers/medications.controller.ts
import { Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { AuthRequest } from '../middleware/auth.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';
import { TIME_RE, slotsSchema, averageDailyDose, currentPeriod, type DoseSlot } from '../lib/doseCycle.js';

const medSchema = z.object({
  name: z.string().min(1),
  brand: z.string().optional().nullable(),
  dosage: z.number().positive().optional(), // ignoré si `slots` est fourni
  dosageUnit: z.enum(['MCG', 'MG', 'IU', 'TABLET', 'DROP', 'ML', 'OTHER']).default('MCG'),
  frequency: z.enum(['DAILY', 'EVERY_OTHER_DAY', 'WEEKLY', 'AS_NEEDED']).default('DAILY'),
  intakeTimes: z.array(z.string().regex(TIME_RE)).max(8).default([]),
  slots: slotsSchema.optional(),
  showOnChart: z.boolean().optional(),
  startDate: z.string(),
  endDate: z.string().optional().nullable(),
  active: z.boolean().default(true),
  instructions: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

// La posologie (dose, heures) ne se modifie plus en place : elle passe par les périodes.
const medUpdateSchema = medSchema.omit({ dosage: true, intakeTimes: true, slots: true }).partial();

const periodSchema = z.object({ startDate: z.string(), slots: slotsSchema });

const withPeriods = { dosePeriods: { orderBy: { startDate: 'asc' as const } } };

// Valeurs recopiées sur le médicament depuis une période, pour les écrans et l'API qui
// lisent encore `dosage` (dose moyenne quotidienne totale) et `intakeTimes`.
const derivedFromSlots = (slots: DoseSlot[]) => ({
  dosage: averageDailyDose(slots),
  intakeTimes: slots.flatMap((s) => (s.time ? [s.time] : [])),
});

// Recalcule dosage / intakeTimes depuis la période en vigueur aujourd'hui (à défaut, la
// première à venir) et renvoie le médicament avec ses périodes.
async function syncFromPeriods(medicationId: string) {
  const periods = await prisma.dosePeriod.findMany({ where: { medicationId }, orderBy: { startDate: 'asc' } });
  const period = currentPeriod(periods, new Date()) ?? periods[0];
  return prisma.medication.update({
    where: { id: medicationId },
    data: derivedFromSlots(slotsSchema.parse(period.slots)),
    include: withPeriods,
  });
}

const intakeSchema = z.object({
  date: z.string(),
  time: z.string().regex(TIME_RE),
});

async function findOwnMedication(req: AuthRequest) {
  const med = await prisma.medication.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!med) throw new NotFoundError(req.t('errors.notFound', { resource: req.t('resources.medication') }));
  return med;
}

async function findPeriod(req: AuthRequest, medicationId: string) {
  const period = await prisma.dosePeriod.findFirst({ where: { id: req.params.periodId, medicationId } });
  if (!period) throw new NotFoundError(req.t('errors.notFound', { resource: req.t('resources.dosePeriod') }));
  return period;
}

export const medicationsController = {
  list: async (req: AuthRequest, res: Response): Promise<void> => {
    const meds = await prisma.medication.findMany({
      where: { userId: req.userId },
      orderBy: [{ active: 'desc' }, { startDate: 'desc' }],
      include: withPeriods,
    });
    res.json(meds);
  },

  create: async (req: AuthRequest, res: Response): Promise<void> => {
    const { startDate, endDate, slots: inputSlots, dosage, intakeTimes, showOnChart, ...data } = medSchema.parse(req.body);
    if (!inputSlots && dosage === undefined) throw new ValidationError(req.t('errors.doseRequired'));
    // Sans `slots`, chaque heure de prise devient un créneau à la dose donnée.
    const slots: DoseSlot[] = inputSlots ?? (intakeTimes.length
      ? intakeTimes.map((time) => ({ time, doses: [dosage!] }))
      : [{ time: null, doses: [dosage!] }]);
    const chart = showOnChart ?? data.dosageUnit === 'MCG';
    if (chart && data.dosageUnit !== 'MCG') throw new ValidationError(req.t('errors.chartMcgOnly'));

    const med = await prisma.medication.create({
      data: {
        userId: req.userId!,
        startDate: new Date(startDate),
        endDate: endDate ? new Date(endDate) : null,
        ...data,
        ...derivedFromSlots(slots),
        showOnChart: chart,
        dosePeriods: { create: { startDate: new Date(startDate), slots } },
      },
      include: withPeriods,
    });
    res.status(201).json(med);
  },

  update: async (req: AuthRequest, res: Response): Promise<void> => {
    const existing = await prisma.medication.findFirst({
      where: { id: req.params.id, userId: req.userId },
    });
    if (!existing) throw new NotFoundError(req.t('errors.notFound', { resource: req.t('resources.medication') }));

    const { startDate, endDate, ...data } = medUpdateSchema.parse(req.body);
    if ((data.showOnChart ?? existing.showOnChart) && (data.dosageUnit ?? existing.dosageUnit) !== 'MCG') {
      throw new ValidationError(req.t('errors.chartMcgOnly'));
    }
    const med = await prisma.medication.update({
      where: { id: req.params.id },
      data: {
        ...(startDate && { startDate: new Date(startDate) }),
        ...(endDate !== undefined && { endDate: endDate ? new Date(endDate) : null }),
        ...data,
      },
      include: withPeriods,
    });
    res.json(med);
  },

  // POST /api/medications/:id/dose-periods - nouvelle posologie à partir d'une date (passée ou future)
  addDosePeriod: async (req: AuthRequest, res: Response): Promise<void> => {
    const med = await findOwnMedication(req);
    const { startDate, slots } = periodSchema.parse(req.body);
    await prisma.dosePeriod.create({ data: { medicationId: med.id, startDate: new Date(startDate), slots } });
    res.status(201).json(await syncFromPeriods(med.id));
  },

  // PUT /api/medications/:id/dose-periods/:periodId
  updateDosePeriod: async (req: AuthRequest, res: Response): Promise<void> => {
    const med = await findOwnMedication(req);
    const period = await findPeriod(req, med.id);
    const { startDate, slots } = periodSchema.partial().parse(req.body);
    await prisma.dosePeriod.update({
      where: { id: period.id },
      data: { ...(startDate && { startDate: new Date(startDate) }), ...(slots && { slots }) },
    });
    res.json(await syncFromPeriods(med.id));
  },

  // DELETE /api/medications/:id/dose-periods/:periodId - un médicament garde toujours une période
  removeDosePeriod: async (req: AuthRequest, res: Response): Promise<void> => {
    const med = await findOwnMedication(req);
    const period = await findPeriod(req, med.id);
    if ((await prisma.dosePeriod.count({ where: { medicationId: med.id } })) <= 1) {
      throw new ValidationError(req.t('errors.lastDosePeriod'));
    }
    await prisma.dosePeriod.delete({ where: { id: period.id } });
    res.json(await syncFromPeriods(med.id));
  },

  remove: async (req: AuthRequest, res: Response): Promise<void> => {
    const existing = await prisma.medication.findFirst({
      where: { id: req.params.id, userId: req.userId },
    });
    if (!existing) throw new NotFoundError(req.t('errors.notFound', { resource: req.t('resources.medication') }));
    await prisma.medication.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  },

  // GET /api/medications/intakes?date=YYYY-MM-DD - prises validées ce jour-là, tous médicaments confondus
  listIntakes: async (req: AuthRequest, res: Response): Promise<void> => {
    const date = (req.query.date as string) ?? new Date().toISOString().slice(0, 10);
    const intakes = await prisma.medicationIntake.findMany({
      where: { date: new Date(date), medication: { userId: req.userId } },
      select: { id: true, medicationId: true, date: true, time: true },
    });
    res.json(intakes);
  },

  // POST /api/medications/:id/intake - valide une prise (créneau horaire) pour une date donnée
  markTaken: async (req: AuthRequest, res: Response): Promise<void> => {
    const med = await prisma.medication.findFirst({
      where: { id: req.params.id, userId: req.userId },
    });
    if (!med) throw new NotFoundError(req.t('errors.notFound', { resource: req.t('resources.medication') }));

    const { date, time } = intakeSchema.parse(req.body);
    const intake = await prisma.medicationIntake.upsert({
      where: { medicationId_date_time: { medicationId: med.id, date: new Date(date), time } },
      create: { medicationId: med.id, date: new Date(date), time },
      update: {},
    });
    res.status(201).json(intake);
  },

  // DELETE /api/medications/:id/intake - annule la validation d'une prise
  markUntaken: async (req: AuthRequest, res: Response): Promise<void> => {
    const med = await prisma.medication.findFirst({
      where: { id: req.params.id, userId: req.userId },
    });
    if (!med) throw new NotFoundError(req.t('errors.notFound', { resource: req.t('resources.medication') }));

    const { date, time } = intakeSchema.parse(req.body);
    await prisma.medicationIntake.deleteMany({ where: { medicationId: med.id, date: new Date(date), time } });
    res.json({ success: true });
  },
};
