// src/lib/authEvents.ts
// Traçabilité des connexions Google : permet une future détection
// d'anomalie et d'informer l'utilisateur des connexions/liaisons sur son
// compte. Écriture en fire-and-forget — un échec d'insertion ne doit
// jamais faire échouer le flow d'authentification lui-même.
import { Request } from 'express';
import { AuthEventType, PrismaClient } from '@prisma/client';
import { logger } from './logger.js';

export async function recordAuthEvent(
  prisma: PrismaClient,
  params: { userId: string | null; provider: string; type: AuthEventType; req: Request }
): Promise<void> {
  try {
    await prisma.authEvent.create({
      data: {
        userId: params.userId,
        provider: params.provider,
        type: params.type,
        ip: params.req.ip,
        userAgent: params.req.headers['user-agent'] ?? null,
      },
    });
  } catch (err) {
    logger.error('Échec enregistrement AuthEvent', err);
  }
}
