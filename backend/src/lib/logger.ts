// src/lib/logger.ts
// Logger applicatif, bâti sur pino. En production : une ligne JSON par
// évènement sur la sortie standard (`docker compose logs`, lisible par
// n'importe quel collecteur). En développement : sortie colorée via
// pino-pretty. L'API (`info`, `success`, `warn`, `error`, `debug`) est celle
// de l'ancien logger console, pour ne rien changer aux appelants.
//
// Lit `process.env` directement plutôt que `config.ts` : config.ts journalise
// lui-même ses erreurs de démarrage, et un import croisé entre les deux
// modules ESM laisserait l'un des deux à moitié initialisé.
import pino, { type Logger as PinoLogger, type LoggerOptions } from 'pino';

const isProd = process.env.NODE_ENV === 'production';
const isTest = process.env.VITEST !== undefined || process.env.NODE_ENV === 'test';

// LOG_LEVEL : fatal | error | warn | info | debug | trace | silent.
// Les tests ne montrent que les avertissements et erreurs, pour garder la
// sortie de vitest lisible.
const level = process.env.LOG_LEVEL || (isTest ? 'warn' : isProd ? 'info' : 'debug');

const options: LoggerOptions = {
  level,
  // Jamais de secret dans les journaux, même si un objet entier est passé par
  // mégarde (requête, réponse d'API tierce...).
  redact: {
    paths: [
      'password',
      '*.password',
      'token',
      '*.token',
      'authorization',
      '*.authorization',
      'cookie',
      '*.cookie',
      'req.headers.authorization',
      'req.headers.cookie',
    ],
    censor: '[REDACTED]',
  },
  ...(isProd || isTest
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
        },
      }),
};

// Logger pino brut : pour les modules qui ont besoin de l'API complète
// (pino-http, loggers enfants avec contexte).
//
// Écriture synchrone sur la sortie standard : la sortie asynchrone par défaut
// perd les dernières lignes à `process.exit()` (celles de l'arrêt propre,
// justement les plus utiles). Le surcoût est négligeable à notre volume. Sans
// objet avec le transport pino-pretty du développement.
export const pinoLogger: PinoLogger = options.transport
  ? pino(options)
  : pino(options, pino.destination({ dest: 1, sync: true }));

// `data` : une Error est sérialisée sous `err` (message, type, pile) ; tout
// autre valeur part sous `data`.
function payload(data: unknown): Record<string, unknown> {
  if (data === undefined || data === '') return {};
  if (data instanceof Error) return { err: data };
  return { data };
}

export const logger = {
  info: (message: string, data?: unknown) => pinoLogger.info(payload(data), message),
  success: (message: string, data?: unknown) => pinoLogger.info(payload(data), message),
  warn: (message: string, data?: unknown) => pinoLogger.warn(payload(data), message),
  error: (message: string, error?: unknown) => pinoLogger.error(payload(error), message),
  debug: (message: string, data?: unknown) => pinoLogger.debug(payload(data), message),
};
