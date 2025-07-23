import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../utils/logger';

export async function requestLogger(request: FastifyRequest, reply: FastifyReply) {
  const start = Date.now();
  
  // Log request
  logger.info('Incoming request', {
    method: request.method,
    url: request.url,
    userAgent: request.headers['user-agent'],
    ip: request.ip,
    userId: request.user?.id,
  });

  // Log response when request completes
  reply.addHook('onSend', async (request, reply, payload) => {
    const duration = Date.now() - start;
    
    logger.info('Request completed', {
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      duration: `${duration}ms`,
      userId: request.user?.id,
    });
    
    return payload;
  });
}