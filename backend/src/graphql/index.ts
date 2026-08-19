// src/graphql/index.ts
import type { Express } from 'express';
import { expressMiddleware } from '@as-integrations/express4';
import { createApolloServer } from './server.js';
import { buildContext } from './context.js';

// Monte /graphql sur une app Express existante, en plus de la REST API.
// Doit être appelé APRÈS express.json()/cookieParser()/xss (le body doit
// déjà être parsé) et AVANT le error handler REST (Apollo formate ses
// propres erreurs et n'appelle jamais next(err)) — voir src/index.ts.
export async function mountGraphQL(app: Express): Promise<void> {
  const server = createApolloServer();
  await server.start();
  app.use('/graphql', expressMiddleware(server, { context: buildContext }));
}
