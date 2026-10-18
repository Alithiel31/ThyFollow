// src/controllers/account.controller.ts
// Droits RGPD sur le compte : export de toutes ses données (portabilité,
// art. 20) et suppression définitive du compte (effacement, art. 17).
import { Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { AuthRequest } from '../middleware/auth.js';
import { AppError, NotFoundError } from '../lib/errors.js';
import { decryptBuffer, isPdfEncryptionConfigured } from '../lib/crypto.js';
import { getStripe, isStripeConfigured } from '../lib/stripe.js';
import { logger } from '../lib/logger.js';

const deleteSchema = z.object({
  // Compte avec mot de passe local : le mot de passe
  password: z.string().max(200).optional(),
  // Compte Google sans mot de passe : l'adresse email du compte, recopiée
  confirmEmail: z.string().max(320).optional(),
});

// Statuts d'abonnement Stripe encore susceptibles d'être facturés
const BILLABLE_STATUSES = new Set(['active', 'trialing', 'past_due', 'unpaid', 'incomplete', 'paused']);

export const accountController = {
  // GET /api/account/export — toutes les données du compte en JSON, PDF de
  // bilans compris (en base64). Les secrets (mot de passe, jetons, mots de
  // passe de PDF, tokens Google Health) n'en font pas partie.
  export: async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.userId!;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        birthDate: true,
        createdAt: true,
        emailVerified: true,
        proUntil: true,
        proSource: true,
        freeImportsUsed: true,
        profile: true,
        notifications: true,
        oauthAccounts: { select: { provider: true, createdAt: true } },
        googleHealthConnection: { select: { scope: true, connectedAt: true, lastSyncedAt: true } },
      },
    });
    if (!user) throw new NotFoundError(req.t('errors.notFound', { resource: req.t('resources.user') }));

    const [entries, symptoms, medications, labResults, documents, appointments, pdfPasswords, authEvents, importUsages, promoRedemptions] =
      await Promise.all([
        prisma.dailyEntry.findMany({
          where: { userId },
          orderBy: { date: 'asc' },
          include: { symptomLogs: { select: { symptomId: true, severity: true, note: true } } },
        }),
        prisma.symptomLibrary.findMany({ where: { userId } }),
        prisma.medication.findMany({
          where: { userId },
          orderBy: { startDate: 'asc' },
          include: { intakes: { select: { date: true, time: true, takenAt: true }, orderBy: { date: 'asc' } } },
        }),
        prisma.labResult.findMany({ where: { userId }, orderBy: { date: 'asc' } }),
        prisma.labDocument.findMany({
          where: { userId },
          orderBy: { createdAt: 'asc' },
          select: { id: true, labResultId: true, filename: true, sizeBytes: true, sha256: true, createdAt: true, dataEnc: true },
        }),
        prisma.appointment.findMany({ where: { userId }, orderBy: { date: 'asc' } }),
        prisma.pdfPassword.findMany({ where: { userId }, select: { label: true, createdAt: true, lastUsedAt: true } }),
        prisma.authEvent.findMany({
          where: { userId },
          orderBy: { createdAt: 'asc' },
          select: { provider: true, type: true, ip: true, userAgent: true, createdAt: true },
        }),
        prisma.importUsage.findMany({ where: { userId }, select: { month: true, count: true } }),
        prisma.promoRedemption.findMany({
          where: { userId },
          select: { createdAt: true, code: { select: { code: true, durationDays: true } } },
        }),
      ]);

    // Un document illisible (clé absente ou changée) reste listé, sans contenu
    const canDecrypt = isPdfEncryptionConfigured();
    const labDocuments = documents.map(({ dataEnc, ...doc }) => {
      let contentBase64: string | null = null;
      if (canDecrypt) {
        try {
          contentBase64 = decryptBuffer(Buffer.from(dataEnc)).toString('base64');
        } catch {
          contentBase64 = null;
        }
      }
      return { ...doc, contentType: 'application/pdf', contentBase64 };
    });

    const exportedAt = new Date();
    res.setHeader('Content-Disposition', `attachment; filename="thyrotrack-export-${exportedAt.toISOString().slice(0, 10)}.json"`);
    res.json({
      format: 'thyrotrack-export',
      version: 1,
      exportedAt: exportedAt.toISOString(),
      account: user,
      dailyEntries: entries,
      customSymptoms: symptoms,
      medications,
      labResults,
      labDocuments,
      appointments,
      pdfPasswords,
      authEvents,
      importUsages,
      promoRedemptions,
    });
  },

  // DELETE /api/account { password } ou { confirmEmail } — supprime le compte
  // et toutes ses données. L'abonnement Stripe est résilié AVANT : si la
  // résiliation échoue, rien n'est supprimé (sinon la personne resterait
  // facturée sans compte pour résilier).
  remove: async (req: AuthRequest, res: Response): Promise<void> => {
    const { password, confirmEmail } = deleteSchema.parse(req.body ?? {});
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { id: true, email: true, password: true, stripeCustomerId: true },
    });
    if (!user) throw new NotFoundError(req.t('errors.notFound', { resource: req.t('resources.user') }));

    // 403 et pas 401 : le frontend déconnecte sur tout 401
    if (user.password) {
      if (!password || !(await bcrypt.compare(password, user.password))) {
        throw new AppError(403, req.t('errors.account.invalidPassword'), true, 'INVALID_PASSWORD');
      }
    } else if (confirmEmail?.trim().toLowerCase() !== user.email.toLowerCase()) {
      throw new AppError(403, req.t('errors.account.invalidEmailConfirmation'), true, 'INVALID_EMAIL_CONFIRMATION');
    }

    if (user.stripeCustomerId) {
      if (!isStripeConfigured()) throw new AppError(503, req.t('errors.account.billingUnavailable'));
      try {
        const stripe = getStripe();
        // Le client Stripe est conservé (factures : obligation comptable), seuls les abonnements sont résiliés
        const subscriptions = await stripe.subscriptions.list({ customer: user.stripeCustomerId, status: 'all', limit: 100 });
        for (const subscription of subscriptions.data) {
          if (BILLABLE_STATUSES.has(subscription.status)) await stripe.subscriptions.cancel(subscription.id);
        }
      } catch (err) {
        logger.error('Suppression de compte : résiliation Stripe échouée', err instanceof Error ? err.message : 'unknown');
        throw new AppError(503, req.t('errors.account.billingUnavailable'));
      }
    }

    // Les AuthEvent ne sont pas supprimés en cascade (onDelete: SetNull) : ils
    // portent l'IP et le navigateur, on les efface explicitement.
    await prisma.$transaction([
      prisma.authEvent.deleteMany({ where: { userId: user.id } }),
      prisma.user.delete({ where: { id: user.id } }),
    ]);
    logger.info('Compte supprimé à la demande de son titulaire', { userId: user.id });
    res.status(204).end();
  },
};
