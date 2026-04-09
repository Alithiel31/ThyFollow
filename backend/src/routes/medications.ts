// src/routes/medications.ts
import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

export const medicationsRouter = Router();
medicationsRouter.use(authenticate);

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

medicationsRouter.get('/', async (req: AuthRequest, res: Response) => {
  const meds = await prisma.medication.findMany({
    where: { userId: req.userId },
    orderBy: [{ active: 'desc' }, { startDate: 'desc' }],
  });
  res.json(meds);
});

medicationsRouter.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = medSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0].message });
    return;
  }
  const { startDate, endDate, ...data } = parsed.data;
  const med = await prisma.medication.create({
    data: {
      userId: req.userId!,
      startDate: new Date(startDate),
      endDate: endDate ? new Date(endDate) : null,
      ...data,
    },
  });
  res.status(201).json(med);
});

medicationsRouter.put('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const existing = await prisma.medication.findFirst({
    where: { id: req.params.id, userId: req.userId },
  });
  if (!existing) throw new AppError('Médicament non trouvé', 404);

  const parsed = medSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0].message });
    return;
  }

  const { startDate, endDate, ...data } = parsed.data;
  const med = await prisma.medication.update({
    where: { id: req.params.id },
    data: {
      ...(startDate && { startDate: new Date(startDate) }),
      ...(endDate !== undefined && { endDate: endDate ? new Date(endDate) : null }),
      ...data,
    },
  });
  res.json(med);
});

medicationsRouter.delete('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const existing = await prisma.medication.findFirst({
    where: { id: req.params.id, userId: req.userId },
  });
  if (!existing) throw new AppError('Médicament non trouvé', 404);
  await prisma.medication.delete({ where: { id: req.params.id } });
  res.json({ success: true });
});
