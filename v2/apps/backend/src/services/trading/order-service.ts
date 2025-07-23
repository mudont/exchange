import { Decimal } from 'decimal.js';
import { prisma } from '../../database';
import { logger } from '../../utils/logger';
import { MatchingEngine } from './matching-engine';
import { OrderBookOrder } from './order-book';
import { AppError } from '../../middleware/error';
import {
  OrderSide,
  OrderType,
  TimeInForce,
  OrderStatus,
  ErrorCode,
  HttpStatus,
  PlaceOrderRequest,
  ModifyOrderRequest,
  CancelOrderRequest,
} from '@trading-exchange/shared';

export interface OrderValidationResult {
  valid: boolean;
  errors: string[];
}

export interface RiskCheckResult {
  passed: boolean;
  errors: string[];
  warnings: string[];
}

export class OrderService {
  private matchingEngine = new MatchingEngine();
  private nextOrderPriority = 1;

  async placeOrder(userId: string, request: PlaceOrderRequest) {
    logger.info('Placing order', {
      userId,
      symbol: request.instrumentSymbol,
      side: request.side,
      quantity: request.quantity,
      price: request.price,
      orderType: request.orderType,
    });

    // Validate the order
    const validation = await this.validateOrder(userId, request);
    if (!validation.valid) {
      throw new AppError(
        ErrorCode.INVALID_ORDER,
        `Order validation failed: ${validation.errors.join(', ')}`,
        HttpStatus.BAD_REQUEST,
        { errors: validation.errors }
      );
    }

    // Perform risk checks
    const riskCheck = await this.performRiskChecks(userId, request);
    if (!riskCheck.passed) {
      throw new AppError(
        ErrorCode.RISK_LIMIT_EXCEEDED,
        `Risk check failed: ${riskCheck.errors.join(', ')}`,
        HttpStatus.FORBIDDEN,
        { errors: riskCheck.errors, warnings: riskCheck.warnings }
      );
    }

    // Create order in database
    const order = await this.createOrderInDatabase(userId, request);

    // Convert to order book format
    const orderBookOrder: OrderBookOrder = {
      id: order.id,
      userId: order.userId,
      side: order.side as OrderSide,
      quantity: new Decimal(order.quantity),
      price: new Decimal(order.price),
      timestamp: order.createdAt,
      priority: this.nextOrderPriority++,
      instrumentSymbol: order.instrumentSymbol,
    };

    // Process through matching engine
    const matchResult = await this.matchingEngine.processOrder(orderBookOrder);

    // Update order status based on matching result
    await this.updateOrderAfterMatching(order.id, matchResult);

    logger.info('Order placed successfully', {
      orderId: order.id,
      userId,
      tradesExecuted: matchResult.trades.length,
    });

    return {
      order,
      trades: matchResult.trades,
      matchResult,
    };
  }

  async cancelOrder(userId: string, request: CancelOrderRequest) {
    logger.info('Cancelling order', {
      userId,
      orderId: request.orderId,
    });

    // Find the order
    const order = await prisma.order.findUnique({
      where: { id: request.orderId },
    });

    if (!order) {
      throw new AppError(
        ErrorCode.ORDER_NOT_FOUND,
        'Order not found',
        HttpStatus.NOT_FOUND
      );
    }

    // Check ownership
    if (order.userId !== userId) {
      throw new AppError(
        ErrorCode.FORBIDDEN,
        'You can only cancel your own orders',
        HttpStatus.FORBIDDEN
      );
    }

    // Check if order can be cancelled
    if (order.status === OrderStatus.FILLED || order.status === OrderStatus.CANCELLED) {
      throw new AppError(
        ErrorCode.INVALID_ORDER,
        `Cannot cancel order with status: ${order.status}`,
        HttpStatus.BAD_REQUEST
      );
    }

    // Remove from order book
    const cancelled = await this.matchingEngine.cancelOrder(order.id, order.instrumentSymbol);

    if (cancelled) {
      // Update order status in database
      await prisma.order.update({
        where: { id: order.id },
        data: {
          status: OrderStatus.CANCELLED,
          updatedAt: new Date(),
        },
      });

      logger.info('Order cancelled successfully', {
        orderId: order.id,
        userId,
      });

      return { success: true, order };
    } else {
      logger.warn('Order not found in order book for cancellation', {
        orderId: order.id,
        symbol: order.instrumentSymbol,
      });

      // Still update database status as it might have been filled between checks
      await prisma.order.update({
        where: { id: order.id },
        data: {
          status: OrderStatus.CANCELLED,
          updatedAt: new Date(),
        },
      });

      return { success: true, order };
    }
  }

  async modifyOrder(userId: string, request: ModifyOrderRequest) {
    logger.info('Modifying order', {
      userId,
      orderId: request.orderId,
      newQuantity: request.quantity,
      newPrice: request.price,
    });

    // Find the order
    const order = await prisma.order.findUnique({
      where: { id: request.orderId },
    });

    if (!order) {
      throw new AppError(
        ErrorCode.ORDER_NOT_FOUND,
        'Order not found',
        HttpStatus.NOT_FOUND
      );
    }

    // Check ownership
    if (order.userId !== userId) {
      throw new AppError(
        ErrorCode.FORBIDDEN,
        'You can only modify your own orders',
        HttpStatus.FORBIDDEN
      );
    }

    // Check if order can be modified
    if (order.status !== OrderStatus.WORKING && order.status !== OrderStatus.PARTIALLY_FILLED) {
      throw new AppError(
        ErrorCode.INVALID_ORDER,
        `Cannot modify order with status: ${order.status}`,
        HttpStatus.BAD_REQUEST
      );
    }

    // Validate new parameters
    if (request.quantity && request.quantity <= 0) {
      throw new AppError(
        ErrorCode.INVALID_ORDER,
        'Quantity must be positive',
        HttpStatus.BAD_REQUEST
      );
    }

    if (request.price && request.price <= 0) {
      throw new AppError(
        ErrorCode.INVALID_ORDER,
        'Price must be positive',
        HttpStatus.BAD_REQUEST
      );
    }

    // Modify in matching engine
    const newQuantity = request.quantity ? new Decimal(request.quantity) : undefined;
    const newPrice = request.price ? new Decimal(request.price) : undefined;

    const matchResult = await this.matchingEngine.modifyOrder(
      order.id,
      order.instrumentSymbol,
      newQuantity,
      newPrice
    );

    if (!matchResult) {
      throw new AppError(
        ErrorCode.INVALID_ORDER,
        'Failed to modify order',
        HttpStatus.BAD_REQUEST
      );
    }

    // Update order in database
    const updateData: any = {
      updatedAt: new Date(),
    };

    if (request.quantity) {
      updateData.quantity = new Decimal(request.quantity);
    }

    if (request.price) {
      updateData.price = new Decimal(request.price);
    }

    const updatedOrder = await prisma.order.update({
      where: { id: order.id },
      data: updateData,
    });

    logger.info('Order modified successfully', {
      orderId: order.id,
      userId,
      tradesExecuted: matchResult.trades.length,
    });

    return {
      order: updatedOrder,
      trades: matchResult.trades,
      matchResult,
    };
  }

  async getOrder(userId: string, orderId: string) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        instrument: true,
        account: true,
        buyTrades: true,
        sellTrades: true,
      },
    });

    if (!order) {
      throw new AppError(
        ErrorCode.ORDER_NOT_FOUND,
        'Order not found',
        HttpStatus.NOT_FOUND
      );
    }

    // Check ownership
    if (order.userId !== userId) {
      throw new AppError(
        ErrorCode.FORBIDDEN,
        'You can only view your own orders',
        HttpStatus.FORBIDDEN
      );
    }

    return order;
  }

  async getUserOrders(userId: string, filters?: {
    status?: OrderStatus;
    instrumentSymbol?: string;
    side?: OrderSide;
    limit?: number;
    offset?: number;
  }) {
    const where: any = { userId };

    if (filters?.status) {
      where.status = filters.status;
    }

    if (filters?.instrumentSymbol) {
      where.instrumentSymbol = filters.instrumentSymbol;
    }

    if (filters?.side) {
      where.side = filters.side;
    }

    const orders = await prisma.order.findMany({
      where,
      include: {
        instrument: true,
        account: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: filters?.limit || 50,
      skip: filters?.offset || 0,
    });

    const total = await prisma.order.count({ where });

    return {
      orders,
      total,
      limit: filters?.limit || 50,
      offset: filters?.offset || 0,
    };
  }

  private async validateOrder(userId: string, request: PlaceOrderRequest): Promise<OrderValidationResult> {
    const errors: string[] = [];

    // Check if instrument exists and is active
    const instrument = await prisma.instrument.findUnique({
      where: { symbol: request.instrumentSymbol },
    });

    if (!instrument) {
      errors.push('Instrument not found');
      return { valid: false, errors };
    }

    if (!instrument.isActive) {
      errors.push('Instrument is not active');
    }

    // Check if instrument has expired
    if (instrument.expirationDate && instrument.expirationDate < new Date()) {
      errors.push('Instrument has expired');
    }

    // Validate price bounds
    const minPrice = new Decimal(instrument.minPrice);
    const maxPrice = new Decimal(instrument.maxPrice);
    const orderPrice = new Decimal(request.price);

    if (orderPrice.lt(minPrice) || orderPrice.gt(maxPrice)) {
      errors.push(`Price must be between ${minPrice} and ${maxPrice}`);
    }

    // Validate tick size
    const tickSize = new Decimal(instrument.tickSize);
    if (!tickSize.isZero() && !orderPrice.mod(tickSize).isZero()) {
      errors.push(`Price must be a multiple of tick size ${tickSize}`);
    }

    // Validate lot size
    const lotSize = new Decimal(instrument.lotSize);
    const orderQuantity = new Decimal(request.quantity);
    if (!lotSize.isZero() && !orderQuantity.mod(lotSize).isZero()) {
      errors.push(`Quantity must be a multiple of lot size ${lotSize}`);
    }

    // Validate account exists and user has access
    const account = await prisma.account.findUnique({
      where: { id: request.accountId },
    });

    if (!account) {
      errors.push('Account not found');
    } else if (account.userId !== userId) {
      errors.push('You do not have access to this account');
    } else if (!account.isActive) {
      errors.push('Account is not active');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  private async performRiskChecks(userId: string, request: PlaceOrderRequest): Promise<RiskCheckResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Get user's account and balance
    const account = await prisma.account.findUnique({
      where: { id: request.accountId },
      include: {
        balances: true,
      },
    });

    if (!account) {
      errors.push('Account not found');
      return { passed: false, errors, warnings };
    }

    // Check available balance
    const orderValue = new Decimal(request.quantity).mul(new Decimal(request.price));
    const balance = account.balances.find(b => b.currency === 'USD'); // Assuming USD for now

    if (!balance) {
      errors.push('No balance found for trading currency');
    } else {
      const availableBalance = new Decimal(balance.availableBalance);
      
      if (request.side === OrderSide.BUY && orderValue.gt(availableBalance)) {
        errors.push(`Insufficient balance. Required: ${orderValue}, Available: ${availableBalance}`);
      }
    }

    // Check position limits (placeholder - would implement based on business rules)
    const existingPositions = await prisma.position.findMany({
      where: {
        accountId: request.accountId,
        instrumentSymbol: request.instrumentSymbol,
      },
    });

    // Add more risk checks as needed
    // - Daily trading limits
    // - Maximum position size
    // - Concentration limits
    // - Margin requirements

    return {
      passed: errors.length === 0,
      errors,
      warnings,
    };
  }

  private async createOrderInDatabase(userId: string, request: PlaceOrderRequest) {
    return await prisma.order.create({
      data: {
        instrumentSymbol: request.instrumentSymbol,
        accountId: request.accountId,
        userId: userId,
        side: request.side,
        quantity: new Decimal(request.quantity),
        price: new Decimal(request.price),
        orderType: request.orderType,
        timeInForce: request.timeInForce || TimeInForce.GTC,
        status: OrderStatus.WORKING,
        filledQuantity: new Decimal(0),
        displayQuantity: request.displayQuantity ? new Decimal(request.displayQuantity) : null,
      },
      include: {
        instrument: true,
        account: true,
      },
    });
  }

  private async updateOrderAfterMatching(orderId: string, matchResult: any) {
    // The matching engine already updates order statuses during trade persistence
    // This method can be used for additional post-matching updates if needed
    
    logger.debug('Order updated after matching', {
      orderId,
      tradesCount: matchResult.trades.length,
    });
  }

  // Get order book snapshot
  getOrderBookSnapshot(symbol: string) {
    return this.matchingEngine.getOrderBookSnapshot(symbol);
  }

  // Get market statistics
  getMarketStats(symbol: string) {
    return this.matchingEngine.getMarketStats(symbol);
  }

  // Administrative functions
  async getOrderBookIntegrity(symbol: string) {
    return this.matchingEngine.validateOrderBookIntegrity(symbol);
  }

  async getActiveOrderBooks() {
    return this.matchingEngine.getActiveOrderBooks();
  }
}