// src/graphql/index.ts
import type { Express } from 'express';
import type { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@as-integrations/express4';
import { createApolloServer } from './server.js';
import { buildContext } from './context.js';
import type { GraphQLContext } from './context.js';

// Monte /graphql sur une app Express existante, en plus de la REST API.
// Doit être appelé APRÈS express.json()/cookieParser()/xss (le body doit
// déjà être parsé) et AVANT le error handler REST (Apollo formate ses
// propres erreurs et n'appelle jamais next(err)) — voir src/index.ts.
// Retourne le serveur Apollo pour que l'arrêt du processus puisse l'arrêter
// proprement (`server.stop()`).
export async function mountGraphQL(app: Express): Promise<ApolloServer<GraphQLContext>> {
  const server = createApolloServer();
  await server.start();
  app.use('/graphql', expressMiddleware(server, { context: buildContext }));
  return server;
}
