import Fastify from 'fastify';
import { config } from './config';
import { setupMiddleware } from './middleware';
import { setupRoutes } from './routes';
import { setupDatabase } from './database';
import { logger } from './utils/logger';
import { initializeWebSocketServer } from './services/websocket/websocket-server';

const fastify = Fastify({
  logger: false, // We use Winston for logging
});

async function start() {
  try {
    // Setup database connection
    await setupDatabase();
    
    // Setup middleware
    await setupMiddleware(fastify);
    
    // Setup routes
    await setupRoutes(fastify);
    
    // Start server
    await fastify.listen({
      port: config.port,
      host: '0.0.0.0',
    });
    
    // Initialize WebSocket server
    initializeWebSocketServer(fastify.server);
    
    logger.info(`Server listening on port ${config.port}`);
    logger.info('WebSocket server initialized');
  } catch (error) {
    logger.error('Error starting server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down gracefully');
  await fastify.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down gracefully');
  await fastify.close();
  process.exit(0);
});

start();