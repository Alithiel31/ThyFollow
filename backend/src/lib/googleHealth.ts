// src/lib/googleHealth.ts
// Connexion à la Google Health API (developers.google.com/health) pour
// synchroniser poids / rythme cardiaque / sommeil depuis un appareil
// connecté (Pixel Watch...). Même famille de protocole que lib/oidc.ts
// ("Se connecter avec Google"), mais :
// - scopes différents (données de santé, pas identité) ;
// - `access_type: offline` + `prompt: consent` pour obtenir un
//   refresh_token (le login n'en avait pas besoin) ;
// - un client OAuth dédié (GOOGLE_HEALTH_CLIENT_ID/SECRET), pas forcément
//   le même projet Google Cloud que le login.
//
// ⚠️ Le flux OAuth2 (construction de l'URL, échange du code, refresh) est
// standard et repose sur les mêmes endpoints Google que lib/oidc.ts — cette
// partie est fiable, et les scopes ci-dessous ont été validés en usage réel
// (voir GOOGLE_HEALTH_SCOPES). En revanche, `fetchDailyMetrics` et
// `subscribeToWebhook` ciblent des endpoints REST de la Google Health API
// dont le détail exact (chemins, format des réponses, mécanisme de
// vérification webhook) n'a toujours pas pu être vérifié (accès réseau à
// developers.google.com bloqué depuis l'environnement de développement). À
// confirmer avec la doc officielle et la console Google Cloud avant mise en
// production — voir le plan d'implémentation.
import * as client from 'openid-client';
import { config } from '../config.js';

let discoveredConfig: client.Configuration | null = null;

async function getGoogleHealthConfig(): Promise<client.Configuration> {
  if (!config.googleHealthClientId || !config.googleHealthClientSecret) {
    throw new Error('GOOGLE_HEALTH_CLIENT_ID / GOOGLE_HEALTH_CLIENT_SECRET non configurés');
  }
  if (!discoveredConfig) {
    // Même serveur d'autorisation OAuth2 que Google Sign-In (accounts.google.com) :
    // valable pour n'importe quel scope Google (Fit, Drive, Calendar, Health...),
    // pas seulement OpenID Connect.
    discoveredConfig = await client.discovery(
      new URL('https://accounts.google.com'),
      config.googleHealthClientId,
      config.googleHealthClientSecret
    );
  }
  return discoveredConfig;
}

// Scopes de la Google Health API. Format confirmé en usage réel (une
// première tentative avec des noms de type "health.sleep.read" a été
// rejetée par Google avec `invalid_scope`) : le préfixe est `googlehealth.`
// et les scopes sont des catégories, pas un scope par métrique — il n'existe
// pas de scope "heart_rate" dédié, la fréquence cardiaque est couverte par
// le scope activité/fitness.
export const GOOGLE_HEALTH_SCOPES = [
  // Sommeil
  'https://www.googleapis.com/auth/googlehealth.sleep.readonly',
  // Poids
  'https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly',
  // Rythme cardiaque (regroupé avec l'activité/fitness côté Google, pas de
  // scope "heart_rate" séparé)
  'https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly',
];

export interface GoogleHealthFlowState {
  state: string;
  codeVerifier: string;
}

export async function buildGoogleHealthAuthorizationUrl(): Promise<{ url: string; flow: GoogleHealthFlowState }> {
  const openidConfig = await getGoogleHealthConfig();

  const codeVerifier = client.randomPKCECodeVerifier();
  const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
  const state = client.randomState();

  const url = client.buildAuthorizationUrl(openidConfig, {
    redirect_uri: config.googleHealthRedirectUri,
    scope: GOOGLE_HEALTH_SCOPES.join(' '),
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
    // `offline` : demande un refresh_token (absent par défaut) pour pouvoir
    // synchroniser en arrière-plan sans que l'utilisateur soit présent.
    access_type: 'offline',
    // `consent` : force le réaffichage de l'écran de consentement, seul
    // moyen fiable d'obtenir un refresh_token si l'utilisateur avait déjà
    // autorisé l'app par le passé (Google ne le renvoie sinon qu'une fois).
    prompt: 'consent',
  });

  return { url: url.href, flow: { state, codeVerifier } };
}

export interface GoogleHealthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scope: string;
}

export async function handleGoogleHealthCallback(
  callbackUrl: URL,
  flow: GoogleHealthFlowState
): Promise<GoogleHealthTokens> {
  const openidConfig = await getGoogleHealthConfig();

  const tokens = await client.authorizationCodeGrant(openidConfig, callbackUrl, {
    pkceCodeVerifier: flow.codeVerifier,
    expectedState: flow.state,
  });

  if (!tokens.refresh_token) {
    // Ne devrait pas arriver avec prompt=consent, mais sans refresh_token
    // on ne pourrait plus synchroniser une fois l'access_token expiré (1h) :
    // mieux vaut échouer explicitement que de stocker une connexion inutilisable.
    throw new Error('Google n’a renvoyé aucun refresh_token (prompt=consent absent ou déjà consenti ?)');
  }

  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: new Date(Date.now() + tokens.expiresIn()! * 1000),
    scope: tokens.scope ?? GOOGLE_HEALTH_SCOPES.join(' '),
  };
}

// Renouvelle l'access_token à partir du refresh_token stocké — nécessaire
// avant chaque appel à fetchDailyMetrics une fois `tokenExpiresAt` dépassé
// (l'access_token Google Health, comme la plupart des tokens Google, expire
// après ~1h).
export async function refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresAt: Date }> {
  const openidConfig = await getGoogleHealthConfig();
  const tokens = await client.refreshTokenGrant(openidConfig, refreshToken);

  return {
    accessToken: tokens.access_token,
    expiresAt: new Date(Date.now() + tokens.expiresIn()! * 1000),
  };
}

export interface DailyHealthMetrics {
  weightKg: number | null;
  heartRateBpm: number | null;
  sleepHours: number | null;
}

// ⚠️ Chemin/forme de réponse non vérifiés (voir en-tête de fichier) — à
// ajuster une fois la Google Health API accessible dans Google Cloud
// Console. Structuré pour que ce soit le seul endroit à corriger.
const GOOGLE_HEALTH_API_BASE = 'https://healthapi.googleapis.com/v1';

export async function fetchDailyMetrics(accessToken: string, date: string): Promise<DailyHealthMetrics> {
  const startTime = new Date(`${date}T00:00:00.000Z`).toISOString();
  const endTime = new Date(`${date}T23:59:59.999Z`).toISOString();

  async function fetchDataType(dataTypeId: string): Promise<unknown[]> {
    const url = new URL(`${GOOGLE_HEALTH_API_BASE}/users/me/dataTypes/${dataTypeId}/dataPoints`);
    url.searchParams.set('startTime', startTime);
    url.searchParams.set('endTime', endTime);

    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) {
      throw new Error(`Google Health API ${dataTypeId} : ${res.status} ${await res.text()}`);
    }
    const body = (await res.json()) as { dataPoints?: unknown[] };
    return body.dataPoints ?? [];
  }

  const [weightPoints, heartRatePoints, sleepPoints] = await Promise.all([
    fetchDataType('weight').catch(() => []),
    fetchDataType('heart_rate').catch(() => []),
    fetchDataType('sleep').catch(() => []),
  ]);

  return {
    weightKg: extractLatestNumericValue(weightPoints),
    heartRateBpm: extractLatestNumericValue(heartRatePoints),
    sleepHours: sumSleepDurationHours(sleepPoints),
  };
}

function extractLatestNumericValue(points: unknown[]): number | null {
  const last = points[points.length - 1] as { value?: number } | undefined;
  return typeof last?.value === 'number' ? last.value : null;
}

function sumSleepDurationHours(points: unknown[]): number | null {
  if (points.length === 0) return null;
  const totalMs = (points as { startTime?: string; endTime?: string }[]).reduce((sum, p) => {
    if (!p.startTime || !p.endTime) return sum;
    return sum + (new Date(p.endTime).getTime() - new Date(p.startTime).getTime());
  }, 0);
  return totalMs > 0 ? totalMs / (1000 * 60 * 60) : null;
}

// Abonnement aux notifications webhook pour ne pas avoir à poller — voir
// controllers/googleHealthWebhook.controller.ts. Best-effort : un échec ne
// doit pas empêcher la connexion elle-même (voir appelant). `channelToken`
// est un secret que nous générons (voir GoogleHealthConnection.webhookChannelToken)
// et que Google est censé renvoyer tel quel dans chaque notification, pour
// que le webhook puisse en vérifier l'authenticité.
export async function subscribeToWebhook(
  accessToken: string,
  webhookUrl: string,
  channelToken: string
): Promise<string | null> {
  const res = await fetch(`${GOOGLE_HEALTH_API_BASE}/users/me/dataTypes:subscribe`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      dataTypeIds: ['weight', 'heart_rate', 'sleep'],
      notificationUrl: webhookUrl,
      token: channelToken,
    }),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { subscriptionId?: string };
  return body.subscriptionId ?? null;
}
