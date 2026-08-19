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
  });
}
