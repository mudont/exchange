import { cacheStrategy } from './cache-strategy';
import { marketDataCache } from './market-data-cache';
import { userDataCache } from './user-data-cache';
import { redisService } from './redis-service';
import { prisma } from '../../database';
import { logger } from '../../utils/logger';
import { Decimal } from 'decimal.js';

export interface CacheWarmingConfig {
  instruments: {
    enabled: boolean;
    batchSize: number;
    intervalMs: number;
  };
  marketData: {
    enabled: boolean;
    topSymbols: number;
    intervalMs: number;
  };
  userData: {
    enabled: boolean;
    activeUserThreshold: number; // minutes since last activity
    batchSize: number;
    intervalMs: number;
  };
  systemData: {
    enabled: boolean;
    intervalMs: number;
  };
}

export class CacheWarmingService {
  private static instance: CacheWarmingService;
  private warmingIntervals: Map<string, NodeJS.Timeout> = new Map();
  private isWarming: Map<string, boolean> = new Map();

  private config: CacheWarmingConfig = {
    instruments: {
      enabled: true,
      batchSize: 50,
      intervalMs: 5 * 60 * 1000, // 5 minutes
    },
    marketData: {
      enabled: true,
      topSymbols: 20,
      intervalMs: 30 * 1000, // 30 seconds
    },
    userData: {
      enabled: true,
      activeUserThreshold: 60, // 1 hour
      batchSize: 100,
      intervalMs: 10 * 60 * 1000, // 10 minutes
    },
    systemData: {
      enabled: true,
      intervalMs: 15 * 60 * 1000, // 15 minutes
    },
  };

  static getInstance(): CacheWarmingService {
    if (!CacheWarmingService.instance) {
      CacheWarmingService.instance = new CacheWarmingService();
    }
    return CacheWarmingService.instance;
  }

  // Start all cache warming processes
  async startCacheWarming(customConfig?: Partial<CacheWarmingConfig>): Promise<void> {
    if (customConfig) {
      this.config = { ...this.config, ...customConfig };
    }

    logger.info('Starting cache warming service', { config: this.config });

    // Initial warming
    await this.performInitialWarming();

    // Schedule periodic warming
    if (this.config.instruments.enabled) {
      this.scheduleInstrumentWarming();
    }

    if (this.config.marketData.enabled) {
      this.scheduleMarketDataWarming();
    }

    if (this.config.userData.enabled) {
      this.scheduleUserDataWarming();
    }

    if (this.config.systemData.enabled) {
      this.scheduleSystemDataWarming();
    }

    logger.info('Cache warming service started successfully');
  }

  // Stop all cache warming processes
  async stopCacheWarming(): Promise<void> {
    logger.info('Stopping cache warming service');

    for (const [name, interval] of this.warmingIntervals) {
      clearInterval(interval);
      logger.debug('Stopped warming interval', { name });
    }

    this.warmingIntervals.clear();
    this.isWarming.clear();

    logger.info('Cache warming service stopped');
  }

  // Perform initial cache warming on startup
  private async performInitialWarming(): Promise<void> {
    logger.info('Performing initial cache warming');

    const startTime = Date.now();

    try {
      await Promise.all([
        this.warmInstrumentCache(),
        this.warmSystemDataCache(),
        this.warmTopMarketData(),
      ]);

      const duration = Date.now() - startTime;
      logger.info('Initial cache warming completed', { durationMs: duration });
    } catch (error) {
      logger.error('Initial cache warming failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // Warm instrument cache
  private async warmInstrumentCache(): Promise<void> {
    if (this.isWarming.get('instruments')) return;
    this.isWarming.set('instruments', true);

    try {
      logger.debug('Warming instrument cache');

      // Get active instruments
      const instruments = await prisma.instrument.findMany({
        where: { isActive: true },
        take: this.config.instruments.batchSize,
        orderBy: { symbol: 'asc' },
      });

      // Warm individual instrument cache
      const warmingPromises = instruments.map(async (instrument) => {
        const key = `instrument:${instrument.symbol}`;
        await cacheStrategy.set(key, instrument, { ttl: 300, tags: ['instruments'] });
      });

      await Promise.allSettled(warmingPromises);

      // Warm instruments list cache
      await cacheStrategy.set(
        'instruments:all:{}',
        instruments,
        { ttl: 120, tags: ['instruments'] }
      );

      // Warm instrument stats
      const stats = await this.calculateInstrumentStats(instruments);
      await cacheStrategy.set(
        'instrument_stats',
        stats,
        { ttl: 300, tags: ['instruments'] }
      );

      logger.debug('Instrument cache warmed', { count: instruments.length });
    } catch (error) {
      logger.error('Failed to warm instrument cache', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      this.isWarming.set('instruments', false);
    }
  }

  // Warm market data cache for top symbols
  private async warmTopMarketData(): Promise<void> {
    if (this.isWarming.get('marketData')) return;
    this.isWarming.set('marketData', true);

    try {
      logger.debug('Warming market data cache');

      // Get top symbols by trading volume
      const topSymbols = await this.getTopTradingSymbols(this.config.marketData.topSymbols);

      // Warm market data for each symbol
      const warmingPromises = topSymbols.map(async (symbol) => {
        try {
          // Warm ticker data
          const ticker = await this.generateTickerData(symbol);
          await marketDataCache.setTicker(symbol, ticker);

          // Warm market stats
          const stats = await this.generateMarketStats(symbol);
          const statsKey = `market_stats:${symbol}`;
          await cacheStrategy.set(statsKey, stats, { ttl: 60, tags: ['market_stats', symbol] });

          // Warm recent trades
          const recentTrades = await this.getRecentTrades(symbol, 50);
          await marketDataCache.cacheRecentTrades(symbol, recentTrades);

        } catch (error) {
          logger.error('Failed to warm market data for symbol', {
            symbol,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      });

      await Promise.allSettled(warmingPromises);

      logger.debug('Market data cache warmed', { symbolsCount: topSymbols.length });
    } catch (error) {
      logger.error('Failed to warm market data cache', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      this.isWarming.set('marketData', false);
    }
  }

  // Warm user data cache for active users
  private async warmActiveUserData(): Promise<void> {
    if (this.isWarming.get('userData')) return;
    this.isWarming.set('userData', true);

    try {
      logger.debug('Warming user data cache');

      // Get recently active users
      const thresholdTime = new Date(Date.now() - this.config.userData.activeUserThreshold * 60 * 1000);
      
      const activeUsers = await prisma.user.findMany({
        where: {
          lastLoginAt: { gte: thresholdTime },
        },
        take: this.config.userData.batchSize,
        include: {
          accounts: {
            where: { isActive: true },
            include: {
              balances: true,
            },
          },
        },
      });

      // Warm user data
      const warmingPromises = activeUsers.map(async (user) => {
        try {
          // Warm user profile
          const userProfile = {
            id: user.id,
            email: user.email,
            profile: user.profile,
            accounts: user.accounts,
            preferences: user.preferences || {},
            lastLogin: user.lastLoginAt || new Date(),
          };

          await userDataCache.setUserProfile(user.id, userProfile);

          // Warm account data for each user account
          for (const account of user.accounts) {
            const accountData = {
              id: account.id,
              userId: user.id,
              name: account.name,
              type: account.type,
              isActive: account.isActive,
              balances: account.balances,
              positions: [], // Would load if needed
              orders: [], // Would load if needed
            };

            await userDataCache.setAccountData(account.id, accountData);
            await userDataCache.setAccountBalances(account.id, account.balances);
          }

        } catch (error) {
          logger.error('Failed to warm user data', {
            userId: user.id,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      });

      await Promise.allSettled(warmingPromises);

      logger.debug('User data cache warmed', { usersCount: activeUsers.length });
    } catch (error) {
      logger.error('Failed to warm user data cache', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      this.isWarming.set('userData', false);
    }
  }

  // Warm system data cache
  private async warmSystemDataCache(): Promise<void> {
    if (this.isWarming.get('systemData')) return;
    this.isWarming.set('systemData', true);

    try {
      logger.debug('Warming system data cache');

      // Warm system configuration
      const systemConfig = {
        tradingHours: { start: '09:00', end: '16:00' },
        maintenanceMode: false,
        maxOrderSize: 1000000,
        minOrderSize: 1,
        supportedCurrencies: ['USD', 'EUR', 'GBP'],
        feeTiers: [
          { volume: 0, makerFee: 0.001, takerFee: 0.002 },
          { volume: 100000, makerFee: 0.0008, takerFee: 0.0015 },
        ],
      };

      await cacheStrategy.set(
        'system_config',
        systemConfig,
        { ttl: 86400, tags: ['config'] }
      );

      // Warm API rate limits
      const rateLimits = {
        default: { requests: 1000, windowMs: 60000 },
        trading: { requests: 100, windowMs: 60000 },
        marketData: { requests: 5000, windowMs: 60000 },
      };

      await cacheStrategy.set(
        'rate_limits',
        rateLimits,
        { ttl: 3600, tags: ['config'] }
      );

      logger.debug('System data cache warmed');
    } catch (error) {
      logger.error('Failed to warm system data cache', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      this.isWarming.set('systemData', false);
    }
  }

  // Schedule periodic warming
  private scheduleInstrumentWarming(): void {
    const interval = setInterval(async () => {
      await this.warmInstrumentCache();
    }, this.config.instruments.intervalMs);

    this.warmingIntervals.set('instruments', interval);
    logger.debug('Scheduled instrument cache warming', { intervalMs: this.config.instruments.intervalMs });
  }

  private scheduleMarketDataWarming(): void {
    const interval = setInterval(async () => {
      await this.warmTopMarketData();
    }, this.config.marketData.intervalMs);

    this.warmingIntervals.set('marketData', interval);
    logger.debug('Scheduled market data cache warming', { intervalMs: this.config.marketData.intervalMs });
  }

  private scheduleUserDataWarming(): void {
    const interval = setInterval(async () => {
      await this.warmActiveUserData();
    }, this.config.userData.intervalMs);

    this.warmingIntervals.set('userData', interval);
    logger.debug('Scheduled user data cache warming', { intervalMs: this.config.userData.intervalMs });
  }

  private scheduleSystemDataWarming(): void {
    const interval = setInterval(async () => {
      await this.warmSystemDataCache();
    }, this.config.systemData.intervalMs);

    this.warmingIntervals.set('systemData', interval);
    logger.debug('Scheduled system data cache warming', { intervalMs: this.config.systemData.intervalMs });
  }

  // Helper methods
  private async getTopTradingSymbols(limit: number): Promise<string[]> {
    const result = await prisma.trade.groupBy({
      by: ['instrumentSymbol'],
      _count: { id: true },
      _sum: { quantity: true },
      where: {
        timestamp: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
        },
      },
      orderBy: {
        _count: { id: 'desc' },
      },
      take: limit,
    });

    return result.map(r => r.instrumentSymbol);
  }

  private async generateTickerData(symbol: string): Promise<any> {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Get last trade
    const lastTrade = await prisma.trade.findFirst({
      where: { instrumentSymbol: symbol },
      orderBy: { timestamp: 'desc' },
    });

    // Get 24h statistics
    const trades24h = await prisma.trade.findMany({
      where: {
        instrumentSymbol: symbol,
        timestamp: { gte: yesterday },
      },
      orderBy: { timestamp: 'asc' },
    });

    let volume24h = new Decimal(0);
    let high24h: Decimal | undefined;
    let low24h: Decimal | undefined;
    let priceChange24h = new Decimal(0);
    let priceChangePercent24h = new Decimal(0);

    if (trades24h.length > 0) {
      volume24h = trades24h.reduce((sum, trade) => {
        return sum.add(new Decimal(trade.quantity).mul(new Decimal(trade.price)));
      }, new Decimal(0));

      const prices = trades24h.map(t => new Decimal(t.price));
      high24h = Decimal.max(...prices);
      low24h = Decimal.min(...prices);

      const firstPrice = new Decimal(trades24h[0].price);
      const lastPrice = lastTrade ? new Decimal(lastTrade.price) : firstPrice;
      
      priceChange24h = lastPrice.sub(firstPrice);
      priceChangePercent24h = firstPrice.isZero() ? new Decimal(0) : priceChange24h.div(firstPrice).mul(100);
    }

    return {
      symbol,
      lastPrice: lastTrade ? new Decimal(lastTrade.price) : undefined,
      volume24h,
      priceChange24h,
      priceChangePercent24h,
      high24h,
      low24h,
      timestamp: now,
    };
  }

  private async generateMarketStats(symbol: string): Promise<any> {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [trades24h, trades7d, totalTrades] = await Promise.all([
      prisma.trade.count({
        where: { instrumentSymbol: symbol, timestamp: { gte: oneDayAgo } },
      }),
      prisma.trade.count({
        where: { instrumentSymbol: symbol, timestamp: { gte: oneWeekAgo } },
      }),
      prisma.trade.count({
        where: { instrumentSymbol: symbol },
      }),
    ]);

    return {
      symbol,
      trades24h,
      trades7d,
      totalTrades,
      timestamp: now,
    };
  }

  private async getRecentTrades(symbol: string, limit: number): Promise<any[]> {
    return await prisma.trade.findMany({
      where: { instrumentSymbol: symbol },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });
  }

  private async calculateInstrumentStats(instruments: any[]): Promise<any> {
    const instrumentsByType: Record<string, number> = {};
    let activeCount = 0;

    for (const instrument of instruments) {
      if (instrument.isActive) activeCount++;
      instrumentsByType[instrument.type] = (instrumentsByType[instrument.type] || 0) + 1;
    }

    // Find expiring instruments
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const expiringInstruments = instruments
      .filter(i => i.expirationDate && i.expirationDate <= thirtyDaysFromNow)
      .map(i => ({
        symbol: i.symbol,
        name: i.name,
        expirationDate: i.expirationDate,
        daysToExpiry: Math.ceil((i.expirationDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
      }))
      .sort((a, b) => a.daysToExpiry - b.daysToExpiry);

    return {
      totalInstruments: instruments.length,
      activeInstruments: activeCount,
      instrumentsByType,
      expiringInstruments,
    };
  }

  // Get warming service statistics
  async getWarmingStats(): Promise<{
    activeWarmingProcesses: string[];
    nextWarmingTimes: Record<string, Date>;
    cacheHitRates: Record<string, number>;
    totalWarmedKeys: number;
  }> {
    const activeProcesses = Array.from(this.isWarming.entries())
      .filter(([, isActive]) => isActive)
      .map(([name]) => name);

    const nextWarmingTimes: Record<string, Date> = {};
    for (const [name, interval] of this.warmingIntervals) {
      // This is approximate - would need to track actual next execution times
      const config = this.config[name as keyof CacheWarmingConfig] as any;
      if (config?.intervalMs) {
        nextWarmingTimes[name] = new Date(Date.now() + config.intervalMs);
      }
    }

    // Get cache statistics
    const cacheStats = await cacheStrategy.getStats();

    return {
      activeWarmingProcesses: activeProcesses,
      nextWarmingTimes,
      cacheHitRates: {}, // Would need to implement hit rate tracking
      totalWarmedKeys: cacheStats.totalKeys,
    };
  }
}

// Export singleton instance
export const cacheWarmingService = CacheWarmingService.getInstance();