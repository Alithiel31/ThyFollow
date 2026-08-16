// src/lib/sentry.ts
// Suivi d'erreurs en production. Sans SENTRY_DSN, no-op complet (même
// logique que lib/resend.ts sans RESEND_API_KEY) : pas d'appel réseau, pas
// d'overhead en dev/CI. Importé en tout premier dans index.ts pour que
// Sentry.init() tourne avant le reste du graphe de modules.
import * as Sentry from '@sentry/node';
import { config } from '../config.js';

export const sentryEnabled = Boolean(config.sentryDsn);

if (sentryEnabled) {
  Sentry.init({
    dsn: config.sentryDsn,
    environment: config.nodeEnv,
    // Suivi d'erreurs uniquement : pas de tracing de perf ni de profiling,
    // qui nécessiteraient un tri des données de santé transitant par les
    // spans avant d'envisager de les activer.
    tracesSampleRate: 0,
  });
}

// N'envoie que les erreurs réellement inattendues (voir middleware/errorHandler.ts) :
// pas les 4xx métier (validation, auth, conflits) qui sont un fonctionnement
// normal de l'API, pas du bruit à faire remonter.
export function captureException(error: unknown): void {
  if (sentryEnabled) Sentry.captureException(error);
}
