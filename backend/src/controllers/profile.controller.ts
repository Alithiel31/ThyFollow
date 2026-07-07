// src/controllers/profile.controller.ts
import { Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { AuthRequest } from '../middleware/auth.js';

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

export const profileController = {
  // GET /api/profile
  get: async (req: AuthRequest, res: Response): Promise<void> => {
    const profile = await prisma.userProfile.findUnique({
      where: { userId: req.userId },
    });
    res.json(profile);
  },

  // PUT /api/profile
  update: async (req: AuthRequest, res: Response): Promise<void> => {
    const { diagnosisDate, ...data } = profileSchema.parse(req.body);

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
  },
};
