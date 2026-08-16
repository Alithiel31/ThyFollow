// src/controllers/entries.controller.ts
import { Response } from 'express';
import { z } from 'zod';
import type { TFunction } from 'i18next';
import { prisma } from '../lib/prisma.js';
import { AuthRequest } from '../middleware/auth.js';
import { NotFoundError } from '../lib/errors.js';

const dateParamSchema = (t: TFunction) => z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, t('validation.invalidDateFormat'));

const entrySchema = (t: TFunction) => z.object({
  date: dateParamSchema(t),
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

// Champs synchronisables depuis Google Health (voir lib/googleHealthSync.ts).
// `LogPage` renvoie systématiquement tout le formulaire à chaque sauvegarde
// (voir frontend/src/pages/LogPage.tsx#handleSave), donc la simple présence
// d'un champ dans le payload ne veut pas dire que l'utilisateur l'a modifié.
// On ne repasse une source en MANUAL que si la valeur envoyée diffère
// réellement de celle déjà stockée — sinon un enregistrement du journal qui
// ne concerne pas ce champ effacerait silencieusement la provenance Google
// Health et bloquerait sa resynchro automatique.
const SYNCABLE_FIELDS = ['weight', 'heartRate', 'sleepHours'] as const;

function buildManualSourceOverrides(
  existing: { weight: number | null; heartRate: number | null; sleepHours: number | null } | null,
  data: Record<string, unknown>
): Record<string, 'MANUAL'> {
  const overrides: Record<string, 'MANUAL'> = {};
  for (const field of SYNCABLE_FIELDS) {
    if (!(field in data)) continue;
    const incoming = data[field] as number | null | undefined;
    const current = existing?.[field] ?? null;
    if (incoming !== undefined && incoming !== current) {
      overrides[`${field}Source`] = 'MANUAL';
    }
  }
  return overrides;
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
    const date = dateParamSchema(req.t).parse(req.params.date);

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
    const { date, tags, medicationTime, ...data } = entrySchema(req.t).parse(req.body);

    const existing = await prisma.dailyEntry.findUnique({
      where: { userId_date: { userId: req.userId!, date: new Date(date) } },
      select: { weight: true, heartRate: true, sleepHours: true },
    });
    const sourceOverrides = buildManualSourceOverrides(existing, data);

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
        ...sourceOverrides,
      },
      update: {
        tags: tags ?? [],
        medicationTime: medicationTime ? new Date(medicationTime) : null,
        ...data,
        ...sourceOverrides,
      },
      include: { symptomLogs: { include: { symptom: true } } },
    });

    res.status(201).json(entry);
  },

  // DELETE /api/entries/:date
  remove: async (req: AuthRequest, res: Response): Promise<void> => {
    const date = dateParamSchema(req.t).parse(req.params.date);

    const entry = await prisma.dailyEntry.findUnique({
      where: { userId_date: { userId: req.userId!, date: new Date(date) } },
    });

    if (!entry) throw new NotFoundError(req.t('errors.notFound', { resource: req.t('resources.entry') }));

    await prisma.dailyEntry.delete({ where: { id: entry.id } });
    res.json({ success: true });
  },
};
