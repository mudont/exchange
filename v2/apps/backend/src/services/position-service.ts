import { Decimal } from 'decimal.js';
import { prisma } from '../database';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/error';
import { ErrorCode, HttpStatus } from '@trading-exchange/shared';
import { redisService } from './cache/redis-service';

export interface PositionSummary {
  id: string;
  accountId: string;
  instrumentSymbol: string;
  instrumentName: string;
  quantity: Decimal;
  avgPrice: Decimal;
  currentPrice: Decimal;
  marketValue: Decimal;
  costBasis: Decimal;
  unrealizedPnL: Decimal;
  realizedPnL: Decimal;
  totalPnL: Decimal;
  pnlPercentage: Decimal;
  lastUpdated: Date;
}

export interface PortfolioSummary {
  accountId: string;
  totalMarketValue: Decimal;
  totalCostBasis: Decimal;
  totalUnrealizedPnL: Decimal;
  totalRealizedPnL: Decimal;
  totalPnL: Decimal;
  totalPnLPercentage: Decimal;
  positionCount: number;
  lastUpdated: Date;
}

export interface PnLCalculation {
  position: PositionSummary;
  dailyPnL: Decimal;
  weeklyPnL: Decimal;
  monthlyPnL: Decimal;
  inceptionPnL: Decimal;
}

export class PositionService {
  async getAccountPositions(userId: string, accountId: string): Promise<PositionSummary[]> {
    // Verify account ownership
    await this.verifyAccountOwnership(userId, accountId);

    // Try cache first
    const cacheKey = `positions:${accountId}`;
    const cached = await redisService.getJSON<PositionSummary[]>(cacheKey);
    
    if (cached) {
      logger.debug('Positions served from cache', { accountId });
      return cached;
    }

    const positions = await prisma.position.findMany({
      where: { accountId },
      include: {
        instrument: true,
      },
    });

    const positionSummaries: PositionSummary[] = [];

    for (const position of positions) {
      const quantity = new Decimal(position.quantity);
      
      // Skip zero positions unless they have realized P&L
      if (quantity.isZero() && new Decimal(position.realizedPnL).isZero()) {
        continue;
      }

      const avgPrice = new Decimal(position.avgPrice);
      const currentPrice = await this.getCurrentMarketPrice(position.instrumentSymbol);
      const costBasis = quantity.abs().mul(avgPrice);
      const marketValue = quantity.abs().mul(currentPrice);
      
      // Calculate unrealized P&L
      let unrealizedPnL = new Decimal(0);
      if (!quantity.isZero()) {
        unrealizedPnL = quantity.mul(currentPrice.sub(avgPrice));
      }

      const realizedPnL = new Decimal(position.realizedPnL);
      const totalPnL = unrealizedPnL.add(realizedPnL);
      
      // Calculate P&L percentage
      let pnlPercentage = new Decimal(0);
      if (!costBasis.isZero()) {
        pnlPercentage = totalPnL.div(costBasis).mul(100);
      }

      positionSummaries.push({
        id: position.id,
        accountId: position.accountId,
        instrumentSymbol: position.instrumentSymbol,
        instrumentName: position.instrument.name,
        quantity,
        avgPrice,
        currentPrice,
        marketValue,
        costBasis,
        unrealizedPnL,
        realizedPnL,
        totalPnL,
        pnlPercentage,
        lastUpdated: position.lastUpdated,
      });
    }

    // Cache for 30 seconds
    await redisService.setJSON(cacheKey, positionSummaries, 30);

    return positionSummaries;
  }

  async getPortfolioSummary(userId: string, accountId: string): Promise<PortfolioSummary> {
    const positions = await this.getAccountPositions(userId, accountId);

    let totalMarketValue = new Decimal(0);
    let totalCostBasis = new Decimal(0);
    let totalUnrealizedPnL = new Decimal(0);
    let totalRealizedPnL = new Decimal(0);

    for (const position of positions) {
      totalMarketValue = totalMarketValue.add(position.marketValue);
      totalCostBasis = totalCostBasis.add(position.costBasis);
      totalUnrealizedPnL = totalUnrealizedPnL.add(position.unrealizedPnL);
      totalRealizedPnL = totalRealizedPnL.add(position.realizedPnL);
    }

    const totalPnL = totalUnrealizedPnL.add(totalRealizedPnL);
    let totalPnLPercentage = new Decimal(0);
    
    if (!totalCostBasis.isZero()) {
      totalPnLPercentage = totalPnL.div(totalCostBasis).mul(100);
    }

    return {
      accountId,
      totalMarketValue,
      totalCostBasis,
      totalUnrealizedPnL,
      totalRealizedPnL,
      totalPnL,
      totalPnLPercentage,
      positionCount: positions.length,
      lastUpdated: new Date(),
    };
  }

  async getPositionHistory(
    userId: string,
    accountId: string,
    instrumentSymbol: string,
    options: {
      startDate?: Date;
      endDate?: Date;
      limit?: number;
    } = {}
  ) {
    await this.verifyAccountOwnership(userId, accountId);

    // Get all trades for this position
    const where: any = {
      instrumentSymbol,
      OR: [
        { buyerUserId: userId },
        { sellerUserId: userId },
      ],
    };

    if (options.startDate || options.endDate) {
      where.timestamp = {};
      if (options.startDate) {
        where.timestamp.gte = options.startDate;
      }
      if (options.endDate) {
        where.timestamp.lte = options.endDate;
      }
    }

    const trades = await prisma.trade.findMany({
      where,
      orderBy: { timestamp: 'asc' },
      take: options.limit || 100,
      include: {
        buyOrder: true,
        sellOrder: true,
      },
    });

    // Calculate position evolution
    const history: Array<{
      timestamp: Date;
      tradeId: string;
      side: 'BUY' | 'SELL';
      quantity: Decimal;
      price: Decimal;
      runningQuantity: Decimal;
      avgPrice: Decimal;
      realizedPnL: Decimal;
      tradeValue: Decimal;
    }> = [];

    let runningQuantity = new Decimal(0);
    let totalCost = new Decimal(0);
    let totalRealizedPnL = new Decimal(0);

    for (const trade of trades) {
      const isBuyer = trade.buyerUserId === userId;
      const side = isBuyer ? 'BUY' : 'SELL';
      const quantity = new Decimal(trade.quantity);
      const price = new Decimal(trade.price);
      const tradeValue = quantity.mul(price);

      let realizedPnL = new Decimal(0);

      if (side === 'BUY') {
        runningQuantity = runningQuantity.add(quantity);
        totalCost = totalCost.add(tradeValue);
      } else {
        // Selling - calculate realized P&L
        if (!runningQuantity.isZero()) {
          const avgPrice = totalCost.div(runningQuantity);
          realizedPnL = quantity.mul(price.sub(avgPrice));
          totalRealizedPnL = totalRealizedPnL.add(realizedPnL);
        }
        
        runningQuantity = runningQuantity.sub(quantity);
        
        // Adjust total cost proportionally
        if (!runningQuantity.isZero()) {
          const remainingRatio = runningQuantity.div(runningQuantity.add(quantity));
          totalCost = totalCost.mul(remainingRatio);
        } else {
          totalCost = new Decimal(0);
        }
      }

      const avgPrice = runningQuantity.isZero() ? new Decimal(0) : totalCost.div(runningQuantity);

      history.push({
        timestamp: trade.timestamp,
        tradeId: trade.id,
        side,
        quantity,
        price,
        runningQuantity,
        avgPrice,
        realizedPnL,
        tradeValue,
      });
    }

    return history;
  }

  async calculatePnLBreakdown(
    userId: string,
    accountId: string,
    instrumentSymbol?: string
  ): Promise<PnLCalculation[]> {
    await this.verifyAccountOwnership(userId, accountId);

    const positions = instrumentSymbol 
      ? await this.getAccountPositions(userId, accountId).then(positions => 
          positions.filter(p => p.instrumentSymbol === instrumentSymbol)
        )
      : await this.getAccountPositions(userId, accountId);

    const calculations: PnLCalculation[] = [];

    for (const position of positions) {
      // Get historical prices for different periods
      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      // For simplicity, we'll use the current calculation
      // In a real system, you'd store historical prices
      const dailyPnL = position.unrealizedPnL; // Simplified
      const weeklyPnL = position.unrealizedPnL; // Simplified
      const monthlyPnL = position.unrealizedPnL; // Simplified
      const inceptionPnL = position.totalPnL;

      calculations.push({
        position,
        dailyPnL,
        weeklyPnL,
        monthlyPnL,
        inceptionPnL,
      });
    }

    return calculations;
  }

  async updatePositionPrices(accountId?: string) {
    logger.info('Updating position prices', { accountId });

    const where = accountId ? { accountId } : {};
    const positions = await prisma.position.findMany({
      where: {
        ...where,
        quantity: { not: 0 }, // Only update non-zero positions
      },
    });

    let updatedCount = 0;

    for (const position of positions) {
      try {
        const currentPrice = await this.getCurrentMarketPrice(position.instrumentSymbol);
        const quantity = new Decimal(position.quantity);
        const avgPrice = new Decimal(position.avgPrice);
        
        // Calculate new unrealized P&L
        const unrealizedPnL = quantity.mul(currentPrice.sub(avgPrice));

        await prisma.position.update({
          where: { id: position.id },
          data: {
            unrealizedPnL,
            lastUpdated: new Date(),
          },
        });

        updatedCount++;
      } catch (error) {
        logger.error('Failed to update position price', {
          positionId: position.id,
          instrumentSymbol: position.instrumentSymbol,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    // Clear position caches
    if (accountId) {
      await redisService.del(`positions:${accountId}`);
    } else {
      // Clear all position caches (expensive, but thorough)
      const keys = await redisService.keys('positions:*');
      if (keys.length > 0) {
        await Promise.all(keys.map(key => redisService.del(key)));
      }
    }

    logger.info('Position prices updated', {
      accountId,
      updatedCount,
      totalPositions: positions.length,
    });

    return { updatedCount, totalPositions: positions.length };
  }

  async getTopPerformers(userId: string, accountId: string, limit = 10) {
    const positions = await this.getAccountPositions(userId, accountId);

    // Sort by P&L percentage (descending)
    const topPerformers = positions
      .filter(p => !p.totalPnL.isZero())
      .sort((a, b) => b.pnlPercentage.cmp(a.pnlPercentage))
      .slice(0, limit);

    return topPerformers;
  }

  async getWorstPerformers(userId: string, accountId: string, limit = 10) {
    const positions = await this.getAccountPositions(userId, accountId);

    // Sort by P&L percentage (ascending)
    const worstPerformers = positions
      .filter(p => !p.totalPnL.isZero())
      .sort((a, b) => a.pnlPercentage.cmp(b.pnlPercentage))
      .slice(0, limit);

    return worstPerformers;
  }

  async getRiskMetrics(userId: string, accountId: string) {
    const positions = await this.getAccountPositions(userId, accountId);
    const portfolio = await this.getPortfolioSummary(userId, accountId);

    // Calculate concentration risk
    const concentrationRisk = positions.map(position => ({
      instrumentSymbol: position.instrumentSymbol,
      concentration: position.marketValue.div(portfolio.totalMarketValue).mul(100),
    })).sort((a, b) => b.concentration.cmp(a.concentration));

    // Calculate volatility (simplified - would need historical data)
    const avgPnLPercentage = positions.length > 0 
      ? positions.reduce((sum, p) => sum.add(p.pnlPercentage), new Decimal(0)).div(positions.length)
      : new Decimal(0);

    // Calculate maximum drawdown (simplified)
    const maxDrawdown = positions.reduce((max, p) => {
      const drawdown = p.pnlPercentage.lt(0) ? p.pnlPercentage.abs() : new Decimal(0);
      return drawdown.gt(max) ? drawdown : max;
    }, new Decimal(0));

    return {
      portfolio,
      concentrationRisk: concentrationRisk.slice(0, 5), // Top 5 concentrations
      avgPnLPercentage,
      maxDrawdown,
      positionCount: positions.length,
      diversificationScore: Math.min(100, positions.length * 10), // Simple diversification score
    };
  }

  private async getCurrentMarketPrice(instrumentSymbol: string): Promise<Decimal> {
    // Try to get from cache first
    const cacheKey = `market_price:${instrumentSymbol}`;
    const cached = await redisService.get(cacheKey);
    
    if (cached) {
      return new Decimal(cached);
    }

    // Get the last trade price
    const lastTrade = await prisma.trade.findFirst({
      where: { instrumentSymbol },
      orderBy: { timestamp: 'desc' },
    });

    if (lastTrade) {
      const price = new Decimal(lastTrade.price);
      // Cache for 10 seconds
      await redisService.set(cacheKey, price.toString(), 10);
      return price;
    }

    // Fallback to instrument mid-price
    const instrument = await prisma.instrument.findUnique({
      where: { symbol: instrumentSymbol },
    });

    if (instrument) {
      const minPrice = new Decimal(instrument.minPrice);
      const maxPrice = new Decimal(instrument.maxPrice);
      const midPrice = minPrice.add(maxPrice).div(2);
      
      // Cache for 60 seconds (less reliable)
      await redisService.set(cacheKey, midPrice.toString(), 60);
      return midPrice;
    }

    // Ultimate fallback
    return new Decimal(100);
  }

  private async verifyAccountOwnership(userId: string, accountId: string) {
    const account = await prisma.account.findUnique({
      where: { id: accountId },
    });

    if (!account) {
      throw new AppError(
        ErrorCode.NOT_FOUND,
        'Account not found',
        HttpStatus.NOT_FOUND
      );
    }

    if (account.userId !== userId) {
      throw new AppError(
        ErrorCode.FORBIDDEN,
        'You can only access your own account positions',
        HttpStatus.FORBIDDEN
      );
    }
  }

  // Scheduled job to update all position prices
  async schedulePositionPriceUpdates() {
    logger.info('Starting scheduled position price updates');
    
    try {
      const result = await this.updatePositionPrices();
      logger.info('Scheduled position price updates completed', result);
    } catch (error) {
      logger.error('Scheduled position price updates failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}