import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { cacheManager } from '../../services/cache/cache-manager';
import { cacheStrategy } from '../../services/cache/cache-strategy';
import { marketDataCache } from '../../services/cache/market-data-cache';
import { userDataCache } from '../../services/cache/user-data-cache';
import { cacheWarmingService } from '../../services/cache/cache-warming-service';
import { redisService } from '../../services/cache/redis-service';
import { logger } from '../../utils/logger';

export async function cacheRoutes(fastify: FastifyInstance) {
  // Get cache health status
  fastify.get('/health', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const health = await cacheManager.performHealthCheck();
      
      const statusCode = health.status === 'healthy' ? 200 : 
                        health.status === 'degraded' ? 206 : 503;
      
      return reply.status(statusCode).send({
        success: true,
        data: health,
      });
    } catch (error) {
      logger.error('Failed to get cache health', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      return reply.status(500).send({
        success: false,
        error: {
          code: 'CACHE_HEALTH_ERROR',
          message: 'Failed to check cache health',
        },
      });
    }
  });

  // Get cache metrics
  fastify.get('/metrics', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const [
        generalMetrics,
        categoryStats,
        warmingStats,
        marketDataStats,
      ] = await Promise.all([
        cacheManager.getMetrics(),
        cacheManager.getCacheStatsByCategory(),
        cacheWarmingService.getWarmingStats(),
        marketDataCache.getCacheStats(),
      ]);

      return reply.send({
        success: true,
        data: {
          general: generalMetrics,
          categories: categoryStats,
          warming: warmingStats,
          marketData: marketDataStats,
          timestamp: new Date(),
        },
      });
    } catch (error) {
      logger.error('Failed to get cache metrics', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      return reply.status(500).send({
        success: false,
        error: {
          code: 'CACHE_METRICS_ERROR',
          message: 'Failed to retrieve cache metrics',
        },
      });
    }
  });

  // Get cache statistics
  fastify.get('/stats', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const stats = await cacheStrategy.getStats();
      
      return reply.send({
        success: true,
        data: stats,
      });
    } catch (error) {
      logger.error('Failed to get cache stats', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      return reply.status(500).send({
        success: false,
        error: {
          code: 'CACHE_STATS_ERROR',
          message: 'Failed to retrieve cache statistics',
        },
      });
    }
  });

  // Clear cache by pattern
  fastify.delete('/clear/:pattern', {
    schema: {
      params: {
        type: 'object',
        properties: {
          pattern: { type: 'string' },
        },
        required: ['pattern'],
      },
    },
  }, async (request: FastifyRequest<{ Params: { pattern: string } }>, reply: FastifyReply) => {
    try {
      const { pattern } = request.params;
      
      // Security check - only allow certain patterns
      const allowedPatterns = [
        'orderbook:*',
        'ticker:*',
        'market_stats:*',
        'user:*',
        'positions:*',
        'balances:*',
        'instruments:*',
      ];
      
      const isAllowed = allowedPatterns.some(allowed => 
        pattern.startsWith(allowed.replace('*', ''))
      );
      
      if (!isAllowed) {
        return reply.status(403).send({
          success: false,
          error: {
            code: 'FORBIDDEN_PATTERN',
            message: 'Pattern not allowed for clearing',
          },
        });
      }
      
      const deletedCount = await cacheManager.clearCacheByPattern(pattern);
      
      return reply.send({
        success: true,
        data: {
          pattern,
          deletedCount,
          timestamp: new Date(),
        },
      });
    } catch (error) {
      logger.error('Failed to clear cache by pattern', {
        pattern: request.params.pattern,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      return reply.status(500).send({
        success: false,
        error: {
          code: 'CACHE_CLEAR_ERROR',
          message: 'Failed to clear cache',
        },
      });
    }
  });

  // Invalidate cache by tag
  fastify.delete('/invalidate/:tag', {
    schema: {
      params: {
        type: 'object',
        properties: {
          tag: { type: 'string' },
        },
        required: ['tag'],
      },
    },
  }, async (request: FastifyRequest<{ Params: { tag: string } }>, reply: FastifyReply) => {
    try {
      const { tag } = request.params;
      
      const deletedCount = await cacheStrategy.invalidateByTag(tag);
      
      return reply.send({
        success: true,
        data: {
          tag,
          deletedCount,
          timestamp: new Date(),
        },
      });
    } catch (error) {
      logger.error('Failed to invalidate cache by tag', {
        tag: request.params.tag,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      return reply.status(500).send({
        success: false,
        error: {
          code: 'CACHE_INVALIDATE_ERROR',
          message: 'Failed to invalidate cache',
        },
      });
    }
  });

  // Warm cache for specific data
  fastify.post('/warm', {
    schema: {
      body: {
        type: 'object',
        properties: {
          type: { 
            type: 'string', 
            enum: ['instruments', 'marketData', 'userData', 'systemData'] 
          },
          symbols: { 
            type: 'array', 
            items: { type: 'string' } 
          },
          userIds: { 
            type: 'array', 
            items: { type: 'string' } 
          },
        },
        required: ['type'],
      },
    },
  }, async (request: FastifyRequest<{ 
    Body: { 
      type: 'instruments' | 'marketData' | 'userData' | 'systemData';
      symbols?: string[];
      userIds?: string[];
    } 
  }>, reply: FastifyReply) => {
    try {
      const { type, symbols, userIds } = request.body;
      
      let result: any = {};
      
      switch (type) {
        case 'marketData':
          if (symbols && symbols.length > 0) {
            await marketDataCache.warmMarketDataCache(symbols);
            result = { warmedSymbols: symbols };
          } else {
            return reply.status(400).send({
              success: false,
              error: {
                code: 'MISSING_SYMBOLS',
                message: 'Symbols required for market data warming',
              },
            });
          }
          break;
          
        case 'instruments':
          // Would implement instrument cache warming
          result = { message: 'Instrument cache warming initiated' };
          break;
          
        case 'userData':
          if (userIds && userIds.length > 0) {
            // Would implement user data warming
            result = { warmedUsers: userIds };
          } else {
            return reply.status(400).send({
              success: false,
              error: {
                code: 'MISSING_USER_IDS',
                message: 'User IDs required for user data warming',
              },
            });
          }
          break;
          
        case 'systemData':
          // Would implement system data warming
          result = { message: 'System data cache warming initiated' };
          break;
      }
      
      return reply.send({
        success: true,
        data: {
          type,
          result,
          timestamp: new Date(),
        },
      });
    } catch (error) {
      logger.error('Failed to warm cache', {
        type: request.body.type,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      return reply.status(500).send({
        success: false,
        error: {
          code: 'CACHE_WARM_ERROR',
          message: 'Failed to warm cache',
        },
      });
    }
  });

  // Get user-specific cache stats
  fastify.get('/user/:userId/stats', {
    schema: {
      params: {
        type: 'object',
        properties: {
          userId: { type: 'string' },
        },
        required: ['userId'],
      },
    },
  }, async (request: FastifyRequest<{ Params: { userId: string } }>, reply: FastifyReply) => {
    try {
      const { userId } = request.params;
      
      const userStats = await userDataCache.getUserCacheStats(userId);
      
      return reply.send({
        success: true,
        data: {
          userId,
          ...userStats,
          timestamp: new Date(),
        },
      });
    } catch (error) {
      logger.error('Failed to get user cache stats', {
        userId: request.params.userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      return reply.status(500).send({
        success: false,
        error: {
          code: 'USER_CACHE_STATS_ERROR',
          message: 'Failed to retrieve user cache statistics',
        },
      });
    }
  });

  // Test cache performance
  fastify.post('/test/performance', {
    schema: {
      body: {
        type: 'object',
        properties: {
          operations: { type: 'number', minimum: 1, maximum: 1000 },
          keyPrefix: { type: 'string' },
          dataSize: { type: 'number', minimum: 1, maximum: 10000 },
        },
        required: ['operations'],
      },
    },
  }, async (request: FastifyRequest<{ 
    Body: { 
      operations: number;
      keyPrefix?: string;
      dataSize?: number;
    } 
  }>, reply: FastifyReply) => {
    try {
      const { operations, keyPrefix = 'test', dataSize = 100 } = request.body;
      
      // Generate test data
      const testData = 'x'.repeat(dataSize);
      const results = {
        operations,
        setOperations: { total: 0, average: 0, min: Infinity, max: 0 },
        getOperations: { total: 0, average: 0, min: Infinity, max: 0 },
        errors: 0,
      };
      
      // Test SET operations
      const setTimes: number[] = [];
      for (let i = 0; i < operations; i++) {
        const key = `${keyPrefix}:perf_test:${i}`;
        const startTime = Date.now();
        
        try {
          await redisService.set(key, testData, 60); // 1 minute TTL
          const duration = Date.now() - startTime;
          setTimes.push(duration);
        } catch (error) {
          results.errors++;
        }
      }
      
      // Test GET operations
      const getTimes: number[] = [];
      for (let i = 0; i < operations; i++) {
        const key = `${keyPrefix}:perf_test:${i}`;
        const startTime = Date.now();
        
        try {
          await redisService.get(key);
          const duration = Date.now() - startTime;
          getTimes.push(duration);
        } catch (error) {
          results.errors++;
        }
      }
      
      // Calculate statistics
      if (setTimes.length > 0) {
        results.setOperations.total = setTimes.reduce((a, b) => a + b, 0);
        results.setOperations.average = results.setOperations.total / setTimes.length;
        results.setOperations.min = Math.min(...setTimes);
        results.setOperations.max = Math.max(...setTimes);
      }
      
      if (getTimes.length > 0) {
        results.getOperations.total = getTimes.reduce((a, b) => a + b, 0);
        results.getOperations.average = results.getOperations.total / getTimes.length;
        results.getOperations.min = Math.min(...getTimes);
        results.getOperations.max = Math.max(...getTimes);
      }
      
      // Cleanup test data
      const cleanupPromises = [];
      for (let i = 0; i < operations; i++) {
        const key = `${keyPrefix}:perf_test:${i}`;
        cleanupPromises.push(redisService.delete(key));
      }
      await Promise.allSettled(cleanupPromises);
      
      return reply.send({
        success: true,
        data: {
          ...results,
          timestamp: new Date(),
        },
      });
    } catch (error) {
      logger.error('Failed to run cache performance test', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      return reply.status(500).send({
        success: false,
        error: {
          code: 'CACHE_PERF_TEST_ERROR',
          message: 'Failed to run performance test',
        },
      });
    }
  });
}

export default cacheRoutes;