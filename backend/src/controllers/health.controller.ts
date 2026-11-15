// src/controllers/health.controller.ts
// GET /health : état du backend ET de sa base. Sans la base, l'API ne peut
// servir aucune donnée : le healthcheck Docker (wget --spider, qui échoue sur
// un 503) passe alors le conteneur en « unhealthy », et deploy.sh refuse de
// conclure au succès du déploiement. La réponse reste volontairement sommaire
// (ok / degraded) : la route est exposée publiquement par nginx.
import { Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';

// Au-delà, la base est considérée injoignable : le healthcheck Docker a un
// délai de 5 s, inutile d'attendre plus.
const DB_TIMEOUT_MS = 2_000;

export async function isDatabaseReachable(): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`PostgreSQL ne répond pas sous ${DB_TIMEOUT_MS} ms`)), DB_TIMEOUT_MS);
  });
  try {
    await Promise.race([prisma.$queryRaw`SELECT 1`, timeout]);
    return true;
  } catch (err) {
    logger.error('Healthcheck : base injoignable', err);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export const healthController = {
  check: async (_req: Request, res: Response): Promise<void> => {
    const db = await isDatabaseReachable();
    res
      .status(db ? 200 : 503)
      .set('Cache-Control', 'no-store')
      .json({ status: db ? 'ok' : 'degraded', db: db ? 'ok' : 'unreachable', timestamp: new Date().toISOString() });
  },
};
