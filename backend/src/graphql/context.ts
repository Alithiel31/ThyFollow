// src/graphql/context.ts
// Pont d'authentification entre middleware/auth.ts (REST) et Apollo.
//
// Reproduit volontairement le décodage JWT de `authenticate` (même header
// `Authorization: Bearer <token>`, même `jwt.verify`) plutôt que de le
// réutiliser tel quel : `authenticate` répond directement via `res` en cas
// d'échec (`res.status(401).json(...)`), un effet de bord Express qui n'a
// pas d'équivalent dans une fonction `context` d'Apollo — celle-ci ne peut
// que `throw`. Partager le code obligerait à faire transiter `res` jusqu'ici,
// ce qui irait à l'encontre du fonctionnement d'Apollo. La duplication est
// donc assumée et limitée à ces quelques lignes.
//
// Note : contrairement aux réponses REST (`req.t('errors.tokenInvalid')`),
// les messages d'erreur ici sont en anglais et non traduits via i18next —
// simplification de scope pour cette démo, voir docs/graphql.md.
import jwt from 'jsonwebtoken';
import { GraphQLError } from 'graphql';
import type { Request } from 'express';
import { config } from '../config.js';
import { prisma } from '../lib/prisma.js';
import { createLoaders, type Loaders } from './dataloaders.js';

export interface GraphQLContext {
  userId: string;
  loaders: Loaders;
}

function unauthenticated(message: string): GraphQLError {
  return new GraphQLError(message, {
    extensions: { code: 'UNAUTHENTICATED', http: { status: 401 } },
  });
}

export async function buildContext({ req }: { req: Request }): Promise<GraphQLContext> {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    throw unauthenticated('Missing authentication token');
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret) as { userId: string };
    // Un loader par requête : son cache ne doit jamais survivre à la requête
    // HTTP courante (voir dataloaders.ts).
    return { userId: decoded.userId, loaders: createLoaders(prisma) };
  } catch {
    throw unauthenticated('Invalid authentication token');
  }
}
