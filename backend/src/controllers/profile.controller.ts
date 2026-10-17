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

const consentSchema = z.object({ consent: z.boolean(), always: z.boolean().optional() });

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

  // GET /api/profile/security/events — historique récent des connexions/
  // liaisons Google (voir lib/authEvents.ts), pour informer l'utilisateur
  // d'une activité inattendue sur son compte.
  securityEvents: async (req: AuthRequest, res: Response): Promise<void> => {
    const events = await prisma.authEvent.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, provider: true, type: true, userAgent: true, createdAt: true },
    });
    res.json(events);
  },

  // PUT /api/profile/ai-extraction-consent — opt-in (révocable à tout moment)
  // à l'envoi du texte anonymisé d'un bilan à l'API Anthropic (voir
  // lib/labExtract/llm.ts). `always` : lecture par IA à chaque import, les deux
  // lectures étant comparées (sinon l'IA ne sert que de repli). Retirer le
  // consentement désactive aussi `always`.
  setAiExtractionConsent: async (req: AuthRequest, res: Response): Promise<void> => {
    const { consent, always } = consentSchema.parse(req.body);
    const existing = await prisma.userProfile.findUnique({
      where: { userId: req.userId! },
      select: { aiExtractionConsentAt: true, aiExtractionAlways: true },
    });
    // La date de consentement ne bouge pas tant que le consentement reste donné.
    const aiExtractionConsentAt = consent ? (existing?.aiExtractionConsentAt ?? new Date()) : null;
    const aiExtractionAlways = consent && (always ?? existing?.aiExtractionAlways ?? false);
    await prisma.userProfile.upsert({
      where: { userId: req.userId! },
      create: { userId: req.userId!, aiExtractionConsentAt, aiExtractionAlways },
      update: { aiExtractionConsentAt, aiExtractionAlways },
    });
    res.json({ aiExtractionConsentAt, aiExtractionAlways });
  },
};
