import { OrderBook, PriceLevel } from '../order-book';
import { Order, OrderSide, OrderType } from '@trading-exchange/shared';

describe('OrderBook', () => {
  let orderBook: OrderBook;
  const instrumentId = 'BTC-USD';

  beforeEach(() => {
    orderBook = new OrderBook(instrumentId);
  });

  describe('constructor', () => {
    it('should initialize with empty order book', () => {
      expect(orderBook.getInstrumentId()).toBe(instrumentId);
      expect(orderBook.getBids()).toEqual([]);
      expect(orderBook.getAsks()).toEqual([]);
      expect(orderBook.getBestBid()).toBeNull();
      expect(orderBook.getBestAsk()).toBeNull();
    });
  });

  describe('addOrder', () => {
    it('should add buy order to bids', () => {
      const order: Order = {
        id: 'order-1',
        userId: 'user-1',
        instrumentId,
        side: OrderSide.BUY,
        type: OrderType.LIMIT,
        quantity: '1.0',
        price: '50000.00',
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      orderBook.addOrder(order);
      const bids = orderBook.getBids();
      
      expect(bids).toHaveLength(1);
      expect(bids[0].price).toBe('50000.00');
      expect(bids[0].quantity).toBe('1.0');
      expect(bids[0].orders).toHaveLength(1);
      expect(bids[0].orders[0]).toBe(order);
    });

    it('should add sell order to asks', () => {
      const order: Order = {
        id: 'order-1',
        userId: 'user-1',
        instrumentId,
        side: OrderSide.SELL,
        type: OrderType.LIMIT,
        quantity: '1.0',
        price: '51000.00',
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      orderBook.addOrder(order);
      const asks = orderBook.getAsks();
      
      expect(asks).toHaveLength(1);
      expect(asks[0].price).toBe('51000.00');
      expect(asks[0].quantity).toBe('1.0');
      expect(asks[0].orders).toHaveLength(1);
      expect(asks[0].orders[0]).toBe(order);
    });

    it('should aggregate orders at same price level', () => {
      const order1: Order = {
        id: 'order-1',
        userId: 'user-1',
        instrumentId,
        side: OrderSide.BUY,
        type: OrderType.LIMIT,
        quantity: '1.0',
        price: '50000.00',
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const order2: Order = {
        id: 'order-2',
        userId: 'user-2',
        instrumentId,
        side: OrderSide.BUY,
        type: OrderType.LIMIT,
        quantity: '2.0',
        price: '50000.00',
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      orderBook.addOrder(order1);
      orderBook.addOrder(order2);
      
      const bids = orderBook.getBids();
      expect(bids).toHaveLength(1);
      expect(bids[0].price).toBe('50000.00');
      expect(bids[0].quantity).toBe('3.0');
      expect(bids[0].orders).toHaveLength(2);
    });

    it('should maintain price-time priority', () => {
      const order1: Order = {
        id: 'order-1',
        userId: 'user-1',
        instrumentId,
        side: OrderSide.BUY,
        type: OrderType.LIMIT,
        quantity: '1.0',
        price: '50000.00',
        status: 'pending',
        createdAt: new Date('2023-01-01T10:00:00Z'),
        updatedAt: new Date('2023-01-01T10:00:00Z'),
      };

      const order2: Order = {
        id: 'order-2',
        userId: 'user-2',
        instrumentId,
        side: OrderSide.BUY,
        type: OrderType.LIMIT,
        quantity: '2.0',
        price: '50000.00',
        status: 'pending',
        createdAt: new Date('2023-01-01T10:01:00Z'),
        updatedAt: new Date('2023-01-01T10:01:00Z'),
      };

      orderBook.addOrder(order2);
      orderBook.addOrder(order1);
      
      const bids = orderBook.getBids();
      expect(bids[0].orders[0]).toBe(order1); // Earlier order first
      expect(bids[0].orders[1]).toBe(order2);
    });

    it('should sort bids in descending price order', () => {
      const order1: Order = {
        id: 'order-1',
        userId: 'user-1',
        instrumentId,
        side: OrderSide.BUY,
        type: OrderType.LIMIT,
        quantity: '1.0',
        price: '49000.00',
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const order2: Order = {
        id: 'order-2',
        userId: 'user-2',
        instrumentId,
        side: OrderSide.BUY,
        type: OrderType.LIMIT,
        quantity: '1.0',
        price: '50000.00',
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      orderBook.addOrder(order1);
      orderBook.addOrder(order2);
      
      const bids = orderBook.getBids();
      expect(bids[0].price).toBe('50000.00'); // Higher price first
      expect(bids[1].price).toBe('49000.00');
    });

    it('should sort asks in ascending price order', () => {
      const order1: Order = {
        id: 'order-1',
        userId: 'user-1',
        instrumentId,
        side: OrderSide.SELL,
        type: OrderType.LIMIT,
        quantity: '1.0',
        price: '52000.00',
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const order2: Order = {
        id: 'order-2',
        userId: 'user-2',
        instrumentId,
        side: OrderSide.SELL,
        type: OrderType.LIMIT,
        quantity: '1.0',
        price: '51000.00',
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      orderBook.addOrder(order1);
      orderBook.addOrder(order2);
      
      const asks = orderBook.getAsks();
      expect(asks[0].price).toBe('51000.00'); // Lower price first
      expect(asks[1].price).toBe('52000.00');
    });
  });

  describe('removeOrder', () => {
    it('should remove order from order book', () => {
      const order: Order = {
        id: 'order-1',
        userId: 'user-1',
        instrumentId,
        side: OrderSide.BUY,
        type: OrderType.LIMIT,
        quantity: '1.0',
        price: '50000.00',
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      orderBook.addOrder(order);
      expect(orderBook.getBids()).toHaveLength(1);

      const removed = orderBook.removeOrder('order-1');
      expect(removed).toBe(true);
      expect(orderBook.getBids()).toHaveLength(0);
    });

    it('should remove price level when no orders remain', () => {
      const order: Order = {
        id: 'order-1',
        userId: 'user-1',
        instrumentId,
        side: OrderSide.BUY,
        type: OrderType.LIMIT,
        quantity: '1.0',
        price: '50000.00',
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      orderBook.addOrder(order);
      orderBook.removeOrder('order-1');
      
      expect(orderBook.getBids()).toHaveLength(0);
    });

    it('should update quantity when removing partial order', () => {
      const order1: Order = {
        id: 'order-1',
        userId: 'user-1',
        instrumentId,
        side: OrderSide.BUY,
        type: OrderType.LIMIT,
        quantity: '1.0',
        price: '50000.00',
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const order2: Order = {
        id: 'order-2',
        userId: 'user-2',
        instrumentId,
        side: OrderSide.BUY,
        type: OrderType.LIMIT,
        quantity: '2.0',
        price: '50000.00',
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      orderBook.addOrder(order1);
      orderBook.addOrder(order2);
      
      expect(orderBook.getBids()[0].quantity).toBe('3.0');
      
      orderBook.removeOrder('order-1');
      
      expect(orderBook.getBids()[0].quantity).toBe('2.0');
      expect(orderBook.getBids()[0].orders).toHaveLength(1);
    });

    it('should return false for non-existent order', () => {
      const removed = orderBook.removeOrder('non-existent');
      expect(removed).toBe(false);
    });
  });

  describe('getBestBid and getBestAsk', () => {
    it('should return best bid and ask prices', () => {
      const buyOrder: Order = {
        id: 'buy-order',
        userId: 'user-1',
        instrumentId,
        side: OrderSide.BUY,
        type: OrderType.LIMIT,
        quantity: '1.0',
        price: '50000.00',
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const sellOrder: Order = {
        id: 'sell-order',
        userId: 'user-2',
        instrumentId,
        side: OrderSide.SELL,
        type: OrderType.LIMIT,
        quantity: '1.0',
        price: '51000.00',
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      orderBook.addOrder(buyOrder);
      orderBook.addOrder(sellOrder);

      expect(orderBook.getBestBid()?.price).toBe('50000.00');
      expect(orderBook.getBestAsk()?.price).toBe('51000.00');
    });

    it('should return null when no orders exist', () => {
      expect(orderBook.getBestBid()).toBeNull();
      expect(orderBook.getBestAsk()).toBeNull();
    });
  });

  describe('getSpread', () => {
    it('should calculate spread correctly', () => {
      const buyOrder: Order = {
        id: 'buy-order',
        userId: 'user-1',
        instrumentId,
        side: OrderSide.BUY,
        type: OrderType.LIMIT,
        quantity: '1.0',
        price: '50000.00',
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const sellOrder: Order = {
        id: 'sell-order',
        userId: 'user-2',
        instrumentId,
        side: OrderSide.SELL,
        type: OrderType.LIMIT,
        quantity: '1.0',
        price: '51000.00',
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      orderBook.addOrder(buyOrder);
      orderBook.addOrder(sellOrder);

      expect(orderBook.getSpread()).toBe('1000.00');
    });

    it('should return null when no spread exists', () => {
      expect(orderBook.getSpread()).toBeNull();
    });
  });

  describe('getSnapshot', () => {
    it('should return order book snapshot', () => {
      const buyOrder: Order = {
        id: 'buy-order',
        userId: 'user-1',
        instrumentId,
        side: OrderSide.BUY,
        type: OrderType.LIMIT,
        quantity: '1.0',
        price: '50000.00',
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const sellOrder: Order = {
        id: 'sell-order',
        userId: 'user-2',
        instrumentId,
        side: OrderSide.SELL,
        type: OrderType.LIMIT,
        quantity: '1.0',
        price: '51000.00',
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      orderBook.addOrder(buyOrder);
      orderBook.addOrder(sellOrder);

      const snapshot = orderBook.getSnapshot();

      expect(snapshot.instrumentId).toBe(instrumentId);
      expect(snapshot.bids).toHaveLength(1);
      expect(snapshot.asks).toHaveLength(1);
      expect(snapshot.bestBid).toBe('50000.00');
      expect(snapshot.bestAsk).toBe('51000.00');
      expect(snapshot.spread).toBe('1000.00');
      expect(snapshot.timestamp).toBeInstanceOf(Date);
    });
  });

  describe('clear', () => {
    it('should clear all orders from order book', () => {
      const buyOrder: Order = {
        id: 'buy-order',
        userId: 'user-1',
        instrumentId,
        side: OrderSide.BUY,
        type: OrderType.LIMIT,
        quantity: '1.0',
        price: '50000.00',
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      orderBook.addOrder(buyOrder);
      expect(orderBook.getBids()).toHaveLength(1);

      orderBook.clear();
      expect(orderBook.getBids()).toHaveLength(0);
      expect(orderBook.getAsks()).toHaveLength(0);
    });
  });

  describe('edge cases', () => {
    it('should handle orders with same timestamp', () => {
      const timestamp = new Date();
      const order1: Order = {
        id: 'order-1',
        userId: 'user-1',
        instrumentId,
        side: OrderSide.BUY,
        type: OrderType.LIMIT,
        quantity: '1.0',
        price: '50000.00',
        status: 'pending',
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      const order2: Order = {
        id: 'order-2',
        userId: 'user-2',
        instrumentId,
        side: OrderSide.BUY,
        type: OrderType.LIMIT,
        quantity: '1.0',
        price: '50000.00',
        status: 'pending',
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      orderBook.addOrder(order1);
      orderBook.addOrder(order2);

      const bids = orderBook.getBids();
      expect(bids[0].orders).toHaveLength(2);
      // Should maintain insertion order when timestamps are equal
      expect(bids[0].orders[0]).toBe(order1);
      expect(bids[0].orders[1]).toBe(order2);
    });

    it('should handle very large quantities', () => {
      const order: Order = {
        id: 'order-1',
        userId: 'user-1',
        instrumentId,
        side: OrderSide.BUY,
        type: OrderType.LIMIT,
        quantity: '999999999.99999999',
        price: '50000.00',
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      orderBook.addOrder(order);
      expect(orderBook.getBids()[0].quantity).toBe('999999999.99999999');
    });

    it('should handle very small quantities', () => {
      const order: Order = {
        id: 'order-1',
        userId: 'user-1',
        instrumentId,
        side: OrderSide.BUY,
        type: OrderType.LIMIT,
        quantity: '0.00000001',
        price: '50000.00',
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      orderBook.addOrder(order);
      expect(orderBook.getBids()[0].quantity).toBe('0.00000001');
    });
  });
});