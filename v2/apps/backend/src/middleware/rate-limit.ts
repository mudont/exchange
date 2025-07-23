import { FastifyRequest, FastifyReply } from 'fastify';
import { redisService } from '../services/cache/redis-service';
import { AppError } from './error';
import { ErrorCode, HttpStatus } from '@trading-exchange/shared';
import { logger } from '../utils/logger';

export interface RateLimitConfig {
  windowMs: number;
  max: number;
  keyGenerator?: (request: FastifyRequest) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  message?: string;
}

export class RateLimiter {
  private config: RateLimitConfig;

  constructor(config: RateLimitConfig) {
    this.config = {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100,
      keyGenerator: (req) => req.ip,
      skipSuccessfulRequests: false,
      skipFailedRequests: false,
      message: 'Too many requests, please try again later',
      ...config,
    };
  }

  async middleware(request: FastifyRequest, reply: FastifyReply) {
    const key = this.config.keyGenerator!(request);
    const windowKey = `rate_limit:${key}:${Math.floor(Date.now() / this.config.windowMs)}`;
    
    try {
      const current = await redisService.get(windowKey);
      const count = current ? parseInt(current) : 0;
      
      if (count >= this.config.max) {
        // Add rate limit headers
        reply.header('X-RateLimit-Limit', this.config.max);
        reply.header('X-RateLimit-Remaining', 0);
        reply.header('X-RateLimit-Reset', Math.ceil(Date.now() / this.config.windowMs) * this.config.windowMs);
        
        throw new AppError(
          ErrorCode.RATE_LIMIT_EXCEEDED,
          this.config.message!,
          HttpStatus.TOO_MANY_REQUESTS
        );
      }
      
      // Increment counter
      await redisService.set(windowKey, (count + 1).toString(), Math.ceil(this.config.windowMs / 1000));
      
      // Add rate limit headers
      reply.header('X-RateLimit-Limit', this.config.max);
      reply.header('X-RateLimit-Remaining', Math.max(0, this.config.max - count - 1));
      reply.header('X-RateLimit-Reset', Math.ceil(Date.now() / this.config.windowMs) * this.config.windowMs);
      
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      
      logger.error('Rate limiting error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        key,
      });
      
      // If Redis is down, allow the request but log the error
    }
  }
}

// Pre-configured rate limiters
export const generalRateLimit = new RateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // 1000 requests per 15 minutes
});

export const authRateLimit = new RateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 auth attempts per 15 minutes
  keyGenerator: (req) => `auth:${req.ip}`,
  message: 'Too many authentication attempts, please try again later',
});

export const tradingRateLimit = new RateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 trading requests per minute
  keyGenerator: (req) => {
    const userId = (req as any).user?.id;
    return userId ? `trading:${userId}` : `trading:${req.ip}`;
  },
  message: 'Too many trading requests, please slow down',
});

export const marketDataRateLimit = new RateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 500, // 500 market data requests per minute
  keyGenerator: (req) => `market_data:${req.ip}`,
  message: 'Too many market data requests, please slow down',
});

// API key rate limiting
export const apiKeyRateLimit = new RateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 1000, // 1000 requests per minute for API keys
  keyGenerator: (req) => {
    const apiKey = req.headers['x-api-key'] as string;
    return apiKey ? `api_key:${apiKey}` : `ip:${req.ip}`;
  },
  message: 'API rate limit exceeded',
});