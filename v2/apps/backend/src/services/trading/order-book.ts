import { Decimal } from 'decimal.js';
import { OrderSide, PriceLevel } from '@trading-exchange/shared';
import { logger } from '../../utils/logger';

export interface OrderBookOrder {
  id: string;
  userId: string;
  side: OrderSide;
  quantity: Decimal;
  price: Decimal;
  timestamp: Date;
  priority: number;
}

export interface OrderBookSnapshot {
  symbol: string;
  bids: PriceLevel[];
  asks: PriceLevel[];
  sequence: number;
  timestamp: Date;
}

export interface OrderBookDelta {
  symbol: string;
  sequence: number;
  changes: OrderBookChange[];
  timestamp: Date;
}

export interface OrderBookChange {
  side: OrderSide;
  price: number;
  quantity: number; // 0 means remove level
  orderCount: number;
}

class PriceLevelManager {
  private orders: Map<string, OrderBookOrder> = new Map();
  private totalQuantity: Decimal = new Decimal(0);
  private orderCount: number = 0;

  constructor(public readonly price: Decimal) {}

  addOrder(order: OrderBookOrder): void {
    if (this.orders.has(order.id)) {
      throw new Error(`Order ${order.id} already exists at price level ${this.price}`);
    }

    this.orders.set(order.id, order);
    this.totalQuantity = this.totalQuantity.add(order.quantity);
    this.orderCount++;

    logger.debug('Order added to price level', {
      orderId: order.id,
      price: this.price.toString(),
      quantity: order.quantity.toString(),
      totalQuantity: this.totalQuantity.toString(),
      orderCount: this.orderCount,
    });
  }

  removeOrder(orderId: string): OrderBookOrder | null {
    const order = this.orders.get(orderId);
    if (!order) {
      return null;
    }

    this.orders.delete(orderId);
    this.totalQuantity = this.totalQuantity.sub(order.quantity);
    this.orderCount--;

    logger.debug('Order removed from price level', {
      orderId,
      price: this.price.toString(),
      quantity: order.quantity.toString(),
      totalQuantity: this.totalQuantity.toString(),
      orderCount: this.orderCount,
    });

    return order;
  }

  updateOrderQuantity(orderId: string, newQuantity: Decimal): boolean {
    const order = this.orders.get(orderId);
    if (!order) {
      return false;
    }

    const quantityDiff = newQuantity.sub(order.quantity);
    order.quantity = newQuantity;
    this.totalQuantity = this.totalQuantity.add(quantityDiff);

    logger.debug('Order quantity updated', {
      orderId,
      price: this.price.toString(),
      newQuantity: newQuantity.toString(),
      quantityDiff: quantityDiff.toString(),
      totalQuantity: this.totalQuantity.toString(),
    });

    return true;
  }

  getOrders(): OrderBookOrder[] {
    return Array.from(this.orders.values()).sort((a, b) => a.priority - b.priority);
  }

  getTotalQuantity(): Decimal {
    return this.totalQuantity;
  }

  getOrderCount(): number {
    return this.orderCount;
  }

  isEmpty(): boolean {
    return this.orderCount === 0;
  }

  toPriceLevel(): PriceLevel {
    return {
      price: this.price.toNumber(),
      quantity: this.totalQuantity.toNumber(),
      orderCount: this.orderCount,
    };
  }
}

export class OrderBook {
  private bids: Map<string, PriceLevelManager> = new Map(); // price -> PriceLevelManager
  private asks: Map<string, PriceLevelManager> = new Map(); // price -> PriceLevelManager
  private sequence: number = 0;
  private orderIndex: Map<string, { price: Decimal; side: OrderSide }> = new Map(); // orderId -> price/side

  constructor(public readonly symbol: string) {}

  addOrder(order: OrderBookOrder): void {
    this.sequence++;
    
    const priceKey = order.price.toString();
    const sideMap = order.side === OrderSide.BUY ? this.bids : this.asks;

    // Get or create price level
    let priceLevel = sideMap.get(priceKey);
    if (!priceLevel) {
      priceLevel = new PriceLevelManager(order.price);
      sideMap.set(priceKey, priceLevel);
    }

    // Add order to price level
    priceLevel.addOrder(order);
    
    // Index the order for quick lookup
    this.orderIndex.set(order.id, { price: order.price, side: order.side });

    logger.info('Order added to order book', {
      symbol: this.symbol,
      orderId: order.id,
      side: order.side,
      price: order.price.toString(),
      quantity: order.quantity.toString(),
      sequence: this.sequence,
    });
  }

  removeOrder(orderId: string): OrderBookOrder | null {
    const orderInfo = this.orderIndex.get(orderId);
    if (!orderInfo) {
      return null;
    }

    this.sequence++;
    
    const priceKey = orderInfo.price.toString();
    const sideMap = orderInfo.side === OrderSide.BUY ? this.bids : this.asks;
    const priceLevel = sideMap.get(priceKey);

    if (!priceLevel) {
      logger.error('Price level not found for order removal', {
        orderId,
        price: orderInfo.price.toString(),
        side: orderInfo.side,
      });
      return null;
    }

    const removedOrder = priceLevel.removeOrder(orderId);
    
    // Remove empty price level
    if (priceLevel.isEmpty()) {
      sideMap.delete(priceKey);
    }

    // Remove from index
    this.orderIndex.delete(orderId);

    if (removedOrder) {
      logger.info('Order removed from order book', {
        symbol: this.symbol,
        orderId,
        side: orderInfo.side,
        price: orderInfo.price.toString(),
        quantity: removedOrder.quantity.toString(),
        sequence: this.sequence,
      });
    }

    return removedOrder;
  }

  updateOrderQuantity(orderId: string, newQuantity: Decimal): boolean {
    const orderInfo = this.orderIndex.get(orderId);
    if (!orderInfo) {
      return false;
    }

    this.sequence++;
    
    const priceKey = orderInfo.price.toString();
    const sideMap = orderInfo.side === OrderSide.BUY ? this.bids : this.asks;
    const priceLevel = sideMap.get(priceKey);

    if (!priceLevel) {
      return false;
    }

    const updated = priceLevel.updateOrderQuantity(orderId, newQuantity);
    
    if (updated) {
      logger.info('Order quantity updated in order book', {
        symbol: this.symbol,
        orderId,
        side: orderInfo.side,
        price: orderInfo.price.toString(),
        newQuantity: newQuantity.toString(),
        sequence: this.sequence,
      });
    }

    return updated;
  }

  getBestBid(): Decimal | null {
    if (this.bids.size === 0) return null;
    
    const prices = Array.from(this.bids.keys()).map(p => new Decimal(p));
    return Decimal.max(...prices);
  }

  getBestAsk(): Decimal | null {
    if (this.asks.size === 0) return null;
    
    const prices = Array.from(this.asks.keys()).map(p => new Decimal(p));
    return Decimal.min(...prices);
  }

  getSpread(): Decimal | null {
    const bestBid = this.getBestBid();
    const bestAsk = this.getBestAsk();
    
    if (!bestBid || !bestAsk) return null;
    
    return bestAsk.sub(bestBid);
  }

  getMidPrice(): Decimal | null {
    const bestBid = this.getBestBid();
    const bestAsk = this.getBestAsk();
    
    if (!bestBid || !bestAsk) return null;
    
    return bestBid.add(bestAsk).div(2);
  }

  getOrdersAtPrice(side: OrderSide, price: Decimal): OrderBookOrder[] {
    const sideMap = side === OrderSide.BUY ? this.bids : this.asks;
    const priceLevel = sideMap.get(price.toString());
    
    return priceLevel ? priceLevel.getOrders() : [];
  }

  getSnapshot(): OrderBookSnapshot {
    const bids = this.getSortedPriceLevels(this.bids, true); // Descending for bids
    const asks = this.getSortedPriceLevels(this.asks, false); // Ascending for asks

    return {
      symbol: this.symbol,
      bids,
      asks,
      sequence: this.sequence,
      timestamp: new Date(),
    };
  }

  private getSortedPriceLevels(
    priceLevels: Map<string, PriceLevelManager>,
    descending: boolean
  ): PriceLevel[] {
    const levels = Array.from(priceLevels.values())
      .map(level => level.toPriceLevel())
      .filter(level => level.quantity > 0);

    return levels.sort((a, b) => {
      return descending ? b.price - a.price : a.price - b.price;
    });
  }

  getSequence(): number {
    return this.sequence;
  }

  isEmpty(): boolean {
    return this.bids.size === 0 && this.asks.size === 0;
  }

  // Get orders that can match with the given order
  getMatchableOrders(side: OrderSide, price: Decimal): OrderBookOrder[] {
    const oppositeSide = side === OrderSide.BUY ? OrderSide.SELL : OrderSide.BUY;
    const oppositeSideMap = oppositeSide === OrderSide.BUY ? this.bids : this.asks;
    
    const matchableOrders: OrderBookOrder[] = [];
    
    for (const [priceKey, priceLevel] of oppositeSideMap.entries()) {
      const levelPrice = new Decimal(priceKey);
      
      // Check if prices can match
      const canMatch = side === OrderSide.BUY 
        ? levelPrice.lte(price) // Buy order can match with sell orders at or below its price
        : levelPrice.gte(price); // Sell order can match with buy orders at or above its price
      
      if (canMatch) {
        matchableOrders.push(...priceLevel.getOrders());
      }
    }
    
    // Sort by price-time priority
    return matchableOrders.sort((a, b) => {
      // First by price (best price first)
      const priceComparison = oppositeSide === OrderSide.BUY 
        ? b.price.cmp(a.price) // Higher prices first for buy orders
        : a.price.cmp(b.price); // Lower prices first for sell orders
      
      if (priceComparison !== 0) return priceComparison;
      
      // Then by time priority (earlier orders first)
      return a.priority - b.priority;
    });
  }

  // Validate order book integrity
  validateIntegrity(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    // Check that all indexed orders exist in price levels
    for (const [orderId, orderInfo] of this.orderIndex.entries()) {
      const sideMap = orderInfo.side === OrderSide.BUY ? this.bids : this.asks;
      const priceLevel = sideMap.get(orderInfo.price.toString());
      
      if (!priceLevel) {
        errors.push(`Order ${orderId} indexed but price level ${orderInfo.price} not found`);
        continue;
      }
      
      const orders = priceLevel.getOrders();
      const orderExists = orders.some(order => order.id === orderId);
      
      if (!orderExists) {
        errors.push(`Order ${orderId} indexed but not found in price level ${orderInfo.price}`);
      }
    }
    
    // Check that all orders in price levels are indexed
    const checkPriceLevels = (sideMap: Map<string, PriceLevelManager>, side: OrderSide) => {
      for (const [priceKey, priceLevel] of sideMap.entries()) {
        const orders = priceLevel.getOrders();
        
        for (const order of orders) {
          const indexedInfo = this.orderIndex.get(order.id);
          
          if (!indexedInfo) {
            errors.push(`Order ${order.id} in price level but not indexed`);
            continue;
          }
          
          if (indexedInfo.price.toString() !== priceKey || indexedInfo.side !== side) {
            errors.push(`Order ${order.id} index mismatch: expected ${side}@${priceKey}, got ${indexedInfo.side}@${indexedInfo.price}`);
          }
        }
      }
    };
    
    checkPriceLevels(this.bids, OrderSide.BUY);
    checkPriceLevels(this.asks, OrderSide.SELL);
    
    return {
      valid: errors.length === 0,
      errors,
    };
  }
}