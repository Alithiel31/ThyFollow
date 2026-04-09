// src/routes/labResults.ts
import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

export const labResultsRouter = Router();
labResultsRouter.use(authenticate);

const labSchema = z.object({
  date: z.string(),
  lab: z.string().optional().nullable(),
  orderedBy: z.string().optional().nullable(),
  tsh: z.number().optional().nullable(),
  ft4: z.number().optional().nullable(),
  ft3: z.number().optional().nullable(),
  t4: z.number().optional().nullable(),
  t3: z.number().optional().nullable(),
  antiTPO: z.number().optional().nullable(),
  antiTG: z.number().optional().nullable(),
  antiTSHR: z.number().optional().nullable(),
  thyroglobulin: z.number().optional().nullable(),
  ferritin: z.number().optional().nullable(),
  vitaminD: z.number().optional().nullable(),
  vitaminB12: z.number().optional().nullable(),
  magnesium: z.number().optional().nullable(),
  selenium: z.number().optional().nullable(),
  cholesterol: z.number().optional().nullable(),
  glucose: z.number().optional().nullable(),
  hemoglobin: z.number().optional().nullable(),
  notes: z.string().optional().nullable(),
  documentUrl: z.string().url().optional().nullable(),
});

// GET /api/lab-results
labResultsRouter.get('/', async (req: AuthRequest, res: Response) => {
  const results = await prisma.labResult.findMany({
    where: { userId: req.userId },
    orderBy: { date: 'desc' },
  });
  res.json(results);
});

// GET /api/lab-results/:id
labResultsRouter.get('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const result = await prisma.labResult.findFirst({
    where: { id: req.params.id, userId: req.userId },
  });
  if (!result) throw new AppError('Résultat non trouvé', 404);
  res.json(result);
});

// POST /api/lab-results
labResultsRouter.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = labSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0].message });
    return;
  }
  const { date, ...data } = parsed.data;
  const result = await prisma.labResult.create({
    data: { userId: req.userId!, date: new Date(date), ...data },
  });
  res.status(201).json(result);
});

// PUT /api/lab-results/:id
labResultsRouter.put('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const existing = await prisma.labResult.findFirst({
    where: { id: req.params.id, userId: req.userId },
  });
  if (!existing) throw new AppError('Résultat non trouvé', 404);

  const parsed = labSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0].message });
    return;
  }

  const { date, ...data } = parsed.data;
  const result = await prisma.labResult.update({
    where: { id: req.params.id },
    data: { ...(date && { date: new Date(date) }), ...data },
  });
  res.json(result);
});

// DELETE /api/lab-results/:id
labResultsRouter.delete('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const existing = await prisma.labResult.findFirst({
    where: { id: req.params.id, userId: req.userId },
  });
  if (!existing) throw new AppError('Résultat non trouvé', 404);

  await prisma.labResult.delete({ where: { id: req.params.id } });
  res.json({ success: true });
});
