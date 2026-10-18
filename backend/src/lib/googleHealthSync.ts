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
import { refreshAccessToken, fetchDailyMetrics, localDateOf } from './googleHealth.js';
import { logger } from './logger.js';

// Marge de sécurité avant l'expiration réelle : évite un aller-retour à
// vide côté Google si l'horloge locale dérive légèrement.
const TOKEN_REFRESH_MARGIN_MS = 60 * 1000;

// Même valeur que le défaut de UserProfile.timezone (prisma/schema.prisma),
// pour un utilisateur sans profil.
const DEFAULT_TIME_ZONE = 'Europe/Paris';

// Le profil n'accepte qu'une chaîne libre (profile.controller.ts) : un fuseau
// inconnu ferait lever Intl (RangeError) et bloquerait toute synchro.
function resolveTimeZone(timeZone: string | undefined): string {
  if (!timeZone) return DEFAULT_TIME_ZONE;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return timeZone;
  } catch {
    logger.warn(`Fuseau horaire de profil invalide "${timeZone}", repli sur ${DEFAULT_TIME_ZONE}`);
    return DEFAULT_TIME_ZONE;
  }
}

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

  // `date` est une date civile de l'utilisateur : les bornes de la journée
  // et l'attribution des nuits se font dans son fuseau.
  const profile = await prisma.userProfile.findUnique({ where: { userId }, select: { timezone: true } });
  const timeZone = resolveTimeZone(profile?.timezone);

  const accessToken = await getValidAccessToken(connection);
  const metrics = await fetchDailyMetrics(accessToken, date, timeZone);

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
  // Mesures de la montre sans équivalent manuel : toujours prises telles
  // que Google les donne, jamais effacées par une réponse vide (qui peut
  // venir d'une erreur de lecture, voir fetchDailyMetrics).
  if (metrics.sleepEfficiency !== null) data.sleepEfficiency = metrics.sleepEfficiency;
  if (metrics.deepSleepMinutes !== null) data.deepSleepMinutes = metrics.deepSleepMinutes;
  if (metrics.remSleepMinutes !== null) data.remSleepMinutes = metrics.remSleepMinutes;

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

// Rattrapage de l'historique : le webhook ne synchronise que les nouvelles
// mesures, ce qui laisse vides les jours antérieurs à la connexion, et
// garde les nuits comptées deux fois par l'ancien découpage (corrigées dès
// que le jour est relu). Relit les `days` derniers jours, aujourd'hui
// compris, dans le fuseau de l'utilisateur, un jour après l'autre (pas de
// rafale d'appels vers Google). Un utilisateur n'a qu'un rattrapage à la fois.
export const MAX_RESYNC_DAYS = 90;
const runningResyncs = new Set<string>();

export function isResyncRunning(userId: string): boolean {
  return runningResyncs.has(userId);
}

export async function resyncRecentDays(userId: string, days: number): Promise<{ synced: number; failed: number }> {
  if (runningResyncs.has(userId)) throw new Error('Rattrapage Google Health déjà en cours');
  runningResyncs.add(userId);
  try {
    const profile = await prisma.userProfile.findUnique({ where: { userId }, select: { timezone: true } });
    const today = localDateOf(Date.now(), resolveTimeZone(profile?.timezone));
    const count = Math.min(Math.max(1, Math.floor(days)), MAX_RESYNC_DAYS);

    let synced = 0;
    let failed = 0;
    for (let i = 0; i < count; i++) {
      const d = new Date(`${today}T00:00:00.000Z`);
      d.setUTCDate(d.getUTCDate() - i);
      const date = d.toISOString().slice(0, 10);
      try {
        await syncDailyMetricsForUser(userId, date);
        synced++;
      } catch (err) {
        failed++;
        logger.error(`Échec rattrapage Google Health (user ${userId}, date ${date})`, err);
      }
    }
    logger.info(`Rattrapage Google Health terminé (user ${userId}) : ${synced} jour(s), ${failed} échec(s)`);
    return { synced, failed };
  } finally {
    runningResyncs.delete(userId);
  }
}

// L'abonnement webhook est au niveau du projet (voir
// lib/googleHealthSubscriber.ts) : une notification ne porte donc pas d'id
// de connexion, mais le `healthUserId` opaque de l'utilisateur concerné
// (voir GoogleHealthConnection.healthUserId, rempli au moment du getIdentity
// post-connexion).
export async function syncDailyMetricsByHealthUserId(healthUserId: string, dates: string[]): Promise<void> {
  const connection = await prisma.googleHealthConnection.findUnique({ where: { healthUserId } });
  if (!connection) {
    logger.warn(`Notification Google Health reçue pour un healthUserId inconnu: ${healthUserId}`);
    return;
  }

  for (const date of dates) {
    await syncDailyMetricsForUser(connection.userId, date).catch((err) => {
      logger.error(`Échec synchro Google Health (user ${connection.userId}, date ${date})`, err);
    });
  }
}
