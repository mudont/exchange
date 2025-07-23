import { ApolloServer } from 'apollo-server-fastify';
import { ApolloServerPluginDrainHttpServer } from 'apollo-server-core';
import { FastifyInstance } from 'fastify';
import { typeDefs } from './schema';
import { resolvers } from './resolvers';
import { config } from '../config';
import { logger } from '../utils/logger';
import jwt from 'jsonwebtoken';
import { prisma } from '../database';

export async function createGraphQLServer(fastify: FastifyInstance) {
  const server = new ApolloServer({
    typeDefs,
    resolvers,
    context: async ({ request, connection }) => {
      // Handle WebSocket connections (subscriptions)
      if (connection) {
        return connection.context;
      }

      // Handle HTTP requests
      let user = null;
      
      try {
        const authHeader = request.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
          const token = authHeader.substring(7);
          const decoded = jwt.verify(token, config.jwtSecret) as any;
          
          user = await prisma.user.findUnique({
            where: { id: decoded.userId },
            select: {
              id: true,
              email: true,
              emailVerified: true,
              firstName: true,
              lastName: true,
              isActive: true,
            },
          });
        }
      } catch (error) {
        logger.warn('Invalid JWT token in GraphQL request', { error: error instanceof Error ? error.message : 'Unknown error' });
      }

      return {
        user,
        request,
      };
    },
    subscriptions: {
      onConnect: async (connectionParams: any) => {
        // Handle WebSocket authentication for subscriptions
        let user = null;
        
        try {
          const token = connectionParams.authorization?.replace('Bearer ', '');
          if (token) {
            const decoded = jwt.verify(token, config.jwtSecret) as any;
            
            user = await prisma.user.findUnique({
              where: { id: decoded.userId },
              select: {
                id: true,
                email: true,
                emailVerified: true,
                firstName: true,
                lastName: true,
                isActive: true,
              },
            });
          }
        } catch (error) {
          logger.warn('Invalid JWT token in GraphQL subscription', { error: error instanceof Error ? error.message : 'Unknown error' });
        }

        return { user };
      },
      onDisconnect: () => {
        logger.info('GraphQL subscription client disconnected');
      },
    },
    plugins: [
      ApolloServerPluginDrainHttpServer({ httpServer: fastify.server }),
    ],
    introspection: config.nodeEnv !== 'production',
    playground: config.nodeEnv !== 'production',
    formatError: (error) => {
      logger.error('GraphQL Error:', {
        message: error.message,
        path: error.path,
        source: error.source?.body,
        positions: error.positions,
      });

      // Don't expose internal errors in production
      if (config.nodeEnv === 'production' && !error.message.startsWith('GraphQL error:')) {
        return new Error('Internal server error');
      }

      return error;
    },
  });

  return server;
}

export async function setupGraphQL(fastify: FastifyInstance) {
  const server = await createGraphQLServer(fastify);
  
  // Start the server
  await server.start();
  
  // Register GraphQL handler
  await fastify.register(server.createHandler({
    path: '/graphql',
    cors: {
      origin: [config.frontendUrl],
      credentials: true,
    },
  }));
  
  logger.info('GraphQL server setup complete', {
    endpoint: '/graphql',
    playground: config.nodeEnv !== 'production' ? '/graphql' : 'disabled',
  });
}