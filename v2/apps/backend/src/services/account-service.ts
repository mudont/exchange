import { Decimal } from 'decimal.js';
import { prisma } from '../database';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/error';
import { ErrorCode, HttpStatus } from '@trading-exchange/shared';
import { redisService } from './cache/redis-service';

export interface CreateAccountRequest {
  name: string;
  type?: string;
  initialBalance?: number;
  currency?: string;
}

export interface AccountSummary {
  id: string;
  name: string;
  type: string;
  isActive: boolean;
  totalBalance: Decimal;
  availableBalance: Decimal;
  reservedBalance: Decimal;
  totalPnL: Decimal;
  createdAt: Date;
  updatedAt: Date;
}

export interface TransactionHistory {
  id: string;
  type: string;
  amount: Decimal;
  currency: string;
  description: string;
  timestamp: Date;
  balanceAfter: Decimal;
}

export class AccountService {
  private readonly defaultCurrency = 'USD';

  async createAccount(userId: string, request: CreateAccountRequest) {
    logger.info('Creating account', {
      userId,
      accountName: request.name,
      type: request.type,
    });

    // Validate request
    if (!request.name || request.name.trim().length === 0) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        'Account name is required',
        HttpStatus.BAD_REQUEST
      );
    }

    // Check if user already has an account with this name
    const existingAccount = await prisma.account.findFirst({
      where: {
        userId,
        name: request.name.trim(),
      },
    });

    if (existingAccount) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        'Account with this name already exists',
        HttpStatus.CONFLICT
      );
    }

    // Create account with initial balance
    const account = await prisma.$transaction(async (tx) => {
      const newAccount = await tx.account.create({
        data: {
          userId,
          name: request.name.trim(),
          type: request.type || 'TRADING',
          isActive: true,
        },
      });

      // Create initial balance if specified
      if (request.initialBalance && request.initialBalance > 0) {
        await tx.balance.create({
          data: {
            accountId: newAccount.id,
            currency: request.currency || this.defaultCurrency,
            balance: new Decimal(request.initialBalance),
            availableBalance: new Decimal(request.initialBalance),
            reservedBalance: new Decimal(0),
          },
        });

        // Create audit log
        await tx.auditLog.create({
          data: {
            userId,
            action: 'ACCOUNT_CREATED',
            resource: `account:${newAccount.id}`,
            details: {
              accountName: request.name,
              initialBalance: request.initialBalance,
              currency: request.currency || this.defaultCurrency,
            },
          },
        });
      }

      return newAccount;
    });

    logger.info('Account created successfully', {
      userId,
      accountId: account.id,
      accountName: account.name,
    });

    return account;
  }

  async getAccount(userId: string, accountId: string) {
    const account = await prisma.account.findUnique({
      where: { id: accountId },
      include: {
        balances: true,
        positions: {
          include: {
            instrument: true,
          },
        },
      },
    });

    if (!account) {
      throw new AppError(
        ErrorCode.NOT_FOUND,
        'Account not found',
        HttpStatus.NOT_FOUND
      );
    }

    // Check ownership
    if (account.userId !== userId) {
      throw new AppError(
        ErrorCode.FORBIDDEN,
        'You can only access your own accounts',
        HttpStatus.FORBIDDEN
      );
    }

    return account;
  }

  async getUserAccounts(userId: string): Promise<AccountSummary[]> {
    // Try cache first
    const cacheKey = `user_accounts:${userId}`;
    const cached = await redisService.getJSON<AccountSummary[]>(cacheKey);
    
    if (cached) {
      logger.debug('User accounts served from cache', { userId });
      return cached;
    }

    const accounts = await prisma.account.findMany({
      where: { userId },
      include: {
        balances: true,
        positions: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const accountSummaries: AccountSummary[] = [];

    for (const account of accounts) {
      // Calculate totals
      let totalBalance = new Decimal(0);
      let availableBalance = new Decimal(0);
      let reservedBalance = new Decimal(0);

      for (const balance of account.balances) {
        totalBalance = totalBalance.add(new Decimal(balance.balance));
        availableBalance = availableBalance.add(new Decimal(balance.availableBalance));
        reservedBalance = reservedBalance.add(new Decimal(balance.reservedBalance));
      }

      // Calculate total P&L from positions
      let totalPnL = new Decimal(0);
      for (const position of account.positions) {
        totalPnL = totalPnL.add(new Decimal(position.realizedPnL));
        totalPnL = totalPnL.add(new Decimal(position.unrealizedPnL));
      }

      accountSummaries.push({
        id: account.id,
        name: account.name,
        type: account.type,
        isActive: account.isActive,
        totalBalance,
        availableBalance,
        reservedBalance,
        totalPnL,
        createdAt: account.createdAt,
        updatedAt: account.updatedAt,
      });
    }

    // Cache for 30 seconds
    await redisService.setJSON(cacheKey, accountSummaries, 30);

    return accountSummaries;
  }

  async updateAccount(userId: string, accountId: string, updates: {
    name?: string;
    isActive?: boolean;
  }) {
    const account = await this.getAccount(userId, accountId);

    const updatedAccount = await prisma.account.update({
      where: { id: accountId },
      data: {
        ...updates,
        updatedAt: new Date(),
      },
    });

    // Clear cache
    await redisService.del(`user_accounts:${userId}`);

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'ACCOUNT_UPDATED',
        resource: `account:${accountId}`,
        details: updates,
      },
    });

    logger.info('Account updated', {
      userId,
      accountId,
      updates,
    });

    return updatedAccount;
  }

  async deleteAccount(userId: string, accountId: string) {
    const account = await this.getAccount(userId, accountId);

    // Check if account has active positions or non-zero balances
    const hasActivePositions = await prisma.position.findFirst({
      where: {
        accountId,
        quantity: { not: 0 },
      },
    });

    if (hasActivePositions) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        'Cannot delete account with active positions',
        HttpStatus.BAD_REQUEST
      );
    }

    const hasNonZeroBalances = await prisma.balance.findFirst({
      where: {
        accountId,
        balance: { not: 0 },
      },
    });

    if (hasNonZeroBalances) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        'Cannot delete account with non-zero balances',
        HttpStatus.BAD_REQUEST
      );
    }

    // Soft delete by marking as inactive
    await prisma.account.update({
      where: { id: accountId },
      data: {
        isActive: false,
        updatedAt: new Date(),
      },
    });

    // Clear cache
    await redisService.del(`user_accounts:${userId}`);

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'ACCOUNT_DELETED',
        resource: `account:${accountId}`,
        details: { accountName: account.name },
      },
    });

    logger.info('Account deleted', {
      userId,
      accountId,
      accountName: account.name,
    });

    return { success: true };
  }

  async depositFunds(userId: string, accountId: string, amount: number, currency = this.defaultCurrency) {
    if (amount <= 0) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        'Deposit amount must be positive',
        HttpStatus.BAD_REQUEST
      );
    }

    const account = await this.getAccount(userId, accountId);

    const result = await prisma.$transaction(async (tx) => {
      // Get or create balance record
      let balance = await tx.balance.findUnique({
        where: {
          accountId_currency: {
            accountId,
            currency,
          },
        },
      });

      if (!balance) {
        balance = await tx.balance.create({
          data: {
            accountId,
            currency,
            balance: new Decimal(amount),
            availableBalance: new Decimal(amount),
            reservedBalance: new Decimal(0),
          },
        });
      } else {
        const newBalance = new Decimal(balance.balance).add(amount);
        const newAvailableBalance = new Decimal(balance.availableBalance).add(amount);

        balance = await tx.balance.update({
          where: {
            accountId_currency: {
              accountId,
              currency,
            },
          },
          data: {
            balance: newBalance,
            availableBalance: newAvailableBalance,
            updatedAt: new Date(),
          },
        });
      }

      // Create audit log
      await tx.auditLog.create({
        data: {
          userId,
          action: 'FUNDS_DEPOSITED',
          resource: `account:${accountId}:balance:${currency}`,
          details: {
            amount,
            currency,
            balanceAfter: balance.balance.toString(),
          },
        },
      });

      return balance;
    });

    // Clear cache
    await redisService.del(`user_accounts:${userId}`);

    logger.info('Funds deposited', {
      userId,
      accountId,
      amount,
      currency,
      newBalance: result.balance.toString(),
    });

    return result;
  }

  async withdrawFunds(userId: string, accountId: string, amount: number, currency = this.defaultCurrency) {
    if (amount <= 0) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        'Withdrawal amount must be positive',
        HttpStatus.BAD_REQUEST
      );
    }

    const account = await this.getAccount(userId, accountId);

    const result = await prisma.$transaction(async (tx) => {
      const balance = await tx.balance.findUnique({
        where: {
          accountId_currency: {
            accountId,
            currency,
          },
        },
      });

      if (!balance) {
        throw new AppError(
          ErrorCode.INSUFFICIENT_BALANCE,
          'No balance found for this currency',
          HttpStatus.BAD_REQUEST
        );
      }

      const availableBalance = new Decimal(balance.availableBalance);
      const withdrawalAmount = new Decimal(amount);

      if (availableBalance.lt(withdrawalAmount)) {
        throw new AppError(
          ErrorCode.INSUFFICIENT_BALANCE,
          `Insufficient balance. Available: ${availableBalance}, Requested: ${withdrawalAmount}`,
          HttpStatus.BAD_REQUEST
        );
      }

      const newBalance = new Decimal(balance.balance).sub(withdrawalAmount);
      const newAvailableBalance = availableBalance.sub(withdrawalAmount);

      const updatedBalance = await tx.balance.update({
        where: {
          accountId_currency: {
            accountId,
            currency,
          },
        },
        data: {
          balance: newBalance,
          availableBalance: newAvailableBalance,
          updatedAt: new Date(),
        },
      });

      // Create audit log
      await tx.auditLog.create({
        data: {
          userId,
          action: 'FUNDS_WITHDRAWN',
          resource: `account:${accountId}:balance:${currency}`,
          details: {
            amount,
            currency,
            balanceAfter: updatedBalance.balance.toString(),
          },
        },
      });

      return updatedBalance;
    });

    // Clear cache
    await redisService.del(`user_accounts:${userId}`);

    logger.info('Funds withdrawn', {
      userId,
      accountId,
      amount,
      currency,
      newBalance: result.balance.toString(),
    });

    return result;
  }

  async getAccountBalances(userId: string, accountId: string) {
    const account = await this.getAccount(userId, accountId);

    return await prisma.balance.findMany({
      where: { accountId },
      orderBy: { currency: 'asc' },
    });
  }

  async getTransactionHistory(
    userId: string,
    accountId: string,
    options: {
      currency?: string;
      limit?: number;
      offset?: number;
      startDate?: Date;
      endDate?: Date;
    } = {}
  ): Promise<{ transactions: TransactionHistory[]; total: number }> {
    const account = await this.getAccount(userId, accountId);

    const where: any = {
      resource: {
        startsWith: `account:${accountId}`,
      },
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

    const [auditLogs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        take: options.limit || 50,
        skip: options.offset || 0,
      }),
      prisma.auditLog.count({ where }),
    ]);

    const transactions: TransactionHistory[] = auditLogs.map(log => ({
      id: log.id,
      type: log.action,
      amount: log.details?.amount ? new Decimal(log.details.amount) : new Decimal(0),
      currency: log.details?.currency || this.defaultCurrency,
      description: this.getTransactionDescription(log.action, log.details),
      timestamp: log.timestamp,
      balanceAfter: log.details?.balanceAfter ? new Decimal(log.details.balanceAfter) : new Decimal(0),
    }));

    return { transactions, total };
  }

  async getTradingHistory(
    userId: string,
    accountId: string,
    options: {
      instrumentSymbol?: string;
      startDate?: Date;
      endDate?: Date;
      limit?: number;
      offset?: number;
    } = {}
  ) {
    const account = await this.getAccount(userId, accountId);

    const where: any = {
      OR: [
        { buyerUserId: userId },
        { sellerUserId: userId },
      ],
    };

    if (options.instrumentSymbol) {
      where.instrumentSymbol = options.instrumentSymbol;
    }

    if (options.startDate || options.endDate) {
      where.timestamp = {};
      if (options.startDate) {
        where.timestamp.gte = options.startDate;
      }
      if (options.endDate) {
        where.timestamp.lte = options.endDate;
      }
    }

    const [trades, total] = await Promise.all([
      prisma.trade.findMany({
        where,
        include: {
          instrument: true,
          buyOrder: true,
          sellOrder: true,
        },
        orderBy: { timestamp: 'desc' },
        take: options.limit || 50,
        skip: options.offset || 0,
      }),
      prisma.trade.count({ where }),
    ]);

    const tradingHistory = trades.map(trade => ({
      id: trade.id,
      instrumentSymbol: trade.instrumentSymbol,
      instrumentName: trade.instrument.name,
      side: trade.buyerUserId === userId ? 'BUY' : 'SELL',
      quantity: new Decimal(trade.quantity),
      price: new Decimal(trade.price),
      value: new Decimal(trade.quantity).mul(new Decimal(trade.price)),
      timestamp: trade.timestamp,
      counterparty: trade.buyerUserId === userId ? trade.sellerUserId : trade.buyerUserId,
      orderId: trade.buyerUserId === userId ? trade.buyOrderId : trade.sellOrderId,
    }));

    return { trades: tradingHistory, total };
  }

  async generateTradingReport(
    userId: string,
    accountId: string,
    options: {
      startDate: Date;
      endDate: Date;
      instrumentSymbol?: string;
    }
  ) {
    const account = await this.getAccount(userId, accountId);

    // Get trading history for the period
    const { trades } = await this.getTradingHistory(userId, accountId, {
      startDate: options.startDate,
      endDate: options.endDate,
      instrumentSymbol: options.instrumentSymbol,
      limit: 10000, // Get all trades for the period
    });

    // Calculate summary statistics
    let totalVolume = new Decimal(0);
    let totalBuyVolume = new Decimal(0);
    let totalSellVolume = new Decimal(0);
    let totalTrades = trades.length;
    let buyTrades = 0;
    let sellTrades = 0;
    let totalFees = new Decimal(0);

    const instrumentBreakdown: Record<string, {
      symbol: string;
      name: string;
      trades: number;
      volume: Decimal;
      avgPrice: Decimal;
      pnl: Decimal;
    }> = {};

    for (const trade of trades) {
      const volume = trade.value;
      totalVolume = totalVolume.add(volume);

      if (trade.side === 'BUY') {
        totalBuyVolume = totalBuyVolume.add(volume);
        buyTrades++;
      } else {
        totalSellVolume = totalSellVolume.add(volume);
        sellTrades++;
      }

      // Instrument breakdown
      if (!instrumentBreakdown[trade.instrumentSymbol]) {
        instrumentBreakdown[trade.instrumentSymbol] = {
          symbol: trade.instrumentSymbol,
          name: trade.instrumentName,
          trades: 0,
          volume: new Decimal(0),
          avgPrice: new Decimal(0),
          pnl: new Decimal(0),
        };
      }

      const breakdown = instrumentBreakdown[trade.instrumentSymbol];
      breakdown.trades++;
      breakdown.volume = breakdown.volume.add(volume);
      
      // Calculate weighted average price
      const totalQuantity = breakdown.volume.div(breakdown.avgPrice.isZero() ? trade.price : breakdown.avgPrice);
      breakdown.avgPrice = breakdown.volume.div(totalQuantity.add(trade.quantity));
    }

    // Get position changes during the period
    const positions = await prisma.position.findMany({
      where: { accountId },
      include: { instrument: true },
    });

    let totalRealizedPnL = new Decimal(0);
    let totalUnrealizedPnL = new Decimal(0);

    for (const position of positions) {
      totalRealizedPnL = totalRealizedPnL.add(new Decimal(position.realizedPnL));
      totalUnrealizedPnL = totalUnrealizedPnL.add(new Decimal(position.unrealizedPnL));
    }

    return {
      period: {
        startDate: options.startDate,
        endDate: options.endDate,
        days: Math.ceil((options.endDate.getTime() - options.startDate.getTime()) / (1000 * 60 * 60 * 24)),
      },
      summary: {
        totalTrades,
        totalVolume,
        totalBuyVolume,
        totalSellVolume,
        buyTrades,
        sellTrades,
        avgTradeSize: totalTrades > 0 ? totalVolume.div(totalTrades) : new Decimal(0),
        totalRealizedPnL,
        totalUnrealizedPnL,
        totalPnL: totalRealizedPnL.add(totalUnrealizedPnL),
      },
      instrumentBreakdown: Object.values(instrumentBreakdown),
      recentTrades: trades.slice(0, 10),
    };
  }

  async getTradingHistory(
    userId: string,
    accountId: string,
    options: {
      instrumentSymbol?: string;
      limit?: number;
      offset?: number;
      startDate?: Date;
      endDate?: Date;
    } = {}
  ) {
    const account = await this.getAccount(userId, accountId);

    const where: any = {
      OR: [
        { buyerUserId: userId },
        { sellerUserId: userId },
      ],
    };

    if (options.instrumentSymbol) {
      where.instrumentSymbol = options.instrumentSymbol;
    }

    if (options.startDate || options.endDate) {
      where.timestamp = {};
      if (options.startDate) {
        where.timestamp.gte = options.startDate;
      }
      if (options.endDate) {
        where.timestamp.lte = options.endDate;
      }
    }

    const [trades, total] = await Promise.all([
      prisma.trade.findMany({
        where,
        include: {
          instrument: true,
          buyOrder: true,
          sellOrder: true,
        },
        orderBy: { timestamp: 'desc' },
        take: options.limit || 50,
        skip: options.offset || 0,
      }),
      prisma.trade.count({ where }),
    ]);

    const tradingHistory = trades.map(trade => ({
      id: trade.id,
      instrumentSymbol: trade.instrumentSymbol,
      instrumentName: trade.instrument.name,
      side: trade.buyerUserId === userId ? 'BUY' : 'SELL',
      quantity: new Decimal(trade.quantity),
      price: new Decimal(trade.price),
      value: new Decimal(trade.quantity).mul(new Decimal(trade.price)),
      timestamp: trade.timestamp,
      orderId: trade.buyerUserId === userId ? trade.buyOrderId : trade.sellOrderId,
      counterparty: trade.buyerUserId === userId ? 'SELLER' : 'BUYER',
    }));

    return { trades: tradingHistory, total };
  }

  async getTradingStatistics(
    userId: string,
    accountId: string,
    options: {
      period?: 'day' | 'week' | 'month' | 'year';
      instrumentSymbol?: string;
    } = {}
  ) {
    const account = await this.getAccount(userId, accountId);

    // Calculate date range based on period
    const now = new Date();
    let startDate: Date;
    
    switch (options.period) {
      case 'day':
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case 'year':
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(0); // All time
    }

    const { trades } = await this.getTradingHistory(userId, accountId, {
      instrumentSymbol: options.instrumentSymbol,
      startDate,
      limit: 1000, // Get more data for statistics
    });

    // Calculate statistics
    let totalVolume = new Decimal(0);
    let totalTrades = trades.length;
    let buyTrades = 0;
    let sellTrades = 0;
    let totalBuyVolume = new Decimal(0);
    let totalSellVolume = new Decimal(0);
    let avgTradeSize = new Decimal(0);

    const instrumentStats: Record<string, {
      trades: number;
      volume: Decimal;
      avgPrice: Decimal;
    }> = {};

    for (const trade of trades) {
      totalVolume = totalVolume.add(trade.value);
      
      if (trade.side === 'BUY') {
        buyTrades++;
        totalBuyVolume = totalBuyVolume.add(trade.value);
      } else {
        sellTrades++;
        totalSellVolume = totalSellVolume.add(trade.value);
      }

      // Instrument-specific stats
      if (!instrumentStats[trade.instrumentSymbol]) {
        instrumentStats[trade.instrumentSymbol] = {
          trades: 0,
          volume: new Decimal(0),
          avgPrice: new Decimal(0),
        };
      }
      
      const instStats = instrumentStats[trade.instrumentSymbol];
      instStats.trades++;
      instStats.volume = instStats.volume.add(trade.value);
      instStats.avgPrice = instStats.volume.div(instStats.trades);
    }

    if (totalTrades > 0) {
      avgTradeSize = totalVolume.div(totalTrades);
    }

    return {
      period: options.period || 'all_time',
      totalTrades,
      totalVolume,
      avgTradeSize,
      buyTrades,
      sellTrades,
      totalBuyVolume,
      totalSellVolume,
      buyVsSellRatio: sellTrades > 0 ? buyTrades / sellTrades : 0,
      instrumentStats,
      startDate,
      endDate: now,
    };
  }

  private getTransactionDescription(action: string, details: any): string {
    switch (action) {
      case 'FUNDS_DEPOSITED':
        return `Deposit of ${details?.amount} ${details?.currency || this.defaultCurrency}`;
      case 'FUNDS_WITHDRAWN':
        return `Withdrawal of ${details?.amount} ${details?.currency || this.defaultCurrency}`;
      case 'TRADE_SETTLEMENT':
        return 'Trade settlement';
      case 'ACCOUNT_CREATED':
        return 'Account created';
      case 'ACCOUNT_UPDATED':
        return 'Account updated';
      case 'ACCOUNT_DELETED':
        return 'Account deleted';
      default:
        return action.replace(/_/g, ' ').toLowerCase();
    }
  }

  // Administrative functions
  async getAccountStats(userId: string, accountId: string) {
    const account = await this.getAccount(userId, accountId);

    const [balances, positions, recentTrades, orderCount] = await Promise.all([
      prisma.balance.findMany({ where: { accountId } }),
      prisma.position.findMany({ 
        where: { accountId },
        include: { instrument: true }
      }),
      prisma.trade.findMany({
        where: {
          OR: [
            { buyerUserId: userId },
            { sellerUserId: userId },
          ],
        },
        orderBy: { timestamp: 'desc' },
        take: 10,
      }),
      prisma.order.count({
        where: { 
          userId,
          accountId,
        },
      }),
    ]);

    // Calculate totals
    let totalBalance = new Decimal(0);
    let totalPnL = new Decimal(0);
    let activePositions = 0;

    for (const balance of balances) {
      totalBalance = totalBalance.add(new Decimal(balance.balance));
    }

    for (const position of positions) {
      if (!new Decimal(position.quantity).isZero()) {
        activePositions++;
      }
      totalPnL = totalPnL.add(new Decimal(position.realizedPnL));
      totalPnL = totalPnL.add(new Decimal(position.unrealizedPnL));
    }

    return {
      account: {
        id: account.id,
        name: account.name,
        type: account.type,
        isActive: account.isActive,
        createdAt: account.createdAt,
      },
      summary: {
        totalBalance,
        totalPnL,
        activePositions,
        totalOrders: orderCount,
        recentTradesCount: recentTrades.length,
      },
      balances,
      positions: positions.slice(0, 5), // Top 5 positions
      recentTrades: recentTrades.slice(0, 5), // Recent 5 trades
    };
  }
}