import { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import {
  setupIntegrationTests,
  teardownIntegrationTests,
  cleanupTestData,
  seedTestData,
  createTestAuthToken,
  createAuthenticatedRequest,
} from './setup';

describe('Database Integration Tests', () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  let testData: any;

  beforeAll(async () => {
    ({ app, prisma } = await setupIntegrationTests());
  });

  afterAll(async () => {
    await teardownIntegrationTests();
  });

  beforeEach(async () => {
    await cleanupTestData();
    testData = await seedTestData();
  });

  describe('Database Transactions', () => {
    it('should handle order placement with balance updates in transaction', async () => {
      const token = await createTestAuthToken(testData.users[0].id);
      const trader = createAuthenticatedRequest(app, token);

      // Get initial balance
      const initialBalanceResponse = await trader.get('/api/v1/accounts/balance');
      const initialBalance = JSON.parse(initialBalanceResponse.body).data.balance;

      // Place an order
      const orderData = {
        instrumentId: testData.instruments[0].id,
        side: 'buy',
        type: 'limit',
        quantity: '1.0',
        price: '45000.00',
      };

      const orderResponse = await trader.post('/api/v1/orders', orderData);
      expect(orderResponse.statusCode).toBe(201);

      // Check that balance was updated atomically
      const updatedBalanceResponse = await trader.get('/api/v1/accounts/balance');
      const updatedBalance = JSON.parse(updatedBalanceResponse.body).data.balance;

      // Balance should be reduced by the order value
      const expectedBalance = parseFloat(initialBalance) - (1.0 * 45000.00);
      expect(parseFloat(updatedBalance)).toBe(expectedBalance);

      // Verify order exists in database
      const order = JSON.parse(orderResponse.body).data.order;
      const dbOrder = await prisma.order.findUnique({
        where: { id: order.id },
      });
      expect(dbOrder).toBeTruthy();
    });

    it('should rollback transaction on order placement failure', async () => {
      const token = await createTestAuthToken(testData.users[0].id);
      const trader = createAuthenticatedRequest(app, token);

      // Get initial balance
      const initialBalanceResponse = await trader.get('/api/v1/accounts/balance');
      const initialBalance = JSON.parse(initialBalanceResponse.body).data.balance;

      // Try to place an order with insufficient balance
      const orderData = {
        instrumentId: testData.instruments[0].id,
        side: 'buy',
        type: 'limit',
        quantity: '100.0', // This should exceed available balance
        price: '50000.00',
      };

      const orderResponse = await trader.post('/api/v1/orders', orderData);
      expect(orderResponse.statusCode).toBe(400);

      // Balance should remain unchanged
      const finalBalanceResponse = await trader.get('/api/v1/accounts/balance');
      const finalBalance = JSON.parse(finalBalanceResponse.body).data.balance;
      expect(finalBalance).toBe(initialBalance);

      // No order should be created
      const orders = await prisma.order.findMany({
        where: { userId: testData.users[0].id },
      });
      expect(orders).toHaveLength(0);
    });

    it('should handle concurrent order placements correctly', async () => {
      const token = await createTestAuthToken(testData.users[0].id);
      const trader = createAuthenticatedRequest(app, token);

      const orderData = {
        instrumentId: testData.instruments[0].id,
        side: 'buy',
        type: 'limit',
        quantity: '1.0',
        price: '45000.00',
      };

      // Place multiple orders concurrently
      const orderPromises = Array.from({ length: 3 }, () =>
        trader.post('/api/v1/orders', orderData)
      );

      const responses = await Promise.all(orderPromises);

      // All orders should be successful or fail consistently
      const successfulOrders = responses.filter(r => r.statusCode === 201);
      const failedOrders = responses.filter(r => r.statusCode !== 201);

      // At least one should succeed, others might fail due to insufficient balance
      expect(successfulOrders.length).toBeGreaterThan(0);

      // Verify database consistency
      const dbOrders = await prisma.order.findMany({
        where: { userId: testData.users[0].id },
      });
      expect(dbOrders.length).toBe(successfulOrders.length);
    });
  });

  describe('Data Integrity', () => {
    it('should maintain referential integrity between orders and trades', async () => {
      const trader1Token = await createTestAuthToken(testData.users[0].id);
      const trader2Token = await createTestAuthToken(testData.users[1].id);
      const trader1 = createAuthenticatedRequest(app, trader1Token);
      const trader2 = createAuthenticatedRequest(app, trader2Token);

      // Place matching orders
      const sellResponse = await trader2.post('/api/v1/orders', {
        instrumentId: testData.instruments[0].id,
        side: 'sell',
        type: 'limit',
        quantity: '1.0',
        price: '50000.00',
      });

      const buyResponse = await trader1.post('/api/v1/orders', {
        instrumentId: testData.instruments[0].id,
        side: 'buy',
        type: 'limit',
        quantity: '1.0',
        price: '50000.00',
      });

      expect(sellResponse.statusCode).toBe(201);
      expect(buyResponse.statusCode).toBe(201);

      // Wait for trade execution
      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify trade references valid orders
      const trades = await prisma.trade.findMany({
        include: {
          buyOrder: true,
          sellOrder: true,
        },
      });

      expect(trades.length).toBeGreaterThan(0);
      trades.forEach(trade => {
        expect(trade.buyOrder).toBeTruthy();
        expect(trade.sellOrder).toBeTruthy();
        expect(trade.buyOrder.side).toBe('buy');
        expect(trade.sellOrder.side).toBe('sell');
      });
    });

    it('should maintain position consistency after multiple trades', async () => {
      const trader1Token = await createTestAuthToken(testData.users[0].id);
      const trader2Token = await createTestAuthToken(testData.users[1].id);
      const trader1 = createAuthenticatedRequest(app, trader1Token);
      const trader2 = createAuthenticatedRequest(app, trader2Token);

      const instrumentId = testData.instruments[0].id;

      // Execute multiple trades
      const trades = [
        { quantity: '1.0', price: '50000.00' },
        { quantity: '0.5', price: '51000.00' },
        { quantity: '2.0', price: '49000.00' },
      ];

      for (const trade of trades) {
        await trader2.post('/api/v1/orders', {
          instrumentId,
          side: 'sell',
          type: 'limit',
          quantity: trade.quantity,
          price: trade.price,
        });

        await trader1.post('/api/v1/orders', {
          instrumentId,
          side: 'buy',
          type: 'limit',
          quantity: trade.quantity,
          price: trade.price,
        });

        // Wait for trade execution
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      // Check final positions
      const buyer1Position = await prisma.position.findUnique({
        where: {
          userId_instrumentId: {
            userId: testData.users[0].id,
            instrumentId,
          },
        },
      });

      const seller2Position = await prisma.position.findUnique({
        where: {
          userId_instrumentId: {
            userId: testData.users[1].id,
            instrumentId,
          },
        },
      });

      // Calculate expected quantities
      const totalQuantity = trades.reduce((sum, trade) => sum + parseFloat(trade.quantity), 0);

      expect(parseFloat(buyer1Position?.quantity || '0')).toBe(totalQuantity);
      expect(parseFloat(seller2Position?.quantity || '0')).toBe(-totalQuantity);
    });

    it('should handle cascade deletes correctly', async () => {
      const userId = testData.users[0].id;
      const instrumentId = testData.instruments[0].id;

      // Create some orders for the user
      await prisma.order.create({
        data: {
          userId,
          instrumentId,
          side: 'buy',
          type: 'limit',
          quantity: '1.0',
          price: '50000.00',
          status: 'pending',
        },
      });

      // Create a position
      await prisma.position.create({
        data: {
          userId,
          instrumentId,
          quantity: '1.0',
          averagePrice: '50000.00',
          unrealizedPnl: '0',
          realizedPnl: '0',
        },
      });

      // Verify data exists
      const ordersBefore = await prisma.order.findMany({ where: { userId } });
      const positionsBefore = await prisma.position.findMany({ where: { userId } });
      expect(ordersBefore.length).toBeGreaterThan(0);
      expect(positionsBefore.length).toBeGreaterThan(0);

      // Delete the user (should cascade)
      await prisma.user.delete({ where: { id: userId } });

      // Verify related data was deleted
      const ordersAfter = await prisma.order.findMany({ where: { userId } });
      const positionsAfter = await prisma.position.findMany({ where: { userId } });
      expect(ordersAfter).toHaveLength(0);
      expect(positionsAfter).toHaveLength(0);
    });
  });

  describe('Database Performance', () => {
    it('should handle bulk order insertions efficiently', async () => {
      const userId = testData.users[0].id;
      const instrumentId = testData.instruments[0].id;

      const startTime = Date.now();

      // Create 100 orders
      const orderPromises = Array.from({ length: 100 }, (_, i) =>
        prisma.order.create({
          data: {
            userId,
            instrumentId,
            side: i % 2 === 0 ? 'buy' : 'sell',
            type: 'limit',
            quantity: '1.0',
            price: (50000 + i).toString(),
            status: 'pending',
          },
        })
      );

      await Promise.all(orderPromises);

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete within reasonable time (adjust threshold as needed)
      expect(duration).toBeLessThan(5000); // 5 seconds

      // Verify all orders were created
      const orders = await prisma.order.findMany({ where: { userId } });
      expect(orders).toHaveLength(100);
    });

    it('should efficiently query orders with complex filters', async () => {
      const userId = testData.users[0].id;
      const instrumentId = testData.instruments[0].id;

      // Create test data
      await Promise.all([
        prisma.order.create({
          data: {
            userId,
            instrumentId,
            side: 'buy',
            type: 'limit',
            quantity: '1.0',
            price: '50000.00',
            status: 'pending',
          },
        }),
        prisma.order.create({
          data: {
            userId,
            instrumentId,
            side: 'sell',
            type: 'limit',
            quantity: '2.0',
            price: '51000.00',
            status: 'filled',
          },
        }),
        prisma.order.create({
          data: {
            userId,
            instrumentId,
            side: 'buy',
            type: 'market',
            quantity: '0.5',
            price: null,
            status: 'cancelled',
          },
        }),
      ]);

      const startTime = Date.now();

      // Complex query with multiple filters
      const orders = await prisma.order.findMany({
        where: {
          userId,
          instrumentId,
          OR: [
            { side: 'buy', status: 'pending' },
            { side: 'sell', status: 'filled' },
          ],
        },
        include: {
          instrument: true,
        },
        orderBy: [
          { createdAt: 'desc' },
          { price: 'asc' },
        ],
      });

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should be fast
      expect(duration).toBeLessThan(100); // 100ms
      expect(orders).toHaveLength(2);
    });
  });

  describe('Database Constraints', () => {
    it('should enforce unique constraints', async () => {
      const userData = {
        email: 'unique@test.com',
        passwordHash: 'hashed_password',
        firstName: 'Test',
        lastName: 'User',
      };

      // Create first user
      await prisma.user.create({ data: userData });

      // Try to create duplicate user
      await expect(
        prisma.user.create({ data: userData })
      ).rejects.toThrow();
    });

    it('should enforce foreign key constraints', async () => {
      // Try to create order with non-existent user
      await expect(
        prisma.order.create({
          data: {
            userId: 'non-existent-user',
            instrumentId: testData.instruments[0].id,
            side: 'buy',
            type: 'limit',
            quantity: '1.0',
            price: '50000.00',
            status: 'pending',
          },
        })
      ).rejects.toThrow();
    });

    it('should enforce check constraints on decimal fields', async () => {
      // Try to create order with negative quantity
      await expect(
        prisma.order.create({
          data: {
            userId: testData.users[0].id,
            instrumentId: testData.instruments[0].id,
            side: 'buy',
            type: 'limit',
            quantity: '-1.0', // Invalid negative quantity
            price: '50000.00',
            status: 'pending',
          },
        })
      ).rejects.toThrow();
    });
  });

  describe('Database Migrations', () => {
    it('should have all required tables', async () => {
      // Query information schema to check table existence
      const tables = await prisma.$queryRaw`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
      ` as Array<{ table_name: string }>;

      const tableNames = tables.map(t => t.table_name);

      // Check for required tables
      const requiredTables = [
        'User',
        'Instrument',
        'Order',
        'Trade',
        'Position',
        'Account',
        'ApiKey',
        'RefreshToken',
        'PasswordResetToken',
      ];

      requiredTables.forEach(tableName => {
        expect(tableNames).toContain(tableName);
      });
    });

    it('should have proper indexes for performance', async () => {
      // Query for indexes on critical tables
      const orderIndexes = await prisma.$queryRaw`
        SELECT indexname 
        FROM pg_indexes 
        WHERE tablename = 'Order'
      ` as Array<{ indexname: string }>;

      const indexNames = orderIndexes.map(i => i.indexname);

      // Should have indexes on frequently queried columns
      expect(indexNames.some(name => name.includes('userId'))).toBe(true);
      expect(indexNames.some(name => name.includes('instrumentId'))).toBe(true);
      expect(indexNames.some(name => name.includes('status'))).toBe(true);
    });
  });
});