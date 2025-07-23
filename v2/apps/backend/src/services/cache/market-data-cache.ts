import { Decimal } from 'decimal.js';
import { cacheStrategy, CacheConfigs } from './cache-strategy';
import { redisService } from './redis-service';
import { logger } from '../../utils/logger';
import { OrderBookSnapshot, OrderBookDelta } from '../trading/order-book';

export interface MarketDataCache {
  orderBookSnapshot: OrderBookSnapshot;
  lastTrade?: {
    price: Decimal;
    quantity: Decimal;
    timestamp: Date;
  };
  ticker: {
    symbol: string;
    lastPrice: Decimal;
    bestBid?: Decimal;
    bestAsk?: Decimal;
    volume24h: Decimal;
    priceChange24h: Decimal;
    priceChangePercent24h: Decimal;
    high24h?: Decimal;
    low24h?: Decimal;
    timestamp: Date;
  };
}

export class MarketDataCacheService {
  private static instance: MarketDataCacheService;

  static getInstance(): MarketDataCacheService {
    if (!MarketDataCacheService.instance) {
      MarketDataCacheService.instance = new MarketDataCacheService();
    }
    return MarketDataCacheService.instance;
  }

  // Order book caching with multi-level strategy
  async getOrderBookSnapshot(
    symbol: string,
    fallback: () => Promise<OrderBookSnapshot>
  ): Promise<OrderBookSnapshot> {
    const l1Key = `orderbook:snapshot:${symbol}:l1`;
    const l2Key = `orderbook:snapshot:${symbol}:l2`;

    return await cacheStrategy.getMultiLevel(
      l1Key,
      l2Key,
      fallback,
      { ttl: 2, refreshThreshold: 0.9, tags: ['orderbook', symbol] }, // L1: 2 seconds
      { ttl: 10, refreshThreshold: 0.8, tags: ['orderbook', symbol] }  // L2: 10 seconds
    ) || await fallback();
  }

  async setOrderBookSnapshot(symbol: string, snapshot: OrderBookSnapshot): Promise<void> {
    const l1Key = `orderbook:snapshot:${symbol}:l1`;
    const l2Key = `orderbook:snapshot:${symbol}:l2`;

    await Promise.all([
      cacheStrategy.set(l1Key, snapshot, { ttl: 2, tags: ['orderbook', symbol] }),
      cacheStrategy.set(l2Key, snapshot, { ttl: 10, tags: ['orderbook', symbol] }),
    ]);
  }

  // Order book delta caching for real-time updates
  async cacheOrderBookDelta(symbol: string, delta: OrderBookDelta): Promise<void> {
    const key = `orderbook:delta:${symbol}`;
    const maxDeltas = 100;

    try {
      // Store deltas in a list for replay capability
      const deltaString = JSON.stringify({
        ...delta,
        timestamp: delta.timestamp.toISOString(),
      });

      await redisService.lpush(key, deltaString);
      
      // Keep only the last N deltas
      const currentLength = await redisService.getClient().llen(key);
      if (currentLength > maxDeltas) {
        await redisService.getClient().ltrim(key, 0, maxDeltas - 1);
      }

      // Set expiration
      await redisService.expire(key, 300); // 5 minutes

      logger.debug('Order book delta cached', {
        symbol,
        sequence: delta.sequence,
        changesCount: delta.changes.length,
      });
    } catch (error) {
      logger.error('Failed to cache order book delta', {
        symbol,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async getOrderBookDeltas(symbol: string, fromSequence?: number): Promise<OrderBookDelta[]> {
    const key = `orderbook:delta:${symbol}`;
    
    try {
      const deltaStrings = await redisService.lrange(key, 0, -1);
      const deltas = deltaStrings
        .map(str => {
          const parsed = JSON.parse(str);
          return {
            ...parsed,
            timestamp: new Date(parsed.timestamp),
          };
        })
        .filter(delta => !fromSequence || delta.sequence > fromSequence)
        .sort((a, b) => a.sequence - b.sequence);

      return deltas;
    } catch (error) {
      logger.error('Failed to get order book deltas', {
        symbol,
        fromSequence,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return [];
    }
  }

  // Ticker data caching
  async getTicker(
    symbol: string,
    fallback: () => Promise<any>
  ): Promise<any> {
    const key = `ticker:${symbol}`;
    
    return await cacheStrategy.get(
      key,
      fallback,
      CacheConfigs.TICKER
    );
  }

  async setTicker(symbol: string, ticker: any): Promise<void> {
    const key = `ticker:${symbol}`;
    await cacheStrategy.set(key, ticker, CacheConfigs.TICKER);
  }

  // Market statistics caching
  async getMarketStats(
    symbol: string,
    fallback: () => Promise<any>
  ): Promise<any> {
    const key = `market_stats:${symbol}`;
    
    return await cacheStrategy.get(
      key,
      fallback,
      { ttl: 60, refreshThreshold: 0.8, tags: ['market_stats', symbol] }
    );
  }

  // Price history caching
  async getPriceHistory(
    symbol: string,
    period: string,
    fallback: () => Promise<any[]>
  ): Promise<any[]> {
    const key = `price_history:${symbol}:${period}`;
    
    return await cacheStrategy.get(
      key,
      fallback,
      { ttl: 300, refreshThreshold: 0.7, tags: ['price_history', symbol] }
    ) || [];
  }

  // Trade feed caching
  async cacheRecentTrades(symbol: string, trades: any[]): Promise<void> {
    const key = `recent_trades:${symbol}`;
    const maxTrades = 100;

    try {
      // Clear existing trades
      await redisService.delete(key);

      // Store recent trades
      if (trades.length > 0) {
        const tradeStrings = trades
          .slice(-maxTrades)
          .map(trade => JSON.stringify({
            ...trade,
            timestamp: trade.timestamp.toISOString(),
          }));

        await redisService.lpush(key, ...tradeStrings);
        await redisService.expire(key, 3600); // 1 hour
      }
    } catch (error) {
      logger.error('Failed to cache recent trades', {
        symbol,
        tradesCount: trades.length,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async getRecentTrades(symbol: string, limit = 50): Promise<any[]> {
    const key = `recent_trades:${symbol}`;
    
    try {
      const tradeStrings = await redisService.lrange(key, 0, limit - 1);
      return tradeStrings.map(str => {
        const parsed = JSON.parse(str);
        return {
          ...parsed,
          timestamp: new Date(parsed.timestamp),
        };
      });
    } catch (error) {
      logger.error('Failed to get recent trades', {
        symbol,
        limit,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return [];
    }
  }

  // Market data warming for active instruments
  async warmMarketDataCache(symbols: string[]): Promise<void> {
    logger.info('Warming market data cache', { symbolsCount: symbols.length });

    const warmingPromises = symbols.map(async (symbol) => {
      try {
        // Warm order book snapshot cache
        const orderBookKey = `orderbook:snapshot:${symbol}:l2`;
        const existingOrderBook = await redisService.getJSON(orderBookKey);
        
        if (!existingOrderBook) {
          // Create empty order book as placeholder
          const emptyOrderBook: OrderBookSnapshot = {
            symbol,
            bids: [],
            asks: [],
            sequence: 0,
            timestamp: new Date(),
          };
          
          await this.setOrderBookSnapshot(symbol, emptyOrderBook);
        }

        // Warm ticker cache
        const tickerKey = `ticker:${symbol}`;
        const existingTicker = await redisService.getJSON(tickerKey);
        
        if (!existingTicker) {
          // Create placeholder ticker
          const placeholderTicker = {
            symbol,
            lastPrice: new Decimal(100),
            volume24h: new Decimal(0),
            priceChange24h: new Decimal(0),
            priceChangePercent24h: new Decimal(0),
            timestamp: new Date(),
          };
          
          await this.setTicker(symbol, placeholderTicker);
        }
      } catch (error) {
        logger.error('Failed to warm cache for symbol', {
          symbol,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    await Promise.allSettled(warmingPromises);
    logger.info('Market data cache warming completed');
  }

  // Invalidate market data cache for a symbol
  async invalidateMarketData(symbol: string): Promise<void> {
    logger.info('Invalidating market data cache', { symbol });

    const patterns = [
      `orderbook:*:${symbol}*`,
      `ticker:${symbol}`,
      `market_stats:${symbol}`,
      `price_history:${symbol}:*`,
      `recent_trades:${symbol}`,
    ];

    const deletePromises = patterns.map(pattern => 
      redisService.deletePattern(pattern)
    );

    await Promise.all(deletePromises);

    // Also invalidate by tags
    await Promise.all([
      cacheStrategy.invalidateByTag('orderbook'),
      cacheStrategy.invalidateByTag(symbol),
      cacheStrategy.invalidateByTag('market_stats'),
      cacheStrategy.invalidateByTag('price_history'),
    ]);

    logger.info('Market data cache invalidated', { symbol });
  }

  // Get cache statistics for monitoring
  async getCacheStats(): Promise<{
    orderBookCacheHits: number;
    tickerCacheHits: number;
    totalMarketDataKeys: number;
    cacheMemoryUsage: string;
  }> {
    try {
      const patterns = [
        'orderbook:*',
        'ticker:*',
        'market_stats:*',
        'price_history:*',
        'recent_trades:*',
      ];

      let totalKeys = 0;
      for (const pattern of patterns) {
        const keys = await redisService.keys(pattern);
        totalKeys += keys.length;
      }

      const generalStats = await cacheStrategy.getStats();

      return {
        orderBookCacheHits: 0, // Would need to implement hit tracking
        tickerCacheHits: 0,    // Would need to implement hit tracking
        totalMarketDataKeys: totalKeys,
        cacheMemoryUsage: generalStats.memoryUsage,
      };
    } catch (error) {
      logger.error('Failed to get cache stats', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      return {
        orderBookCacheHits: 0,
        tickerCacheHits: 0,
        totalMarketDataKeys: 0,
        cacheMemoryUsage: 'Unknown',
      };
    }
  }

  // Cleanup expired market data
  async cleanupExpiredData(): Promise<void> {
    logger.info('Starting market data cache cleanup');

    try {
      // Clean up old order book deltas
      const deltaKeys = await redisService.keys('orderbook:delta:*');
      let cleanedDeltas = 0;

      for (const key of deltaKeys) {
        const ttl = await redisService.ttl(key);
        if (ttl === -1) { // No expiration set
          await redisService.expire(key, 300); // Set 5 minute expiration
        } else if (ttl === -2) { // Key doesn't exist
          cleanedDeltas++;
        }
      }

      // Clean up old trade data
      const tradeKeys = await redisService.keys('recent_trades:*');
      let cleanedTrades = 0;

      for (const key of tradeKeys) {
        const length = await redisService.getClient().llen(key);
        if (length > 100) {
          await redisService.getClient().ltrim(key, 0, 99);
          cleanedTrades++;
        }
      }

      logger.info('Market data cache cleanup completed', {
        cleanedDeltas,
        cleanedTrades,
        totalDeltaKeys: deltaKeys.length,
        totalTradeKeys: tradeKeys.length,
      });
    } catch (error) {
      logger.error('Market data cache cleanup failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}

// Export singleton instance
export const marketDataCache = MarketDataCacheService.getInstance();