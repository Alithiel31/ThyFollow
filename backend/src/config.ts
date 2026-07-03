// src/config.ts
// Centralise la lecture des variables d'environnement pour éviter les
// `process.env.X!` (assertion non-null) dispersés dans tout le code.
import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-key-min-32-characters-long',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '30d',
  // Rate limiting global : 100 requêtes / 15 min par IP par défaut
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || String(15 * 60 * 1000), 10),
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
  // Rate limiting dédié /api/auth (plus strict, contre le brute-force)
  authRateLimitWindowMs: parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS || String(15 * 60 * 1000), 10),
  authRateLimitMax: parseInt(process.env.AUTH_RATE_LIMIT_MAX || '20', 10),
  isDev: process.env.NODE_ENV !== 'production',
  isProd: process.env.NODE_ENV === 'production',
};

// En production, on refuse de démarrer si JWT_SECRET est absent ou trop
// court : un secret par défaut/faible en prod permettrait à n'importe qui
// de forger des tokens valides (accès à n'importe quel compte).
if (config.isProd && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)) {
  console.error(
    '❌ JWT_SECRET manquant ou trop court (< 32 caractères) en production. ' +
      "Définissez un secret fort via la variable d'environnement JWT_SECRET."
  );
  process.exit(1);
}

if (!config.isProd && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)) {
  console.warn(
    '⚠️  JWT_SECRET manquant ou trop court (< 32 caractères). Secret de développement utilisé.'
  );
}
