// src/controllers/profile.controller.ts
import { Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { AuthRequest } from '../middleware/auth.js';
import { ValidationError } from '../lib/errors.js';
import { isEmailConfigured } from '../lib/resend.js';

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

function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone });
    return true;
  } catch {
    return false;
  }
}

const notificationsSchema = z.object({
  dailyLogReminder: z.boolean(),
  dailyLogTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  medicationReminder: z.boolean(),
  labResultReminder: z.boolean(),
  labReminderWeeks: z.number().int().min(1).max(52),
  appointmentReminder: z.boolean(),
  // Fuseau du navigateur : les rappels partent à l'heure locale de l'utilisateur
  timezone: z.string().max(64).optional(),
});

// Réglages tels que lus par le frontend ; sans ligne en base, tout est désactivé.
const NOTIFICATION_DEFAULTS = {
  dailyLogReminder: false,
  dailyLogTime: '20:00',
  medicationReminder: false,
  labResultReminder: false,
  labReminderWeeks: 12,
  appointmentReminder: false,
};
const notificationSelect = {
  dailyLogReminder: true,
  dailyLogTime: true,
  medicationReminder: true,
  labResultReminder: true,
  labReminderWeeks: true,
  appointmentReminder: true,
} as const;

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
  // GET /api/profile/notifications — réglages des rappels par email.
  // `emailEnabled` : faux si l'envoi d'emails n'est pas configuré sur ce serveur.
  getNotifications: async (req: AuthRequest, res: Response): Promise<void> => {
    const settings = await prisma.notificationSetting.findUnique({
      where: { userId: req.userId },
      select: notificationSelect,
    });
    res.json({ ...(settings ?? NOTIFICATION_DEFAULTS), emailEnabled: isEmailConfigured() });
  },

  // PUT /api/profile/notifications
  updateNotifications: async (req: AuthRequest, res: Response): Promise<void> => {
    const { timezone, ...data } = notificationsSchema.parse(req.body);
    if (timezone !== undefined && !isValidTimeZone(timezone)) {
      throw new ValidationError(req.t('errors.invalidTimezone'));
    }
    const userId = req.userId!;
    // Les emails de rappel suivent la langue de l'interface au moment de l'enregistrement
    const language = req.language?.startsWith('en') ? 'en' : 'fr';
    const [settings] = await prisma.$transaction([
      prisma.notificationSetting.upsert({
        where: { userId },
        create: { userId, ...data, language },
        update: { ...data, language },
        select: notificationSelect,
      }),
      ...(timezone
        ? [prisma.userProfile.upsert({ where: { userId }, create: { userId, timezone }, update: { timezone } })]
        : []),
    ]);
    res.json({ ...settings, emailEnabled: isEmailConfigured() });
  },
};
