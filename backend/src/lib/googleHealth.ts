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
// ⚠️ `fetchDailyMetrics` lit les points selon la forme décrite par la
// référence v4 (voir RawWeightPoint & co. plus bas), pas encore observée sur
// un vrai payload : la structure du premier point reçu par type est
// journalisée (sans les valeurs) pour la confirmer en production.
import * as client from 'openid-client';
import { config } from '../config.js';
import { logger } from './logger.js';

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
  // Pas de score de sommeil Fitbit : l'API Google Health ne l'expose pas.
  // À la place, ce que le résumé de chaque nuit fournit (voir SleepDay).
  sleepEfficiency: number | null;
  deepSleepMinutes: number | null;
  remSleepMinutes: number | null;
}

// Forme d'un point, d'après la référence v4 (developers.google.com/health/
// reference/rest/v4/users.dataTypes.dataPoints) : un objet par type, sous
// une clé au nom du type. Les entiers int64 sont sérialisés en chaînes JSON
// (convention proto3), d'où `number | string` partout.
//   { weight: { sampleTime: { physicalTime }, weightGrams } }
//   { heartRate: { sampleTime: { physicalTime }, beatsPerMinute } }
//   { sleep: { interval: { startTime, endTime, civilEndTime? },
//              stages: [{ startTime, endTime, type }],
//              summary: { minutesAsleep, minutesInSleepPeriod,
//                         stagesSummary: [{ type, minutes }] } } }
type Int64 = number | string;
interface SampleTime {
  physicalTime?: string;
}
interface RawWeightPoint {
  weight?: { sampleTime?: SampleTime; weightGrams?: Int64 };
}
interface RawHeartRatePoint {
  heartRate?: { sampleTime?: SampleTime; beatsPerMinute?: Int64 };
}

// Types de données : identifiant kebab-case pour le chemin de l'URL (ex:
// "body-fat"), et le filtre AIP-160 de la journée demandée.
// - `sample_time.physical_time` pour une mesure ponctuelle (poids, rythme
//   cardiaque) — fonctionne avec un timestamp UTC ("...Z"), confirmé.
// - Pour `sleep` : `interval.start_time` et `interval.civil_start_time` sont
//   rejetés ("not supported for filtering", confirmé deux fois en usage
//   réel). La doc des filtres liste en revanche `sleep.interval.civil_end_time`
//   — exactement la règle voulue (une nuit appartient au jour du réveil, en
//   heure locale de l'appareil). Pas encore confirmé en usage réel : en cas
//   de refus (400), on relit sans filtre (les 25 nuits les plus récentes,
//   triées par début décroissant) et le tri se fait côté code.
interface DataTypeQuery {
  path: string;
  filter: string;
  // Relire sans filtre si Google refuse le filtre (voir `sleep`).
  retryWithoutFilter?: boolean;
}

function dataTypeQueries(date: string, startTime: string, endTime: string): Record<'weight' | 'heartRate' | 'sleep', DataTypeQuery> {
  const instantRange = (field: string) => `${field} >= "${startTime}" AND ${field} < "${endTime}"`;
  return {
    weight: { path: 'weight', filter: instantRange('weight.sample_time.physical_time') },
    heartRate: { path: 'heart-rate', filter: instantRange('heart_rate.sample_time.physical_time') },
    sleep: {
      path: 'sleep',
      filter: `sleep.interval.civil_end_time >= "${date}T00:00:00" AND sleep.interval.civil_end_time < "${addDays(date, 1)}T00:00:00"`,
      retryWithoutFilter: true,
    },
  };
}

// Journalise une fois par type et par processus la STRUCTURE d'un point
// reçu (noms de champs et types, jamais les valeurs : ce sont des données de
// santé). Sert à confirmer en production la forme décrite ci-dessus, encore
// jamais observée sur un vrai payload. À retirer une fois confirmée.
const loggedShapes = new Set<string>();

export function describeShape(value: unknown, depth = 0): unknown {
  if (Array.isArray(value)) return value.length > 0 && depth < 4 ? [describeShape(value[0], depth + 1)] : [];
  if (value && typeof value === 'object') {
    if (depth >= 4) return 'object';
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, describeShape(v, depth + 1)]));
  }
  return typeof value;
}

function logShapeOnce(path: string, points: unknown[]): void {
  if (loggedShapes.has(path) || points.length === 0) return;
  loggedShapes.add(path);
  logger.info(`Google Health : structure d'un point "${path}"`, JSON.stringify(describeShape(points[0])));
}

// `date` (YYYY-MM-DD) s'entend dans le fuseau de l'utilisateur
// (UserProfile.timezone) : une journée découpée en UTC s'arrêterait vers
// 19-20h heure locale au Québec, et rangerait la soirée au lendemain.
export async function fetchDailyMetrics(
  accessToken: string,
  date: string,
  timeZone: string
): Promise<DailyHealthMetrics> {
  // Intervalle semi-ouvert [minuit local, minuit local du lendemain[ —
  // confirmé nécessaire en usage réel : certains champs (ex:
  // heart_rate.sample_time) rejettent LESS_THAN_EQUALS avec "only supports
  // comparators GREATER_THAN_EQUALS and LESS_THAN". Univoque de toute façon
  // (pas de double-comptage d'une mesure pile à minuit).
  const startTime = new Date(zonedMidnightUtc(date, timeZone)).toISOString();
  const endTime = new Date(zonedMidnightUtc(addDays(date, 1), timeZone)).toISOString();
  const queries = dataTypeQueries(date, startTime, endTime);

  async function request(path: string, filter: string | null): Promise<Response> {
    const url = new URL(`${GOOGLE_HEALTH_API_BASE}/users/me/dataTypes/${path}/dataPoints`);
    // Syntaxe de filtrage AIP-160 (l'API suit ce standard, voir
    // developers.google.com/health/endpoints) — `startTime`/`endTime` en
    // paramètres séparés, essayé initialement, est rejeté par Google avec
    // "Cannot bind query parameter" : confirmé en usage réel.
    if (filter) url.searchParams.set('filter', filter);
    return fetch(url, { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } });
  }

  async function fetchDataType(query: DataTypeQuery): Promise<unknown[]> {
    let res = await request(query.path, query.filter);
    if (res.status === 400 && query.retryWithoutFilter) {
      logger.warn(`Filtre Google Health refusé pour "${query.path}", relecture sans filtre`, await res.text());
      res = await request(query.path, null);
    }
    if (!res.ok) {
      throw new Error(`Google Health API ${query.path} : ${res.status} ${await res.text()}`);
    }
    const body = (await res.json()) as { dataPoints?: unknown[] };
    const points = body.dataPoints ?? [];
    logShapeOnce(query.path, points);
    return points;
  }

  // Un échec sur un type de donnée ne doit pas empêcher les autres de
  // remonter, mais doit rester visible — un `.catch(() => [])` muet ferait
  // "réussir" silencieusement une synchro qui n'a en fait rien récupéré
  // (déjà vécu avec l'abonnement webhook, voir lib/googleHealthSubscriber.ts).
  async function fetchDataTypeLogged(query: DataTypeQuery): Promise<unknown[]> {
    try {
      return await fetchDataType(query);
    } catch (err) {
      logger.error(`Échec lecture Google Health API pour "${query.path}"`, err);
      return [];
    }
  }

  const [weightPoints, heartRatePoints, sleepPoints] = await Promise.all([
    fetchDataTypeLogged(queries.weight),
    fetchDataTypeLogged(queries.heartRate),
    fetchDataTypeLogged(queries.sleep),
  ]);

  const weightGrams = latestSample(
    (weightPoints as RawWeightPoint[]).map((p) => ({ time: p.weight?.sampleTime?.physicalTime, value: p.weight?.weightGrams }))
  );
  const heartRate = latestSample(
    (heartRatePoints as RawHeartRatePoint[]).map((p) => ({
      time: p.heartRate?.sampleTime?.physicalTime,
      value: p.heartRate?.beatsPerMinute,
    }))
  );
  const sleep = summarizeSleepForDate(sleepPoints, date, timeZone);

  return {
    weightKg: weightGrams === null ? null : Math.round(weightGrams / 10) / 100,
    heartRateBpm: heartRate,
    sleepHours: sleep?.hours ?? null,
    sleepEfficiency: sleep?.efficiency ?? null,
    deepSleepMinutes: sleep?.deepMinutes ?? null,
    remSleepMinutes: sleep?.remMinutes ?? null,
  };
}

function toNumber(value: Int64 | undefined): number | null {
  if (value === undefined || value === null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

// Mesure la plus récente parmi des échantillons ponctuels. L'ordre de la
// réponse n'est documenté que pour le sommeil : on trie sur l'heure de la
// mesure plutôt que de se fier à la position dans le tableau.
export function latestSample(samples: { time?: string; value?: Int64 }[]): number | null {
  let best: { t: number; v: number } | null = null;
  for (const s of samples) {
    const v = toNumber(s.value);
    const t = s.time ? Date.parse(s.time) : NaN;
    if (v === null || !Number.isFinite(t)) continue;
    if (!best || t > best.t) best = { t, v };
  }
  return best?.v ?? null;
}

// ── Fuseau horaire ────────────────────────────────────────────────────────
// Sans dépendance : Intl donne l'heure murale d'un instant dans un fuseau,
// on en déduit le décalage.

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Décalage (ms) du fuseau par rapport à UTC à l'instant donné (ex: -4h à
// Montréal l'été, +2h à Paris).
function timeZoneOffsetMs(instantMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(instantMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const wallClockAsUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return wallClockAsUtc - Math.floor(instantMs / 1000) * 1000;
}

// Instant UTC (ms) de minuit local pour `date` dans `timeZone`. Le
// décalage est recalculé une fois au résultat pour encaisser un changement
// d'heure entre minuit UTC et minuit local.
export function zonedMidnightUtc(date: string, timeZone: string): number {
  const naive = new Date(`${date}T00:00:00.000Z`).getTime();
  const guess = naive - timeZoneOffsetMs(naive, timeZone);
  return naive - timeZoneOffsetMs(guess, timeZone);
}

// Date civile (YYYY-MM-DD) d'un instant dans `timeZone`.
export function localDateOf(instantMs: number, timeZone: string): string {
  // en-CA formate en YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(instantMs)
  );
}

// ── Sommeil ───────────────────────────────────────────────────────────────

interface RawInterval {
  startTime?: string;
  endTime?: string;
  // Heure civile (murale) du réveil sur l'appareil. Chaîne ISO sans
  // décalage, ou objet date/heure selon la sérialisation : les deux sont lus.
  civilEndTime?: string | { date?: { year?: number; month?: number; day?: number } };
}

interface RawSleepStage {
  startTime?: string;
  endTime?: string;
  type?: string;
}

interface RawSleepPoint {
  sleep?: {
    interval?: RawInterval;
    stages?: RawSleepStage[];
    summary?: {
      minutesAsleep?: Int64;
      minutesInSleepPeriod?: Int64;
      stagesSummary?: { type?: string; minutes?: Int64 }[];
    };
  };
}

interface SleepSession {
  startMs: number;
  endMs: number;
  // Date civile du réveil quand Google la fournit (fuseau de l'appareil).
  civilEndDate: string | null;
  asleepMinutes: number;
  inBedMinutes: number;
  deepMinutes: number | null;
  remMinutes: number | null;
}

export interface SleepDay {
  hours: number;
  // Minutes dormies / minutes de la période de sommeil, en % — la définition
  // Fitbit de l'efficacité, calculée ici : l'API ne la renvoie pas.
  efficiency: number | null;
  deepMinutes: number | null;
  remMinutes: number | null;
}

function civilDate(value: RawInterval['civilEndTime']): string | null {
  if (typeof value === 'string') return /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;
  const d = value?.date;
  if (!d?.year || !d.month || !d.day) return null;
  return `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
}

function minutesBetween(startTime?: string, endTime?: string): number {
  const d = (Date.parse(endTime ?? '') - Date.parse(startTime ?? '')) / 60000;
  return Number.isFinite(d) && d > 0 ? d : 0;
}

// Minutes d'un type de phase : d'abord le résumé calculé par Google, sinon
// la somme des segments. `null` si la nuit n'a pas de phases (sommeil
// "classique", sans distinction profond/paradoxal).
function stageMinutes(sleep: NonNullable<RawSleepPoint['sleep']>, type: string): number | null {
  const fromSummary = sleep.summary?.stagesSummary?.find((s) => s.type?.toUpperCase() === type);
  const summaryValue = toNumber(fromSummary?.minutes);
  if (summaryValue !== null) return summaryValue;
  const stages = sleep.stages ?? [];
  if (stages.length === 0) return null;
  return stages.filter((s) => s.type?.toUpperCase() === type).reduce((sum, s) => sum + minutesBetween(s.startTime, s.endTime), 0);
}

export function readSleepSession(point: unknown): SleepSession | null {
  const sleep = (point as RawSleepPoint).sleep;
  const interval = sleep?.interval;
  if (!sleep || !interval) return null;
  const startMs = Date.parse(interval.startTime ?? '');
  const endMs = Date.parse(interval.endTime ?? '');
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null;

  const inBedMinutes = toNumber(sleep.summary?.minutesInSleepPeriod) ?? (endMs - startMs) / 60000;
  // Minutes dormies : le résumé de Google (phases d'éveil déjà exclues),
  // sinon la période moins les phases AWAKE, sinon le temps au lit.
  let asleepMinutes = toNumber(sleep.summary?.minutesAsleep);
  if (asleepMinutes === null) {
    const awake = (sleep.stages ?? [])
      .filter((s) => s.type?.toUpperCase() === 'AWAKE')
      .reduce((sum, s) => sum + minutesBetween(s.startTime, s.endTime), 0);
    asleepMinutes = Math.max(0, inBedMinutes - awake);
  }

  return {
    startMs,
    endMs,
    civilEndDate: civilDate(interval.civilEndTime),
    asleepMinutes,
    inBedMinutes,
    deepMinutes: stageMinutes(sleep, 'DEEP'),
    remMinutes: stageMinutes(sleep, 'REM'),
  };
}

// Sommeil attribué à `date` : chaque session est rangée entièrement au jour
// de son RÉVEIL, en heure locale, comme le fait l'app Fitbit. Une nuit
// 23h → 7h appartient donc au matin du 7h, et n'est plus comptée sur les
// deux jours qu'elle chevauche. La date civile fournie par Google (fuseau de
// l'appareil) prime ; à défaut, le fuseau du profil. Les siestes du jour
// s'ajoutent ; une même session renvoyée deux fois n'est comptée qu'une fois.
export function summarizeSleepForDate(points: unknown[], date: string, timeZone: string): SleepDay | null {
  const seen = new Set<string>();
  const sessions: SleepSession[] = [];
  for (const point of points) {
    const session = readSleepSession(point);
    if (!session) continue;
    const wakeDate = session.civilEndDate ?? localDateOf(session.endMs, timeZone);
    const key = `${session.startMs}-${session.endMs}`;
    if (wakeDate !== date || seen.has(key)) continue;
    seen.add(key);
    sessions.push(session);
  }
  if (sessions.length === 0) return null;

  const asleep = sessions.reduce((sum, s) => sum + s.asleepMinutes, 0);
  const inBed = sessions.reduce((sum, s) => sum + s.inBedMinutes, 0);
  if (asleep <= 0) return null;
  // Phases : seulement si toutes les sessions en ont, sinon le total serait
  // sous-estimé sans qu'on le sache.
  const sumStage = (pick: (s: SleepSession) => number | null): number | null =>
    sessions.every((s) => pick(s) !== null) ? Math.round(sessions.reduce((sum, s) => sum + pick(s)!, 0)) : null;

  return {
    hours: Math.round((asleep / 60) * 100) / 100,
    efficiency: inBed > 0 ? Math.min(100, Math.round((asleep / inBed) * 100)) : null,
    deepMinutes: sumStage((s) => s.deepMinutes),
    remMinutes: sumStage((s) => s.remMinutes),
  };
}
