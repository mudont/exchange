import { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { WebSocket } from 'ws';
import {
  setupIntegrationTests,
  teardownIntegrationTests,
  cleanupTestData,
  seedTestData,
  createTestAuthToken,
  waitFor,
} from './setup';

describe('WebSocket Integration Tests', () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  let testData: any;
  let wsUrl: string;

  beforeAll(async () => {
    ({ app, prisma } = await setupIntegrationTests());
    
    // Get WebSocket URL from the app
    await app.listen({ port: 0 }); // Let system assign port
    const address = app.server.address();
    const port = typeof address === 'object' && address ? address.port : 3001;
    wsUrl = `ws://localhost:${port}`;
  });

  afterAll(async () => {
    await teardownIntegrationTests();
  });

  beforeEach(async () => {
    await cleanupTestData();
    testData = await seedTestData();
  });

  describe('WebSocket Connection', () => {
    it('should establish WebSocket connection successfully', async () => {
      const ws = new WebSocket(wsUrl);
      
      await new Promise((resolve, reject) => {
        ws.on('open', resolve);
        ws.on('error', reject);
        setTimeout(() => reject(new Error('Connection timeout')), 5000);
      });

      expect(ws.readyState).toBe(WebSocket.OPEN);
      ws.close();
    });

    it('should authenticate WebSocket connection with valid token', async () => {
      const token = await createTestAuthToken(testData.users[0].id);
      const ws = new WebSocket(wsUrl);

      await new Promise((resolve, reject) => {
        ws.on('open', () => {
          ws.send(JSON.stringify({
            type: 'auth',
            token,
          }));
        });

        ws.on('message', (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === 'auth_success') {
            resolve(message);
          } else if (message.type === 'auth_error') {
            reject(new Error(message.error));
          }
        });

        ws.on('error', reject);
        setTimeout(() => reject(new Error('Auth timeout')), 5000);
      });

      ws.close();
    });

    it('should reject WebSocket authentication with invalid token', async () => {
      const ws = new WebSocket(wsUrl);

      const authError = await new Promise((resolve, reject) => {
        ws.on('open', () => {
          ws.send(JSON.stringify({
            type: 'auth',
            token: 'invalid.token.here',
          }));
        });

        ws.on('message', (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === 'auth_error') {
            resolve(message);
          } else if (message.type === 'auth_success') {
            reject(new Error('Should not authenticate with invalid token'));
          }
        });

        ws.on('error', reject);
        setTimeout(() => reject(new Error('Auth timeout')), 5000);
      });

      expect(authError).toHaveProperty('type', 'auth_error');
      ws.close();
    });
  });

  describe('Market Data Subscriptions', () => {
    let authenticatedWs: WebSocket;
    let token: string;

    beforeEach(async () => {
      token = await createTestAuthToken(testData.users[0].id);
      authenticatedWs = new WebSocket(wsUrl);

      // Authenticate the WebSocket connection
      await new Promise((resolve, reject) => {
        authenticatedWs.on('open', () => {
          authenticatedWs.send(JSON.stringify({
            type: 'auth',
            token,
          }));
        });

        authenticatedWs.on('message', (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === 'auth_success') {
            resolve(message);
          }
        });

        authenticatedWs.on('error', reject);
        setTimeout(() => reject(new Error('Auth timeout')), 5000);
      });
    });

    afterEach(() => {
      if (authenticatedWs.readyState === WebSocket.OPEN) {
        authenticatedWs.close();
      }
    });

    it('should subscribe to order book updates', async () => {
      const instrumentId = testData.instruments[0].id;

      // Subscribe to order book
      authenticatedWs.send(JSON.stringify({
        type: 'subscribe',
        channel: 'orderbook',
        instrumentId,
      }));

      // Wait for subscription confirmation
      const subscriptionConfirm = await new Promise((resolve, reject) => {
        authenticatedWs.on('message', (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === 'subscription_success' && message.channel === 'orderbook') {
            resolve(message);
          }
        });

        setTimeout(() => reject(new Error('Subscription timeout')), 5000);
      });

      expect(subscriptionConfirm).toHaveProperty('type', 'subscription_success');
      expect(subscriptionConfirm).toHaveProperty('channel', 'orderbook');
    });

    it('should receive order book updates when orders are placed', async () => {
      const instrumentId = testData.instruments[0].id;

      // Subscribe to order book
      authenticatedWs.send(JSON.stringify({
        type: 'subscribe',
        channel: 'orderbook',
        instrumentId,
      }));

      // Wait for subscription
      await waitFor(100);

      // Set up listener for order book updates
      const orderBookUpdate = new Promise((resolve, reject) => {
        authenticatedWs.on('message', (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === 'orderbook_update') {
            resolve(message);
          }
        });

        setTimeout(() => reject(new Error('Update timeout')), 10000);
      });

      // Place an order to trigger update
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/orders',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        payload: {
          instrumentId,
          side: 'buy',
          type: 'limit',
          quantity: '1.0',
          price: '45000.00',
        },
      });

      expect(response.statusCode).toBe(201);

      // Wait for order book update
      const update = await orderBookUpdate;
      expect(update).toHaveProperty('type', 'orderbook_update');
      expect(update).toHaveProperty('instrumentId', instrumentId);
      expect(update).toHaveProperty('bids');
      expect(update).toHaveProperty('asks');
    });

    it('should subscribe to trade updates', async () => {
      const instrumentId = testData.instruments[0].id;

      // Subscribe to trades
      authenticatedWs.send(JSON.stringify({
        type: 'subscribe',
        channel: 'trades',
        instrumentId,
      }));

      // Wait for subscription confirmation
      const subscriptionConfirm = await new Promise((resolve, reject) => {
        authenticatedWs.on('message', (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === 'subscription_success' && message.channel === 'trades') {
            resolve(message);
          }
        });

        setTimeout(() => reject(new Error('Subscription timeout')), 5000);
      });

      expect(subscriptionConfirm).toHaveProperty('type', 'subscription_success');
      expect(subscriptionConfirm).toHaveProperty('channel', 'trades');
    });

    it('should receive trade updates when trades are executed', async () => {
      const instrumentId = testData.instruments[0].id;
      const trader2Token = await createTestAuthToken(testData.users[1].id);

      // Subscribe to trades
      authenticatedWs.send(JSON.stringify({
        type: 'subscribe',
        channel: 'trades',
        instrumentId,
      }));

      await waitFor(100);

      // Set up listener for trade updates
      const tradeUpdate = new Promise((resolve, reject) => {
        authenticatedWs.on('message', (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === 'trade_executed') {
            resolve(message);
          }
        });

        setTimeout(() => reject(new Error('Trade update timeout')), 10000);
      });

      // Place matching orders to create a trade
      await app.inject({
        method: 'POST',
        url: '/api/v1/orders',
        headers: {
          authorization: `Bearer ${trader2Token}`,
          'content-type': 'application/json',
        },
        payload: {
          instrumentId,
          side: 'sell',
          type: 'limit',
          quantity: '1.0',
          price: '50000.00',
        },
      });

      await app.inject({
        method: 'POST',
        url: '/api/v1/orders',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        payload: {
          instrumentId,
          side: 'buy',
          type: 'limit',
          quantity: '1.0',
          price: '50000.00',
        },
      });

      // Wait for trade update
      const update = await tradeUpdate;
      expect(update).toHaveProperty('type', 'trade_executed');
      expect(update).toHaveProperty('instrumentId', instrumentId);
      expect(update).toHaveProperty('price', '50000.00');
      expect(update).toHaveProperty('quantity', '1.0');
    });

    it('should unsubscribe from channels', async () => {
      const instrumentId = testData.instruments[0].id;

      // Subscribe first
      authenticatedWs.send(JSON.stringify({
        type: 'subscribe',
        channel: 'orderbook',
        instrumentId,
      }));

      await waitFor(100);

      // Then unsubscribe
      authenticatedWs.send(JSON.stringify({
        type: 'unsubscribe',
        channel: 'orderbook',
        instrumentId,
      }));

      // Wait for unsubscription confirmation
      const unsubscriptionConfirm = await new Promise((resolve, reject) => {
        authenticatedWs.on('message', (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === 'unsubscription_success' && message.channel === 'orderbook') {
            resolve(message);
          }
        });

        setTimeout(() => reject(new Error('Unsubscription timeout')), 5000);
      });

      expect(unsubscriptionConfirm).toHaveProperty('type', 'unsubscription_success');
      expect(unsubscriptionConfirm).toHaveProperty('channel', 'orderbook');
    });
  });

  describe('User-Specific Notifications', () => {
    let authenticatedWs: WebSocket;
    let token: string;

    beforeEach(async () => {
      token = await createTestAuthToken(testData.users[0].id);
      authenticatedWs = new WebSocket(wsUrl);

      // Authenticate the WebSocket connection
      await new Promise((resolve, reject) => {
        authenticatedWs.on('open', () => {
          authenticatedWs.send(JSON.stringify({
            type: 'auth',
            token,
          }));
        });

        authenticatedWs.on('message', (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === 'auth_success') {
            resolve(message);
          }
        });

        authenticatedWs.on('error', reject);
        setTimeout(() => reject(new Error('Auth timeout')), 5000);
      });
    });

    afterEach(() => {
      if (authenticatedWs.readyState === WebSocket.OPEN) {
        authenticatedWs.close();
      }
    });

    it('should receive order status updates', async () => {
      const instrumentId = testData.instruments[0].id;

      // Set up listener for order status updates
      const orderStatusUpdate = new Promise((resolve, reject) => {
        authenticatedWs.on('message', (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === 'order_status_update') {
            resolve(message);
          }
        });

        setTimeout(() => reject(new Error('Order status update timeout')), 10000);
      });

      // Place an order
      const orderResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/orders',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        payload: {
          instrumentId,
          side: 'buy',
          type: 'limit',
          quantity: '1.0',
          price: '45000.00',
        },
      });

      expect(orderResponse.statusCode).toBe(201);

      // Wait for order status update
      const update = await orderStatusUpdate;
      expect(update).toHaveProperty('type', 'order_status_update');
      expect(update).toHaveProperty('orderId');
      expect(update).toHaveProperty('status', 'pending');
    });

    it('should receive position updates', async () => {
      const instrumentId = testData.instruments[0].id;
      const trader2Token = await createTestAuthToken(testData.users[1].id);

      // Set up listener for position updates
      const positionUpdate = new Promise((resolve, reject) => {
        authenticatedWs.on('message', (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === 'position_update') {
            resolve(message);
          }
        });

        setTimeout(() => reject(new Error('Position update timeout')), 15000);
      });

      // Execute a trade to trigger position update
      await app.inject({
        method: 'POST',
        url: '/api/v1/orders',
        headers: {
          authorization: `Bearer ${trader2Token}`,
          'content-type': 'application/json',
        },
        payload: {
          instrumentId,
          side: 'sell',
          type: 'limit',
          quantity: '1.0',
          price: '50000.00',
        },
      });

      await app.inject({
        method: 'POST',
        url: '/api/v1/orders',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        payload: {
          instrumentId,
          side: 'buy',
          type: 'limit',
          quantity: '1.0',
          price: '50000.00',
        },
      });

      // Wait for position update
      const update = await positionUpdate;
      expect(update).toHaveProperty('type', 'position_update');
      expect(update).toHaveProperty('instrumentId', instrumentId);
      expect(update).toHaveProperty('quantity', '1.0');
    });
  });

  describe('Connection Management', () => {
    it('should handle connection drops gracefully', async () => {
      const ws = new WebSocket(wsUrl);

      await new Promise((resolve, reject) => {
        ws.on('open', resolve);
        ws.on('error', reject);
        setTimeout(() => reject(new Error('Connection timeout')), 5000);
      });

      // Simulate connection drop
      ws.terminate();

      // Connection should be closed
      expect(ws.readyState).toBe(WebSocket.CLOSED);
    });

    it('should handle multiple concurrent connections', async () => {
      const connections: WebSocket[] = [];
      const connectionPromises: Promise<void>[] = [];

      // Create multiple connections
      for (let i = 0; i < 5; i++) {
        const ws = new WebSocket(wsUrl);
        connections.push(ws);

        connectionPromises.push(
          new Promise((resolve, reject) => {
            ws.on('open', () => resolve());
            ws.on('error', reject);
            setTimeout(() => reject(new Error(`Connection ${i} timeout`)), 5000);
          })
        );
      }

      // Wait for all connections to open
      await Promise.all(connectionPromises);

      // All connections should be open
      connections.forEach(ws => {
        expect(ws.readyState).toBe(WebSocket.OPEN);
      });

      // Close all connections
      connections.forEach(ws => ws.close());
    });

    it('should handle invalid message formats gracefully', async () => {
      const ws = new WebSocket(wsUrl);

      await new Promise((resolve, reject) => {
        ws.on('open', resolve);
        ws.on('error', reject);
        setTimeout(() => reject(new Error('Connection timeout')), 5000);
      });

      // Send invalid JSON
      ws.send('invalid json');

      // Wait a bit to ensure server processes the message
      await waitFor(100);

      // Connection should still be open (server should handle gracefully)
      expect(ws.readyState).toBe(WebSocket.OPEN);

      ws.close();
    });
  });
});