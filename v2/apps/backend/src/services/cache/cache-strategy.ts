import { redisService } from './redis-service';
import { logger } from '../../utils/logger';

export interface CacheConfig {
  ttl: number; // Time to live in seconds
  refreshThreshold?: number; // Percentage of TTL after which to refresh (0-1)
  maxStale?: number; // Maximum time to serve stale data while refreshing
  tags?: string[]; // Cache tags for invalidation
}

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
  tags?: string[];
}

export class CacheStrategy {
  private static instance: CacheStrategy;
  private refreshCallbacks: Map<string, () => Promise<any>> = new Map();
  private refreshingKeys: Set<string> = new Set();

  static getInstance(): CacheStrategy {
    if (!CacheStrategy.instance) {
      CacheStrategy.instance = new CacheStrategy();
    }
    return CacheStrategy.instance;
  }

  // Cache-aside pattern
  async get<T>(key: string, fallback?: () => Promise<T>, config?: CacheConfig): Promise<T | null> {
    try {
      // Try to get from cache first
      const cached = await redisService.getJSON<CacheEntry<T>>(key);
      
      if (cached) {
        const now = Date.now();
        const age = now - cached.timestamp;
        const maxAge = cached.ttl * 1000;
        
        // Check if cache is still valid
        if (age < maxAge) {
          // Check if we should refresh in background
          if (config?.refreshThreshold && fallback) {
            const refreshThreshold = maxAge * config.refreshThreshold;
            if (age > refreshThreshold && !this.refreshingKeys.has(key)) {
              this.backgroundRefresh(key, fallback, config);
            }
          }
          
          return cached.data;
        }
        
        // Cache expired, check if we can serve stale data while refreshing
        if (config?.maxStale && fallback) {
          const maxStaleAge = maxAge + (config.maxStale * 1000);
          if (age < maxStaleAge && !this.refreshingKeys.has(key)) {
            this.backgroundRefresh(key, fallback, config);
            return cached.data; // Serve stale data
          }
        }
      }
      
      // Cache miss or expired, get fresh data
      if (fallback) {
        const freshData = await fallback();
        if (config) {
          await this.set(key, freshData, config);
        }
        return freshData;
      }
      
      return null;
    } catch (error) {
      logger.error(`Cache get error for key ${key}:`, error);
      
      // Fallback to fresh data if cache fails
      if (fallback) {
        try {
          return await fallback();
        } catch (fallbackError) {
          logger.error(`Fallback error for key ${key}:`, fallbackError);
          return null;
        }
      }
      
      return null;
    }
  }

  async set<T>(key: string, data: T, config: CacheConfig): Promise<boolean> {
    try {
      const entry: CacheEntry<T> = {
        data,
        timestamp: Date.now(),
        ttl: config.ttl,
        tags: config.tags,
      };
      
      const success = await redisService.setJSON(key, entry, config.ttl);
      
      // Add to tag sets for invalidation
      if (config.tags && success) {
        for (const tag of config.tags) {
          await redisService.sadd(`tag:${tag}`, key);
          await redisService.expire(`tag:${tag}`, config.ttl + 3600); // Keep tags longer
        }
      }
      
      return success;
    } catch (error) {
      logger.error(`Cache set error for key ${key}:`, error);
      return false;
    }
  }

  async delete(key: string): Promise<boolean> {
    try {
      // Remove from tag sets
      const cached = await redisService.getJSON<CacheEntry<any>>(key);
      if (cached?.tags) {
        for (const tag of cached.tags) {
          await redisService.getClient().srem(`tag:${tag}`, key);
        }
      }
      
      return await redisService.delete(key);
    } catch (error) {
      logger.error(`Cache delete error for key ${key}:`, error);
      return false;
    }
  }

  // Invalidate by tags
  async invalidateByTag(tag: string): Promise<number> {
    try {
      const keys = await redisService.smembers(`tag:${tag}`);
      if (keys.length === 0) return 0;
      
      // Delete all keys with this tag
      const pipeline = redisService.getClient().pipeline();
      for (const key of keys) {
        pipeline.del(key);
      }
      
      // Delete the tag set
      pipeline.del(`tag:${tag}`);
      
      const results = await pipeline.exec();
      const deletedCount = results?.filter(([err, result]) => !err && result === 1).length || 0;
      
      logger.info(`Invalidated ${deletedCount} cache entries for tag: ${tag}`);
      return deletedCount;
    } catch (error) {
      logger.error(`Cache invalidation error for tag ${tag}:`, error);
      return 0;
    }
  }

  // Background refresh
  private async backgroundRefresh<T>(key: string, fallback: () => Promise<T>, config: CacheConfig): Promise<void> {
    if (this.refreshingKeys.has(key)) return;
    
    this.refreshingKeys.add(key);
    
    try {
      const freshData = await fallback();
      await this.set(key, freshData, config);
      logger.debug(`Background refresh completed for key: ${key}`);
    } catch (error) {
      logger.error(`Background refresh failed for key ${key}:`, error);
    } finally {
      this.refreshingKeys.delete(key);
    }
  }

  // Write-through pattern
  async writeThrough<T>(key: string, data: T, config: CacheConfig, persistFn: (data: T) => Promise<void>): Promise<boolean> {
    try {
      // Write to persistent storage first
      await persistFn(data);
      
      // Then update cache
      return await this.set(key, data, config);
    } catch (error) {
      logger.error(`Write-through error for key ${key}:`, error);
      return false;
    }
  }

  // Write-behind pattern
  async writeBehind<T>(key: string, data: T, config: CacheConfig, persistFn: (data: T) => Promise<void>): Promise<boolean> {
    try {
      // Update cache immediately
      const cacheSuccess = await this.set(key, data, config);
      
      // Schedule background persistence
      setImmediate(async () => {
        try {
          await persistFn(data);
          logger.debug(`Write-behind persistence completed for key: ${key}`);
        } catch (error) {
          logger.error(`Write-behind persistence failed for key ${key}:`, error);
        }
      });
      
      return cacheSuccess;
    } catch (error) {
      logger.error(`Write-behind error for key ${key}:`, error);
      return false;
    }
  }

  // Multi-level caching
  async getMultiLevel<T>(
    l1Key: string,
    l2Key: string,
    fallback: () => Promise<T>,
    l1Config: CacheConfig,
    l2Config: CacheConfig
  ): Promise<T | null> {
    try {
      // Try L1 cache (fast, short TTL)
      const l1Data = await this.get<T>(l1Key);
      if (l1Data) return l1Data;
      
      // Try L2 cache (slower, longer TTL)
      const l2Data = await this.get<T>(l2Key, fallback, l2Config);
      if (l2Data) {
        // Populate L1 cache
        await this.set(l1Key, l2Data, l1Config);
        return l2Data;
      }
      
      return null;
    } catch (error) {
      logger.error(`Multi-level cache error for keys ${l1Key}, ${l2Key}:`, error);
      return fallback ? await fallback() : null;
    }
  }

  // Cache warming
  async warmCache(entries: Array<{ key: string; data: any; config: CacheConfig }>): Promise<void> {
    const pipeline = redisService.getClient().pipeline();
    
    for (const entry of entries) {
      const cacheEntry: CacheEntry<any> = {
        data: entry.data,
        timestamp: Date.now(),
        ttl: entry.config.ttl,
        tags: entry.config.tags,
      };
      
      pipeline.setex(entry.key, entry.config.ttl, JSON.stringify(cacheEntry));
      
      // Add to tag sets
      if (entry.config.tags) {
        for (const tag of entry.config.tags) {
          pipeline.sadd(`tag:${tag}`, entry.key);
          pipeline.expire(`tag:${tag}`, entry.config.ttl + 3600);
        }
      }
    }
    
    try {
      await pipeline.exec();
      logger.info(`Cache warmed with ${entries.length} entries`);
    } catch (error) {
      logger.error('Cache warming failed:', error);
    }
  }

  // Cache statistics
  async getStats(): Promise<{
    totalKeys: number;
    memoryUsage: string;
    hitRate?: number;
    missRate?: number;
  }> {
    try {
      const info = await redisService.getClient().info('memory');
      const keyspace = await redisService.getClient().info('keyspace');
      
      const memoryMatch = info.match(/used_memory_human:(.+)/);
      const keyspaceMatch = keyspace.match(/db0:keys=(\d+)/);
      
      return {
        totalKeys: keyspaceMatch ? parseInt(keyspaceMatch[1]) : 0,
        memoryUsage: memoryMatch ? memoryMatch[1].trim() : 'Unknown',
      };
    } catch (error) {
      logger.error('Failed to get cache stats:', error);
      return {
        totalKeys: 0,
        memoryUsage: 'Unknown',
      };
    }
  }
}

// Export singleton instance
export const cacheStrategy = CacheStrategy.getInstance();

// Predefined cache configurations
export const CacheConfigs = {
  // Short-lived cache for frequently changing data
  SHORT: { ttl: 60, refreshThreshold: 0.8 }, // 1 minute
  
  // Medium-lived cache for moderately changing data
  MEDIUM: { ttl: 300, refreshThreshold: 0.7 }, // 5 minutes
  
  // Long-lived cache for rarely changing data
  LONG: { ttl: 3600, refreshThreshold: 0.6 }, // 1 hour
  
  // Very long-lived cache for static data
  STATIC: { ttl: 86400 }, // 24 hours
  
  // Market data specific
  MARKET_DATA: { ttl: 30, refreshThreshold: 0.9, tags: ['market'] },
  ORDER_BOOK: { ttl: 5, refreshThreshold: 0.8, tags: ['orderbook'] },
  TICKER: { ttl: 10, refreshThreshold: 0.8, tags: ['ticker'] },
  
  // User data specific
  USER_PROFILE: { ttl: 1800, tags: ['user'] }, // 30 minutes
  USER_POSITIONS: { ttl: 60, refreshThreshold: 0.8, tags: ['positions'] },
  USER_ORDERS: { ttl: 30, refreshThreshold: 0.9, tags: ['orders'] },
  
  // System data
  INSTRUMENTS: { ttl: 3600, tags: ['instruments'] },
  SYSTEM_CONFIG: { ttl: 86400, tags: ['config'] },
};