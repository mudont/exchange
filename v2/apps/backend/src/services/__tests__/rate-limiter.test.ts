import { RateLimiterService, RateLimitConfig } from '../rate-limiter';
import { FastifyRequest } from 'fastify';
import { Redis } from 'ioredis';

// Mock Redis
jest.mock('ioredis');
jest.mock('../cache/redis-service', () => ({
  redisService: {
    getClient: jest.fn(() => mockRedis),
  },
}));

const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  pttl: jest.fn(),
  pexpire: jest.fn(),
  multi: jest.fn(() => ({
    incr: jest.fn().mockReturnThis(),
    pttl: jest.fn().mockReturnThis(),
    exec: jest.fn(),
  })),
} as unknown as jest.Mocked<Redis>;

describe('RateLimiterService', () => {
  let rateLimiter: RateLimiterService;
  let mockRequest: Partial<FastifyRequest>;

  beforeEach(() => {
    jest.clearAllMocks();
    rateLimiter = RateLimiterService.getInstance();
    mockRequest = {
      ip: '127.0.0.1',
      url: '/api/test',
      method: 'GET',
    };
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = RateLimiterService.getInstance();
      const instance2 = RateLimiterService.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('configureLimiter', () => {
    it('should configure a new rate limiter', () => {
      const config: Partial<RateLimitConfig> = {
        windowMs: 60000,
        maxRequests: 100,
        keyPrefix: 'test:',
      };

      rateLimiter.configureLimiter('test', config);
      const limiters = rateLimiter.getLimiters();
      
      expect(limiters.has('test')).toBe(true);
      expect(limiters.get('test')?.windowMs).toBe(60000);
      expect(limiters.get('test')?.maxRequests).toBe(100);
      expect(limiters.get('test')?.keyPrefix).toBe('test:');
    });

    it('should merge with existing configuration', () => {
      rateLimiter.configureLimiter('test', { maxRequests: 50 });
      rateLimiter.configureLimiter('test', { windowMs: 30000 });
      
      const config = rateLimiter.getLimiters().get('test');
      expect(config?.maxRequests).toBe(50);
      expect(config?.windowMs).toBe(30000);
    });
  });

  describe('checkRateLimit', () => {
    beforeEach(() => {
      rateLimiter.configureLimiter('test', {
        windowMs: 60000,
        maxRequests: 10,
        keyPrefix: 'test:',
      });
    });

    it('should allow request within rate limit', async () => {
      const mockMulti = {
        incr: jest.fn().mockReturnThis(),
        pttl: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([
          [null, 5], // Current count
          [null, 30000], // TTL
        ]),
      };

      (mockRedis.multi as jest.Mock).mockReturnValue(mockMulti);

      const result = await rateLimiter.checkRateLimit(mockRequest as FastifyRequest, 'test');

      expect(result.limited).toBe(false);
      expect(result.info.current).toBe(5);
      expect(result.info.remaining).toBe(5);
      expect(result.info.limit).toBe(10);
    });

    it('should block request when rate limit exceeded', async () => {
      const mockMulti = {
        incr: jest.fn().mockReturnThis(),
        pttl: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([
          [null, 15], // Current count exceeds limit
          [null, 30000], // TTL
        ]),
      };

      (mockRedis.multi as jest.Mock).mockReturnValue(mockMulti);

      const result = await rateLimiter.checkRateLimit(mockRequest as FastifyRequest, 'test');

      expect(result.limited).toBe(true);
      expect(result.info.current).toBe(15);
      expect(result.info.remaining).toBe(0);
      expect(result.info.limit).toBe(10);
    });

    it('should set expiration for new keys', async () => {
      const mockMulti = {
        incr: jest.fn().mockReturnThis(),
        pttl: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([
          [null, 1], // First request
          [null, -1], // No TTL set
        ]),
      };

      (mockRedis.multi as jest.Mock).mockReturnValue(mockMulti);
      (mockRedis.pexpire as jest.Mock).mockResolvedValue(1);

      await rateLimiter.checkRateLimit(mockRequest as FastifyRequest, 'test');

      expect(mockRedis.pexpire).toHaveBeenCalledWith(
        expect.stringContaining('test:'),
        60000
      );
    });

    it('should skip rate limiting for OPTIONS requests', async () => {
      const optionsRequest = {
        ...mockRequest,
        method: 'OPTIONS',
      };

      rateLimiter.configureLimiter('test', {
        skipMethods: ['OPTIONS'],
      });

      const result = await rateLimiter.checkRateLimit(optionsRequest as FastifyRequest, 'test');

      expect(result.limited).toBe(false);
      expect(mockRedis.multi).not.toHaveBeenCalled();
    });

    it('should skip rate limiting for specified routes', async () => {
      const healthRequest = {
        ...mockRequest,
        url: '/health',
      };

      rateLimiter.configureLimiter('test', {
        skipRoutes: ['/health'],
      });

      const result = await rateLimiter.checkRateLimit(healthRequest as FastifyRequest, 'test');

      expect(result.limited).toBe(false);
      expect(mockRedis.multi).not.toHaveBeenCalled();
    });

    it('should use custom key generator', async () => {
      const customKeyGenerator = jest.fn().mockReturnValue('custom-key');
      
      rateLimiter.configureLimiter('test', {
        keyGenerator: customKeyGenerator,
      });

      const mockMulti = {
        incr: jest.fn().mockReturnThis(),
        pttl: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([
          [null, 1],
          [null, 60000],
        ]),
      };

      (mockRedis.multi as jest.Mock).mockReturnValue(mockMulti);

      await rateLimiter.checkRateLimit(mockRequest as FastifyRequest, 'test');

      expect(customKeyGenerator).toHaveBeenCalledWith(mockRequest);
      expect(mockMulti.incr).toHaveBeenCalledWith(expect.stringContaining('custom-key'));
    });

    it('should use user ID when available', async () => {
      const userRequest = {
        ...mockRequest,
        user: { id: 'user-123' },
      };

      const mockMulti = {
        incr: jest.fn().mockReturnThis(),
        pttl: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([
          [null, 1],
          [null, 60000],
        ]),
      };

      (mockRedis.multi as jest.Mock).mockReturnValue(mockMulti);

      await rateLimiter.checkRateLimit(userRequest as FastifyRequest, 'test');

      expect(mockMulti.incr).toHaveBeenCalledWith(expect.stringContaining('user:user-123'));
    });

    it('should fall back to IP address when user not available', async () => {
      const mockMulti = {
        incr: jest.fn().mockReturnThis(),
        pttl: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([
          [null, 1],
          [null, 60000],
        ]),
      };

      (mockRedis.multi as jest.Mock).mockReturnValue(mockMulti);

      await rateLimiter.checkRateLimit(mockRequest as FastifyRequest, 'test');

      expect(mockMulti.incr).toHaveBeenCalledWith(expect.stringContaining('ip:127.0.0.1'));
    });

    it('should handle Redis errors gracefully', async () => {
      const mockMulti = {
        incr: jest.fn().mockReturnThis(),
        pttl: jest.fn().mockReturnThis(),
        exec: jest.fn().mockRejectedValue(new Error('Redis error')),
      };

      (mockRedis.multi as jest.Mock).mockReturnValue(mockMulti);

      const result = await rateLimiter.checkRateLimit(mockRequest as FastifyRequest, 'test');

      // Should fail open (allow request) when Redis fails
      expect(result.limited).toBe(false);
    });

    it('should use default limiter when limiter not found', async () => {
      const mockMulti = {
        incr: jest.fn().mockReturnThis(),
        pttl: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([
          [null, 1],
          [null, 60000],
        ]),
      };

      (mockRedis.multi as jest.Mock).mockReturnValue(mockMulti);

      const result = await rateLimiter.checkRateLimit(mockRequest as FastifyRequest, 'nonexistent');

      expect(result.limited).toBe(false);
      expect(result.info.limit).toBe(100); // Default limit
    });
  });

  describe('resetRateLimit', () => {
    it('should reset rate limit for a key', async () => {
      (mockRedis.del as jest.Mock).mockResolvedValue(1);

      await rateLimiter.resetRateLimit('test-key', 'test');

      expect(mockRedis.del).toHaveBeenCalledWith(expect.stringContaining('test-key'));
    });

    it('should handle Redis errors during reset', async () => {
      (mockRedis.del as jest.Mock).mockRejectedValue(new Error('Redis error'));

      // Should not throw error
      await expect(rateLimiter.resetRateLimit('test-key', 'test')).resolves.not.toThrow();
    });
  });

  describe('getRateLimitInfo', () => {
    beforeEach(() => {
      rateLimiter.configureLimiter('test', {
        windowMs: 60000,
        maxRequests: 10,
      });
    });

    it('should return current rate limit info', async () => {
      (mockRedis.get as jest.Mock).mockResolvedValue('5');
      (mockRedis.pttl as jest.Mock).mockResolvedValue(30000);

      const info = await rateLimiter.getRateLimitInfo(mockRequest as FastifyRequest, 'test');

      expect(info.current).toBe(5);
      expect(info.remaining).toBe(5);
      expect(info.limit).toBe(10);
      expect(info.resetTime).toBeInstanceOf(Date);
    });

    it('should handle missing key', async () => {
      (mockRedis.get as jest.Mock).mockResolvedValue(null);
      (mockRedis.pttl as jest.Mock).mockResolvedValue(-1);

      const info = await rateLimiter.getRateLimitInfo(mockRequest as FastifyRequest, 'test');

      expect(info.current).toBe(0);
      expect(info.remaining).toBe(10);
      expect(info.limit).toBe(10);
    });

    it('should handle Redis errors', async () => {
      (mockRedis.get as jest.Mock).mockRejectedValue(new Error('Redis error'));

      const info = await rateLimiter.getRateLimitInfo(mockRequest as FastifyRequest, 'test');

      expect(info.current).toBe(0);
      expect(info.remaining).toBe(10);
      expect(info.limit).toBe(10);
    });
  });

  describe('default limiters', () => {
    it('should have default limiter configured', () => {
      const limiters = rateLimiter.getLimiters();
      expect(limiters.has('default')).toBe(true);
    });

    it('should have auth limiter configured', () => {
      const limiters = rateLimiter.getLimiters();
      expect(limiters.has('auth')).toBe(true);
      
      const authConfig = limiters.get('auth');
      expect(authConfig?.windowMs).toBe(15 * 60 * 1000); // 15 minutes
      expect(authConfig?.maxRequests).toBe(10);
    });

    it('should have trading limiter configured', () => {
      const limiters = rateLimiter.getLimiters();
      expect(limiters.has('trading')).toBe(true);
      
      const tradingConfig = limiters.get('trading');
      expect(tradingConfig?.maxRequests).toBe(30);
    });

    it('should have market limiter configured', () => {
      const limiters = rateLimiter.getLimiters();
      expect(limiters.has('market')).toBe(true);
      
      const marketConfig = limiters.get('market');
      expect(marketConfig?.maxRequests).toBe(300);
    });

    it('should have admin limiter configured', () => {
      const limiters = rateLimiter.getLimiters();
      expect(limiters.has('admin')).toBe(true);
      
      const adminConfig = limiters.get('admin');
      expect(adminConfig?.maxRequests).toBe(20);
    });
  });

  describe('edge cases', () => {
    it('should handle request without IP address', async () => {
      const requestWithoutIP = {
        ...mockRequest,
        ip: undefined,
      };

      const mockMulti = {
        incr: jest.fn().mockReturnThis(),
        pttl: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([
          [null, 1],
          [null, 60000],
        ]),
      };

      (mockRedis.multi as jest.Mock).mockReturnValue(mockMulti);

      await rateLimiter.checkRateLimit(requestWithoutIP as FastifyRequest, 'test');

      expect(mockMulti.incr).toHaveBeenCalledWith(expect.stringContaining('ip:unknown'));
    });

    it('should handle very high request counts', async () => {
      const mockMulti = {
        incr: jest.fn().mockReturnThis(),
        pttl: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([
          [null, 999999], // Very high count
          [null, 60000],
        ]),
      };

      (mockRedis.multi as jest.Mock).mockReturnValue(mockMulti);

      const result = await rateLimiter.checkRateLimit(mockRequest as FastifyRequest, 'test');

      expect(result.limited).toBe(true);
      expect(result.info.remaining).toBe(0); // Should not go negative
    });

    it('should handle malformed Redis responses', async () => {
      const mockMulti = {
        incr: jest.fn().mockReturnThis(),
        pttl: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([
          [new Error('Redis error'), null], // Error in response
          [null, 60000],
        ]),
      };

      (mockRedis.multi as jest.Mock).mockReturnValue(mockMulti);

      const result = await rateLimiter.checkRateLimit(mockRequest as FastifyRequest, 'test');

      // Should handle gracefully and default to allowing request
      expect(result.limited).toBe(false);
    });
  });
});