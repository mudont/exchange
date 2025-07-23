import { FastifyInstance } from 'fastify';
import { prisma } from '../database';
import { logger } from '../utils/logger';

export async function healthRoutes(fastify: FastifyInstance) {
  // Basic health check
  fastify.get('/', async (request, reply) => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  });

  // Detailed health check with dependencies
  fastify.get('/detailed', async (request, reply) => {
    const health = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      services: {
        database: 'unknown',
        redis: 'unknown',
      },
    };

    // Check database connection
    try {
      await prisma.$queryRaw`SELECT 1`;
      health.services.database = 'ok';
    } catch (error) {
      logger.error('Database health check failed:', error);
      health.services.database = 'error';
      health.status = 'degraded';
    }

    // TODO: Add Redis health check when we implement Redis connection
    health.services.redis = 'ok'; // Placeholder

    return health;
  });
}