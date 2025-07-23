import { GraphQLScalarType, Kind } from 'graphql';
import { Decimal } from 'decimal.js';
import { AuthService } from '../services/auth';
import { AccountService } from '../services/account-service';
import { InstrumentService } from '../services/instrument-service';
import { OrderService } from '../services/trading/order-service';
import { PositionService } from '../services/position-service';
import { MarketDataService } from '../services/market-data-service';
import { prisma } from '../database';
import { AppError } from '../middleware/error';
import { ErrorCode, HttpStatus } from '@trading-exchange/shared';
import { withFilter } from 'graphql-subscriptions';
import { pubsub } from '../services/websocket/websocket-server';

// Custom scalar types
const DateTimeScalar = new GraphQLScalarType({
  name: 'DateTime',
  description: 'Date custom scalar type',
  serialize(value: any) {
    return value instanceof Date ? value.toISOString() : null;
  },
  parseValue(value: any) {
    return new Date(value);
  },
  parseLiteral(ast) {
    if (ast.kind === Kind.STRING) {
      return new Date(ast.value);
    }
    return null;
  },
});

const DecimalScalar = new GraphQLScalarType({
  name: 'Decimal',
  description: 'Decimal custom scalar type',
  serialize(value: any) {
    return value instanceof Decimal ? value.toString() : value;
  },
  parseValue(value: any) {
    return new Decimal(value);
  },
  parseLiteral(ast) {
    if (ast.kind === Kind.STRING || ast.kind === Kind.INT || ast.kind === Kind.FLOAT) {
      return new Decimal(ast.value);
    }
    return null;
  },
});

// Service instances
const authService = new AuthService();
const accountService = new AccountService();
const instrumentService = new InstrumentService();
const orderService = new OrderService();
const positionService = new PositionService();
const marketDataService = new MarketDataService();

export const resolvers = {
  DateTime: DateTimeScalar,
  Decimal: DecimalScalar,

  Query: {
    // User queries
    me: async (_: any, __: any, context: any) => {
      if (!context.user) {
        throw new AppError(ErrorCode.UNAUTHORIZED, 'Authentication required', HttpStatus.UNAUTHORIZED);
      }
      
      return await prisma.user.findUnique({
        where: { id: context.user.id },
        include: {
          accounts: true,
          authProviders: {
            select: { provider: true, createdAt: true },
          },
        },
      });
    },

    // Account queries
    accounts: async (_: any, __: any, context: any) => {
      if (!context.user) {
        throw new AppError(ErrorCode.UNAUTHORIZED, 'Authentication required', HttpStatus.UNAUTHORIZED);
      }
      
      return await accountService.getUserAccounts(context.user.id);
    },

    account: async (_: any, { id }: { id: string }, context: any) => {
      if (!context.user) {
        throw new AppError(ErrorCode.UNAUTHORIZED, 'Authentication required', HttpStatus.UNAUTHORIZED);
      }
      
      return await accountService.getAccount(context.user.id, id);
    },

    // Instrument queries
    instruments: async (_: any, { type, isActive }: { type?: string; isActive?: boolean }) => {
      return await instrumentService.getAllInstruments({ type, isActive });
    },

    instrument: async (_: any, { symbol }: { symbol: string }) => {
      return await instrumentService.getInstrument(symbol);
    },

    // Order queries
    orders: async (_: any, args: any, context: any) => {
      if (!context.user) {
        throw new AppError(ErrorCode.UNAUTHORIZED, 'Authentication required', HttpStatus.UNAUTHORIZED);
      }
      
      return await orderService.getUserOrders({
        userId: context.user.id,
        ...args,
      });
    },

    order: async (_: any, { id }: { id: string }, context: any) => {
      if (!context.user) {
        throw new AppError(ErrorCode.UNAUTHORIZED, 'Authentication required', HttpStatus.UNAUTHORIZED);
      }
      
      return await orderService.getOrder(context.user.id, id);
    },

    orderBook: async (_: any, { symbol }: { symbol: string }) => {
      return await orderService.getOrderBook(symbol);
    },

    // Position queries
    positions: async (_: any, args: any, context: any) => {
      if (!context.user) {
        throw new AppError(ErrorCode.UNAUTHORIZED, 'Authentication required', HttpStatus.UNAUTHORIZED);
      }
      
      return await positionService.getUserPositions({
        userId: context.user.id,
        ...args,
      });
    },

    position: async (_: any, { id }: { id: string }, context: any) => {
      if (!context.user) {
        throw new AppError(ErrorCode.UNAUTHORIZED, 'Authentication required', HttpStatus.UNAUTHORIZED);
      }
      
      return await positionService.getPosition(context.user.id, id);
    },

    positionSummary: async (_: any, { accountId }: { accountId?: string }, context: any) => {
      if (!context.user) {
        throw new AppError(ErrorCode.UNAUTHORIZED, 'Authentication required', HttpStatus.UNAUTHORIZED);
      }
      
      return await positionService.getPositionSummary(context.user.id, accountId);
    },

    // Market data queries
    marketData: async (_: any, { symbol }: { symbol: string }) => {
      return await marketDataService.getMarketTicker(symbol);
    },

    marketSummary: async () => {
      return await marketDataService.getMarketSummary();
    },

    recentTrades: async (_: any, { symbol, limit }: { symbol: string; limit: number }) => {
      return await marketDataService.getRecentTrades(symbol, limit);
    },

    // Trading history
    trades: async (_: any, args: any, context: any) => {
      if (!context.user) {
        throw new AppError(ErrorCode.UNAUTHORIZED, 'Authentication required', HttpStatus.UNAUTHORIZED);
      }
      
      const where: any = {
        OR: [
          { buyerUserId: context.user.id },
          { sellerUserId: context.user.id },
        ],
      };
      
      if (args.instrumentSymbol) {
        where.instrumentSymbol = args.instrumentSymbol;
      }
      
      return await prisma.trade.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        take: args.limit || 50,
        skip: args.offset || 0,
      });
    },
  },

  Mutation: {
    // Authentication
    register: async (_: any, { input }: { input: any }) => {
      try {
        const result = await authService.register(input);
        return {
          success: true,
          token: result.token,
          user: result.user,
          message: 'Registration successful',
        };
      } catch (error) {
        return {
          success: false,
          message: error instanceof Error ? error.message : 'Registration failed',
        };
      }
    },

    login: async (_: any, { input }: { input: any }) => {
      try {
        const result = await authService.login(input);
        return {
          success: true,
          token: result.token,
          user: result.user,
          message: 'Login successful',
        };
      } catch (error) {
        return {
          success: false,
          message: error instanceof Error ? error.message : 'Login failed',
        };
      }
    },

    // Account management
    createAccount: async (_: any, { input }: { input: any }, context: any) => {
      if (!context.user) {
        throw new AppError(ErrorCode.UNAUTHORIZED, 'Authentication required', HttpStatus.UNAUTHORIZED);
      }
      
      return await accountService.createAccount(context.user.id, input);
    },

    updateProfile: async (_: any, { input }: { input: any }, context: any) => {
      if (!context.user) {
        throw new AppError(ErrorCode.UNAUTHORIZED, 'Authentication required', HttpStatus.UNAUTHORIZED);
      }
      
      return await prisma.user.update({
        where: { id: context.user.id },
        data: {
          ...input,
          updatedAt: new Date(),
        },
      });
    },

    // Trading
    placeOrder: async (_: any, { input }: { input: any }, context: any) => {
      if (!context.user) {
        throw new AppError(ErrorCode.UNAUTHORIZED, 'Authentication required', HttpStatus.UNAUTHORIZED);
      }
      
      try {
        const result = await orderService.placeOrder({
          ...input,
          userId: context.user.id,
        });
        
        // Publish order status update
        pubsub.publish('ORDER_STATUS_UPDATE', {
          orderStatusUpdates: result.order,
          userId: context.user.id,
        });
        
        return {
          success: true,
          order: result.order,
          trades: result.trades || [],
          message: 'Order placed successfully',
        };
      } catch (error) {
        return {
          success: false,
          message: error instanceof Error ? error.message : 'Order placement failed',
        };
      }
    },

    cancelOrder: async (_: any, { id }: { id: string }, context: any) => {
      if (!context.user) {
        throw new AppError(ErrorCode.UNAUTHORIZED, 'Authentication required', HttpStatus.UNAUTHORIZED);
      }
      
      try {
        const result = await orderService.cancelOrder(context.user.id, id);
        
        // Publish order status update
        pubsub.publish('ORDER_STATUS_UPDATE', {
          orderStatusUpdates: result.order,
          userId: context.user.id,
        });
        
        return {
          success: true,
          order: result.order,
          message: 'Order cancelled successfully',
        };
      } catch (error) {
        return {
          success: false,
          message: error instanceof Error ? error.message : 'Order cancellation failed',
        };
      }
    },

    modifyOrder: async (_: any, { id, input }: { id: string; input: any }, context: any) => {
      if (!context.user) {
        throw new AppError(ErrorCode.UNAUTHORIZED, 'Authentication required', HttpStatus.UNAUTHORIZED);
      }
      
      try {
        const result = await orderService.modifyOrder(context.user.id, id, input);
        
        // Publish order status update
        pubsub.publish('ORDER_STATUS_UPDATE', {
          orderStatusUpdates: result.order,
          userId: context.user.id,
        });
        
        return {
          success: true,
          order: result.order,
          message: 'Order modified successfully',
        };
      } catch (error) {
        return {
          success: false,
          message: error instanceof Error ? error.message : 'Order modification failed',
        };
      }
    },

    cancelAllOrders: async (_: any, { accountId, instrumentSymbol }: any, context: any) => {
      if (!context.user) {
        throw new AppError(ErrorCode.UNAUTHORIZED, 'Authentication required', HttpStatus.UNAUTHORIZED);
      }
      
      const result = await orderService.cancelAllOrders(context.user.id, {
        accountId,
        instrumentSymbol,
      });
      
      return result.cancelledCount;
    },

    // Account operations
    depositFunds: async (_: any, { accountId, amount, currency }: any, context: any) => {
      if (!context.user) {
        throw new AppError(ErrorCode.UNAUTHORIZED, 'Authentication required', HttpStatus.UNAUTHORIZED);
      }
      
      const result = await accountService.depositFunds(context.user.id, accountId, amount, currency);
      
      // Publish balance update
      pubsub.publish('BALANCE_UPDATE', {
        balanceUpdates: result.balance,
        userId: context.user.id,
      });
      
      return result.balance;
    },

    withdrawFunds: async (_: any, { accountId, amount, currency }: any, context: any) => {
      if (!context.user) {
        throw new AppError(ErrorCode.UNAUTHORIZED, 'Authentication required', HttpStatus.UNAUTHORIZED);
      }
      
      const result = await accountService.withdrawFunds(context.user.id, accountId, amount, currency);
      
      // Publish balance update
      pubsub.publish('BALANCE_UPDATE', {
        balanceUpdates: result.balance,
        userId: context.user.id,
      });
      
      return result.balance;
    },
  },

  Subscription: {
    // Order book updates
    orderBookUpdates: {
      subscribe: withFilter(
        () => pubsub.asyncIterator(['ORDER_BOOK_UPDATE']),
        (payload, variables) => {
          return payload.orderBookUpdates.symbol === variables.symbol;
        }
      ),
    },

    // Trade updates
    tradeUpdates: {
      subscribe: withFilter(
        () => pubsub.asyncIterator(['TRADE_EXECUTED']),
        (payload, variables) => {
          return !variables.symbol || payload.tradeUpdates.instrumentSymbol === variables.symbol;
        }
      ),
    },

    // User-specific updates
    orderStatusUpdates: {
      subscribe: withFilter(
        () => pubsub.asyncIterator(['ORDER_STATUS_UPDATE']),
        (payload, variables, context) => {
          return context.user && payload.userId === context.user.id;
        }
      ),
    },

    positionUpdates: {
      subscribe: withFilter(
        () => pubsub.asyncIterator(['POSITION_UPDATE']),
        (payload, variables, context) => {
          return context.user && payload.userId === context.user.id;
        }
      ),
    },

    balanceUpdates: {
      subscribe: withFilter(
        () => pubsub.asyncIterator(['BALANCE_UPDATE']),
        (payload, variables, context) => {
          return context.user && payload.userId === context.user.id;
        }
      ),
    },

    // Market data updates
    marketDataUpdates: {
      subscribe: withFilter(
        () => pubsub.asyncIterator(['MARKET_DATA_UPDATE']),
        (payload, variables) => {
          return !variables.symbol || payload.marketDataUpdates.symbol === variables.symbol;
        }
      ),
    },
  },

  // Field resolvers
  User: {
    accounts: async (parent: any) => {
      return await prisma.account.findMany({
        where: { userId: parent.id },
      });
    },
  },

  Account: {
    balances: async (parent: any) => {
      return await prisma.balance.findMany({
        where: { accountId: parent.id },
      });
    },
    positions: async (parent: any) => {
      return await prisma.position.findMany({
        where: { accountId: parent.id },
      });
    },
    orders: async (parent: any) => {
      return await prisma.order.findMany({
        where: { accountId: parent.id },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
    },
  },

  Instrument: {
    marketData: async (parent: any) => {
      try {
        return await marketDataService.getMarketTicker(parent.symbol);
      } catch {
        return null;
      }
    },
    orderBook: async (parent: any) => {
      try {
        return await marketDataService.getMarketDepth(parent.symbol);
      } catch {
        return null;
      }
    },
  },

  Order: {
    fills: async (parent: any) => {
      return await prisma.trade.findMany({
        where: {
          OR: [
            { buyOrderId: parent.id },
            { sellOrderId: parent.id },
          ],
        },
        orderBy: { timestamp: 'desc' },
      });
    },
  },

  Position: {
    instrument: async (parent: any) => {
      return await prisma.instrument.findUnique({
        where: { symbol: parent.instrumentSymbol },
      });
    },
  },
};