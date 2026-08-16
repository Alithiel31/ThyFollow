// src/controllers/googleHealthWebhook.controller.ts
// Réception des notifications de la Google Health API (voir
// lib/googleHealthSubscriber.ts pour la création de l'abonné projet-wide
// qui pointe vers cet endpoint). Contrat confirmé par lecture directe de
// developers.google.com/health/webhooks :
//
// - Authentification : Google renvoie tel quel, dans l'en-tête
//   `Authorization`, le secret statique déclaré à la création de l'abonné
//   (`endpointAuthorization.secret`, voir config.googleHealthWebhookSecret).
//   Pas de signature à vérifier pour l'instant (Google signe aussi chaque
//   payload via Tink/ECDSA — non implémenté ici, voir le README).
// - Négociation de validation (à la création/modification de l'abonné) :
//   Google envoie deux requêtes POST avec le corps {"type":"verification"} —
//   une avec l'en-tête Authorization configuré (doit répondre 200/201), une
//   sans (doit répondre 401/403). La logique ci-dessous satisfait les deux
//   par construction (vérification de l'auth d'abord, cas "verification"
//   ensuite).
// - Notifications réelles : répondre immédiatement 204, traiter le payload
//   de façon asynchrone (Google retente sinon, jusqu'à 7 jours).
import { Request, Response } from 'express';
import { config } from '../config.js';
import { syncDailyMetricsByHealthUserId } from '../lib/googleHealthSync.js';
import { logger } from '../lib/logger.js';

interface WebhookBody {
  type?: string;
  data?: {
    healthUserId?: string;
    operation?: 'UPSERT' | 'DELETE';
    dataType?: string;
    intervals?: { civilIso8601TimeInterval?: { startTime?: string; endTime?: string } }[];
  };
}

// Déduit les dates (YYYY-MM-DD) affectées par la notification à partir des
// intervalles en heure civile fournis par Google.
function extractDates(body: WebhookBody): string[] {
  const dates = new Set<string>();
  for (const interval of body.data?.intervals ?? []) {
    const { startTime, endTime } = interval.civilIso8601TimeInterval ?? {};
    if (startTime) dates.add(startTime.slice(0, 10));
    if (endTime) dates.add(endTime.slice(0, 10));
  }
  return [...dates];
}

export const googleHealthWebhookController = {
  // POST /api/webhooks/google-health
  notify: (req: Request, res: Response): void => {
    if (!config.googleHealthWebhookSecret || req.headers.authorization !== config.googleHealthWebhookSecret) {
      res.status(401).end();
      return;
    }

    const body = (req.body ?? {}) as WebhookBody;

    // Poignée de main de validation d'abonné (voir en-tête de fichier) —
    // pas une vraie notification de donnée, juste confirmer qu'on répond.
    if (body.type === 'verification') {
      res.status(200).end();
      return;
    }

    // Répondre avant de traiter : Google attend un 204 rapide, et retente
    // sinon (jusqu'à 7 jours) — voir doc citée en en-tête de fichier.
    res.status(204).end();

    const healthUserId = body.data?.healthUserId;
    const dates = extractDates(body);
    if (!healthUserId || dates.length === 0) {
      logger.warn('Notification Google Health sans healthUserId/date exploitable', body);
      return;
    }

    syncDailyMetricsByHealthUserId(healthUserId, dates).catch((err) => {
      logger.error('Échec traitement notification Google Health', err);
    });
  },
};
