// src/controllers/stripeWebhook.controller.ts
// Webhook Stripe : seule source d'écriture du droit Pro lié à un abonnement.
// Le corps doit arriver BRUT (Buffer) pour que la signature soit vérifiable —
// voir le montage de la route dans index.ts, avant express.json().
import { Request, Response } from 'express';
import type Stripe from 'stripe';
import { prisma } from '../lib/prisma.js';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';
import { getStripe, proFromSubscription } from '../lib/stripe.js';

// Les évènements Stripe peuvent arriver dans le désordre ou être rejoués : on
// n'applique jamais l'état du payload, on relit l'abonnement chez Stripe
// (état courant) et on applique celui-là. Le payload ne sert de repli que si
// la relecture échoue.
async function syncSubscription(payload: Stripe.Subscription): Promise<void> {
  let subscription = payload;
  try {
    subscription = await getStripe().subscriptions.retrieve(payload.id);
  } catch (err) {
    logger.warn('Webhook Stripe : relecture de l’abonnement impossible, payload utilisé', err instanceof Error ? err.name : 'unknown');
  }
  const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;
  const data = proFromSubscription(subscription);
  if (!data) return;
  // Rattachement par client Stripe ; à défaut (l'évènement subscription.created
  // peut précéder checkout.session.completed), par l'userId posé en metadata à
  // la création de la session de paiement.
  const metadataUserId = subscription.metadata?.userId;
  const result = await prisma.user.updateMany({
    where: { OR: [{ stripeCustomerId: customerId }, ...(metadataUserId ? [{ id: metadataUserId }] : [])] },
    data: { ...(data as { proUntil: Date; proSource: 'STRIPE' }), stripeCustomerId: customerId },
  });
  if (result.count === 0) logger.warn('Webhook Stripe : aucun utilisateur pour le client', customerId);
}

export const stripeWebhookController = {
  // POST /api/webhooks/stripe
  handle: async (req: Request, res: Response): Promise<void> => {
    if (!config.stripeWebhookSecret) {
      res.status(501).json({ error: 'stripe webhook not configured' });
      return;
    }
    const signature = req.headers['stripe-signature'];
    if (typeof signature !== 'string' || !Buffer.isBuffer(req.body)) {
      res.status(400).json({ error: 'invalid request' });
      return;
    }

    let event: Stripe.Event;
    try {
      event = getStripe().webhooks.constructEvent(req.body, signature, config.stripeWebhookSecret);
    } catch {
      res.status(400).json({ error: 'invalid signature' });
      return;
    }

    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object;
          const userId = session.client_reference_id;
          const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
          if (userId && customerId) {
            // Lie le client Stripe au compte, puis applique l'abonnement créé
            await prisma.user.updateMany({ where: { id: userId }, data: { stripeCustomerId: customerId } });
            const subscriptionId =
              typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
            if (subscriptionId) {
              await syncSubscription(await getStripe().subscriptions.retrieve(subscriptionId));
            }
          }
          break;
        }
        case 'customer.subscription.created':
        case 'customer.subscription.updated':
        case 'customer.subscription.deleted':
          await syncSubscription(event.data.object);
          break;
        default:
          break;
      }
    } catch (err) {
      // 500 → Stripe réessaie la livraison
      logger.error('Webhook Stripe : traitement échoué', err instanceof Error ? err.message : 'unknown');
      res.status(500).json({ error: 'processing failed' });
      return;
    }
    res.json({ received: true });
  },
};
