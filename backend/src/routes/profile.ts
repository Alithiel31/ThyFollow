// src/routes/profile.ts
import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';

export const profileRouter = Router();
profileRouter.use(authenticate);

const profileSchema = z.object({
  diagnosisType: z.enum(['HYPOTHYROIDISM', 'HYPERTHYROIDISM', 'HASHIMOTO', 'GRAVES', 'THYROID_CANCER', 'NODULES', 'GOITER', 'OTHER']).optional().nullable(),
  diagnosisDate: z.string().optional().nullable(),
  thyroidStatus: z.enum(['INTACT', 'PARTIAL_REMOVAL', 'TOTAL_REMOVAL', 'RADIOIODINE_ABLATION', 'RADIOIODINE_PARTIAL']).optional().nullable(),
  endocrinologistName: z.string().optional().nullable(),
  targetTSH_min: z.number().optional().nullable(),
  targetTSH_max: z.number().optional().nullable(),
  targetFT4_min: z.number().optional().nullable(),
  targetFT4_max: z.number().optional().nullable(),
  targetFT3_min: z.number().optional().nullable(),
  targetFT3_max: z.number().optional().nullable(),
  timezone: z.string().optional(),
  weightUnit: z.enum(['KG', 'LBS']).optional(),
  temperatureUnit: z.enum(['CELSIUS', 'FAHRENHEIT']).optional(),
});

// GET /api/profile
profileRouter.get('/', async (req: AuthRequest, res: Response) => {
  const profile = await prisma.userProfile.findUnique({
    where: { userId: req.userId },
  });
  res.json(profile);
});

// PUT /api/profile
profileRouter.put('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0].message });
    return;
  }

  const { diagnosisDate, ...data } = parsed.data;

  const profile = await prisma.userProfile.upsert({
    where: { userId: req.userId! },
    create: {
      userId: req.userId!,
      ...(diagnosisDate && { diagnosisDate: new Date(diagnosisDate) }),
      ...data,
    },
    update: {
      ...(diagnosisDate !== undefined && {
        diagnosisDate: diagnosisDate ? new Date(diagnosisDate) : null,
      }),
      ...data,
    },
  });

  res.json(profile);
});
