import { FastifyInstance } from 'fastify';
import { MarketDataService } from '../../services/market-data-service';
import { z } from 'zod';

export async function marketDataRoutes(fastify: FastifyInstance) {
  const marketDataService = new MarketDataService();

  // Get market ticker
  fastify.get('/ticker/:symbol', async (request, reply) => {
    const symbol = (request.params as any).symbol;
    const ticker = await marketDataService.getMarketTicker(symbol);
    
    return reply.send({
      success: true,
      data: ticker,
      timestamp: new Date().toISOString(),
    });
  });

  // Get market depth (order book)
  fastify.get('/depth/:symbol', async (request, reply) => {
    const symbol = (request.params as any).symbol;
    const depth = await marketDataService.getMarketDepth(symbol);
    
    return reply.send({
      success: true,
      data: depth,
      timestamp: new Date().toISOString(),
    });
  });

  // Get market history/candles
  fastify.get('/history/:symbol', {
    schema: {
      querystring: z.object({
        interval: z.enum(['1m', '5m', '15m', '1h', '4h', '1d']).optional(),
        limit: z.string().transform(Number).optional(),
      }),
    },
  }, async (request, reply) => {
    const symbol = (request.params as any).symbol;
    const query = request.query as any;
    
    const history = await marketDataService.getMarketHistory(
      symbol,
      query.interval || '1h',
      query.limit || 100
    );
    
    return reply.send({
      success: true,
      data: history,
      timestamp: new Date().toISOString(),
    });
  });

  // Get recent trades
  fastify.get('/trades/:symbol', {
    schema: {
      querystring: z.object({
        limit: z.string().transform(Number).optional(),
      }),
    },
  }, async (request, reply) => {
    const symbol = (request.params as any).symbol;
    const query = request.query as any;
    
    const trades = await marketDataService.getRecentTrades(
      symbol,
      query.limit || 50
    );
    
    return reply.send({
      success: true,
      data: trades,
      timestamp: new Date().toISOString(),
    });
  });

  // Get market summary for all instruments
  fastify.get('/summary', async (request, reply) => {
    const summary = await marketDataService.getMarketSummary();
    
    return reply.send({
      success: true,
      data: summary,
      timestamp: new Date().toISOString(),
    });
  });

  // Get multiple tickers
  fastify.get('/tickers', {
    schema: {
      querystring: z.object({
        symbols: z.string().optional(),
      }),
    },
  }, async (request, reply) => {
    const query = request.query as any;
    
    if (query.symbols) {
      const symbols = query.symbols.split(',');
      const tickers = await Promise.all(
        symbols.map(symbol => marketDataService.getMarketTicker(symbol.trim()))
      );
      
      return reply.send({
        success: true,
        data: tickers,
        timestamp: new Date().toISOString(),
      });
    } else {
      // Return all active instruments
      const summary = await marketDataService.getMarketSummary();
      
      return reply.send({
        success: true,
        data: summary,
        timestamp: new Date().toISOString(),
      });
    }
  });

  // Get market statistics
  fastify.get('/stats/:symbol', async (request, reply) => {
    const symbol = (request.params as any).symbol;
    const ticker = await marketDataService.getMarketTicker(symbol);
    
    // Calculate additional statistics
    const stats = {
      symbol: ticker.symbol,
      lastPrice: ticker.lastPrice,
      priceChange24h: ticker.priceChange24h,
      priceChangePercent24h: ticker.priceChangePercent24h,
      high24h: ticker.high24h,
      low24h: ticker.low24h,
      volume24h: ticker.volume24h,
      bestBid: ticker.bestBid,
      bestAsk: ticker.bestAsk,
      spread: ticker.bestAsk.sub(ticker.bestBid),
      spreadPercent: ticker.bestBid.gt(0) 
        ? ticker.bestAsk.sub(ticker.bestBid).div(ticker.bestBid).mul(100)
        : 0,
      timestamp: ticker.timestamp,
    };
    
    return reply.send({
      success: true,
      data: stats,
      timestamp: new Date().toISOString(),
    });
  });
}