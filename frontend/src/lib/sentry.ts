// src/lib/sentry.ts
// Suivi d'erreurs en production. Sans VITE_SENTRY_DSN, no-op complet (même
// logique que le lib/sentry.ts backend) : pas d'appel réseau, pas
// d'overhead en dev. Importé en tout premier dans main.tsx.
import * as Sentry from '@sentry/react';

const dsn = import.meta.env.VITE_SENTRY_DSN;

export const sentryEnabled = Boolean(dsn);

if (sentryEnabled) {
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    // Suivi d'erreurs uniquement : pas de tracing de perf ni de session
    // replay, qui capturerait potentiellement des données de santé affichées
    // à l'écran.
    tracesSampleRate: 0,
  });
}
