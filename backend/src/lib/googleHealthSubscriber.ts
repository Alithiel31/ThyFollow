// src/lib/googleHealthSubscriber.ts
// Gestion de l'abonné webhook Google Health — AU NIVEAU DU PROJET, pas par
// utilisateur connecté (contrairement à ce qu'une première version de cette
// intégration faisait). Un seul abonné (`projects.subscribers`) est créé une
// fois pour tout ThyroTrack ; avec une politique AUTOMATIC, Google route
// ensuite automatiquement les notifications de tout utilisateur consentant
// vers cet unique endpoint — aucun abonnement par utilisateur n'est requis.
// Voir developers.google.com/health/webhooks (contenu confirmé par lecture
// directe de la doc, pas une supposition).
//
// Authentification différente du reste de l'intégration : gérer
// `projects.subscribers` est documenté comme nécessitant un compte de
// service IAM Google Cloud (scope `cloud-platform`), pas le token OAuth
// utilisateur utilisé pour lire les données de santé (voir lib/googleHealth.ts).
import { GoogleAuth } from 'google-auth-library';
import { config } from '../config.js';
import { GOOGLE_HEALTH_API_BASE } from './googleHealth.js';
import { logger } from './logger.js';

// Doit respecter ([a-z]([a-z0-9-]{2,34}[a-z0-9])) — voir la doc.
const SUBSCRIBER_ID = 'thyrotrack-webhook';

let cachedAuth: GoogleAuth | null = null;

function getAuth(): GoogleAuth {
  if (!config.googleHealthServiceAccountKey) {
    throw new Error('GOOGLE_HEALTH_SERVICE_ACCOUNT_KEY non configuré');
  }
  if (!cachedAuth) {
    let credentials: Record<string, unknown>;
    try {
      credentials = JSON.parse(config.googleHealthServiceAccountKey);
    } catch {
      throw new Error('GOOGLE_HEALTH_SERVICE_ACCOUNT_KEY invalide : doit être le contenu JSON complet de la clé, pas un chemin de fichier');
    }
    cachedAuth = new GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
  }
  return cachedAuth;
}

async function getServiceAccountAccessToken(): Promise<string> {
  const client = await getAuth().getClient();
  const { token } = await client.getAccessToken();
  if (!token) throw new Error('Impossible d’obtenir un access_token pour le compte de service Google Health');
  return token;
}

function subscribersUrl(path = ''): string {
  if (!config.googleHealthProjectNumber) {
    throw new Error('GOOGLE_HEALTH_PROJECT_NUMBER non configuré');
  }
  return `${GOOGLE_HEALTH_API_BASE}/projects/${config.googleHealthProjectNumber}/subscribers${path}`;
}

function webhookEndpointUri(): string {
  // Dérive l'origine publique du backend depuis GOOGLE_HEALTH_REDIRECT_URI
  // (déjà l'URL publique du backend) plutôt que de dupliquer une variable
  // d'env supplémentaire pour la même information.
  return new URL('/api/webhooks/google-health', config.googleHealthRedirectUri).href;
}

interface SubscriberListResponse {
  subscribers?: { name?: string }[];
}

// Idempotent : à appeler au démarrage du backend (voir index.ts). Ne fait
// rien si l'abonné existe déjà (pas de tentative de réconciliation de
// config à chaud pour l'instant — un changement de endpointUri/secret
// nécessite une intervention manuelle, voir README).
export async function ensureProjectSubscriber(): Promise<void> {
  const accessToken = await getServiceAccountAccessToken();

  const listRes = await fetch(subscribersUrl(), {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  });
  if (!listRes.ok) {
    throw new Error(`Échec listage des abonnés Google Health : ${listRes.status} ${await listRes.text()}`);
  }
  const list = (await listRes.json()) as SubscriberListResponse;
  const alreadyExists = (list.subscribers ?? []).some((s) => s.name?.endsWith(`/subscribers/${SUBSCRIBER_ID}`));

  if (alreadyExists) {
    logger.info(`Abonné webhook Google Health "${SUBSCRIBER_ID}" déjà enregistré, rien à faire.`);
    return;
  }

  if (!config.googleHealthWebhookSecret) {
    throw new Error('GOOGLE_HEALTH_WEBHOOK_SECRET non configuré — requis pour créer l’abonné webhook');
  }

  const createRes = await fetch(`${subscribersUrl()}?subscriberId=${SUBSCRIBER_ID}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      endpointUri: webhookEndpointUri(),
      // Politique AUTOMATIC : Google gère lui-même l'abonnement de chaque
      // utilisateur consentant, aucun appel par utilisateur nécessaire (voir
      // controllers/googleHealth.controller.ts, qui ne fait plus qu'un
      // getIdentity après connexion).
      subscriberConfigs: [{ dataTypes: ['weight', 'sleep', 'heart-rate'], subscriptionCreatePolicy: 'AUTOMATIC' }],
      endpointAuthorization: { secret: config.googleHealthWebhookSecret },
    }),
  });

  if (!createRes.ok) {
    throw new Error(`Échec création de l’abonné webhook Google Health : ${createRes.status} ${await createRes.text()}`);
  }

  logger.success(`Abonné webhook Google Health "${SUBSCRIBER_ID}" créé.`);
}
