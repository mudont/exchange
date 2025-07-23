import { MatchingEngine, MatchResult } from '../matching-engine';
import { OrderBook } from '../order-book';
import { Order, OrderSide, OrderType, Trade } from '@trading-exchange/shared';

// Mock the OrderBook
jest.mock('../order-book');

describe('MatchingEngine', () => {
  let matchingEngine: MatchingEngine;
  let mockOrderBook: jest.Mocked<OrderBook>;

  beforeEach(() => {
    matchingEngine = new MatchingEngine();
    mockOrderBook = new OrderBook('BTC-USD') as jest.Mocked<OrderBook>;
  });

  describe('matchOrder', () => {
    it('should match buy order against sell orders', async () => {
      const buyOrder: Order = {
        id: 'buy-order-1',
        userId: 'buyer-1',
        instrumentId: 'BTC-USD',
        side: OrderSide.BUY,
        type: OrderType.LIMIT,
        quantity: '1.0',
        price: '50000.00',
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const sellOrder: Order = {
        id: 'sell-order-1',
        userId: 'seller-1',
        instrumentId: 'BTC-USD',
        side: OrderSide.SELL,
        type: OrderType.LIMIT,
        quantity: '1.0',
        price: '49000.00',
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Mock order book to return the sell order
      mockOrderBook.getAsks.mockReturnValue([{
        price: '49000.00',
        quantity: '1.0',
        orders: [sellOrder],
      }]);

      mockOrderBook.removeOrder.mockReturnValue(true);

      const result = await matchingEngine.matchOrder(buyOrder, mockOrderBook);

      expect(result.matched).toBe(true);
      expect(result.trades).toHaveLength(1);
      expect(result.trades[0].quantity).toBe('1.0');
      expect(result.trades[0].price).toBe('49000.00');
      expect(result.trades[0].buyOrderId).toBe('buy-order-1');
      expect(result.trades[0].sellOrderId).toBe('sell-order-1');
      expect(result.remainingQuantity).toBe('0');
    });

    it('should match sell order against buy orders', async () => {
      const sellOrder: Order = {
        id: 'sell-order-1',
        userId: 'seller-1',
        instrumentId: 'BTC-USD',
        side: OrderSide.SELL,
        type: OrderType.LIMIT,
        quantity: '1.0',
        price: '49000.00',
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const buyOrder: Order = {
        id: 'buy-order-1',
        userId: 'buyer-1',
        instrumentId: 'BTC-USD',
        side: OrderSide.BUY,
        type: OrderType.LIMIT,
        quantity: '1.0',
        price: '50000.00',
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Mock order book to return the buy order
      mockOrderBook.getBids.mockReturnValue([{
        price: '50000.00',
        quantity: '1.0',
        orders: [buyOrder],
      }]);

      mockOrderBook.removeOrder.mockReturnValue(true);

      const result = await matchingEngine.matchOrder(sellOrder, mockOrderBook);

      expect(result.matched).toBe(true);
      expect(result.trades).toHaveLength(1);
      expect(result.trades[0].quantity).toBe('1.0');
      expect(result.trades[0].price).toBe('50000.00');
      expect(result.trades[0].buyOrderId).toBe('buy-order-1');
      expect(result.trades[0].sellOrderId).toBe('sell-order-1');
      expect(result.remainingQuantity).toBe('0');
    });

    it('should partially match order when insufficient quantity', async () => {
      const buyOrder: Order = {
        id: 'buy-order-1',
        userId: 'buyer-1',
        instrumentId: 'BTC-USD',
        side: OrderSide.BUY,
        type: OrderType.LIMIT,
        quantity: '2.0',
        price: '50000.00',
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const sellOrder: Order = {
        id: 'sell-order-1',
        userId: 'seller-1',
        instrumentId: 'BTC-USD',
        side: OrderSide.SELL,
        type: OrderType.LIMIT,
        quantity: '1.0',
        price: '49000.00',
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Mock order book to return the sell order
      mockOrderBook.getAsks.mockReturnValue([{
        price: '49000.00',
        quantity: '1.0',
        orders: [sellOrder],
      }]);

      mockOrderBook.removeOrder.mockReturnValue(true);

      const result = await matchingEngine.matchOrder(buyOrder, mockOrderBook);

      expect(result.matched).toBe(true);
      expect(result.trades).toHaveLength(1);
      expect(result.trades[0].quantity).toBe('1.0');
      expect(result.remainingQuantity).toBe('1.0');
    });

    it('should match against multiple orders', async () => {
      const buyOrder: Order = {
        id: 'buy-order-1',
        userId: 'buyer-1',
        instrumentId: 'BTC-USD',
        side: OrderSide.BUY,
        type: OrderType.LIMIT,
        quantity: '3.0',
        price: '50000.00',
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const sellOrder1: Order = {
        id: 'sell-order-1',
        userId: 'seller-1',
        instrumentId: 'BTC-USD',
        side: OrderSide.SELL,
        type: OrderType.LIMIT,
        quantity: '1.0',
        price: '49000.00',
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const sellOrder2: Order = {
        id: 'sell-order-2',
        userId: 'seller-2',
        instrumentId: 'BTC-USD',
        side: OrderSide.SELL,
        type: OrderType.LIMIT,
        quantity: '2.0',
        price: '49500.00',
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Mock order book to return multiple sell orders
      mockOrderBook.getAsks.mockReturnValue([
        {
          price: '49000.00',
          quantity: '1.0',
          orders: [sellOrder1],
        },
        {
          price: '49500.00',
          quantity: '2.0',
          orders: [sellOrder2],
        },
      ]);

      mockOrderBook.removeOrder.mockReturnValue(true);

      const result = await matchingEngine.matchOrder(buyOrder, mockOrderBook);

      expect(result.matched).toBe(true);
      expect(result.trades).toHaveLength(2);
      expect(result.trades[0].price).toBe('49000.00');
      expect(result.trades[1].price).toBe('49500.00');
      expect(result.remainingQuantity).toBe('0');
    });

    it('should not match when no compatible orders exist', async () => {
      const buyOrder: Order = {
        id: 'buy-order-1',
        userId: 'buyer-1',
        instrumentId: 'BTC-USD',
        side: OrderSide.BUY,
        type: OrderType.LIMIT,
        quantity: '1.0',
        price: '49000.00',
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Mock order book to return no matching orders
      mockOrderBook.getAsks.mockReturnValue([{
        price: '51000.00',
        quantity: '1.0',
        orders: [],
      }]);

      const result = await matchingEngine.matchOrder(buyOrder, mockOrderBook);

      expect(result.matched).toBe(false);
      expect(result.trades).toHaveLength(0);
      expect(result.remainingQuantity).toBe('1.0');
    });

    it('should handle market buy orders', async () => {
      const marketBuyOrder: Order = {
        id: 'market-buy-1',
        userId: 'buyer-1',
        instrumentId: 'BTC-USD',
        side: OrderSide.BUY,
        type: OrderType.MARKET,
        quantity: '1.0',
        price: null,
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const sellOrder: Order = {
        id: 'sell-order-1',
        userId: 'seller-1',
        instrumentId: 'BTC-USD',
        side: OrderSide.SELL,
        type: OrderType.LIMIT,
        quantity: '1.0',
        price: '50000.00',
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockOrderBook.getAsks.mockReturnValue([{
        price: '50000.00',
        quantity: '1.0',
        orders: [sellOrder],
      }]);

      mockOrderBook.removeOrder.mockReturnValue(true);

      const result = await matchingEngine.matchOrder(marketBuyOrder, mockOrderBook);

      expect(result.matched).toBe(true);
      expect(result.trades).toHaveLength(1);
      expect(result.trades[0].price).toBe('50000.00');
      expect(result.remainingQuantity).toBe('0');
    });

    it('should handle market sell orders', async () => {
      const marketSellOrder: Order = {
        id: 'market-sell-1',
        userId: 'seller-1',
        instrumentId: 'BTC-USD',
        side: OrderSide.SELL,
        type: OrderType.MARKET,
        quantity: '1.0',
        price: null,
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const buyOrder: Order = {
        id: 'buy-order-1',
        userId: 'buyer-1',
        instrumentId: 'BTC-USD',
        side: OrderSide.BUY,
        type: OrderType.LIMIT,
        quantity: '1.0',
        price: '49000.00',
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockOrderBook.getBids.mockReturnValue([{
        price: '49000.00',
        quantity: '1.0',
        orders: [buyOrder],
      }]);

      mockOrderBook.removeOrder.mockReturnValue(true);

      const result = await matchingEngine.matchOrder(marketSellOrder, mockOrderBook);

      expect(result.matched).toBe(true);
      expect(result.trades).toHaveLength(1);
      expect(result.trades[0].price).toBe('49000.00');
      expect(result.remainingQuantity).toBe('0');
    });

    it('should respect price-time priority', async () => {
      const buyOrder: Order = {
        id: 'buy-order-1',
        userId: 'buyer-1',
        instrumentId: 'BTC-USD',
        side: OrderSide.BUY,
        type: OrderType.LIMIT,
        quantity: '1.0',
        price: '50000.00',
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const sellOrder1: Order = {
        id: 'sell-order-1',
        userId: 'seller-1',
        instrumentId: 'BTC-USD',
        side: OrderSide.SELL,
        type: OrderType.LIMIT,
        quantity: '0.5',
        price: '49000.00',
        status: 'pending',
        createdAt: new Date('2023-01-01T10:00:00Z'),
        updatedAt: new Date('2023-01-01T10:00:00Z'),
      };

      const sellOrder2: Order = {
        id: 'sell-order-2',
        userId: 'seller-2',
        instrumentId: 'BTC-USD',
        side: OrderSide.SELL,
        type: OrderType.LIMIT,
        quantity: '0.5',
        price: '49000.00',
        status: 'pending',
        createdAt: new Date('2023-01-01T10:01:00Z'),
        updatedAt: new Date('2023-01-01T10:01:00Z'),
      };

      // Mock order book to return orders in time priority
      mockOrderBook.getAsks.mockReturnValue([{
        price: '49000.00',
        quantity: '1.0',
        orders: [sellOrder1, sellOrder2], // Earlier order first
      }]);

      mockOrderBook.removeOrder.mockReturnValue(true);

      const result = await matchingEngine.matchOrder(buyOrder, mockOrderBook);

      expect(result.matched).toBe(true);
      expect(result.trades).toHaveLength(2);
      expect(result.trades[0].sellOrderId).toBe('sell-order-1'); // Earlier order matched first
      expect(result.trades[1].sellOrderId).toBe('sell-order-2');
    });

    it('should prevent self-trading', async () => {
      const buyOrder: Order = {
        id: 'buy-order-1',
        userId: 'user-1', // Same user
        instrumentId: 'BTC-USD',
        side: OrderSide.BUY,
        type: OrderType.LIMIT,
        quantity: '1.0',
        price: '50000.00',
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const sellOrder: Order = {
        id: 'sell-order-1',
        userId: 'user-1', // Same user
        instrumentId: 'BTC-USD',
        side: OrderSide.SELL,
        type: OrderType.LIMIT,
        quantity: '1.0',
        price: '49000.00',
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockOrderBook.getAsks.mockReturnValue([{
        price: '49000.00',
        quantity: '1.0',
        orders: [sellOrder],
      }]);

      const result = await matchingEngine.matchOrder(buyOrder, mockOrderBook);

      expect(result.matched).toBe(false);
      expect(result.trades).toHaveLength(0);
      expect(result.remainingQuantity).toBe('1.0');
    });
  });

  describe('calculateTradePrice', () => {
    it('should use maker order price for limit orders', () => {
      const takerOrder: Order = {
        id: 'taker-1',
        userId: 'user-1',
        instrumentId: 'BTC-USD',
        side: OrderSide.BUY,
        type: OrderType.LIMIT,
        quantity: '1.0',
        price: '50000.00',
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const makerOrder: Order = {
        id: 'maker-1',
        userId: 'user-2',
        instrumentId: 'BTC-USD',
        side: OrderSide.SELL,
        type: OrderType.LIMIT,
        quantity: '1.0',
        price: '49000.00',
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const price = matchingEngine.calculateTradePrice(takerOrder, makerOrder);
      expect(price).toBe('49000.00'); // Maker price
    });

    it('should use maker order price for market orders', () => {
      const marketOrder: Order = {
        id: 'market-1',
        userId: 'user-1',
        instrumentId: 'BTC-USD',
        side: OrderSide.BUY,
        type: OrderType.MARKET,
        quantity: '1.0',
        price: null,
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const limitOrder: Order = {
        id: 'limit-1',
        userId: 'user-2',
        instrumentId: 'BTC-USD',
        side: OrderSide.SELL,
        type: OrderType.LIMIT,
        quantity: '1.0',
        price: '49000.00',
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const price = matchingEngine.calculateTradePrice(marketOrder, limitOrder);
      expect(price).toBe('49000.00'); // Limit order price
    });
  });

  describe('error handling', () => {
    it('should handle invalid order quantities', async () => {
      const invalidOrder: Order = {
        id: 'invalid-1',
        userId: 'user-1',
        instrumentId: 'BTC-USD',
        side: OrderSide.BUY,
        type: OrderType.LIMIT,
        quantity: '0',
        price: '50000.00',
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockOrderBook.getAsks.mockReturnValue([]);

      const result = await matchingEngine.matchOrder(invalidOrder, mockOrderBook);

      expect(result.matched).toBe(false);
      expect(result.trades).toHaveLength(0);
      expect(result.remainingQuantity).toBe('0');
    });

    it('should handle order book errors gracefully', async () => {
      const order: Order = {
        id: 'order-1',
        userId: 'user-1',
        instrumentId: 'BTC-USD',
        side: OrderSide.BUY,
        type: OrderType.LIMIT,
        quantity: '1.0',
        price: '50000.00',
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockOrderBook.getAsks.mockImplementation(() => {
        throw new Error('Order book error');
      });

      await expect(matchingEngine.matchOrder(order, mockOrderBook))
        .rejects.toThrow('Order book error');
    });
  });
});