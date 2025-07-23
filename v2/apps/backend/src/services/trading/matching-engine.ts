import { Decimal } from 'decimal.js';
import { OrderBook, OrderBookOrder } from './order-book';
import { OrderSide, OrderStatus } from '@trading-exchange/shared';
import { logger } from '../../utils/logger';
import { prisma } from '../../database';
import { redisService } from '../cache/redis-service';

export interface Trade {
  id: string;
  instrumentSymbol: string;
  buyOrderId: string;
  sellOrderId: string;
  quantity: Decimal;
  price: Decimal;
  buyerUserId: string;
  sellerUserId: string;
  timestamp: Date;
}

export interface MatchResult {
  trades: Trade[];
  updatedOrders: OrderBookOrder[];
  orderBookChanges: OrderBookChange[];
}

export interface OrderBookChange {
  side: OrderSide;
  price: number;
  quantity: number;
  orderCount: number;
}

export class MatchingEngine {
  private orderBooks: Map<string, OrderBook> = new Map();
  private nextTradeId = 1;

  constructor() {
    logger.info('Matching engine initialized');
  }

  getOrderBook(symbol: string): OrderBook {
    let orderBook = this.orderBooks.get(symbol);
    if (!orderBook) {
      orderBook = new OrderBook(symbol);
      this.orderBooks.set(symbol, orderBook);
      logger.info('Created new order book', { symbol });
    }
    return orderBook;
  }

  async processOrder(order: OrderBookOrder): Promise<MatchResult> {
    const orderBook = this.getOrderBook(order.instrumentSymbol);
    
    logger.info('Processing order', {
      orderId: order.id,
      symbol: order.instrumentSymbol,
      side: order.side,
      quantity: order.quantity.toString(),
      price: order.price.toString(),
    });

    // Get matchable orders before adding the new order
    const matchableOrders = orderBook.getMatchableOrders(order.side, order.price);
    
    const result: MatchResult = {
      trades: [],
      updatedOrders: [],
      orderBookChanges: [],
    };

    let remainingQuantity = order.quantity;
    const updatedOrders: OrderBookOrder[] = [];

    // Process matches
    for (const matchingOrder of matchableOrders) {
      if (remainingQuantity.isZero()) break;

      // Prevent self-matching
      if (matchingOrder.userId === order.userId) {
        logger.warn('Prevented self-match', {
          orderId: order.id,
          matchingOrderId: matchingOrder.id,
          userId: order.userId,
        });
        continue;
      }

      const tradeQuantity = Decimal.min(remainingQuantity, matchingOrder.quantity);
      const tradePrice = matchingOrder.price; // Price improvement for taker

      // Create trade
      const trade: Trade = {
        id: this.generateTradeId(),
        instrumentSymbol: order.instrumentSymbol,
        buyOrderId: order.side === OrderSide.BUY ? order.id : matchingOrder.id,
        sellOrderId: order.side === OrderSide.SELL ? order.id : matchingOrder.id,
        quantity: tradeQuantity,
        price: tradePrice,
        buyerUserId: order.side === OrderSide.BUY ? order.userId : matchingOrder.userId,
        sellerUserId: order.side === OrderSide.SELL ? order.userId : matchingOrder.userId,
        timestamp: new Date(),
      };

      result.trades.push(trade);

      // Update quantities
      remainingQuantity = remainingQuantity.sub(tradeQuantity);
      matchingOrder.quantity = matchingOrder.quantity.sub(tradeQuantity);

      // Update matching order in order book
      if (matchingOrder.quantity.isZero()) {
        orderBook.removeOrder(matchingOrder.id);
        logger.debug('Removed fully filled order', { orderId: matchingOrder.id });
      } else {
        orderBook.updateOrderQuantity(matchingOrder.id, matchingOrder.quantity);
        logger.debug('Updated partially filled order', {
          orderId: matchingOrder.id,
          remainingQuantity: matchingOrder.quantity.toString(),
        });
      }

      updatedOrders.push(matchingOrder);

      logger.info('Trade executed', {
        tradeId: trade.id,
        buyOrderId: trade.buyOrderId,
        sellOrderId: trade.sellOrderId,
        quantity: trade.quantity.toString(),
        price: trade.price.toString(),
        buyer: trade.buyerUserId,
        seller: trade.sellerUserId,
      });
    }

    // Update the incoming order
    order.quantity = remainingQuantity;
    updatedOrders.push(order);

    // Add remaining quantity to order book if any
    if (!remainingQuantity.isZero()) {
      orderBook.addOrder(order);
      logger.debug('Added remaining order to book', {
        orderId: order.id,
        remainingQuantity: remainingQuantity.toString(),
      });
    }

    result.updatedOrders = updatedOrders;

    // Persist trades to database
    await this.persistTrades(result.trades);

    // Generate order book changes for real-time updates
    result.orderBookChanges = this.generateOrderBookChanges(orderBook);

    logger.info('Order processing completed', {
      orderId: order.id,
      tradesExecuted: result.trades.length,
      remainingQuantity: remainingQuantity.toString(),
    });

    return result;
  }

  async cancelOrder(orderId: string, symbol: string): Promise<boolean> {
    const orderBook = this.getOrderBook(symbol);
    const removedOrder = orderBook.removeOrder(orderId);

    if (removedOrder) {
      logger.info('Order cancelled', {
        orderId,
        symbol,
        side: removedOrder.side,
        quantity: removedOrder.quantity.toString(),
        price: removedOrder.price.toString(),
      });
      return true;
    }

    logger.warn('Order not found for cancellation', { orderId, symbol });
    return false;
  }

  async modifyOrder(
    orderId: string,
    symbol: string,
    newQuantity?: Decimal,
    newPrice?: Decimal
  ): Promise<MatchResult | null> {
    const orderBook = this.getOrderBook(symbol);
    
    // For price changes, we need to remove and re-add the order
    if (newPrice) {
      const removedOrder = orderBook.removeOrder(orderId);
      if (!removedOrder) {
        logger.warn('Order not found for modification', { orderId, symbol });
        return null;
      }

      // Update order details
      if (newQuantity) {
        removedOrder.quantity = newQuantity;
      }
      removedOrder.price = newPrice;
      removedOrder.timestamp = new Date(); // Reset time priority

      // Process the modified order as a new order
      return await this.processOrder(removedOrder);
    }

    // For quantity-only changes
    if (newQuantity) {
      const success = orderBook.updateOrderQuantity(orderId, newQuantity);
      if (success) {
        logger.info('Order quantity modified', {
          orderId,
          symbol,
          newQuantity: newQuantity.toString(),
        });
        
        return {
          trades: [],
          updatedOrders: [],
          orderBookChanges: this.generateOrderBookChanges(orderBook),
        };
      }
    }

    return null;
  }

  async getOrderBookSnapshot(symbol: string) {
    // Try to get from cache first
    const cacheKey = `orderbook:${symbol}`;
    const cached = await redisService.getJSON(cacheKey);
    
    if (cached) {
      logger.debug('Order book snapshot served from cache', { symbol });
      return cached;
    }

    // Get fresh snapshot
    const orderBook = this.getOrderBook(symbol);
    const snapshot = orderBook.getSnapshot();
    
    // Cache for 1 second (high frequency updates)
    await redisService.setJSON(cacheKey, snapshot, 1);
    
    logger.debug('Order book snapshot cached', { symbol });
    return snapshot;
  }

  private generateTradeId(): string {
    return `trade_${this.nextTradeId++}_${Date.now()}`;
  }

  private async persistTrades(trades: Trade[]): Promise<void> {
    if (trades.length === 0) return;

    try {
      // Use a transaction to ensure all trades are persisted atomically
      await prisma.$transaction(async (tx) => {
        for (const trade of trades) {
          await tx.trade.create({
            data: {
              id: trade.id,
              instrumentSymbol: trade.instrumentSymbol,
              buyOrderId: trade.buyOrderId,
              sellOrderId: trade.sellOrderId,
              quantity: trade.quantity,
              price: trade.price,
              buyerUserId: trade.buyerUserId,
              sellerUserId: trade.sellerUserId,
              timestamp: trade.timestamp,
            },
          });

          // Update order statuses in database
          await this.updateOrderStatus(tx, trade.buyOrderId, trade.quantity);
          await this.updateOrderStatus(tx, trade.sellOrderId, trade.quantity);
        }
      });

      logger.info('Trades persisted to database', { count: trades.length });
    } catch (error) {
      logger.error('Failed to persist trades', { error, trades });
      throw error;
    }
  }

  private async updateOrderStatus(tx: any, orderId: string, filledQuantity: Decimal) {
    const order = await tx.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      logger.error('Order not found for status update', { orderId });
      return;
    }

    const newFilledQuantity = new Decimal(order.filledQuantity).add(filledQuantity);
    const totalQuantity = new Decimal(order.quantity);
    
    const isFullyFilled = newFilledQuantity.gte(totalQuantity);
    const newStatus = isFullyFilled ? OrderStatus.FILLED : OrderStatus.PARTIALLY_FILLED;

    await tx.order.update({
      where: { id: orderId },
      data: {
        filledQuantity: newFilledQuantity,
        status: newStatus,
        updatedAt: new Date(),
      },
    });

    logger.debug('Order status updated', {
      orderId,
      filledQuantity: newFilledQuantity.toString(),
      status: newStatus,
    });
  }

  private generateOrderBookChanges(orderBook: OrderBook): OrderBookChange[] {
    const snapshot = orderBook.getSnapshot();
    const changes: OrderBookChange[] = [];

    // Convert bid levels to changes
    for (const bid of snapshot.bids) {
      changes.push({
        side: OrderSide.BUY,
        price: bid.price,
        quantity: bid.quantity,
        orderCount: bid.orderCount,
      });
    }

    // Convert ask levels to changes
    for (const ask of snapshot.asks) {
      changes.push({
        side: OrderSide.SELL,
        price: ask.price,
        quantity: ask.quantity,
        orderCount: ask.orderCount,
      });
    }

    return changes;
  }

  // Risk management checks
  private async validateOrder(order: OrderBookOrder): Promise<{ valid: boolean; error?: string }> {
    // Check if instrument exists and is active
    const instrument = await prisma.instrument.findUnique({
      where: { symbol: order.instrumentSymbol },
    });

    if (!instrument) {
      return { valid: false, error: 'Instrument not found' };
    }

    if (!instrument.isActive) {
      return { valid: false, error: 'Instrument is not active' };
    }

    // Check if instrument has expired
    if (instrument.expirationDate && instrument.expirationDate < new Date()) {
      return { valid: false, error: 'Instrument has expired' };
    }

    // Validate price bounds
    const minPrice = new Decimal(instrument.minPrice);
    const maxPrice = new Decimal(instrument.maxPrice);
    
    if (order.price.lt(minPrice) || order.price.gt(maxPrice)) {
      return { valid: false, error: `Price must be between ${minPrice} and ${maxPrice}` };
    }

    // Validate tick size
    const tickSize = new Decimal(instrument.tickSize);
    if (!tickSize.isZero() && !order.price.mod(tickSize).isZero()) {
      return { valid: false, error: `Price must be a multiple of tick size ${tickSize}` };
    }

    // Validate lot size
    const lotSize = new Decimal(instrument.lotSize);
    if (!lotSize.isZero() && !order.quantity.mod(lotSize).isZero()) {
      return { valid: false, error: `Quantity must be a multiple of lot size ${lotSize}` };
    }

    return { valid: true };
  }

  // Get market statistics
  async getMarketStats(symbol: string) {
    // Try cache first
    const cacheKey = `market_stats:${symbol}`;
    const cached = await redisService.getJSON(cacheKey);
    
    if (cached) {
      logger.debug('Market stats served from cache', { symbol });
      return cached;
    }

    const orderBook = this.getOrderBook(symbol);
    const bestBid = orderBook.getBestBid();
    const bestAsk = orderBook.getBestAsk();
    const spread = orderBook.getSpread();
    const midPrice = orderBook.getMidPrice();

    const stats = {
      symbol,
      bestBid: bestBid?.toNumber() || null,
      bestAsk: bestAsk?.toNumber() || null,
      spread: spread?.toNumber() || null,
      midPrice: midPrice?.toNumber() || null,
      timestamp: new Date(),
    };

    // Cache for 5 seconds
    await redisService.setJSON(cacheKey, stats, 5);
    
    return stats;
  }

  // Validate order book integrity
  validateOrderBookIntegrity(symbol: string): { valid: boolean; errors: string[] } {
    const orderBook = this.getOrderBook(symbol);
    return orderBook.validateIntegrity();
  }

  // Get all active order books
  getActiveOrderBooks(): string[] {
    return Array.from(this.orderBooks.keys());
  }

  // Clear order book (for testing or maintenance)
  clearOrderBook(symbol: string): void {
    this.orderBooks.delete(symbol);
    logger.info('Order book cleared', { symbol });
  }
}