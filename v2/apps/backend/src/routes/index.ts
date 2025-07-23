import { FastifyInstance } from 'fastify';
import { authRoutes } from './auth';
import { healthRoutes } from './health';
import { apiRoutes } from './api';
import { setupGraphQL } from '../graphql/server';

export async function setupRoutes(fastify: FastifyInstance) {
  // Health check routes
  await fastify.register(healthRoutes, { prefix: '/health' });
  
  // Authentication routes (legacy - will be moved to API routes)
  await fastify.register(authRoutes, { prefix: '/api/v1/auth' });
  
  // All API routes
  await fastify.register(apiRoutes);
  
  // GraphQL endpoint
  await setupGraphQL(fastify);
}