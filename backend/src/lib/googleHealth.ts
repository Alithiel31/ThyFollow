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
// Le flux OAuth2 (construction de l'URL, échange du code, refresh) est
// standard et repose sur les mêmes endpoints Google que lib/oidc.ts. Les
// scopes (GOOGLE_HEALTH_SCOPES), le host/version de l'API
// (health.googleapis.com/v4) et getHealthUserId ont été confirmés contre la
// documentation officielle (developers.google.com/health). La gestion de
// l'abonnement webhook (au niveau du projet, pas par utilisateur) vit dans
// lib/googleHealthSubscriber.ts — voir ce fichier pour le détail du modèle.
//
// ⚠️ `fetchDailyMetrics` reste partiellement une best-effort : le chemin et
// les en-têtes sont corrects (confirmés), mais la forme exacte du corps de
// réponse des endpoints `dataPoints` n'a pas pu être vérifiée (les exemples
// de la doc n'affichent que la requête, pas la réponse JSON). À ajuster si
// le parsing s'avère incorrect en usage réel.
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

// Host/version confirmés (developers.google.com/health/endpoints) : toute
// l'API Google Health, données comme abonnements, vit sous ce préfixe.
export const GOOGLE_HEALTH_API_BASE = 'https://health.googleapis.com/v4';

// Mappe l'identité OAuth de l'utilisateur (le token qu'on vient d'obtenir)
// vers son `healthUserId` — l'identifiant opaque que Google utilise dans
// les notifications webhook (voir googleHealthSync.ts). Appelé une seule
// fois à la connexion, le mapping ne change jamais (recommandation officielle :
// "peut être mis en cache indéfiniment").
//
// ⚠️ La forme exacte du corps de réponse n'était pas visible dans la doc
// consultée (seule la requête était montrée) — plusieurs noms de champ
// plausibles sont essayés, avec un log explicite si aucun ne correspond.
export async function getHealthUserId(accessToken: string): Promise<string> {
  const res = await fetch(`${GOOGLE_HEALTH_API_BASE}/users/me/identity`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`Échec récupération identité Google Health : ${res.status} ${await res.text()}`);
  }
  const body = (await res.json()) as Record<string, unknown>;
  const healthUserId = body.healthUserId ?? body.userId ?? body.googleUserId ?? body.id;
  if (typeof healthUserId !== 'string' || !healthUserId) {
    throw new Error(`Réponse getIdentity sans healthUserId reconnu : ${JSON.stringify(body)}`);
  }
  return healthUserId;
}

export interface DailyHealthMetrics {
  weightKg: number | null;
  heartRateBpm: number | null;
  sleepHours: number | null;
}

// Types de données au format kebab-case attendu dans le chemin de l'URL
// (voir developers.google.com/health/endpoints, ex: "body-fat").
const DATA_TYPES = { weight: 'weight', heartRate: 'heart-rate', sleep: 'sleep' } as const;

export async function fetchDailyMetrics(accessToken: string, date: string): Promise<DailyHealthMetrics> {
  const startTime = new Date(`${date}T00:00:00.000Z`).toISOString();
  const endTime = new Date(`${date}T23:59:59.999Z`).toISOString();

  async function fetchDataType(dataTypeId: string): Promise<unknown[]> {
    const url = new URL(`${GOOGLE_HEALTH_API_BASE}/users/me/dataTypes/${dataTypeId}/dataPoints`);
    url.searchParams.set('startTime', startTime);
    url.searchParams.set('endTime', endTime);

    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } });
    if (!res.ok) {
      throw new Error(`Google Health API ${dataTypeId} : ${res.status} ${await res.text()}`);
    }
    const body = (await res.json()) as { dataPoints?: unknown[] };
    return body.dataPoints ?? [];
  }

  const [weightPoints, heartRatePoints, sleepPoints] = await Promise.all([
    fetchDataType(DATA_TYPES.weight).catch(() => []),
    fetchDataType(DATA_TYPES.heartRate).catch(() => []),
    fetchDataType(DATA_TYPES.sleep).catch(() => []),
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
