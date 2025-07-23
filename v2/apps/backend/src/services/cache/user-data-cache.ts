import { cacheStrategy, CacheConfigs } from './cache-strategy';
import { redisService } from './redis-service';
import { logger } from '../../utils/logger';

export interface UserCacheData {
  id: string;
  email: string;
  profile: any;
  accounts: any[];
  preferences: any;
  lastLogin: Date;
}

export interface AccountCacheData {
  id: string;
  userId: string;
  name: string;
  type: string;
  isActive: boolean;
  balances: any[];
  positions: any[];
  orders: any[];
}

export class UserDataCacheService {
  private static instance: UserDataCacheService;

  static getInstance(): UserDataCacheService {
    if (!UserDataCacheService.instance) {
      UserDataCacheService.instance = new UserDataCacheService();
    }
    return UserDataCacheService.instance;
  }

  // User profile caching
  async getUserProfile(
    userId: string,
    fallback: () => Promise<UserCacheData>
  ): Promise<UserCacheData | null> {
    const key = `user:profile:${userId}`;
    
    return await cacheStrategy.get(
      key,
      fallback,
      CacheConfigs.USER_PROFILE
    );
  }

  async setUserProfile(userId: string, profile: UserCacheData): Promise<void> {
    const key = `user:profile:${userId}`;
    await cacheStrategy.set(key, profile, CacheConfigs.USER_PROFILE);
  }

  async invalidateUserProfile(userId: string): Promise<void> {
    const key = `user:profile:${userId}`;
    await cacheStrategy.delete(key);
    await cacheStrategy.invalidateByTag('user');
  }

  // User session caching
  async getUserSession(
    sessionId: string,
    fallback?: () => Promise<any>
  ): Promise<any> {
    const key = `session:${sessionId}`;
    
    return await cacheStrategy.get(
      key,
      fallback,
      { ttl: 3600, tags: ['session'] } // 1 hour
    );
  }

  async setUserSession(sessionId: string, sessionData: any): Promise<void> {
    const key = `session:${sessionId}`;
    await cacheStrategy.set(key, sessionData, { ttl: 3600, tags: ['session'] });
  }

  async invalidateUserSession(sessionId: string): Promise<void> {
    const key = `session:${sessionId}`;
    await cacheStrategy.delete(key);
  }

  // Account data caching
  async getAccountData(
    accountId: string,
    fallback: () => Promise<AccountCacheData>
  ): Promise<AccountCacheData | null> {
    const key = `account:${accountId}`;
    
    return await cacheStrategy.get(
      key,
      fallback,
      { ttl: 300, refreshThreshold: 0.8, tags: ['account'] } // 5 minutes
    );
  }

  async setAccountData(accountId: string, accountData: AccountCacheData): Promise<void> {
    const key = `account:${accountId}`;
    await cacheStrategy.set(key, accountData, { ttl: 300, tags: ['account'] });
  }

  async invalidateAccountData(accountId: string): Promise<void> {
    const key = `account:${accountId}`;
    await cacheStrategy.delete(key);
    
    // Also invalidate related data
    await Promise.all([
      this.invalidateAccountBalances(accountId),
      this.invalidateAccountPositions(accountId),
      this.invalidateAccountOrders(accountId),
    ]);
  }

  // Account balances caching
  async getAccountBalances(
    accountId: string,
    fallback: () => Promise<any[]>
  ): Promise<any[]> {
    const key = `balances:${accountId}`;
    
    return await cacheStrategy.get(
      key,
      fallback,
      { ttl: 60, refreshThreshold: 0.9, tags: ['balances', accountId] }
    ) || [];
  }

  async setAccountBalances(accountId: string, balances: any[]): Promise<void> {
    const key = `balances:${accountId}`;
    await cacheStrategy.set(key, balances, { ttl: 60, tags: ['balances', accountId] });
  }

  async invalidateAccountBalances(accountId: string): Promise<void> {
    const key = `balances:${accountId}`;
    await cacheStrategy.delete(key);
  }

  // Account positions caching
  async getAccountPositions(
    accountId: string,
    fallback: () => Promise<any[]>
  ): Promise<any[]> {
    const key = `positions:${accountId}`;
    
    return await cacheStrategy.get(
      key,
      fallback,
      CacheConfigs.USER_POSITIONS
    ) || [];
  }

  async setAccountPositions(accountId: string, positions: any[]): Promise<void> {
    const key = `positions:${accountId}`;
    await cacheStrategy.set(key, positions, CacheConfigs.USER_POSITIONS);
  }

  async invalidateAccountPositions(accountId: string): Promise<void> {
    const key = `positions:${accountId}`;
    await cacheStrategy.delete(key);
    await cacheStrategy.invalidateByTag('positions');
  }

  // Account orders caching
  async getAccountOrders(
    accountId: string,
    fallback: () => Promise<any[]>
  ): Promise<any[]> {
    const key = `orders:${accountId}`;
    
    return await cacheStrategy.get(
      key,
      fallback,
      CacheConfigs.USER_ORDERS
    ) || [];
  }

  async setAccountOrders(accountId: string, orders: any[]): Promise<void> {
    const key = `orders:${accountId}`;
    await cacheStrategy.set(key, orders, CacheConfigs.USER_ORDERS);
  }

  async invalidateAccountOrders(accountId: string): Promise<void> {
    const key = `orders:${accountId}`;
    await cacheStrategy.delete(key);
    await cacheStrategy.invalidateByTag('orders');
  }

  // User preferences caching
  async getUserPreferences(
    userId: string,
    fallback: () => Promise<any>
  ): Promise<any> {
    const key = `preferences:${userId}`;
    
    return await cacheStrategy.get(
      key,
      fallback,
      { ttl: 1800, tags: ['preferences'] } // 30 minutes
    );
  }

  async setUserPreferences(userId: string, preferences: any): Promise<void> {
    const key = `preferences:${userId}`;
    await cacheStrategy.set(key, preferences, { ttl: 1800, tags: ['preferences'] });
  }

  // Trading history caching
  async getTradingHistory(
    userId: string,
    accountId: string,
    filters: any,
    fallback: () => Promise<any[]>
  ): Promise<any[]> {
    const filterKey = JSON.stringify(filters);
    const key = `trading_history:${userId}:${accountId}:${Buffer.from(filterKey).toString('base64')}`;
    
    return await cacheStrategy.get(
      key,
      fallback,
      { ttl: 300, tags: ['trading_history', userId, accountId] }
    ) || [];
  }

  async invalidateTradingHistory(userId: string, accountId?: string): Promise<void> {
    if (accountId) {
      await cacheStrategy.invalidateByTag(accountId);
    }
    await cacheStrategy.invalidateByTag('trading_history');
    await cacheStrategy.invalidateByTag(userId);
  }

  // Portfolio summary caching
  async getPortfolioSummary(
    userId: string,
    accountId: string,
    fallback: () => Promise<any>
  ): Promise<any> {
    const key = `portfolio_summary:${userId}:${accountId}`;
    
    return await cacheStrategy.get(
      key,
      fallback,
      { ttl: 120, refreshThreshold: 0.8, tags: ['portfolio', userId, accountId] }
    );
  }

  async setPortfolioSummary(userId: string, accountId: string, summary: any): Promise<void> {
    const key = `portfolio_summary:${userId}:${accountId}`;
    await cacheStrategy.set(key, summary, { ttl: 120, tags: ['portfolio', userId, accountId] });
  }

  async invalidatePortfolioSummary(userId: string, accountId?: string): Promise<void> {
    if (accountId) {
      const key = `portfolio_summary:${userId}:${accountId}`;
      await cacheStrategy.delete(key);
    }
    await cacheStrategy.invalidateByTag('portfolio');
    await cacheStrategy.invalidateByTag(userId);
  }

  // User activity tracking
  async trackUserActivity(userId: string, activity: {
    action: string;
    resource?: string;
    timestamp: Date;
    metadata?: any;
  }): Promise<void> {
    const key = `user_activity:${userId}`;
    const maxActivities = 100;

    try {
      const activityString = JSON.stringify({
        ...activity,
        timestamp: activity.timestamp.toISOString(),
      });

      await redisService.lpush(key, activityString);
      
      // Keep only recent activities
      const currentLength = await redisService.getClient().llen(key);
      if (currentLength > maxActivities) {
        await redisService.getClient().ltrim(key, 0, maxActivities - 1);
      }

      await redisService.expire(key, 86400); // 24 hours
    } catch (error) {
      logger.error('Failed to track user activity', {
        userId,
        activity: activity.action,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async getUserActivity(userId: string, limit = 50): Promise<any[]> {
    const key = `user_activity:${userId}`;
    
    try {
      const activityStrings = await redisService.lrange(key, 0, limit - 1);
      return activityStrings.map(str => {
        const parsed = JSON.parse(str);
        return {
          ...parsed,
          timestamp: new Date(parsed.timestamp),
        };
      });
    } catch (error) {
      logger.error('Failed to get user activity', {
        userId,
        limit,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return [];
    }
  }

  // Bulk cache operations for performance
  async warmUserCache(userId: string, userData: {
    profile?: UserCacheData;
    accounts?: AccountCacheData[];
    preferences?: any;
  }): Promise<void> {
    const operations: Array<{ key: string; data: any; config: any }> = [];

    if (userData.profile) {
      operations.push({
        key: `user:profile:${userId}`,
        data: userData.profile,
        config: CacheConfigs.USER_PROFILE,
      });
    }

    if (userData.accounts) {
      for (const account of userData.accounts) {
        operations.push({
          key: `account:${account.id}`,
          data: account,
          config: { ttl: 300, tags: ['account'] },
        });
      }
    }

    if (userData.preferences) {
      operations.push({
        key: `preferences:${userId}`,
        data: userData.preferences,
        config: { ttl: 1800, tags: ['preferences'] },
      });
    }

    await cacheStrategy.warmCache(operations);
    logger.info('User cache warmed', { userId, operationsCount: operations.length });
  }

  // Cache invalidation for user logout
  async invalidateUserCache(userId: string): Promise<void> {
    logger.info('Invalidating user cache', { userId });

    // Invalidate by user tag
    await cacheStrategy.invalidateByTag(userId);

    // Invalidate specific user data
    const patterns = [
      `user:profile:${userId}`,
      `preferences:${userId}`,
      `user_activity:${userId}`,
      `portfolio_summary:${userId}:*`,
      `trading_history:${userId}:*`,
    ];

    const deletePromises = patterns.map(pattern => 
      redisService.deletePattern(pattern)
    );

    await Promise.all(deletePromises);

    logger.info('User cache invalidated', { userId });
  }

  // Get user cache statistics
  async getUserCacheStats(userId: string): Promise<{
    cachedKeys: string[];
    totalKeys: number;
    estimatedMemoryUsage: number;
  }> {
    try {
      const patterns = [
        `user:profile:${userId}`,
        `preferences:${userId}`,
        `user_activity:${userId}`,
        `portfolio_summary:${userId}:*`,
        `trading_history:${userId}:*`,
        `session:*`, // Would need to filter by user
      ];

      let allKeys: string[] = [];
      for (const pattern of patterns) {
        const keys = await redisService.keys(pattern);
        allKeys = allKeys.concat(keys);
      }

      // Estimate memory usage (rough calculation)
      let estimatedMemory = 0;
      for (const key of allKeys.slice(0, 10)) { // Sample first 10 keys
        try {
          const value = await redisService.get(key);
          if (value) {
            estimatedMemory += Buffer.byteLength(value, 'utf8');
          }
        } catch (error) {
          // Ignore individual key errors
        }
      }

      // Extrapolate to all keys
      const avgKeySize = allKeys.length > 0 ? estimatedMemory / Math.min(10, allKeys.length) : 0;
      const totalEstimatedMemory = avgKeySize * allKeys.length;

      return {
        cachedKeys: allKeys,
        totalKeys: allKeys.length,
        estimatedMemoryUsage: Math.round(totalEstimatedMemory),
      };
    } catch (error) {
      logger.error('Failed to get user cache stats', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      return {
        cachedKeys: [],
        totalKeys: 0,
        estimatedMemoryUsage: 0,
      };
    }
  }

  // Cleanup expired user data
  async cleanupExpiredUserData(): Promise<void> {
    logger.info('Starting user data cache cleanup');

    try {
      // Clean up expired sessions
      const sessionKeys = await redisService.keys('session:*');
      let cleanedSessions = 0;

      for (const key of sessionKeys) {
        const ttl = await redisService.ttl(key);
        if (ttl === -2) { // Key doesn't exist
          cleanedSessions++;
        }
      }

      // Clean up old user activities
      const activityKeys = await redisService.keys('user_activity:*');
      let cleanedActivities = 0;

      for (const key of activityKeys) {
        const length = await redisService.getClient().llen(key);
        if (length > 100) {
          await redisService.getClient().ltrim(key, 0, 99);
          cleanedActivities++;
        }
      }

      logger.info('User data cache cleanup completed', {
        cleanedSessions,
        cleanedActivities,
        totalSessionKeys: sessionKeys.length,
        totalActivityKeys: activityKeys.length,
      });
    } catch (error) {
      logger.error('User data cache cleanup failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}

// Export singleton instance
export const userDataCache = UserDataCacheService.getInstance();