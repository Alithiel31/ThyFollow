// src/lib/entitlements.ts
// Droits d'accès Pro (import de bilans PDF). Source de vérité unique :
// « Pro tant que User.proUntil est dans le futur » — que la date vienne d'un
// abonnement Stripe, d'un code promo ou d'un octroi manuel. Le reste du code
// ne se préoccupe jamais de la provenance. Un ADMIN est toujours Pro.
import type { ProSource, Role } from '@prisma/client';
import { prisma } from './prisma.js';
import { config } from '../config.js';

export interface EntitlementUser {
  id: string;
  role: Role;
  proUntil: Date | null;
  freeImportsUsed: number;
}

export interface ImportAllowance {
  pro: boolean;
  limit: number;
  used: number;
  remaining: number;
  // Hors Pro : la limite est un essai à vie ; Pro : un plafond qui se remet à zéro chaque mois
  period: 'lifetime' | 'month';
}

export function isPro(user: Pick<EntitlementUser, 'role' | 'proUntil'>, now = new Date()): boolean {
  return user.role === 'ADMIN' || (user.proUntil !== null && user.proUntil > now);
}

// Mois UTC « YYYY-MM »
export function monthKey(date = new Date()): string {
  return date.toISOString().slice(0, 7);
}

export async function getImportAllowance(user: EntitlementUser, now = new Date()): Promise<ImportAllowance> {
  if (!isPro(user, now)) {
    const limit = config.freeImportLimit;
    const used = user.freeImportsUsed;
    return { pro: false, limit, used, remaining: Math.max(0, limit - used), period: 'lifetime' };
  }
  const usage = await prisma.importUsage.findUnique({
    where: { userId_month: { userId: user.id, month: monthKey(now) } },
    select: { count: true },
  });
  const limit = config.proMonthlyImportLimit;
  const used = usage?.count ?? 0;
  return { pro: true, limit, used, remaining: Math.max(0, limit - used), period: 'month' };
}

// À appeler une fois par import effectivement traité (extraction faite).
export async function consumeImport(userId: string, pro: boolean, now = new Date()): Promise<void> {
  if (pro) {
    const month = monthKey(now);
    await prisma.importUsage.upsert({
      where: { userId_month: { userId, month } },
      create: { userId, month, count: 1 },
      update: { count: { increment: 1 } },
    });
  } else {
    await prisma.user.update({ where: { id: userId }, data: { freeImportsUsed: { increment: 1 } } });
  }
}

export interface Entitlements {
  pro: boolean;
  proUntil: string | null;
  proSource: ProSource | null;
  // Le paiement par carte est-il configuré sur ce serveur ? (sinon : codes promo seulement)
  billingEnabled: boolean;
  imports: Omit<ImportAllowance, 'pro'>;
}

export async function getEntitlements(
  user: EntitlementUser & { proSource: ProSource | null },
  now = new Date()
): Promise<Entitlements> {
  const { pro, ...imports } = await getImportAllowance(user, now);
  return {
    pro,
    proUntil: user.proUntil?.toISOString() ?? null,
    proSource: user.proSource,
    billingEnabled: Boolean(config.stripeSecretKey && config.stripePriceId),
    imports,
  };
}
