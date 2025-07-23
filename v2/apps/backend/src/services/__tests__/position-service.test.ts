import { PositionService } from '../position-service';
import { PrismaClient } from '@prisma/client';
import { Decimal } from 'decimal.js';

// Mock Prisma
jest.mock('@prisma/client');

describe('PositionService', () => {
  let positionService: PositionService;
  let mockPrisma: jest.Mocked<PrismaClient>;

  beforeEach(() => {
    mockPrisma = new PrismaClient() as jest.Mocked<PrismaClient>;
    positionService = new PositionService();
    (positionService as any).prisma = mockPrisma;
  });

  describe('updatePosition', () => {
    it('should create new position when none exists', async () => {
      const tradeData = {
        userId: 'user-1',
        instrumentId: 'BTC-USD',
        side: 'buy' as const,
        quantity: '1.0',
        price: '50000.00',
      };

      mockPrisma.position.findUnique.mockResolvedValue(null);
      mockPrisma.position.create.mockResolvedValue({
        id: 'position-1',
        userId: 'user-1',
        instrumentId: 'BTC-USD',
        quantity: '1.0',
        averagePrice: '50000.00',
        unrealizedPnl: '0',
        realizedPnl: '0',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const result = await positionService.updatePosition(tradeData);

      expect(mockPrisma.position.findUnique).toHaveBeenCalledWith({
        where: {
          userId_instrumentId: {
            userId: 'user-1',
            instrumentId: 'BTC-USD',
          },
        },
      });

      expect(mockPrisma.position.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          instrumentId: 'BTC-USD',
          quantity: '1.0',
          averagePrice: '50000.00',
          unrealizedPnl: '0',
          realizedPnl: '0',
        },
      });

      expect(result.quantity).toBe('1.0');
      expect(result.averagePrice).toBe('50000.00');
    });

    it('should update existing position with same side', async () => {
      const tradeData = {
        userId: 'user-1',
        instrumentId: 'BTC-USD',
        side: 'buy' as const,
        quantity: '1.0',
        price: '51000.00',
      };

      const existingPosition = {
        id: 'position-1',
        userId: 'user-1',
        instrumentId: 'BTC-USD',
        quantity: '2.0',
        averagePrice: '49000.00',
        unrealizedPnl: '0',
        realizedPnl: '0',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.position.findUnique.mockResolvedValue(existingPosition as any);
      mockPrisma.position.update.mockResolvedValue({
        ...existingPosition,
        quantity: '3.0',
        averagePrice: '49666.67', // Weighted average
      } as any);

      const result = await positionService.updatePosition(tradeData);

      expect(mockPrisma.position.update).toHaveBeenCalledWith({
        where: { id: 'position-1' },
        data: {
          quantity: '3.0',
          averagePrice: expect.stringMatching(/49666\.6[67]/), // Allow for rounding
          unrealizedPnl: '0',
        },
      });

      expect(result.quantity).toBe('3.0');
    });

    it('should reduce position with opposite side', async () => {
      const tradeData = {
        userId: 'user-1',
        instrumentId: 'BTC-USD',
        side: 'sell' as const,
        quantity: '1.0',
        price: '52000.00',
      };

      const existingPosition = {
        id: 'position-1',
        userId: 'user-1',
        instrumentId: 'BTC-USD',
        quantity: '2.0',
        averagePrice: '50000.00',
        unrealizedPnl: '0',
        realizedPnl: '0',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.position.findUnique.mockResolvedValue(existingPosition as any);
      mockPrisma.position.update.mockResolvedValue({
        ...existingPosition,
        quantity: '1.0',
        realizedPnl: '2000.00', // Profit from selling at higher price
      } as any);

      const result = await positionService.updatePosition(tradeData);

      expect(mockPrisma.position.update).toHaveBeenCalledWith({
        where: { id: 'position-1' },
        data: {
          quantity: '1.0',
          averagePrice: '50000.00', // Unchanged for remaining position
          realizedPnl: '2000.00',
          unrealizedPnl: '0',
        },
      });

      expect(result.quantity).toBe('1.0');
      expect(result.realizedPnl).toBe('2000.00');
    });

    it('should close position when quantities match', async () => {
      const tradeData = {
        userId: 'user-1',
        instrumentId: 'BTC-USD',
        side: 'sell' as const,
        quantity: '2.0',
        price: '52000.00',
      };

      const existingPosition = {
        id: 'position-1',
        userId: 'user-1',
        instrumentId: 'BTC-USD',
        quantity: '2.0',
        averagePrice: '50000.00',
        unrealizedPnl: '0',
        realizedPnl: '0',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.position.findUnique.mockResolvedValue(existingPosition as any);
      mockPrisma.position.update.mockResolvedValue({
        ...existingPosition,
        quantity: '0',
        realizedPnl: '4000.00', // Total profit
      } as any);

      const result = await positionService.updatePosition(tradeData);

      expect(mockPrisma.position.update).toHaveBeenCalledWith({
        where: { id: 'position-1' },
        data: {
          quantity: '0',
          averagePrice: '50000.00',
          realizedPnl: '4000.00',
          unrealizedPnl: '0',
        },
      });

      expect(result.quantity).toBe('0');
      expect(result.realizedPnl).toBe('4000.00');
    });

    it('should reverse position when sell quantity exceeds buy position', async () => {
      const tradeData = {
        userId: 'user-1',
        instrumentId: 'BTC-USD',
        side: 'sell' as const,
        quantity: '3.0',
        price: '52000.00',
      };

      const existingPosition = {
        id: 'position-1',
        userId: 'user-1',
        instrumentId: 'BTC-USD',
        quantity: '2.0',
        averagePrice: '50000.00',
        unrealizedPnl: '0',
        realizedPnl: '0',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.position.findUnique.mockResolvedValue(existingPosition as any);
      mockPrisma.position.update.mockResolvedValue({
        ...existingPosition,
        quantity: '-1.0', // Short position
        averagePrice: '52000.00',
        realizedPnl: '4000.00',
      } as any);

      const result = await positionService.updatePosition(tradeData);

      expect(mockPrisma.position.update).toHaveBeenCalledWith({
        where: { id: 'position-1' },
        data: {
          quantity: '-1.0',
          averagePrice: '52000.00',
          realizedPnl: '4000.00',
          unrealizedPnl: '0',
        },
      });

      expect(result.quantity).toBe('-1.0');
    });

    it('should handle short position correctly', async () => {
      const tradeData = {
        userId: 'user-1',
        instrumentId: 'BTC-USD',
        side: 'sell' as const,
        quantity: '1.0',
        price: '50000.00',
      };

      mockPrisma.position.findUnique.mockResolvedValue(null);
      mockPrisma.position.create.mockResolvedValue({
        id: 'position-1',
        userId: 'user-1',
        instrumentId: 'BTC-USD',
        quantity: '-1.0',
        averagePrice: '50000.00',
        unrealizedPnl: '0',
        realizedPnl: '0',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const result = await positionService.updatePosition(tradeData);

      expect(mockPrisma.position.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          instrumentId: 'BTC-USD',
          quantity: '-1.0',
          averagePrice: '50000.00',
          unrealizedPnl: '0',
          realizedPnl: '0',
        },
      });

      expect(result.quantity).toBe('-1.0');
    });
  });

  describe('calculateUnrealizedPnl', () => {
    it('should calculate unrealized PnL for long position', async () => {
      const positionData = {
        userId: 'user-1',
        instrumentId: 'BTC-USD',
        quantity: '2.0',
        averagePrice: '50000.00',
        currentPrice: '55000.00',
      };

      const pnl = await positionService.calculateUnrealizedPnl(positionData);

      // (55000 - 50000) * 2 = 10000
      expect(pnl).toBe('10000.00');
    });

    it('should calculate unrealized PnL for short position', async () => {
      const positionData = {
        userId: 'user-1',
        instrumentId: 'BTC-USD',
        quantity: '-2.0',
        averagePrice: '50000.00',
        currentPrice: '45000.00',
      };

      const pnl = await positionService.calculateUnrealizedPnl(positionData);

      // (50000 - 45000) * 2 = 10000 (profit for short position)
      expect(pnl).toBe('10000.00');
    });

    it('should return zero for zero quantity', async () => {
      const positionData = {
        userId: 'user-1',
        instrumentId: 'BTC-USD',
        quantity: '0',
        averagePrice: '50000.00',
        currentPrice: '55000.00',
      };

      const pnl = await positionService.calculateUnrealizedPnl(positionData);

      expect(pnl).toBe('0');
    });

    it('should handle negative PnL for long position', async () => {
      const positionData = {
        userId: 'user-1',
        instrumentId: 'BTC-USD',
        quantity: '2.0',
        averagePrice: '50000.00',
        currentPrice: '45000.00',
      };

      const pnl = await positionService.calculateUnrealizedPnl(positionData);

      // (45000 - 50000) * 2 = -10000
      expect(pnl).toBe('-10000.00');
    });
  });

  describe('getPositions', () => {
    it('should return user positions', async () => {
      const mockPositions = [
        {
          id: 'position-1',
          userId: 'user-1',
          instrumentId: 'BTC-USD',
          quantity: '2.0',
          averagePrice: '50000.00',
          unrealizedPnl: '0',
          realizedPnl: '1000.00',
          createdAt: new Date(),
          updatedAt: new Date(),
          instrument: {
            symbol: 'BTC-USD',
            name: 'Bitcoin/USD',
          },
        },
        {
          id: 'position-2',
          userId: 'user-1',
          instrumentId: 'ETH-USD',
          quantity: '-1.0',
          averagePrice: '3000.00',
          unrealizedPnl: '0',
          realizedPnl: '500.00',
          createdAt: new Date(),
          updatedAt: new Date(),
          instrument: {
            symbol: 'ETH-USD',
            name: 'Ethereum/USD',
          },
        },
      ];

      mockPrisma.position.findMany.mockResolvedValue(mockPositions as any);

      const result = await positionService.getPositions('user-1');

      expect(mockPrisma.position.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        include: { instrument: true },
        orderBy: { updatedAt: 'desc' },
      });

      expect(result).toHaveLength(2);
      expect(result[0].quantity).toBe('2.0');
      expect(result[1].quantity).toBe('-1.0');
    });

    it('should return empty array when no positions exist', async () => {
      mockPrisma.position.findMany.mockResolvedValue([]);

      const result = await positionService.getPositions('user-1');

      expect(result).toEqual([]);
    });
  });

  describe('getPosition', () => {
    it('should return specific position', async () => {
      const mockPosition = {
        id: 'position-1',
        userId: 'user-1',
        instrumentId: 'BTC-USD',
        quantity: '2.0',
        averagePrice: '50000.00',
        unrealizedPnl: '0',
        realizedPnl: '1000.00',
        createdAt: new Date(),
        updatedAt: new Date(),
        instrument: {
          symbol: 'BTC-USD',
          name: 'Bitcoin/USD',
        },
      };

      mockPrisma.position.findUnique.mockResolvedValue(mockPosition as any);

      const result = await positionService.getPosition('user-1', 'BTC-USD');

      expect(mockPrisma.position.findUnique).toHaveBeenCalledWith({
        where: {
          userId_instrumentId: {
            userId: 'user-1',
            instrumentId: 'BTC-USD',
          },
        },
        include: { instrument: true },
      });

      expect(result?.quantity).toBe('2.0');
      expect(result?.averagePrice).toBe('50000.00');
    });

    it('should return null when position does not exist', async () => {
      mockPrisma.position.findUnique.mockResolvedValue(null);

      const result = await positionService.getPosition('user-1', 'BTC-USD');

      expect(result).toBeNull();
    });
  });

  describe('updateUnrealizedPnl', () => {
    it('should update unrealized PnL for all positions', async () => {
      const mockPositions = [
        {
          id: 'position-1',
          userId: 'user-1',
          instrumentId: 'BTC-USD',
          quantity: '2.0',
          averagePrice: '50000.00',
        },
        {
          id: 'position-2',
          userId: 'user-2',
          instrumentId: 'BTC-USD',
          quantity: '-1.0',
          averagePrice: '51000.00',
        },
      ];

      const currentPrice = '55000.00';

      mockPrisma.position.findMany.mockResolvedValue(mockPositions as any);
      mockPrisma.position.updateMany.mockResolvedValue({ count: 2 } as any);

      await positionService.updateUnrealizedPnl('BTC-USD', currentPrice);

      expect(mockPrisma.position.findMany).toHaveBeenCalledWith({
        where: {
          instrumentId: 'BTC-USD',
          quantity: { not: '0' },
        },
      });

      // Should update each position with calculated PnL
      expect(mockPrisma.position.updateMany).toHaveBeenCalledTimes(2);
    });

    it('should skip positions with zero quantity', async () => {
      mockPrisma.position.findMany.mockResolvedValue([]);

      await positionService.updateUnrealizedPnl('BTC-USD', '55000.00');

      expect(mockPrisma.position.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('getPortfolioSummary', () => {
    it('should calculate portfolio summary', async () => {
      const mockPositions = [
        {
          id: 'position-1',
          userId: 'user-1',
          instrumentId: 'BTC-USD',
          quantity: '2.0',
          averagePrice: '50000.00',
          unrealizedPnl: '10000.00',
          realizedPnl: '1000.00',
        },
        {
          id: 'position-2',
          userId: 'user-1',
          instrumentId: 'ETH-USD',
          quantity: '-1.0',
          averagePrice: '3000.00',
          unrealizedPnl: '500.00',
          realizedPnl: '200.00',
        },
      ];

      mockPrisma.position.findMany.mockResolvedValue(mockPositions as any);

      const summary = await positionService.getPortfolioSummary('user-1');

      expect(summary.totalUnrealizedPnl).toBe('10500.00');
      expect(summary.totalRealizedPnl).toBe('1200.00');
      expect(summary.totalPnl).toBe('11700.00');
      expect(summary.positionCount).toBe(2);
    });

    it('should return zero values for empty portfolio', async () => {
      mockPrisma.position.findMany.mockResolvedValue([]);

      const summary = await positionService.getPortfolioSummary('user-1');

      expect(summary.totalUnrealizedPnl).toBe('0');
      expect(summary.totalRealizedPnl).toBe('0');
      expect(summary.totalPnl).toBe('0');
      expect(summary.positionCount).toBe(0);
    });
  });

  describe('error handling', () => {
    it('should handle database errors in updatePosition', async () => {
      const tradeData = {
        userId: 'user-1',
        instrumentId: 'BTC-USD',
        side: 'buy' as const,
        quantity: '1.0',
        price: '50000.00',
      };

      mockPrisma.position.findUnique.mockRejectedValue(new Error('Database error'));

      await expect(positionService.updatePosition(tradeData)).rejects.toThrow('Database error');
    });

    it('should handle invalid decimal values', async () => {
      const positionData = {
        userId: 'user-1',
        instrumentId: 'BTC-USD',
        quantity: 'invalid',
        averagePrice: '50000.00',
        currentPrice: '55000.00',
      };

      await expect(positionService.calculateUnrealizedPnl(positionData)).rejects.toThrow();
    });
  });

  describe('decimal precision', () => {
    it('should maintain precision in calculations', async () => {
      const tradeData = {
        userId: 'user-1',
        instrumentId: 'BTC-USD',
        side: 'buy' as const,
        quantity: '0.12345678',
        price: '50000.12345678',
      };

      mockPrisma.position.findUnique.mockResolvedValue(null);
      mockPrisma.position.create.mockResolvedValue({
        id: 'position-1',
        userId: 'user-1',
        instrumentId: 'BTC-USD',
        quantity: '0.12345678',
        averagePrice: '50000.12345678',
        unrealizedPnl: '0',
        realizedPnl: '0',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const result = await positionService.updatePosition(tradeData);

      expect(result.quantity).toBe('0.12345678');
      expect(result.averagePrice).toBe('50000.12345678');
    });

    it('should handle very small quantities', async () => {
      const positionData = {
        userId: 'user-1',
        instrumentId: 'BTC-USD',
        quantity: '0.00000001',
        averagePrice: '50000.00',
        currentPrice: '55000.00',
      };

      const pnl = await positionService.calculateUnrealizedPnl(positionData);

      expect(pnl).toBe('0.05'); // (55000 - 50000) * 0.00000001
    });
  });
});