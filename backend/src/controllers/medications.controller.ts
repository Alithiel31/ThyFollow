// src/controllers/medications.controller.ts
import { Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { AuthRequest } from '../middleware/auth.js';
import { NotFoundError } from '../lib/errors.js';

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const medSchema = z.object({
  name: z.string().min(1),
  brand: z.string().optional().nullable(),
  dosage: z.number().positive(),
  dosageUnit: z.enum(['MCG', 'MG', 'IU', 'TABLET', 'DROP', 'ML', 'OTHER']).default('MCG'),
  frequency: z.enum(['DAILY', 'EVERY_OTHER_DAY', 'WEEKLY', 'AS_NEEDED']).default('DAILY'),
  intakeTimes: z.array(z.string().regex(TIME_RE)).max(8).default([]),
  startDate: z.string(),
  endDate: z.string().optional().nullable(),
  active: z.boolean().default(true),
  instructions: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const intakeSchema = z.object({
  date: z.string(),
  time: z.string().regex(TIME_RE),
});

export const medicationsController = {
  list: async (req: AuthRequest, res: Response): Promise<void> => {
    const meds = await prisma.medication.findMany({
      where: { userId: req.userId },
      orderBy: [{ active: 'desc' }, { startDate: 'desc' }],
    });
    res.json(meds);
  },

  create: async (req: AuthRequest, res: Response): Promise<void> => {
    const { startDate, endDate, ...data } = medSchema.parse(req.body);
    const med = await prisma.medication.create({
      data: {
        userId: req.userId!,
        startDate: new Date(startDate),
        endDate: endDate ? new Date(endDate) : null,
        ...data,
      },
    });
    res.status(201).json(med);
  },

  update: async (req: AuthRequest, res: Response): Promise<void> => {
    const existing = await prisma.medication.findFirst({
      where: { id: req.params.id, userId: req.userId },
    });
    if (!existing) throw new NotFoundError(req.t('errors.notFound', { resource: req.t('resources.medication') }));

    const { startDate, endDate, ...data } = medSchema.partial().parse(req.body);
    const med = await prisma.medication.update({
      where: { id: req.params.id },
      data: {
        ...(startDate && { startDate: new Date(startDate) }),
        ...(endDate !== undefined && { endDate: endDate ? new Date(endDate) : null }),
        ...data,
      },
    });
    res.json(med);
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
