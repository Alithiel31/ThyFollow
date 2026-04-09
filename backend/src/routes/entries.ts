// src/routes/entries.ts
import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

export const entriesRouter = Router();
entriesRouter.use(authenticate);

const entrySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format de date invalide (YYYY-MM-DD)'),
  energyLevel: z.number().int().min(1).max(5).optional().nullable(),
  moodScore: z.number().int().min(1).max(5).optional().nullable(),
  anxietyLevel: z.number().int().min(1).max(5).optional().nullable(),
  brainFogLevel: z.number().int().min(1).max(5).optional().nullable(),
  weight: z.number().positive().optional().nullable(),
  bodyTemperature: z.number().optional().nullable(),
  heartRate: z.number().int().optional().nullable(),
  bloodPressureSys: z.number().int().optional().nullable(),
  bloodPressureDia: z.number().int().optional().nullable(),
  coldSensitivity: z.number().int().min(1).max(5).optional().nullable(),
  heatSensitivity: z.number().int().min(1).max(5).optional().nullable(),
  hairLoss: z.number().int().min(1).max(5).optional().nullable(),
  drySkin: z.number().int().min(1).max(5).optional().nullable(),
  constipation: z.number().int().min(1).max(5).optional().nullable(),
  bloating: z.number().int().min(1).max(5).optional().nullable(),
  muscleWeakness: z.number().int().min(1).max(5).optional().nullable(),
  jointPain: z.number().int().min(1).max(5).optional().nullable(),
  neckPain: z.number().int().min(1).max(5).optional().nullable(),
  swelling: z.number().int().min(1).max(5).optional().nullable(),
  tremors: z.number().int().min(1).max(5).optional().nullable(),
  sleepHours: z.number().min(0).max(24).optional().nullable(),
  sleepQuality: z.number().int().min(1).max(5).optional().nullable(),
  medicationTaken: z.boolean().optional(),
  medicationTime: z.string().optional().nullable(),
  medicationNotes: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  tags: z.array(z.string()).optional(),
});

// GET /api/entries - list with pagination
entriesRouter.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const { from, to, limit = '30', offset = '0' } = req.query as Record<string, string>;

  const where: Record<string, unknown> = { userId: req.userId };
  if (from || to) {
    where.date = {
      ...(from && { gte: new Date(from) }),
      ...(to && { lte: new Date(to) }),
    };
  }

  const [entries, total] = await Promise.all([
    prisma.dailyEntry.findMany({
      where,
      orderBy: { date: 'desc' },
      take: Math.min(parseInt(limit), 365),
      skip: parseInt(offset),
      include: { symptomLogs: { include: { symptom: true } } },
    }),
    prisma.dailyEntry.count({ where }),
  ]);

  res.json({ entries, total });
});

// GET /api/entries/:date - get entry by date
entriesRouter.get('/:date', async (req: AuthRequest, res: Response): Promise<void> => {
  const entry = await prisma.dailyEntry.findUnique({
    where: {
      userId_date: {
        userId: req.userId!,
        date: new Date(req.params.date),
      },
    },
    include: { symptomLogs: { include: { symptom: true } } },
  });

  if (!entry) {
    res.json(null);
    return;
  }
  res.json(entry);
});

// POST /api/entries - create or update (upsert by date)
entriesRouter.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = entrySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0].message });
    return;
  }

  const { date, tags, medicationTime, ...data } = parsed.data;

  const entry = await prisma.dailyEntry.upsert({
    where: {
      userId_date: { userId: req.userId!, date: new Date(date) },
    },
    create: {
      userId: req.userId!,
      date: new Date(date),
      tags: tags ?? [],
      medicationTime: medicationTime ? new Date(medicationTime) : null,
      ...data,
    },
    update: {
      tags: tags ?? [],
      medicationTime: medicationTime ? new Date(medicationTime) : null,
      ...data,
    },
    include: { symptomLogs: { include: { symptom: true } } },
  });

  res.status(201).json(entry);
});

// DELETE /api/entries/:date
entriesRouter.delete('/:date', async (req: AuthRequest, res: Response): Promise<void> => {
  const entry = await prisma.dailyEntry.findUnique({
    where: {
      userId_date: { userId: req.userId!, date: new Date(req.params.date) },
    },
  });

  if (!entry) throw new AppError('Entrée non trouvée', 404);

  await prisma.dailyEntry.delete({ where: { id: entry.id } });
  res.json({ success: true });
});
