// src/graphql/server.ts
import { ApolloServer } from '@apollo/server';
import { config } from '../config.js';
import { typeDefs } from './schema.js';
import { resolvers } from './resolvers.js';
import type { GraphQLContext } from './context.js';

export function createApolloServer(): ApolloServer<GraphQLContext> {
  return new ApolloServer<GraphQLContext>({
    typeDefs,
    resolvers,
    // Introspection (Apollo Sandbox) réservée au dev — même convention que
    // le reste de la config (config.isDev), pas de nouvelle variable d'env.
    introspection: config.isDev,
    // Par défaut, Apollo installe ses propres écouteurs SIGINT/SIGTERM : il
    // appelle stop() puis relance le signal sur le processus. Cela court-
    // circuitait l'arrêt propre de src/index.ts (un second stop() concurrent
    // ne rend jamais la main, et le signal relancé tuait le processus). C'est
    // index.ts qui orchestre l'arrêt et appelle stop() au bon moment.
    stopOnTerminationSignals: false,
  });
}
