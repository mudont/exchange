import { Decimal } from 'decimal.js';
import { prisma } from '../database';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/error';
import { ErrorCode, HttpStatus, OrderSide } from '@trading-exchange/shared';
import { cacheStrategy, CacheConfigs } from './cache/cache-strategy';
import { userDataCache } from './cache/user-data-cache';
import { redisService } from './cache/redis-service';

export interface RiskLimits {
  maxOrderSize: Decimal;
  maxPositionSize: Decimal;
  maxDailyLoss: Decimal;
  maxDailyVolume: Decimal;
  marginRequirement: Decimal;
  concentrationLimit: Decimal; // Max % of portfolio in single instrument
}

export interface RiskCheck {
  passed: boolean;
  errors: string[];
  warnings: string[];
  riskScore: number; // 0-100, higher is riskier
}

export interface MarginRequirement {
  accountId: string;
  totalMarginRequired: Decimal;
  availableMargin: Decimal;
  marginUtilization: Decimal; // Percentage
  marginCall: boolean;
  liquidationRisk: boolean;
}

export interface PositionRisk {
  instrumentSymbol: string;
  position: Decimal;
  marketValue: Decimal;
  var95: Decimal; // Value at Risk 95%
  expectedShortfall: Decimal;
  concentrationRisk: Decimal;
}

export class RiskService {
  private readonly defaultRiskLimits: RiskLimits = {
    maxOrderSize: new Decimal(100000), // $100k max order
    maxPositionSize: new Decimal(500000), // $500k max position
    maxDailyLoss: new Decimal(50000), // $50k max daily loss
    maxDailyVolume: new Decimal(1000000), // $1M max daily volume
    marginRequirement: new Decimal(0.2), // 20% margin requirement
    concentrationLimit: new Decimal(0.25), // 25% max concentration
  };

  async performPreTradeRiskCheck(
    userId: string,
    accountId: string,
    instrumentSymbol: string,
    side: OrderSide,
    quantity: Decimal,
    price: Decimal
  ): Promise<RiskCheck> {
    logger.debug('Performing pre-trade risk check', {
      userId,
      accountId,
      instrumentSymbol,
      side,
      quantity: quantity.toString(),
      price: price.toString(),
    });

    const errors: string[] = [];
    const warnings: string[] = [];
    let riskScore = 0;

    try {
      // Get user's risk limits (could be customized per user)
      const riskLimits = await this.getUserRiskLimits(userId);

      // Check order size limit
      const orderValue = quantity.mul(price);
      if (orderValue.gt(riskLimits.maxOrderSize)) {
        errors.push(`Order size ${orderValue} exceeds maximum allowed ${riskLimits.maxOrderSize}`);
        riskScore += 30;
      }

      // Check account balance and margin
      const marginCheck = await this.checkMarginRequirements(accountId, instrumentSymbol, side, quantity, price);
      if (marginCheck.marginCall) {
        errors.push('Insufficient margin for this trade');
        riskScore += 40;
      } else if (marginCheck.marginUtilization.gt(80)) {
        warnings.push(`High margin utilization: ${marginCheck.marginUtilization.toFixed(1)}%`);
        riskScore += 15;
      }

      // Check position limits
      const positionCheck = await this.checkPositionLimits(accountId, instrumentSymbol, side, quantity, price, riskLimits);
      if (!positionCheck.passed) {
        errors.push(...positionCheck.errors);
        riskScore += 25;
      }

      // Check daily trading limits
      const dailyLimitCheck = await this.checkDailyLimits(userId, accountId, orderValue, riskLimits);
      if (!dailyLimitCheck.passed) {
        errors.push(...dailyLimitCheck.errors);
        riskScore += 20;
      }

      // Check concentration risk
      const concentrationCheck = await this.checkConcentrationRisk(accountId, instrumentSymbol, side, quantity, price, riskLimits);
      if (!concentrationCheck.passed) {
        warnings.push(...concentrationCheck.warnings);
        riskScore += 10;
      }

      // Check instrument-specific risks
      const instrumentRisk = await this.checkInstrumentRisk(instrumentSymbol);
      if (instrumentRisk.riskScore > 70) {
        warnings.push(`High-risk instrument: ${instrumentSymbol}`);
        riskScore += instrumentRisk.riskScore * 0.1;
      }

      const result: RiskCheck = {
        passed: errors.length === 0,
        errors,
        warnings,
        riskScore: Math.min(100, Math.round(riskScore)),
      };

      logger.info('Pre-trade risk check completed', {
        userId,
        accountId,
        instrumentSymbol,
        passed: result.passed,
        riskScore: result.riskScore,
        errorsCount: errors.length,
        warningsCount: warnings.length,
      });

      return result;
    } catch (error) {
      logger.error('Risk check failed', {
        userId,
        accountId,
        instrumentSymbol,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        passed: false,
        errors: ['Risk check system error'],
        warnings: [],
        riskScore: 100,
      };
    }
  }

  async checkMarginRequirements(
    accountId: string,
    instrumentSymbol: string,
    side: OrderSide,
    quantity: Decimal,
    price: Decimal
  ): Promise<MarginRequirement> {
    // Get current positions and balances
    const [positions, balances] = await Promise.all([
      prisma.position.findMany({
        where: { accountId },
        include: { instrument: true },
      }),
      prisma.balance.findMany({
        where: { accountId },
      }),
    ]);

    // Calculate current margin requirements
    let totalMarginRequired = new Decimal(0);

    for (const position of positions) {
      const positionValue = new Decimal(position.quantity).abs().mul(await this.getCurrentPrice(position.instrumentSymbol));
      const marginRate = new Decimal(position.instrument.marginRate);
      totalMarginRequired = totalMarginRequired.add(positionValue.mul(marginRate));
    }

    // Add margin requirement for new trade
    const newTradeValue = quantity.mul(price);
    const instrument = await prisma.instrument.findUnique({
      where: { symbol: instrumentSymbol },
    });

    if (instrument) {
      const newMarginRequired = newTradeValue.mul(new Decimal(instrument.marginRate));
      totalMarginRequired = totalMarginRequired.add(newMarginRequired);
    }

    // Calculate available margin
    const cashBalance = balances.find(b => b.currency === 'USD');
    const availableCash = cashBalance ? new Decimal(cashBalance.availableBalance) : new Decimal(0);

    // Add unrealized P&L to available margin
    let unrealizedPnL = new Decimal(0);
    for (const position of positions) {
      unrealizedPnL = unrealizedPnL.add(new Decimal(position.unrealizedPnL));
    }

    const availableMargin = availableCash.add(unrealizedPnL);
    const marginUtilization = totalMarginRequired.isZero() ? new Decimal(0) : totalMarginRequired.div(availableMargin).mul(100);

    const marginCall = availableMargin.lt(totalMarginRequired);
    const liquidationRisk = marginUtilization.gt(95);

    return {
      accountId,
      totalMarginRequired,
      availableMargin,
      marginUtilization,
      marginCall,
      liquidationRisk,
    };
  }

  async calculatePortfolioRisk(accountId: string): Promise<{
    totalValue: Decimal;
    var95: Decimal;
    expectedShortfall: Decimal;
    positionRisks: PositionRisk[];
    concentrationRisk: Decimal;
    liquidityRisk: number;
  }> {
    const positions = await prisma.position.findMany({
      where: { accountId },
      include: { instrument: true },
    });

    let totalValue = new Decimal(0);
    let totalVar95 = new Decimal(0);
    const positionRisks: PositionRisk[] = [];

    for (const position of positions) {
      const quantity = new Decimal(position.quantity);
      if (quantity.isZero()) continue;

      const currentPrice = await this.getCurrentPrice(position.instrumentSymbol);
      const marketValue = quantity.abs().mul(currentPrice);
      totalValue = totalValue.add(marketValue);

      // Simplified VaR calculation (in reality, would use historical data)
      const volatility = await this.getInstrumentVolatility(position.instrumentSymbol);
      const var95 = marketValue.mul(volatility).mul(1.645); // 95% confidence interval
      const expectedShortfall = var95.mul(1.3); // Simplified ES calculation

      totalVar95 = totalVar95.add(var95);

      positionRisks.push({
        instrumentSymbol: position.instrumentSymbol,
        position: quantity,
        marketValue,
        var95,
        expectedShortfall,
        concentrationRisk: totalValue.isZero() ? new Decimal(0) : marketValue.div(totalValue).mul(100),
      });
    }

    // Calculate concentration risk (max single position as % of portfolio)
    const concentrationRisk = positionRisks.length > 0
      ? positionRisks.reduce((max, pos) => pos.concentrationRisk.gt(max) ? pos.concentrationRisk : max, new Decimal(0))
      : new Decimal(0);

    // Simple liquidity risk score (0-100)
    const liquidityRisk = Math.min(100, positionRisks.length * 5); // More positions = higher liquidity risk

    return {
      totalValue,
      var95: totalVar95,
      expectedShortfall: totalVar95.mul(1.3),
      positionRisks,
      concentrationRisk,
      liquidityRisk,
    };
  }

  async monitorRiskLimits(accountId: string): Promise<{
    breaches: Array<{
      type: string;
      severity: 'WARNING' | 'CRITICAL';
      message: string;
      currentValue: Decimal;
      limit: Decimal;
    }>;
    riskScore: number;
  }> {
    const breaches: Array<{
      type: string;
      severity: 'WARNING' | 'CRITICAL';
      message: string;
      currentValue: Decimal;
      limit: Decimal;
    }> = [];

    // Get account info
    const account = await prisma.account.findUnique({
      where: { id: accountId },
    });

    if (!account) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Account not found', HttpStatus.NOT_FOUND);
    }

    const riskLimits = await this.getUserRiskLimits(account.userId);

    // Check margin requirements
    const marginReq = await this.checkMarginRequirements(accountId, '', 'BUY', new Decimal(0), new Decimal(0));
    if (marginReq.marginCall) {
      breaches.push({
        type: 'MARGIN_CALL',
        severity: 'CRITICAL',
        message: 'Margin call - insufficient margin',
        currentValue: marginReq.availableMargin,
        limit: marginReq.totalMarginRequired,
      });
    } else if (marginReq.marginUtilization.gt(80)) {
      breaches.push({
        type: 'HIGH_MARGIN_UTILIZATION',
        severity: 'WARNING',
        message: 'High margin utilization',
        currentValue: marginReq.marginUtilization,
        limit: new Decimal(80),
      });
    }

    // Check daily P&L
    const dailyPnL = await this.getDailyPnL(accountId);
    if (dailyPnL.lt(riskLimits.maxDailyLoss.neg())) {
      breaches.push({
        type: 'DAILY_LOSS_LIMIT',
        severity: 'CRITICAL',
        message: 'Daily loss limit exceeded',
        currentValue: dailyPnL.abs(),
        limit: riskLimits.maxDailyLoss,
      });
    }

    // Check concentration risk
    const portfolioRisk = await this.calculatePortfolioRisk(accountId);
    if (portfolioRisk.concentrationRisk.gt(riskLimits.concentrationLimit.mul(100))) {
      breaches.push({
        type: 'CONCENTRATION_RISK',
        severity: 'WARNING',
        message: 'High concentration in single instrument',
        currentValue: portfolioRisk.concentrationRisk,
        limit: riskLimits.concentrationLimit.mul(100),
      });
    }

    // Calculate overall risk score
    let riskScore = 0;
    for (const breach of breaches) {
      riskScore += breach.severity === 'CRITICAL' ? 30 : 15;
    }
    riskScore += portfolioRisk.liquidityRisk * 0.2;

    return {
      breaches,
      riskScore: Math.min(100, Math.round(riskScore)),
    };
  }

  private async getUserRiskLimits(userId: string): Promise<RiskLimits> {
    // Try cache first
    const cacheKey = `risk_limits:${userId}`;
    const cached = await redisService.getJSON<RiskLimits>(cacheKey);

    if (cached) {
      return {
        maxOrderSize: new Decimal(cached.maxOrderSize),
        maxPositionSize: new Decimal(cached.maxPositionSize),
        maxDailyLoss: new Decimal(cached.maxDailyLoss),
        maxDailyVolume: new Decimal(cached.maxDailyVolume),
        marginRequirement: new Decimal(cached.marginRequirement),
        concentrationLimit: new Decimal(cached.concentrationLimit),
      };
    }

    // In a real system, this would fetch user-specific limits from database
    // For now, return default limits
    await redisService.setJSON(cacheKey, this.defaultRiskLimits, 300); // Cache for 5 minutes
    return this.defaultRiskLimits;
  }

  private async checkPositionLimits(
    accountId: string,
    instrumentSymbol: string,
    side: OrderSide,
    quantity: Decimal,
    price: Decimal,
    riskLimits: RiskLimits
  ): Promise<{ passed: boolean; errors: string[] }> {
    const errors: string[] = [];

    // Get current position
    const currentPosition = await prisma.position.findUnique({
      where: {
        accountId_instrumentSymbol: {
          accountId,
          instrumentSymbol,
        },
      },
    });

    const currentQuantity = currentPosition ? new Decimal(currentPosition.quantity) : new Decimal(0);

    // Calculate new position after trade
    const quantityChange = side === OrderSide.BUY ? quantity : quantity.neg();
    const newQuantity = currentQuantity.add(quantityChange);
    const newPositionValue = newQuantity.abs().mul(price);

    if (newPositionValue.gt(riskLimits.maxPositionSize)) {
      errors.push(`Position size ${newPositionValue} would exceed limit ${riskLimits.maxPositionSize}`);
    }

    return {
      passed: errors.length === 0,
      errors,
    };
  }

  private async checkDailyLimits(
    userId: string,
    accountId: string,
    orderValue: Decimal,
    riskLimits: RiskLimits
  ): Promise<{ passed: boolean; errors: string[] }> {
    const errors: string[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check daily volume
    const dailyVolume = await this.getDailyTradingVolume(accountId, today);
    const newDailyVolume = dailyVolume.add(orderValue);

    if (newDailyVolume.gt(riskLimits.maxDailyVolume)) {
      errors.push(`Daily volume ${newDailyVolume} would exceed limit ${riskLimits.maxDailyVolume}`);
    }

    // Check daily P&L
    const dailyPnL = await this.getDailyPnL(accountId, today);
    if (dailyPnL.lt(riskLimits.maxDailyLoss.neg())) {
      errors.push(`Daily loss ${dailyPnL.abs()} exceeds limit ${riskLimits.maxDailyLoss}`);
    }

    return {
      passed: errors.length === 0,
      errors,
    };
  }

  private async checkConcentrationRisk(
    accountId: string,
    instrumentSymbol: string,
    side: OrderSide,
    quantity: Decimal,
    price: Decimal,
    riskLimits: RiskLimits
  ): Promise<{ passed: boolean; warnings: string[] }> {
    const warnings: string[] = [];

    // Get portfolio value
    const portfolioRisk = await this.calculatePortfolioRisk(accountId);

    // Calculate new position value
    const currentPosition = await prisma.position.findUnique({
      where: {
        accountId_instrumentSymbol: {
          accountId,
          instrumentSymbol,
        },
      },
    });

    const currentQuantity = currentPosition ? new Decimal(currentPosition.quantity) : new Decimal(0);
    const quantityChange = side === OrderSide.BUY ? quantity : quantity.neg();
    const newQuantity = currentQuantity.add(quantityChange);
    const newPositionValue = newQuantity.abs().mul(price);

    const totalPortfolioValue = portfolioRisk.totalValue.add(newPositionValue);
    const concentration = totalPortfolioValue.isZero() ? new Decimal(0) : newPositionValue.div(totalPortfolioValue);

    if (concentration.gt(riskLimits.concentrationLimit)) {
      warnings.push(`Position concentration ${concentration.mul(100).toFixed(1)}% exceeds recommended limit ${riskLimits.concentrationLimit.mul(100).toFixed(1)}%`);
    }

    return {
      passed: true, // Concentration is a warning, not a hard stop
      warnings,
    };
  }

  private async checkInstrumentRisk(instrumentSymbol: string): Promise<{ riskScore: number }> {
    // Get instrument info
    const instrument = await prisma.instrument.findUnique({
      where: { symbol: instrumentSymbol },
    });

    if (!instrument) {
      return { riskScore: 100 }; // Unknown instrument = high risk
    }

    let riskScore = 0;

    // Check if instrument is close to expiration
    if (instrument.expirationDate) {
      const daysToExpiry = Math.ceil((instrument.expirationDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      if (daysToExpiry < 7) {
        riskScore += 30; // High risk for instruments expiring soon
      } else if (daysToExpiry < 30) {
        riskScore += 15;
      }
    }

    // Check volatility
    const volatility = await this.getInstrumentVolatility(instrumentSymbol);
    if (volatility.gt(0.3)) { // 30% volatility
      riskScore += 25;
    } else if (volatility.gt(0.2)) { // 20% volatility
      riskScore += 15;
    }

    return { riskScore: Math.min(100, riskScore) };
  }

  private async getCurrentPrice(instrumentSymbol: string): Promise<Decimal> {
    // Try cache first
    const cacheKey = `current_price:${instrumentSymbol}`;
    const cached = await redisService.get(cacheKey);

    if (cached) {
      return new Decimal(cached);
    }

    // Get last trade price
    const lastTrade = await prisma.trade.findFirst({
      where: { instrumentSymbol },
      orderBy: { timestamp: 'desc' },
    });

    if (lastTrade) {
      const price = new Decimal(lastTrade.price);
      await redisService.set(cacheKey, price.toString(), 10);
      return price;
    }

    // Fallback to mid-price
    const instrument = await prisma.instrument.findUnique({
      where: { symbol: instrumentSymbol },
    });

    if (instrument) {
      const midPrice = new Decimal(instrument.minPrice).add(new Decimal(instrument.maxPrice)).div(2);
      await redisService.set(cacheKey, midPrice.toString(), 60);
      return midPrice;
    }

    return new Decimal(100); // Default fallback
  }

  private async getInstrumentVolatility(instrumentSymbol: string): Promise<Decimal> {
    // Simplified volatility calculation
    // In reality, would calculate from historical price data
    const cacheKey = `volatility:${instrumentSymbol}`;
    const cached = await redisService.get(cacheKey);

    if (cached) {
      return new Decimal(cached);
    }

    // Default volatility based on instrument type
    const instrument = await prisma.instrument.findUnique({
      where: { symbol: instrumentSymbol },
    });

    let volatility = new Decimal(0.15); // Default 15%

    if (instrument) {
      switch (instrument.type) {
        case 'CRYPTO':
          volatility = new Decimal(0.4); // 40% for crypto
          break;
        case 'STOCK':
          volatility = new Decimal(0.2); // 20% for stocks
          break;
        case 'FOREX':
          volatility = new Decimal(0.1); // 10% for forex
          break;
        default:
          volatility = new Decimal(0.15);
      }
    }

    await redisService.set(cacheKey, volatility.toString(), 3600); // Cache for 1 hour
    return volatility;
  }

  private async getDailyTradingVolume(accountId: string, date: Date): Promise<Decimal> {
    const nextDay = new Date(date);
    nextDay.setDate(nextDay.getDate() + 1);

    const trades = await prisma.trade.findMany({
      where: {
        OR: [
          { buyerUserId: { in: await this.getUserIdFromAccount(accountId) } },
          { sellerUserId: { in: await this.getUserIdFromAccount(accountId) } },
        ],
        timestamp: {
          gte: date,
          lt: nextDay,
        },
      },
    });

    return trades.reduce((total, trade) => {
      return total.add(new Decimal(trade.quantity).mul(new Decimal(trade.price)));
    }, new Decimal(0));
  }

  private async getDailyPnL(accountId: string, date?: Date): Promise<Decimal> {
    // Simplified daily P&L calculation
    // In reality, would track daily P&L changes
    const positions = await prisma.position.findMany({
      where: { accountId },
    });

    return positions.reduce((total, position) => {
      return total.add(new Decimal(position.unrealizedPnL)).add(new Decimal(position.realizedPnL));
    }, new Decimal(0));
  }

  private async getUserIdFromAccount(accountId: string): Promise<string[]> {
    const account = await prisma.account.findUnique({
      where: { id: accountId },
    });

    return account ? [account.userId] : [];
  }
}