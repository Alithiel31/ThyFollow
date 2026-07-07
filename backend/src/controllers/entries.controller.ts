// src/controllers/entries.controller.ts
import { Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { AuthRequest } from '../middleware/auth.js';
import { NotFoundError } from '../lib/errors.js';

const dateParamSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format de date invalide (YYYY-MM-DD)');

const entrySchema = z.object({
  date: dateParamSchema,
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

// Parse un entier de query string en retombant sur une valeur par défaut
// si la valeur est absente ou invalide (au lieu de laisser passer NaN
// jusqu'à Prisma, qui échouerait de façon confuse).
function parseIntOr(value: string | undefined, fallback: number): number {
  const n = value !== undefined ? Number.parseInt(value, 10) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

export const entriesController = {
  // GET /api/entries - liste paginée
  list: async (req: AuthRequest, res: Response): Promise<void> => {
    const { from, to, limit, offset } = req.query as Record<string, string | undefined>;

    const where: Record<string, unknown> = { userId: req.userId };
    if (from || to) {
      where.date = {
        ...(from && { gte: new Date(from) }),
        ...(to && { lte: new Date(to) }),
      };
    }

    const take = Math.min(parseIntOr(limit, 30), 365);
    const skip = Math.max(parseIntOr(offset, 0), 0);

    const [entries, total] = await Promise.all([
      prisma.dailyEntry.findMany({
        where,
        orderBy: { date: 'desc' },
        take,
        skip,
        include: { symptomLogs: { include: { symptom: true } } },
      }),
      prisma.dailyEntry.count({ where }),
    ]);

    res.json({ entries, total });
  },

  // GET /api/entries/:date
  getByDate: async (req: AuthRequest, res: Response): Promise<void> => {
    const date = dateParamSchema.parse(req.params.date);

    const entry = await prisma.dailyEntry.findUnique({
      where: {
        userId_date: { userId: req.userId!, date: new Date(date) },
      },
      include: { symptomLogs: { include: { symptom: true } } },
    });

    res.json(entry ?? null);
  },

  // POST /api/entries - create ou update (upsert par date)
  upsert: async (req: AuthRequest, res: Response): Promise<void> => {
    const { date, tags, medicationTime, ...data } = entrySchema.parse(req.body);

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
  },

  // DELETE /api/entries/:date
  remove: async (req: AuthRequest, res: Response): Promise<void> => {
    const date = dateParamSchema.parse(req.params.date);

    const entry = await prisma.dailyEntry.findUnique({
      where: { userId_date: { userId: req.userId!, date: new Date(date) } },
    });

    if (!entry) throw new NotFoundError('Entrée');

    await prisma.dailyEntry.delete({ where: { id: entry.id } });
    res.json({ success: true });
  },
};
