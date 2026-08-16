// src/lib/googleHealthSync.ts
// Logique de synchronisation partagée : va chercher les mesures du jour
// via la Google Health API et les fusionne dans DailyEntry, en respectant
// la règle "ne jamais écraser une saisie manuelle" (voir
// prisma/schema.prisma#DataSource). Appelée depuis le webhook
// (controllers/googleHealthWebhook.controller.ts) — c'est le seul
// déclencheur, il n'y a pas de polling de secours (voir plan).
import type { GoogleHealthConnection } from '@prisma/client';
import { prisma } from './prisma.js';
import { encrypt, decrypt } from './crypto.js';
import { refreshAccessToken, fetchDailyMetrics } from './googleHealth.js';
import { logger } from './logger.js';

// Marge de sécurité avant l'expiration réelle : évite un aller-retour à
// vide côté Google si l'horloge locale dérive légèrement.
const TOKEN_REFRESH_MARGIN_MS = 60 * 1000;

async function getValidAccessToken(connection: GoogleHealthConnection): Promise<string> {
  if (connection.tokenExpiresAt.getTime() - TOKEN_REFRESH_MARGIN_MS > Date.now()) {
    return decrypt(connection.accessTokenEnc);
  }

  const refreshToken = decrypt(connection.refreshTokenEnc);
  const { accessToken, expiresAt } = await refreshAccessToken(refreshToken);

  await prisma.googleHealthConnection.update({
    where: { id: connection.id },
    data: { accessTokenEnc: encrypt(accessToken), tokenExpiresAt: expiresAt },
  });

  return accessToken;
}

// Synchronise une date donnée (YYYY-MM-DD) pour un utilisateur. Ne touche
// que les champs dont la source actuelle est MANUAL sans valeur, ou déjà
// GOOGLE_HEALTH (resynchro) — jamais un champ que l'utilisateur a rempli
// lui-même (voir entriesController.upsert pour le flux de saisie manuelle,
// qui repasse toujours la source à MANUAL).
export async function syncDailyMetricsForUser(userId: string, date: string): Promise<void> {
  const connection = await prisma.googleHealthConnection.findUnique({ where: { userId } });
  if (!connection) return;

  const accessToken = await getValidAccessToken(connection);
  const metrics = await fetchDailyMetrics(accessToken, date);

  const existing = await prisma.dailyEntry.findUnique({
    where: { userId_date: { userId, date: new Date(date) } },
  });

  // Règle : on ne remplace jamais une valeur MANUAL non nulle (une vraie
  // saisie utilisateur). Un champ vide est libre d'être rempli, même si sa
  // source est restée MANUAL par défaut (cas normal d'un champ jamais
  // touché). Limite connue et acceptée : si l'utilisateur efface
  // volontairement un champ précédemment synchronisé, il redevient éligible
  // à un futur remplissage automatique — il n'existe pas de moyen de
  // distinguer "jamais touché" de "explicitement vidé" avec le modèle actuel.
  const data: Record<string, unknown> = {};

  if (metrics.weightKg !== null && (!existing || existing.weightSource !== 'MANUAL' || existing.weight === null)) {
    data.weight = metrics.weightKg;
    data.weightSource = 'GOOGLE_HEALTH';
  }
  if (
    metrics.heartRateBpm !== null &&
    (!existing || existing.heartRateSource !== 'MANUAL' || existing.heartRate === null)
  ) {
    data.heartRate = Math.round(metrics.heartRateBpm);
    data.heartRateSource = 'GOOGLE_HEALTH';
  }
  if (
    metrics.sleepHours !== null &&
    (!existing || existing.sleepHoursSource !== 'MANUAL' || existing.sleepHours === null)
  ) {
    data.sleepHours = metrics.sleepHours;
    data.sleepHoursSource = 'GOOGLE_HEALTH';
  }

  if (Object.keys(data).length > 0) {
    await prisma.dailyEntry.upsert({
      where: { userId_date: { userId, date: new Date(date) } },
      create: { userId, date: new Date(date), tags: [], ...data },
      update: data,
    });
  }

  await prisma.googleHealthConnection.update({
    where: { id: connection.id },
    data: { lastSyncedAt: new Date() },
  });
}

export async function syncDailyMetricsBySubscription(subscriptionId: string, dates: string[]): Promise<void> {
  const connection = await prisma.googleHealthConnection.findFirst({ where: { webhookSubscriptionId: subscriptionId } });
  if (!connection) {
    logger.warn(`Notification Google Health reçue pour un abonnement inconnu: ${subscriptionId}`);
    return;
  }

  for (const date of dates) {
    await syncDailyMetricsForUser(connection.userId, date).catch((err) => {
      logger.error(`Échec synchro Google Health (user ${connection.userId}, date ${date})`, err);
    });
  }
}
