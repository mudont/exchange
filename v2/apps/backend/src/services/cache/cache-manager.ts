import { cacheStrategy } from './cache-strategy';
import { marketDataCache } from './market-data-cache';
import { userDataCache } from './user-data-cache';
import { cacheWarmingService } from './cache-warming-service';
import { redisService } from './redis-service';
import { logger } from '../../utils/logger';
import { EventEmitter } from 'events';

export interface CacheInvalidationEvent {
  type: 'ORDER_PLACED' | 'TRADE_EXECUTED' | 'POSITION_UPDATED' | 'BALANCE_CHANGED' | 'USER_LOGIN' | 'USER_LOGOUT';
  userId?: string;
  accountId?: string;
  instrumentSymbol?: string;
  metadata?: any;
  timestamp: Date;
}

export interface CacheMetrics {
  hitRate: number;
  missRate: number;
  totalRequests: number;
  averageResponseTime: number;
  memoryUsage: string;
  keyCount: number;
  evictionCount: number;
  connectionStatus: 'connected' | 'disconnected' | 'error';
}

export interface CacheHealthCheck {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: {
    redis: boolean;
    memory: boolean;
    performance: boolean;
  };
  metrics: CacheMetrics;
  issues: string[];
}

export class CacheManager extends EventEmitter {
  private static instance: CacheManager;
  private metricsCollector: NodeJS.Timeout | null = null;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private metrics: CacheMetrics = {
    hitRate: 0,
    missRate: 0,
    totalRequests: 0,
    averageResponseTime: 0,
    memoryUsage: '0B',
    keyCount: 0,
    evictionCount: 0,
    connectionStatus: 'disconnected',
  };

  static getInstance(): CacheManager {
    if (!CacheManager.instance) {
      CacheManager.instance = new CacheManager();
    }
    return CacheManager.instance;
  }

  // Initialize cache management
  async initialize(): Promise<void> {
    logger.info('Initializing cache manager');

    try {
      // Connect to Redis
      await redisService.connect();
      this.metrics.connectionStatus = 'connected';

      // Start cache warming
      await cacheWarmingService.startCacheWarming();

      // Start metrics collection
      this.startMetricsCollection();

      // Start health monitoring
      this.startHealthMonitoring();

      // Set up event listeners for cache invalidation
      this.setupEventListeners();

      logger.info('Cache manager initialized successfully');
    } catch (error) {
      this.metrics.connectionStatus = 'error';
      logger.error('Failed to initialize cache manager', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  // Shutdown cache management
  async shutdown(): Promise<void> {
    logger.info('Shutting down cache manager');

    // Stop intervals
    if (this.metricsCollector) {
      clearInterval(this.metricsCollector);
    }
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    // Stop cache warming
    await cacheWarmingService.stopCacheWarming();

    // Disconnect from Redis
    await redisService.disconnect();
    this.metrics.connectionStatus = 'disconnected';

    logger.info('Cache manager shut down successfully');
  }

  // Handle cache invalidation events
  async handleInvalidationEvent(event: CacheInvalidationEvent): Promise<void> {
    logger.debug('Handling cache invalidation event', {
      type: event.type,
      userId: event.userId,
      accountId: event.accountId,
      instrumentSymbol: event.instrumentSymbol,
    });

    try {
      switch (event.type) {
        case 'ORDER_PLACED':
          await this.invalidateOrderRelatedCache(event);
          break;
        case 'TRADE_EXECUTED':
          await this.invalidateTradeRelatedCache(event);
          break;
        case 'POSITION_UPDATED':
          await this.invalidatePositionRelatedCache(event);
          break;
        case 'BALANCE_CHANGED':
          await this.invalidateBalanceRelatedCache(event);
          break;
        case 'USER_LOGIN':
          await this.handleUserLogin(event);
          break;
        case 'USER_LOGOUT':
          await this.handleUserLogout(event);
          break;
      }

      this.emit('invalidation_completed', event);
    } catch (error) {
      logger.error('Failed to handle invalidation event', {
        event,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      this.emit('invalidation_failed', event, error);
    }
  }

  // Get cache performance metrics
  getMetrics(): CacheMetrics {
    return { ...this.metrics };
  }

  // Perform cache health check
  async performHealthCheck(): Promise<CacheHealthCheck> {
    const issues: string[] = [];
    const checks = {
      redis: false,
      memory: false,
      performance: false,
    };

    try {
      // Check Redis connection
      checks.redis = await redisService.ping();
      if (!checks.redis) {
        issues.push('Redis connection failed');
      }

      // Check memory usage
      const stats = await cacheStrategy.getStats();
      const memoryUsageBytes = this.parseMemoryUsage(stats.memoryUsage);
      const maxMemoryBytes = 1024 * 1024 * 1024; // 1GB limit
      checks.memory = memoryUsageBytes < maxMemoryBytes * 0.9; // 90% threshold
      if (!checks.memory) {
        issues.push(`High memory usage: ${stats.memoryUsage}`);
      }

      // Check performance
      checks.performance = this.metrics.averageResponseTime < 100; // 100ms threshold
      if (!checks.performance) {
        issues.push(`Slow response time: ${this.metrics.averageResponseTime}ms`);
      }

      // Update metrics
      await this.updateMetrics();

      const status = issues.length === 0 ? 'healthy' : 
                   issues.length <= 1 ? 'degraded' : 'unhealthy';

      return {
        status,
        checks,
        metrics: this.metrics,
        issues,
      };
    } catch (error) {
      logger.error('Health check failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        status: 'unhealthy',
        checks,
        metrics: this.metrics,
        issues: [...issues, 'Health check system error'],
      };
    }
  }

  // Clear all cache data
  async clearAllCache(): Promise<void> {
    logger.warn('Clearing all cache data');

    try {
      await redisService.flushCache();
      logger.info('All cache data cleared');
      this.emit('cache_cleared');
    } catch (error) {
      logger.error('Failed to clear cache', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  // Clear cache by pattern
  async clearCacheByPattern(pattern: string): Promise<number> {
    logger.info('Clearing cache by pattern', { pattern });

    try {
      const deletedCount = await redisService.deletePattern(pattern);
      logger.info('Cache cleared by pattern', { pattern, deletedCount });
      this.emit('cache_pattern_cleared', pattern, deletedCount);
      return deletedCount;
    } catch (error) {
      logger.error('Failed to clear cache by pattern', {
        pattern,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  // Get cache statistics by category
  async getCacheStatsByCategory(): Promise<{
    marketData: { keys: number; memoryUsage: number };
    userData: { keys: number; memoryUsage: number };
    instruments: { keys: number; memoryUsage: number };
    system: { keys: number; memoryUsage: number };
  }> {
    const categories = {
      marketData: ['orderbook:*', 'ticker:*', 'market_stats:*', 'recent_trades:*'],
      userData: ['user:*', 'session:*', 'positions:*', 'balances:*', 'orders:*'],
      instruments: ['instrument:*', 'instruments:*'],
      system: ['system_*', 'rate_limits', 'risk_limits:*'],
    };

    const stats = {
      marketData: { keys: 0, memoryUsage: 0 },
      userData: { keys: 0, memoryUsage: 0 },
      instruments: { keys: 0, memoryUsage: 0 },
      system: { keys: 0, memoryUsage: 0 },
    };

    for (const [category, patterns] of Object.entries(categories)) {
      for (const pattern of patterns) {
        try {
          const keys = await redisService.keys(pattern);
          stats[category as keyof typeof stats].keys += keys.length;

          // Estimate memory usage (sample first 10 keys)
          for (const key of keys.slice(0, 10)) {
            try {
              const value = await redisService.get(key);
              if (value) {
                stats[category as keyof typeof stats].memoryUsage += Buffer.byteLength(value, 'utf8');
              }
            } catch (error) {
              // Ignore individual key errors
            }
          }
        } catch (error) {
          logger.error('Failed to get stats for pattern', {
            category,
            pattern,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
    }

    return stats;
  }

  // Private methods
  private async invalidateOrderRelatedCache(event: CacheInvalidationEvent): Promise<void> {
    const { userId, accountId, instrumentSymbol } = event;

    const invalidationPromises: Promise<any>[] = [];

    if (accountId) {
      invalidationPromises.push(userDataCache.invalidateAccountOrders(accountId));
    }

    if (instrumentSymbol) {
      invalidationPromises.push(marketDataCache.invalidateMarketData(instrumentSymbol));
    }

    if (userId) {
      invalidationPromises.push(cacheStrategy.invalidateByTag(userId));
    }

    await Promise.allSettled(invalidationPromises);
  }

  private async invalidateTradeRelatedCache(event: CacheInvalidationEvent): Promise<void> {
    const { userId, accountId, instrumentSymbol } = event;

    const invalidationPromises: Promise<any>[] = [];

    if (accountId) {
      invalidationPromises.push(
        userDataCache.invalidateAccountPositions(accountId),
        userDataCache.invalidateAccountBalances(accountId),
        userDataCache.invalidatePortfolioSummary(userId!, accountId),
        userDataCache.invalidateTradingHistory(userId!, accountId)
      );
    }

    if (instrumentSymbol) {
      invalidationPromises.push(marketDataCache.invalidateMarketData(instrumentSymbol));
    }

    if (userId) {
      invalidationPromises.push(cacheStrategy.invalidateByTag(userId));
    }

    // Invalidate market data tags
    invalidationPromises.push(
      cacheStrategy.invalidateByTag('market'),
      cacheStrategy.invalidateByTag('positions'),
      cacheStrategy.invalidateByTag('portfolio')
    );

    await Promise.allSettled(invalidationPromises);
  }

  private async invalidatePositionRelatedCache(event: CacheInvalidationEvent): Promise<void> {
    const { userId, accountId } = event;

    if (accountId && userId) {
      await Promise.allSettled([
        userDataCache.invalidateAccountPositions(accountId),
        userDataCache.invalidatePortfolioSummary(userId, accountId),
        cacheStrategy.invalidateByTag('positions'),
        cacheStrategy.invalidateByTag('portfolio'),
      ]);
    }
  }

  private async invalidateBalanceRelatedCache(event: CacheInvalidationEvent): Promise<void> {
    const { userId, accountId } = event;

    if (accountId && userId) {
      await Promise.allSettled([
        userDataCache.invalidateAccountBalances(accountId),
        userDataCache.invalidatePortfolioSummary(userId, accountId),
        cacheStrategy.invalidateByTag('balances'),
      ]);
    }
  }

  private async handleUserLogin(event: CacheInvalidationEvent): Promise<void> {
    const { userId } = event;

    if (userId) {
      // Warm user cache on login
      try {
        // This would typically load user data and warm the cache
        logger.debug('User logged in, warming cache', { userId });
        // Implementation would depend on your user data structure
      } catch (error) {
        logger.error('Failed to warm user cache on login', {
          userId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  }

  private async handleUserLogout(event: CacheInvalidationEvent): Promise<void> {
    const { userId } = event;

    if (userId) {
      await userDataCache.invalidateUserCache(userId);
    }
  }

  private startMetricsCollection(): void {
    this.metricsCollector = setInterval(async () => {
      await this.updateMetrics();
    }, 30000); // Update every 30 seconds
  }

  private startHealthMonitoring(): void {
    this.healthCheckInterval = setInterval(async () => {
      const health = await this.performHealthCheck();
      
      if (health.status === 'unhealthy') {
        logger.error('Cache system unhealthy', { health });
        this.emit('health_degraded', health);
      } else if (health.status === 'degraded') {
        logger.warn('Cache system degraded', { health });
        this.emit('health_degraded', health);
      }
    }, 60000); // Check every minute
  }

  private async updateMetrics(): Promise<void> {
    try {
      const stats = await cacheStrategy.getStats();
      
      this.metrics = {
        ...this.metrics,
        memoryUsage: stats.memoryUsage,
        keyCount: stats.totalKeys,
        connectionStatus: await redisService.ping() ? 'connected' : 'disconnected',
      };
    } catch (error) {
      logger.error('Failed to update metrics', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  private setupEventListeners(): void {
    // Listen for cache events and emit metrics
    this.on('invalidation_completed', () => {
      this.metrics.totalRequests++;
    });

    this.on('invalidation_failed', () => {
      this.metrics.totalRequests++;
    });
  }

  private parseMemoryUsage(memoryString: string): number {
    const match = memoryString.match(/^([\d.]+)([KMGT]?)B?$/i);
    if (!match) return 0;

    const value = parseFloat(match[1]);
    const unit = match[2].toUpperCase();

    const multipliers: Record<string, number> = {
      '': 1,
      'K': 1024,
      'M': 1024 * 1024,
      'G': 1024 * 1024 * 1024,
      'T': 1024 * 1024 * 1024 * 1024,
    };

    return value * (multipliers[unit] || 1);
  }
}

// Export singleton instance
export const cacheManager = CacheManager.getInstance();