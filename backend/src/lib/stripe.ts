// src/lib/stripe.ts
// Client Stripe + traduction d'un abonnement Stripe en droit Pro (proUntil).
import Stripe from 'stripe';
import type { Prisma } from '@prisma/client';
import { config } from '../config.js';

export function isStripeConfigured(): boolean {
  return Boolean(config.stripeSecretKey && config.stripePriceId);
}

let client: Stripe | null = null;
export function getStripe(): Stripe {
  client ??= new Stripe(config.stripeSecretKey);
  return client;
}

// Statuts qui donnent accès jusqu'à la fin de la période payée (past_due : Stripe
// retente le paiement, on ne coupe pas l'accès avant la fin de la période).
const ACTIVE_STATUSES: Stripe.Subscription.Status[] = ['active', 'trialing', 'past_due'];

// Fin de la période en cours : portée par les items d'abonnement.
function periodEnd(subscription: Stripe.Subscription): Date | null {
  const ends = subscription.items.data.map((item) => item.current_period_end);
  return ends.length > 0 ? new Date(Math.max(...ends) * 1000) : null;
}

// Données `User` à écrire pour refléter l'état d'un abonnement Stripe, ou null
// s'il n'y a rien à changer.
export function proFromSubscription(
  subscription: Stripe.Subscription,
  now = new Date()
): Prisma.UserUpdateInput | null {
  if (ACTIVE_STATUSES.includes(subscription.status)) {
    const until = periodEnd(subscription);
    return until ? { proUntil: until, proSource: 'STRIPE' } : null;
  }
  // Abonnement terminé : l'accès s'arrête maintenant (jamais prolongé).
  return { proUntil: now, proSource: 'STRIPE' };
}
