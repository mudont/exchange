import { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import {
  setupIntegrationTests,
  teardownIntegrationTests,
  cleanupTestData,
  seedTestData,
  createAuthenticatedRequest,
  createTestAuthToken,
  waitFor,
} from './setup';

describe('Trading Integration Tests', () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  let testData: any;
  let trader1Token: string;
  let trader2Token: string;

  beforeAll(async () => {
    ({ app, prisma } = await setupIntegrationTests());
  });

  afterAll(async () => {
    await teardownIntegrationTests();
  });

  beforeEach(async () => {
    await cleanupTestData();
    testData = await seedTestData();
    
    // Create auth tokens for test users
    trader1Token = await createTestAuthToken(testData.users[0].id);
    trader2Token = await createTestAuthToken(testData.users[1].id);
  });

  describe('Order Management', () => {
    describe('POST /api/v1/orders', () => {
      it('should place a limit buy order successfully', async () => {
        const trader1 = createAuthenticatedRequest(app, trader1Token);
        
        const orderData = {
          instrumentId: testData.instruments[0].id, // BTC-USD
          side: 'buy',
          type: 'limit',
          quantity: '1.0',
          price: '45000.00',
        };

        const response = await trader1.post('/api/v1/orders', orderData);

        expect(response.statusCode).toBe(201);
        
        const body = JSON.parse(response.body);
        expect(body.success).toBe(true);
        expect(body.data.order.side).toBe('buy');
        expect(body.data.order.type).toBe('limit');
        expect(body.data.order.quantity).toBe('1.0');
        expect(body.data.order.price).toBe('45000.00');
        expect(body.data.order.status).toBe('pending');

        // Verify order was created in database
        const dbOrder = await prisma.order.findUnique({
          where: { id: body.data.order.id },
        });
        expect(dbOrder).toBeTruthy();
        expect(dbOrder?.userId).toBe(testData.users[0].id);
      });

      it('should place a limit sell order successfully', async () => {
        const trader1 = createAuthenticatedRequest(app, trader1Token);
        
        const orderData = {
          instrumentId: testData.instruments[0].id, // BTC-USD
          side: 'sell',
          type: 'limit',
          quantity: '0.5',
          price: '55000.00',
        };

        const response = await trader1.post('/api/v1/orders', orderData);

        expect(response.statusCode).toBe(201);
        
        const body = JSON.parse(response.body);
        expect(body.success).toBe(true);
        expect(body.data.order.side).toBe('sell');
        expect(body.data.order.price).toBe('55000.00');
      });

      it('should place a market buy order successfully', async () => {
        const trader1 = createAuthenticatedRequest(app, trader1Token);
        const trader2 = createAuthenticatedRequest(app, trader2Token);

        // First, place a sell order to match against
        await trader2.post('/api/v1/orders', {
          instrumentId: testData.instruments[0].id,
          side: 'sell',
          type: 'limit',
          quantity: '1.0',
          price: '50000.00',
        });

        // Then place a market buy order
        const orderData = {
          instrumentId: testData.instruments[0].id,
          side: 'buy',
          type: 'market',
          quantity: '0.5',
        };

        const response = await trader1.post('/api/v1/orders', orderData);

        expect(response.statusCode).toBe(201);
        
        const body = JSON.parse(response.body);
        expect(body.success).toBe(true);
        expect(body.data.order.type).toBe('market');
        expect(body.data.order.price).toBeNull();

        // Check if trade was executed
        await waitFor(100); // Allow time for matching
        
        const trades = await prisma.trade.findMany({
          where: { instrumentId: testData.instruments[0].id },
        });
        expect(trades.length).toBeGreaterThan(0);
      });

      it('should validate order parameters', async () => {
        const trader1 = createAuthenticatedRequest(app, trader1Token);
        
        const invalidOrderData = {
          instrumentId: testData.instruments[0].id,
          side: 'buy',
          type: 'limit',
          quantity: '0', // Invalid quantity
          price: '45000.00',
        };

        const response = await trader1.post('/api/v1/orders', invalidOrderData);

        expect(response.statusCode).toBe(400);
        
        const body = JSON.parse(response.body);
        expect(body.success).toBe(false);
        expect(body.error.code).toBe('VALIDATION_ERROR');
      });

      it('should check minimum order size', async () => {
        const trader1 = createAuthenticatedRequest(app, trader1Token);
        
        const orderData = {
          instrumentId: testData.instruments[0].id, // BTC-USD min size is 0.001
          side: 'buy',
          type: 'limit',
          quantity: '0.0001', // Below minimum
          price: '45000.00',
        };

        const response = await trader1.post('/api/v1/orders', orderData);

        expect(response.statusCode).toBe(400);
        
        const body = JSON.parse(response.body);
        expect(body.success).toBe(false);
        expect(body.error.code).toBe('ORDER_SIZE_TOO_SMALL');
      });

      it('should check maximum order size', async () => {
        const trader1 = createAuthenticatedRequest(app, trader1Token);
        
        const orderData = {
          instrumentId: testData.instruments[0].id, // BTC-USD max size is 1000
          side: 'buy',
          type: 'limit',
          quantity: '1001', // Above maximum
          price: '45000.00',
        };

        const response = await trader1.post('/api/v1/orders', orderData);

        expect(response.statusCode).toBe(400);
        
        const body = JSON.parse(response.body);
        expect(body.success).toBe(false);
        expect(body.error.code).toBe('ORDER_SIZE_TOO_LARGE');
      });

      it('should check sufficient balance for buy orders', async () => {
        const trader1 = createAuthenticatedRequest(app, trader1Token);
        
        const orderData = {
          instrumentId: testData.instruments[0].id,
          side: 'buy',
          type: 'limit',
          quantity: '100', // Would cost 5,000,000 USD
          price: '50000.00',
        };

        const response = await trader1.post('/api/v1/orders', orderData);

        expect(response.statusCode).toBe(400);
        
        const body = JSON.parse(response.body);
        expect(body.success).toBe(false);
        expect(body.error.code).toBe('INSUFFICIENT_BALANCE');
      });
    });

    describe('GET /api/v1/orders', () => {
      beforeEach(async () => {
        const trader1 = createAuthenticatedRequest(app, trader1Token);
        
        // Create some test orders
        await trader1.post('/api/v1/orders', {
          instrumentId: testData.instruments[0].id,
          side: 'buy',
          type: 'limit',
          quantity: '1.0',
          price: '45000.00',
        });

        await trader1.post('/api/v1/orders', {
          instrumentId: testData.instruments[1].id, // ETH-USD
          side: 'sell',
          type: 'limit',
          quantity: '10.0',
          price: '3000.00',
        });
      });

      it('should list user orders', async () => {
        const trader1 = createAuthenticatedRequest(app, trader1Token);
        
        const response = await trader1.get('/api/v1/orders');

        expect(response.statusCode).toBe(200);
        
        const body = JSON.parse(response.body);
        expect(body.success).toBe(true);
        expect(body.data.orders).toHaveLength(2);
        expect(body.data.orders[0].userId).toBe(testData.users[0].id);
      });

      it('should filter orders by instrument', async () => {
        const trader1 = createAuthenticatedRequest(app, trader1Token);
        
        const response = await trader1.get(`/api/v1/orders?instrumentId=${testData.instruments[0].id}`);

        expect(response.statusCode).toBe(200);
        
        const body = JSON.parse(response.body);
        expect(body.success).toBe(true);
        expect(body.data.orders).toHaveLength(1);
        expect(body.data.orders[0].instrumentId).toBe(testData.instruments[0].id);
      });

      it('should filter orders by status', async () => {
        const trader1 = createAuthenticatedRequest(app, trader1Token);
        
        const response = await trader1.get('/api/v1/orders?status=pending');

        expect(response.statusCode).toBe(200);
        
        const body = JSON.parse(response.body);
        expect(body.success).toBe(true);
        expect(body.data.orders.every((order: any) => order.status === 'pending')).toBe(true);
      });

      it('should paginate results', async () => {
        const trader1 = createAuthenticatedRequest(app, trader1Token);
        
        const response = await trader1.get('/api/v1/orders?limit=1&offset=0');

        expect(response.statusCode).toBe(200);
        
        const body = JSON.parse(response.body);
        expect(body.success).toBe(true);
        expect(body.data.orders).toHaveLength(1);
        expect(body.data.pagination.total).toBe(2);
        expect(body.data.pagination.limit).toBe(1);
        expect(body.data.pagination.offset).toBe(0);
      });
    });

    describe('DELETE /api/v1/orders/:orderId', () => {
      let orderId: string;

      beforeEach(async () => {
        const trader1 = createAuthenticatedRequest(app, trader1Token);
        
        const response = await trader1.post('/api/v1/orders', {
          instrumentId: testData.instruments[0].id,
          side: 'buy',
          type: 'limit',
          quantity: '1.0',
          price: '45000.00',
        });

        const body = JSON.parse(response.body);
        orderId = body.data.order.id;
      });

      it('should cancel order successfully', async () => {
        const trader1 = createAuthenticatedRequest(app, trader1Token);
        
        const response = await trader1.delete(`/api/v1/orders/${orderId}`);

        expect(response.statusCode).toBe(200);
        
        const body = JSON.parse(response.body);
        expect(body.success).toBe(true);

        // Verify order was cancelled in database
        const dbOrder = await prisma.order.findUnique({
          where: { id: orderId },
        });
        expect(dbOrder?.status).toBe('cancelled');
      });

      it('should not allow cancelling other users orders', async () => {
        const trader2 = createAuthenticatedRequest(app, trader2Token);
        
        const response = await trader2.delete(`/api/v1/orders/${orderId}`);

        expect(response.statusCode).toBe(404);
        
        const body = JSON.parse(response.body);
        expect(body.success).toBe(false);
        expect(body.error.code).toBe('ORDER_NOT_FOUND');
      });

      it('should not allow cancelling non-existent orders', async () => {
        const trader1 = createAuthenticatedRequest(app, trader1Token);
        
        const response = await trader1.delete('/api/v1/orders/non-existent-id');

        expect(response.statusCode).toBe(404);
        
        const body = JSON.parse(response.body);
        expect(body.success).toBe(false);
        expect(body.error.code).toBe('ORDER_NOT_FOUND');
      });
    });
  });

  describe('Order Matching', () => {
    it('should match compatible buy and sell orders', async () => {
      const trader1 = createAuthenticatedRequest(app, trader1Token);
      const trader2 = createAuthenticatedRequest(app, trader2Token);

      // Place a sell order first
      const sellResponse = await trader2.post('/api/v1/orders', {
        instrumentId: testData.instruments[0].id,
        side: 'sell',
        type: 'limit',
        quantity: '1.0',
        price: '50000.00',
      });

      expect(sellResponse.statusCode).toBe(201);

      // Place a matching buy order
      const buyResponse = await trader1.post('/api/v1/orders', {
        instrumentId: testData.instruments[0].id,
        side: 'buy',
        type: 'limit',
        quantity: '1.0',
        price: '50000.00',
      });

      expect(buyResponse.statusCode).toBe(201);

      // Wait for matching to complete
      await waitFor(200);

      // Check that trade was created
      const trades = await prisma.trade.findMany({
        where: { instrumentId: testData.instruments[0].id },
      });

      expect(trades).toHaveLength(1);
      expect(trades[0].quantity).toBe('1.0');
      expect(trades[0].price).toBe('50000.00');

      // Check that orders were filled
      const sellOrder = JSON.parse(sellResponse.body).data.order;
      const buyOrder = JSON.parse(buyResponse.body).data.order;

      const updatedSellOrder = await prisma.order.findUnique({
        where: { id: sellOrder.id },
      });
      const updatedBuyOrder = await prisma.order.findUnique({
        where: { id: buyOrder.id },
      });

      expect(updatedSellOrder?.status).toBe('filled');
      expect(updatedBuyOrder?.status).toBe('filled');
    });

    it('should partially fill orders when quantities dont match', async () => {
      const trader1 = createAuthenticatedRequest(app, trader1Token);
      const trader2 = createAuthenticatedRequest(app, trader2Token);

      // Place a large sell order
      const sellResponse = await trader2.post('/api/v1/orders', {
        instrumentId: testData.instruments[0].id,
        side: 'sell',
        type: 'limit',
        quantity: '2.0',
        price: '50000.00',
      });

      // Place a smaller buy order
      const buyResponse = await trader1.post('/api/v1/orders', {
        instrumentId: testData.instruments[0].id,
        side: 'buy',
        type: 'limit',
        quantity: '1.0',
        price: '50000.00',
      });

      // Wait for matching
      await waitFor(200);

      // Check trade
      const trades = await prisma.trade.findMany({
        where: { instrumentId: testData.instruments[0].id },
      });

      expect(trades).toHaveLength(1);
      expect(trades[0].quantity).toBe('1.0');

      // Check order statuses
      const sellOrder = JSON.parse(sellResponse.body).data.order;
      const buyOrder = JSON.parse(buyResponse.body).data.order;

      const updatedSellOrder = await prisma.order.findUnique({
        where: { id: sellOrder.id },
      });
      const updatedBuyOrder = await prisma.order.findUnique({
        where: { id: buyOrder.id },
      });

      expect(updatedSellOrder?.status).toBe('partially_filled');
      expect(updatedSellOrder?.filledQuantity).toBe('1.0');
      expect(updatedBuyOrder?.status).toBe('filled');
      expect(updatedBuyOrder?.filledQuantity).toBe('1.0');
    });

    it('should respect price-time priority', async () => {
      const trader1 = createAuthenticatedRequest(app, trader1Token);
      const trader2 = createAuthenticatedRequest(app, trader2Token);

      // Place first sell order
      const firstSellResponse = await trader2.post('/api/v1/orders', {
        instrumentId: testData.instruments[0].id,
        side: 'sell',
        type: 'limit',
        quantity: '1.0',
        price: '50000.00',
      });

      // Wait a bit to ensure different timestamps
      await waitFor(10);

      // Place second sell order at same price
      const secondSellResponse = await trader2.post('/api/v1/orders', {
        instrumentId: testData.instruments[0].id,
        side: 'sell',
        type: 'limit',
        quantity: '1.0',
        price: '50000.00',
      });

      // Place buy order that can only fill one
      const buyResponse = await trader1.post('/api/v1/orders', {
        instrumentId: testData.instruments[0].id,
        side: 'buy',
        type: 'limit',
        quantity: '1.0',
        price: '50000.00',
      });

      // Wait for matching
      await waitFor(200);

      // Check which order was filled (should be the first one due to time priority)
      const firstSellOrder = JSON.parse(firstSellResponse.body).data.order;
      const secondSellOrder = JSON.parse(secondSellResponse.body).data.order;

      const updatedFirstSell = await prisma.order.findUnique({
        where: { id: firstSellOrder.id },
      });
      const updatedSecondSell = await prisma.order.findUnique({
        where: { id: secondSellOrder.id },
      });

      expect(updatedFirstSell?.status).toBe('filled');
      expect(updatedSecondSell?.status).toBe('pending');
    });

    it('should prevent self-trading', async () => {
      const trader1 = createAuthenticatedRequest(app, trader1Token);

      // Place sell order
      await trader1.post('/api/v1/orders', {
        instrumentId: testData.instruments[0].id,
        side: 'sell',
        type: 'limit',
        quantity: '1.0',
        price: '50000.00',
      });

      // Try to place matching buy order from same user
      await trader1.post('/api/v1/orders', {
        instrumentId: testData.instruments[0].id,
        side: 'buy',
        type: 'limit',
        quantity: '1.0',
        price: '50000.00',
      });

      // Wait for potential matching
      await waitFor(200);

      // Should not have created any trades
      const trades = await prisma.trade.findMany({
        where: { instrumentId: testData.instruments[0].id },
      });

      expect(trades).toHaveLength(0);
    });
  });

  describe('Position Updates', () => {
    it('should update positions after trade execution', async () => {
      const trader1 = createAuthenticatedRequest(app, trader1Token);
      const trader2 = createAuthenticatedRequest(app, trader2Token);

      // Execute a trade
      await trader2.post('/api/v1/orders', {
        instrumentId: testData.instruments[0].id,
        side: 'sell',
        type: 'limit',
        quantity: '1.0',
        price: '50000.00',
      });

      await trader1.post('/api/v1/orders', {
        instrumentId: testData.instruments[0].id,
        side: 'buy',
        type: 'limit',
        quantity: '1.0',
        price: '50000.00',
      });

      // Wait for trade execution and position updates
      await waitFor(300);

      // Check positions were created/updated
      const buyer1Position = await prisma.position.findUnique({
        where: {
          userId_instrumentId: {
            userId: testData.users[0].id,
            instrumentId: testData.instruments[0].id,
          },
        },
      });

      const seller2Position = await prisma.position.findUnique({
        where: {
          userId_instrumentId: {
            userId: testData.users[1].id,
            instrumentId: testData.instruments[0].id,
          },
        },
      });

      expect(buyer1Position?.quantity).toBe('1.0');
      expect(buyer1Position?.averagePrice).toBe('50000.00');
      expect(seller2Position?.quantity).toBe('-1.0');
      expect(seller2Position?.averagePrice).toBe('50000.00');
    });
  });
});