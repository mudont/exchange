import { FastifyInstance } from 'fastify';
import { authRoutes } from './auth';
import { accountRoutes } from './account';
import { instrumentRoutes } from './instrument';
import { orderRoutes } from './order';
import { marketDataRoutes } from './market-data';
import { positionRoutes } from './position';
import { userRoutes } from './user';
import { apiKeyRoutes } from './api-keys';
import { docsRoutes } from './docs';
import cacheRoutes from './cache';
import databaseRoutes from './database';
import monitoringRoutes from './monitoring';
import { loadTestingRoutes } from './load-testing';

export async function apiRoutes(fastify: FastifyInstance) {
  // API version prefix
  const apiPrefix = '/api/v1';
  
  // Register documentation routes (no version prefix)
  await fastify.register(docsRoutes);
  
  // Register all API routes
  await fastify.register(authRoutes, { prefix: `${apiPrefix}/auth` });
  await fastify.register(userRoutes, { prefix: `${apiPrefix}/users` });
  await fastify.register(accountRoutes, { prefix: `${apiPrefix}/accounts` });
  await fastify.register(instrumentRoutes, { prefix: `${apiPrefix}/instruments` });
  await fastify.register(orderRoutes, { prefix: `${apiPrefix}/orders` });
  await fastify.register(marketDataRoutes, { prefix: `${apiPrefix}/market-data` });
  await fastify.register(positionRoutes, { prefix: `${apiPrefix}/positions` });
  await fastify.register(apiKeyRoutes, { prefix: `${apiPrefix}/api-keys` });
  await fastify.register(cacheRoutes, { prefix: `${apiPrefix}/cache` });
  await fastify.register(databaseRoutes, { prefix: `${apiPrefix}/database` });
  await fastify.register(monitoringRoutes, { prefix: `${apiPrefix}/monitoring` });
  await fastify.register(loadTestingRoutes, { prefix: `${apiPrefix}/load-testing` });
  
  // API documentation endpoint
  fastify.get(apiPrefix, async (request, reply) => {
    return {
      name: 'Trading Exchange API',
      version: '1.0.0',
      description: 'Modern TypeScript trading exchange platform',
      authentication: {
        jwt: 'Bearer token authentication',
        apiKey: 'X-API-Key header authentication',
      },
      endpoints: [
        { path: `${apiPrefix}/auth`, description: 'Authentication endpoints' },
        { path: `${apiPrefix}/users`, description: 'User management endpoints' },
        { path: `${apiPrefix}/accounts`, description: 'Account management endpoints' },
        { path: `${apiPrefix}/instruments`, description: 'Instrument management endpoints' },
        { path: `${apiPrefix}/orders`, description: 'Order management endpoints' },
        { path: `${apiPrefix}/market-data`, description: 'Market data endpoints' },
        { path: `${apiPrefix}/positions`, description: 'Position management endpoints' },
        { path: `${apiPrefix}/api-keys`, description: 'API key management endpoints' },
        { path: `${apiPrefix}/cache`, description: 'Cache management and monitoring endpoints' },
        { path: `${apiPrefix}/database`, description: 'Database performance monitoring and optimization endpoints' },
        { path: `${apiPrefix}/monitoring`, description: 'Application monitoring, metrics, and observability endpoints' },
        { path: `${apiPrefix}/load-testing`, description: 'Load testing and performance validation endpoints' },
      ],
      documentation: '/docs',
      graphql: '/graphql',
      timestamp: new Date().toISOString(),
    };
  });
  
  // Health check for API
  fastify.get(`${apiPrefix}/health`, async (request, reply) => {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      rateLimit: {
        general: '1000 requests per 15 minutes',
        auth: '10 requests per 15 minutes',
        trading: '100 requests per minute',
        marketData: '500 requests per minute',
        apiKey: '1000 requests per minute',
      },
    };
  });
}