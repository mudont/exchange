import { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import jwt from '@fastify/jwt';
import websocket from '@fastify/websocket';
import { config } from '../config';
import { authMiddleware, requirePermission } from './auth';
import { errorHandler } from './error';
import { requestLogger } from './logger';
import { OAuthService } from '../services/oauth';
import { 
  generalRateLimit, 
  authRateLimit, 
  tradingRateLimit, 
  marketDataRateLimit,
  apiKeyRateLimit 
} from './rate-limit';

export async function setupMiddleware(fastify: FastifyInstance) {
  // Security middleware
  await fastify.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'", 'wss:', 'ws:'],
      },
    },
    crossOriginEmbedderPolicy: false,
  });

  // CORS
  await fastify.register(cors, {
    origin: [config.frontendUrl],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
  });

  // General rate limiting
  await fastify.register(rateLimit, {
    max: config.rateLimit.max,
    timeWindow: config.rateLimit.windowMs,
    errorResponseBuilder: (request, context) => {
      return {
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests, please try again later',
        },
        retryAfter: Math.round(context.ttl / 1000),
      };
    },
  });

  // JWT
  await fastify.register(jwt, {
    secret: config.jwtSecret,
  });

  // WebSocket support
  await fastify.register(websocket);

  // Setup OAuth strategies
  const oauthService = new OAuthService();
  oauthService.setupSerialization();

  // Request logging
  fastify.addHook('onRequest', requestLogger);

  // API versioning
  const { versioningMiddleware, transformationMiddleware } = await import('./versioning');
  fastify.addHook('onRequest', versioningMiddleware);
  fastify.addHook('onRequest', transformationMiddleware);

  // Authentication middleware
  fastify.decorate('authenticate', authMiddleware);
  
  // Permission middleware
  fastify.decorate('requirePermission', requirePermission);

  // Route-specific rate limiting
  fastify.addHook('onRequest', async (request, reply) => {
    const path = request.url;
    
    // Apply specific rate limits based on route
    if (path.includes('/auth/')) {
      await authRateLimit.middleware(request, reply);
    } else if (path.includes('/orders') || path.includes('/positions')) {
      await tradingRateLimit.middleware(request, reply);
    } else if (path.includes('/market-data')) {
      await marketDataRateLimit.middleware(request, reply);
    } else if (request.headers['x-api-key']) {
      await apiKeyRateLimit.middleware(request, reply);
    } else {
      await generalRateLimit.middleware(request, reply);
    }
  });

  // Security headers
  fastify.addHook('onSend', async (request, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('X-XSS-Protection', '1; mode=block');
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    
    // Remove server header
    reply.removeHeader('server');
    
    return payload;
  });

  // Error handling
  fastify.setErrorHandler(errorHandler);
}