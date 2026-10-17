// src/lib/entitlements.ts
// Droits d'accès Pro (import de bilans PDF). Source de vérité unique :
// « Pro tant que User.proUntil est dans le futur » — que la date vienne d'un
// abonnement Stripe, d'un code promo ou d'un octroi manuel. Le reste du code
// ne se préoccupe jamais de la provenance. Un ADMIN est toujours Pro.
import { Prisma, type ProSource, type Role } from '@prisma/client';
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

// Réserve un import AVANT l'extraction (qui peut déclencher un appel LLM
// payant), par incrément conditionnel en base : deux requêtes simultanées ne
// peuvent pas consommer le même dernier import. Le solde lu en début de
// requête (getImportAllowance) n'est qu'un pré-contrôle pour la réponse
// 402/429 ; c'est cette réservation qui fait foi. Retourne false si le solde
// est épuisé.
export async function reserveImport(userId: string, pro: boolean, now = new Date()): Promise<boolean> {
  if (!pro) {
    const { count } = await prisma.user.updateMany({
      where: { id: userId, freeImportsUsed: { lt: config.freeImportLimit } },
      data: { freeImportsUsed: { increment: 1 } },
    });
    return count === 1;
  }
  const month = monthKey(now);
  try {
    // Ligne du mois créée à 0 si absente, pour que l'incrément conditionnel
    // ci-dessous ait toujours une ligne sur laquelle porter.
    await prisma.importUsage.upsert({
      where: { userId_month: { userId, month } },
      create: { userId, month, count: 0 },
      update: {},
    });
  } catch (err) {
    // Création simultanée par une autre requête : la ligne existe, on continue.
    if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err;
  }
  const { count } = await prisma.importUsage.updateMany({
    where: { userId, month, count: { lt: config.proMonthlyImportLimit } },
    data: { count: { increment: 1 } },
  });
  return count === 1;
}

// Rend un import réservé dont l'extraction n'a pas abouti (un échec ne
// consomme pas d'import). `now` doit être celui de la réservation.
export async function releaseImport(userId: string, pro: boolean, now = new Date()): Promise<void> {
  if (!pro) {
    await prisma.user.updateMany({
      where: { id: userId, freeImportsUsed: { gt: 0 } },
      data: { freeImportsUsed: { decrement: 1 } },
    });
    return;
  }
  await prisma.importUsage.updateMany({
    where: { userId, month: monthKey(now), count: { gt: 0 } },
    data: { count: { decrement: 1 } },
  });
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
