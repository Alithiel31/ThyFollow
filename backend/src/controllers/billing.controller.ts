// src/controllers/billing.controller.ts
// Accès Pro : paiement Stripe (Checkout + portail client) et codes promo.
import { Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { config } from '../config.js';
import { AuthRequest } from '../middleware/auth.js';
import { AppError, ConflictError, NotFoundError, ValidationError } from '../lib/errors.js';
import { getEntitlements } from '../lib/entitlements.js';
import { getStripe, isStripeConfigured } from '../lib/stripe.js';

const redeemSchema = z.object({ code: z.string().trim().min(1).max(64) });
const DAY_MS = 24 * 60 * 60 * 1000;

function requireStripe(req: AuthRequest): void {
  if (!isStripeConfigured()) throw new AppError(501, req.t('errors.billing.notConfigured'));
}

export const billingController = {
  // POST /api/billing/checkout → { url } : page de paiement hébergée par Stripe
  checkout: async (req: AuthRequest, res: Response): Promise<void> => {
    requireStripe(req);
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { id: true, email: true, role: true, proUntil: true, proSource: true, stripeCustomerId: true },
    });
    if (!user) throw new NotFoundError(req.t('errors.notFound', { resource: req.t('resources.user') }));
    // Déjà abonné : on renvoie vers le portail plutôt que de créer un 2e abonnement
    if (user.proSource === 'STRIPE' && user.proUntil && user.proUntil > new Date()) {
      throw new ConflictError(req.t('errors.billing.alreadySubscribed'));
    }

    const session = await getStripe().checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: config.stripePriceId, quantity: 1 }],
      // Le lien userId ↔ client Stripe est posé par le webhook (client_reference_id)
      client_reference_id: user.id,
      ...(user.stripeCustomerId ? { customer: user.stripeCustomerId } : { customer_email: user.email }),
      success_url: `${config.appUrl}/lab-results?billing=success`,
      cancel_url: `${config.appUrl}/lab-results?billing=cancelled`,
      allow_promotion_codes: false,
    });
    if (!session.url) throw new AppError(502, req.t('errors.billing.checkoutFailed'));
    res.json({ url: session.url });
  },

  // POST /api/billing/portal → { url } : gérer / résilier l'abonnement
  portal: async (req: AuthRequest, res: Response): Promise<void> => {
    requireStripe(req);
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { stripeCustomerId: true },
    });
    if (!user?.stripeCustomerId) throw new NotFoundError(req.t('errors.billing.noSubscription'));
    const session = await getStripe().billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${config.appUrl}/profile`,
    });
    res.json({ url: session.url });
  },

  // POST /api/billing/redeem { code } : active l'accès Pro pour la durée du code
  redeem: async (req: AuthRequest, res: Response): Promise<void> => {
    const { code } = redeemSchema.parse(req.body);
    const userId = req.userId!;

    const entitlements = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true, role: true, proUntil: true, proSource: true, freeImportsUsed: true },
      });
      if (!user) throw new NotFoundError(req.t('errors.notFound', { resource: req.t('resources.user') }));

      const now = new Date();
      // Un abonnement Stripe actif fait déjà foi : un code ne s'y superpose pas
      if (user.proSource === 'STRIPE' && user.proUntil && user.proUntil > now) {
        throw new ConflictError(req.t('errors.billing.alreadySubscribed'));
      }

      const promo = await tx.promoCode.findUnique({ where: { code: code.toUpperCase() } });
      // Même message pour inconnu / désactivé / expiré / épuisé : ne pas aider à deviner les codes
      const usable =
        promo &&
        promo.active &&
        (!promo.expiresAt || promo.expiresAt > now) &&
        (promo.maxRedemptions === null || promo.redemptionCount < promo.maxRedemptions);
      if (!usable) throw new ValidationError(req.t('errors.billing.invalidCode'));

      const already = await tx.promoRedemption.findUnique({
        where: { codeId_userId: { codeId: promo.id, userId } },
      });
      if (already) throw new ConflictError(req.t('errors.billing.codeAlreadyUsed'));

      // Incrément conditionnel : deux utilisations simultanées du dernier slot
      // ne passent pas toutes les deux.
      const claimed = await tx.promoCode.updateMany({
        where: {
          id: promo.id,
          ...(promo.maxRedemptions !== null && { redemptionCount: { lt: promo.maxRedemptions } }),
        },
        data: { redemptionCount: { increment: 1 } },
      });
      if (claimed.count === 0) throw new ValidationError(req.t('errors.billing.invalidCode'));

      await tx.promoRedemption.create({ data: { codeId: promo.id, userId } });

      // Prolonge à partir de la fin du droit actuel s'il court encore
      const base = user.proUntil && user.proUntil > now ? user.proUntil : now;
      const proUntil = new Date(base.getTime() + promo.durationDays * DAY_MS);
      const updated = await tx.user.update({
        where: { id: userId },
        data: { proUntil, proSource: 'PROMO' },
        select: { id: true, role: true, proUntil: true, proSource: true, freeImportsUsed: true },
      });
      return getEntitlements(updated);
    });

    res.json({ entitlements });
  },
};
