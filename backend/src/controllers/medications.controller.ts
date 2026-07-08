// src/controllers/medications.controller.ts
import { Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { AuthRequest } from '../middleware/auth.js';
import { NotFoundError } from '../lib/errors.js';

const medSchema = z.object({
  name: z.string().min(1),
  brand: z.string().optional().nullable(),
  dosageMcg: z.number().positive(),
  frequency: z.enum(['DAILY', 'EVERY_OTHER_DAY', 'WEEKLY', 'AS_NEEDED']).default('DAILY'),
  intakeTime: z.string().optional().nullable(),
  startDate: z.string(),
  endDate: z.string().optional().nullable(),
  active: z.boolean().default(true),
  instructions: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
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
};
