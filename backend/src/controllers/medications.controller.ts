// src/controllers/medications.controller.ts
import { Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { AuthRequest } from '../middleware/auth.js';
import { ConflictError, NotFoundError, ValidationError } from '../lib/errors.js';

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Historique de posologie renvoyé avec chaque médicament, du plus récent au plus ancien
const DOSE_CHANGES_INCLUDE = { doseChanges: { orderBy: { effectiveFrom: 'desc' as const } } };

// Déclaration explicite d'un changement de dose (par opposition à une
// correction de saisie) lors d'un PUT /medications/:id
const doseChangeSchema = z.object({
  effectiveFrom: z.string().regex(DATE_RE),
  reason: z.string().max(200).optional().nullable(),
});

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
      include: DOSE_CHANGES_INCLUDE,
    });
    res.json(meds);
  },

  create: async (req: AuthRequest, res: Response): Promise<void> => {
    const { startDate, endDate, ...data } = medSchema.parse(req.body);
    // Le médicament naît avec sa première ligne d'historique, à la dose saisie
    const med = await prisma.medication.create({
      data: {
        userId: req.userId!,
        startDate: new Date(startDate),
        endDate: endDate ? new Date(endDate) : null,
        ...data,
        doseChanges: {
          create: { dosage: data.dosage, dosageUnit: data.dosageUnit, effectiveFrom: new Date(startDate) },
        },
      },
      include: DOSE_CHANGES_INCLUDE,
    });
    res.status(201).json(med);
  },

  update: async (req: AuthRequest, res: Response): Promise<void> => {
    const existing = await prisma.medication.findFirst({
      where: { id: req.params.id, userId: req.userId },
      include: { doseChanges: { orderBy: { effectiveFrom: 'desc' }, take: 1 } },
    });
    if (!existing) throw new NotFoundError(req.t('errors.notFound', { resource: req.t('resources.medication') }));

    const { startDate, endDate, doseChange, ...data } = medSchema
      .partial()
      .extend({ doseChange: doseChangeSchema.optional() })
      .parse(req.body);

    // Dose/unité demandées, comparées à la ligne d'historique la plus récente
    // (la migration de reprise garantit qu'il y en a toujours une).
    const latest = existing.doseChanges[0];
    const nextDosage = data.dosage ?? existing.dosage;
    const nextUnit = data.dosageUnit ?? existing.dosageUnit;
    const doseDiffers = latest ? nextDosage !== latest.dosage || nextUnit !== latest.dosageUnit : false;

    if (doseChange && latest && new Date(doseChange.effectiveFrom) < latest.effectiveFrom) {
      throw new ValidationError(req.t('errors.doseChangeBeforeLatest'));
    }

    const med = await prisma.$transaction(async (tx) => {
      if (doseDiffers && latest) {
        if (doseChange) {
          // Vrai changement de posologie : nouvelle ligne datée (deux changements
          // le même jour se remplacent)
          await tx.medicationDoseChange.upsert({
            where: { medicationId_effectiveFrom: { medicationId: existing.id, effectiveFrom: new Date(doseChange.effectiveFrom) } },
            create: {
              medicationId: existing.id,
              dosage: nextDosage,
              dosageUnit: nextUnit,
              effectiveFrom: new Date(doseChange.effectiveFrom),
              reason: doseChange.reason ?? null,
            },
            update: { dosage: nextDosage, dosageUnit: nextUnit, reason: doseChange.reason ?? null },
          });
        } else {
          // Correction de saisie : la ligne courante est rectifiée en place
          await tx.medicationDoseChange.update({
            where: { id: latest.id },
            data: { dosage: nextDosage, dosageUnit: nextUnit },
          });
        }
      }
      return tx.medication.update({
        where: { id: existing.id },
        data: {
          ...(startDate && { startDate: new Date(startDate) }),
          ...(endDate !== undefined && { endDate: endDate ? new Date(endDate) : null }),
          ...data,
        },
        include: DOSE_CHANGES_INCLUDE,
      });
    });
    res.json(med);
  },

  // DELETE /api/medications/:id/dose-changes/:changeId - retire une ligne d'historique
  // (jamais la plus ancienne) ; la dose courante suit la ligne la plus récente restante
  removeDoseChange: async (req: AuthRequest, res: Response): Promise<void> => {
    const med = await prisma.medication.findFirst({
      where: { id: req.params.id, userId: req.userId },
      include: DOSE_CHANGES_INCLUDE,
    });
    if (!med) throw new NotFoundError(req.t('errors.notFound', { resource: req.t('resources.medication') }));

    const target = med.doseChanges.find((c) => c.id === req.params.changeId);
    if (!target) throw new NotFoundError(req.t('errors.notFound', { resource: req.t('resources.doseChange') }));

    const oldest = med.doseChanges[med.doseChanges.length - 1];
    if (target.id === oldest.id) throw new ConflictError(req.t('errors.doseChangeFirstRow'));

    const wasLatest = target.id === med.doseChanges[0].id;
    const nextLatest = med.doseChanges[1];
    await prisma.$transaction(async (tx) => {
      await tx.medicationDoseChange.delete({ where: { id: target.id } });
      if (wasLatest) {
        await tx.medication.update({
          where: { id: med.id },
          data: { dosage: nextLatest.dosage, dosageUnit: nextLatest.dosageUnit },
        });
      }
    });
    res.json({ success: true });
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
