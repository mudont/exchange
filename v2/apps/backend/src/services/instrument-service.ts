import { Decimal } from 'decimal.js';
import { prisma } from '../database';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/error';
import { ErrorCode, HttpStatus, InstrumentType } from '@trading-exchange/shared';
import { redisService } from './cache/redis-service';

export interface CreateInstrumentRequest {
  symbol: string;
  name: string;
  description?: string;
  type: InstrumentType;
  minPrice: number;
  maxPrice: number;
  tickSize: number;
  lotSize: number;
  marginRate?: number;
  expirationDate?: Date;
}

export interface InstrumentSummary {
  symbol: string;
  name: string;
  description?: string;
  type: InstrumentType;
  minPrice: Decimal;
  maxPrice: Decimal;
  tickSize: Decimal;
  lotSize: Decimal;
  marginRate: Decimal;
  expirationDate?: Date;
  settlementPrice?: Decimal;
  isActive: boolean;
  marketData?: {
    lastPrice?: Decimal;
    bestBid?: Decimal;
    bestAsk?: Decimal;
    volume24h: Decimal;
    priceChange24h: Decimal;
    priceChangePercent24h: Decimal;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface MarketSession {
  instrumentSymbol: string;
  sessionType: 'PRE_MARKET' | 'REGULAR' | 'POST_MARKET' | 'CLOSED';
  startTime: Date;
  endTime: Date;
  isActive: boolean;
}

export class InstrumentService {
  async createInstrument(userId: string, request: CreateInstrumentRequest): Promise<InstrumentSummary> {
    logger.info('Creating instrument', {
      userId,
      symbol: request.symbol,
      type: request.type,
    });

    // Validate request
    await this.validateInstrumentRequest(request);

    // Check if instrument already exists
    const existingInstrument = await prisma.instrument.findUnique({
      where: { symbol: request.symbol },
    });

    if (existingInstrument) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        'Instrument with this symbol already exists',
        HttpStatus.CONFLICT
      );
    }

    // Create instrument
    const instrument = await prisma.instrument.create({
      data: {
        symbol: request.symbol.toUpperCase(),
        name: request.name,
        description: request.description,
        type: request.type,
        minPrice: new Decimal(request.minPrice),
        maxPrice: new Decimal(request.maxPrice),
        tickSize: new Decimal(request.tickSize),
        lotSize: new Decimal(request.lotSize),
        marginRate: new Decimal(request.marginRate || 0.1),
        expirationDate: request.expirationDate,
        isActive: true,
      },
    });

    // Clear instruments cache
    await redisService.deletePattern('instruments:*');

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'INSTRUMENT_CREATED',
        resource: `instrument:${instrument.symbol}`,
        details: {
          symbol: instrument.symbol,
          name: instrument.name,
          type: instrument.type,
        },
      },
    });

    logger.info('Instrument created successfully', {
      userId,
      symbol: instrument.symbol,
      type: instrument.type,
    });

    return this.formatInstrumentSummary(instrument);
  }

  async getInstrument(symbol: string): Promise<InstrumentSummary> {
    // Try cache first
    const cacheKey = `instrument:${symbol}`;
    const cached = await redisService.getJSON<any>(cacheKey);
    
    if (cached) {
      logger.debug('Instrument served from cache', { symbol });
      return this.formatInstrumentSummary(cached);
    }

    const instrument = await prisma.instrument.findUnique({
      where: { symbol: symbol.toUpperCase() },
    });

    if (!instrument) {
      throw new AppError(
        ErrorCode.INSTRUMENT_NOT_FOUND,
        'Instrument not found',
        HttpStatus.NOT_FOUND
      );
    }

    // Cache for 5 minutes
    await redisService.setJSON(cacheKey, instrument, 300);

    return this.formatInstrumentSummary(instrument);
  }

  async getAllInstruments(filters?: {
    type?: InstrumentType;
    isActive?: boolean;
    includeExpired?: boolean;
  }): Promise<InstrumentSummary[]> {
    const cacheKey = `instruments:all:${JSON.stringify(filters || {})}`;
    const cached = await redisService.getJSON<any[]>(cacheKey);
    
    if (cached) {
      logger.debug('Instruments list served from cache');
      return cached.map(i => this.formatInstrumentSummary(i));
    }

    const where: any = {};

    if (filters?.type) {
      where.type = filters.type;
    }

    if (filters?.isActive !== undefined) {
      where.isActive = filters.isActive;
    }

    if (!filters?.includeExpired) {
      where.OR = [
        { expirationDate: null },
        { expirationDate: { gt: new Date() } },
      ];
    }

    const instruments = await prisma.instrument.findMany({
      where,
      orderBy: [
        { isActive: 'desc' },
        { symbol: 'asc' },
      ],
    });

    // Cache for 2 minutes
    await redisService.setJSON(cacheKey, instruments, 120);

    return instruments.map(i => this.formatInstrumentSummary(i));
  }

  async updateInstrument(
    userId: string,
    symbol: string,
    updates: {
      name?: string;
      description?: string;
      minPrice?: number;
      maxPrice?: number;
      tickSize?: number;
      lotSize?: number;
      marginRate?: number;
      expirationDate?: Date;
      isActive?: boolean;
    }
  ): Promise<InstrumentSummary> {
    const instrument = await this.getInstrument(symbol);

    // Validate updates
    if (updates.minPrice !== undefined && updates.maxPrice !== undefined) {
      if (updates.minPrice >= updates.maxPrice) {
        throw new AppError(
          ErrorCode.VALIDATION_ERROR,
          'Minimum price must be less than maximum price',
          HttpStatus.BAD_REQUEST
        );
      }
    }

    if (updates.tickSize !== undefined && updates.tickSize <= 0) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        'Tick size must be positive',
        HttpStatus.BAD_REQUEST
      );
    }

    if (updates.lotSize !== undefined && updates.lotSize <= 0) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        'Lot size must be positive',
        HttpStatus.BAD_REQUEST
      );
    }

    // Prepare update data
    const updateData: any = {
      updatedAt: new Date(),
    };

    if (updates.name) updateData.name = updates.name;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.minPrice !== undefined) updateData.minPrice = new Decimal(updates.minPrice);
    if (updates.maxPrice !== undefined) updateData.maxPrice = new Decimal(updates.maxPrice);
    if (updates.tickSize !== undefined) updateData.tickSize = new Decimal(updates.tickSize);
    if (updates.lotSize !== undefined) updateData.lotSize = new Decimal(updates.lotSize);
    if (updates.marginRate !== undefined) updateData.marginRate = new Decimal(updates.marginRate);
    if (updates.expirationDate !== undefined) updateData.expirationDate = updates.expirationDate;
    if (updates.isActive !== undefined) updateData.isActive = updates.isActive;

    const updatedInstrument = await prisma.instrument.update({
      where: { symbol: symbol.toUpperCase() },
      data: updateData,
    });

    // Clear caches
    await redisService.deletePattern(`instrument:${symbol}`);
    await redisService.deletePattern('instruments:*');

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'INSTRUMENT_UPDATED',
        resource: `instrument:${symbol}`,
        details: updates,
      },
    });

    logger.info('Instrument updated', {
      userId,
      symbol,
      updates,
    });

    return this.formatInstrumentSummary(updatedInstrument);
  }

  async deactivateInstrument(userId: string, symbol: string): Promise<void> {
    const instrument = await this.getInstrument(symbol);

    // Check if there are active orders
    const activeOrders = await prisma.order.count({
      where: {
        instrumentSymbol: symbol,
        status: {
          in: ['WORKING', 'PARTIALLY_FILLED'],
        },
      },
    });

    if (activeOrders > 0) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        `Cannot deactivate instrument with ${activeOrders} active orders`,
        HttpStatus.BAD_REQUEST
      );
    }

    await prisma.instrument.update({
      where: { symbol: symbol.toUpperCase() },
      data: {
        isActive: false,
        updatedAt: new Date(),
      },
    });

    // Clear caches
    await redisService.deletePattern(`instrument:${symbol}`);
    await redisService.deletePattern('instruments:*');

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'INSTRUMENT_DEACTIVATED',
        resource: `instrument:${symbol}`,
        details: { symbol },
      },
    });

    logger.info('Instrument deactivated', {
      userId,
      symbol,
    });
  }

  async getInstrumentMarketData(symbol: string): Promise<{
    symbol: string;
    lastPrice?: Decimal;
    bestBid?: Decimal;
    bestAsk?: Decimal;
    spread?: Decimal;
    volume24h: Decimal;
    trades24h: number;
    priceChange24h: Decimal;
    priceChangePercent24h: Decimal;
    high24h?: Decimal;
    low24h?: Decimal;
    timestamp: Date;
  }> {
    const cacheKey = `market_data:${symbol}`;
    const cached = await redisService.getJSON(cacheKey);
    
    if (cached) {
      return {
        ...cached,
        lastPrice: cached.lastPrice ? new Decimal(cached.lastPrice) : undefined,
        bestBid: cached.bestBid ? new Decimal(cached.bestBid) : undefined,
        bestAsk: cached.bestAsk ? new Decimal(cached.bestAsk) : undefined,
        spread: cached.spread ? new Decimal(cached.spread) : undefined,
        volume24h: new Decimal(cached.volume24h),
        priceChange24h: new Decimal(cached.priceChange24h),
        priceChangePercent24h: new Decimal(cached.priceChangePercent24h),
        high24h: cached.high24h ? new Decimal(cached.high24h) : undefined,
        low24h: cached.low24h ? new Decimal(cached.low24h) : undefined,
      };
    }

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
      // Calculate volume
      volume24h = trades24h.reduce((sum, trade) => {
        return sum.add(new Decimal(trade.quantity).mul(new Decimal(trade.price)));
      }, new Decimal(0));

      // Calculate high/low
      const prices = trades24h.map(t => new Decimal(t.price));
      high24h = Decimal.max(...prices);
      low24h = Decimal.min(...prices);

      // Calculate price change
      const firstPrice = new Decimal(trades24h[0].price);
      const lastPrice = lastTrade ? new Decimal(lastTrade.price) : firstPrice;
      
      priceChange24h = lastPrice.sub(firstPrice);
      priceChangePercent24h = firstPrice.isZero() ? new Decimal(0) : priceChange24h.div(firstPrice).mul(100);
    }

    const marketData = {
      symbol,
      lastPrice: lastTrade ? new Decimal(lastTrade.price) : undefined,
      bestBid: undefined, // Would get from order book
      bestAsk: undefined, // Would get from order book
      spread: undefined,
      volume24h,
      trades24h: trades24h.length,
      priceChange24h,
      priceChangePercent24h,
      high24h,
      low24h,
      timestamp: now,
    };

    // Cache for 30 seconds
    await redisService.setJSON(cacheKey, marketData, 30);

    return marketData;
  }

  async getMarketSessions(symbol: string): Promise<MarketSession[]> {
    // For now, return a simple session (24/7 trading)
    // In a real system, this would be configurable per instrument
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    return [
      {
        instrumentSymbol: symbol,
        sessionType: 'REGULAR',
        startTime: startOfDay,
        endTime: endOfDay,
        isActive: true,
      },
    ];
  }

  async isMarketOpen(symbol: string): Promise<boolean> {
    const sessions = await this.getMarketSessions(symbol);
    const now = new Date();

    return sessions.some(session => {
      return session.isActive && now >= session.startTime && now <= session.endTime;
    });
  }

  async getInstrumentStats(): Promise<{
    totalInstruments: number;
    activeInstruments: number;
    instrumentsByType: Record<string, number>;
    expiringInstruments: Array<{
      symbol: string;
      name: string;
      expirationDate: Date;
      daysToExpiry: number;
    }>;
  }> {
    const cacheKey = 'instrument_stats';
    const cached = await redisService.getJSON(cacheKey);
    
    if (cached) {
      return cached;
    }

    const [totalCount, activeCount, instruments] = await Promise.all([
      prisma.instrument.count(),
      prisma.instrument.count({ where: { isActive: true } }),
      prisma.instrument.findMany({
        where: {
          OR: [
            { expirationDate: null },
            { expirationDate: { gt: new Date() } },
          ],
        },
      }),
    ]);

    // Group by type
    const instrumentsByType: Record<string, number> = {};
    for (const instrument of instruments) {
      instrumentsByType[instrument.type] = (instrumentsByType[instrument.type] || 0) + 1;
    }

    // Find expiring instruments (within 30 days)
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const expiringInstruments = instruments
      .filter(i => i.expirationDate && i.expirationDate <= thirtyDaysFromNow)
      .map(i => ({
        symbol: i.symbol,
        name: i.name,
        expirationDate: i.expirationDate!,
        daysToExpiry: Math.ceil((i.expirationDate!.getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
      }))
      .sort((a, b) => a.daysToExpiry - b.daysToExpiry);

    const stats = {
      totalInstruments: totalCount,
      activeInstruments: activeCount,
      instrumentsByType,
      expiringInstruments,
    };

    // Cache for 5 minutes
    await redisService.setJSON(cacheKey, stats, 300);

    return stats;
  }

  private async validateInstrumentRequest(request: CreateInstrumentRequest): Promise<void> {
    const errors: string[] = [];

    // Validate symbol
    if (!request.symbol || request.symbol.trim().length === 0) {
      errors.push('Symbol is required');
    } else if (!/^[A-Z0-9_-]+$/.test(request.symbol.toUpperCase())) {
      errors.push('Symbol must contain only uppercase letters, numbers, underscores, and hyphens');
    }

    // Validate name
    if (!request.name || request.name.trim().length === 0) {
      errors.push('Name is required');
    }

    // Validate prices
    if (request.minPrice <= 0) {
      errors.push('Minimum price must be positive');
    }

    if (request.maxPrice <= 0) {
      errors.push('Maximum price must be positive');
    }

    if (request.minPrice >= request.maxPrice) {
      errors.push('Minimum price must be less than maximum price');
    }

    // Validate tick size
    if (request.tickSize <= 0) {
      errors.push('Tick size must be positive');
    }

    // Validate lot size
    if (request.lotSize <= 0) {
      errors.push('Lot size must be positive');
    }

    // Validate margin rate
    if (request.marginRate !== undefined && (request.marginRate < 0 || request.marginRate > 1)) {
      errors.push('Margin rate must be between 0 and 1');
    }

    // Validate expiration date
    if (request.expirationDate && request.expirationDate <= new Date()) {
      errors.push('Expiration date must be in the future');
    }

    if (errors.length > 0) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        `Validation failed: ${errors.join(', ')}`,
        HttpStatus.BAD_REQUEST,
        { errors }
      );
    }
  }

  private formatInstrumentSummary(instrument: any): InstrumentSummary {
    return {
      symbol: instrument.symbol,
      name: instrument.name,
      description: instrument.description,
      type: instrument.type as InstrumentType,
      minPrice: new Decimal(instrument.minPrice),
      maxPrice: new Decimal(instrument.maxPrice),
      tickSize: new Decimal(instrument.tickSize),
      lotSize: new Decimal(instrument.lotSize),
      marginRate: new Decimal(instrument.marginRate),
      expirationDate: instrument.expirationDate,
      settlementPrice: instrument.settlementPrice ? new Decimal(instrument.settlementPrice) : undefined,
      isActive: instrument.isActive,
      createdAt: instrument.createdAt,
      updatedAt: instrument.updatedAt,
    };
  }
}