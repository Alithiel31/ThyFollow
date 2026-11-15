// src/middleware/requestLogger.ts
// Journal d'accès et identifiant de requête (pino-http). Chaque requête reçoit
// un `X-Request-Id` (repris de l'en-tête entrant s'il existe, sinon généré),
// renvoyé au client et présent sur chaque ligne de journal de la requête via
// `req.log`. Un utilisateur qui signale une erreur peut donner cet identifiant
// pour retrouver la requête dans les journaux.
//
// Aucun corps de requête ni de réponse n'est journalisé : ce sont des données
// de santé. Les en-têtes sont réduits à ce qui sert au diagnostic.
import crypto from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { SerializedRequest, SerializedResponse } from 'pino';
import { pinoHttp } from 'pino-http';
import { pinoLogger } from '../lib/logger.js';

const REQUEST_ID_HEADER = 'x-request-id';
// Un identifiant fourni par le client n'est repris que s'il a une forme sûre
// (pas de retour à la ligne ni de caractère de contrôle dans les journaux).
const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/;

export function requestIdFrom(req: IncomingMessage): string {
  const incoming = req.headers[REQUEST_ID_HEADER];
  const value = Array.isArray(incoming) ? incoming[0] : incoming;
  return value && SAFE_REQUEST_ID.test(value) ? value : crypto.randomUUID();
}

export const requestLogger = pinoHttp({
  logger: pinoLogger,
  genReqId: (req, res) => {
    const id = requestIdFrom(req);
    res.setHeader('X-Request-Id', id);
    return id;
  },
  // Le healthcheck Docker appelle /health toutes les 30 s : pas de ligne pour lui.
  autoLogging: { ignore: (req) => req.url === '/health' },
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  customSuccessMessage: (req, res) => `${req.method} ${req.url} ${res.statusCode}`,
  customErrorMessage: (req, res) => `${req.method} ${req.url} ${res.statusCode}`,
  // pino-http applique d'abord ses sérialiseurs standard, puis les nôtres sur
  // le résultat (`raw` pointe vers la requête Express d'origine).
  serializers: {
    req: (req: SerializedRequest) => ({
      id: req.id,
      method: req.method,
      url: req.url,
      // IP réelle : nginx remplace X-Forwarded-For (voir frontend/nginx.conf)
      // et Express la lit grâce à `trust proxy` (voir index.ts).
      ip: (req.raw as IncomingMessage & { ip?: string }).ip ?? req.remoteAddress,
      userAgent: req.headers['user-agent'],
    }),
    res: (res: SerializedResponse) => ({ statusCode: res.statusCode }),
  },
});
