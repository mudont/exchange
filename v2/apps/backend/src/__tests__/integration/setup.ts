import { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import { createApp } from '../../server';

// Test database and Redis instances
let testApp: FastifyInstance;
let testPrisma: PrismaClient;
let testRedis: Redis;

// Test database URL - should use a separate test database
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://test:test@localhost:5432/trading_exchange_test';
const TEST_REDIS_URL = process.env.TEST_REDIS_URL || 'redis://localhost:6379/15'; // Use DB 15 for tests

export async function setupIntegrationTests(): Promise<{
  app: FastifyInstance;
  prisma: PrismaClient;
  redis: Redis;
}> {
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  process.env.REDIS_URL = TEST_REDIS_URL;
  process.env.JWT_SECRET = 'test-jwt-secret-for-integration-tests';
  process.env.API_KEY_SECRET = 'test-api-key-secret-for-integration-tests';

  // Create test database connection
  testPrisma = new PrismaClient({
    datasources: {
      db: {
        url: TEST_DATABASE_URL,
      },
    },
  });

  // Create test Redis connection
  testRedis = new Redis(TEST_REDIS_URL);

  // Create Fastify app instance
  testApp = await createApp();

  // Wait for app to be ready
  await testApp.ready();

  return {
    app: testApp,
    prisma: testPrisma,
    redis: testRedis,
  };
}

export async function teardownIntegrationTests(): Promise<void> {
  // Close Fastify app
  if (testApp) {
    await testApp.close();
  }

  // Disconnect from test database
  if (testPrisma) {
    await testPrisma.$disconnect();
  }

  // Disconnect from test Redis
  if (testRedis) {
    await testRedis.disconnect();
  }
}

export async function cleanupTestData(): Promise<void> {
  if (!testPrisma) return;

  // Clean up test data in reverse dependency order
  await testPrisma.trade.deleteMany({});
  await testPrisma.order.deleteMany({});
  await testPrisma.position.deleteMany({});
  await testPrisma.account.deleteMany({});
  await testPrisma.apiKey.deleteMany({});
  await testPrisma.refreshToken.deleteMany({});
  await testPrisma.passwordResetToken.deleteMany({});
  await testPrisma.emailVerificationToken.deleteMany({});
  await testPrisma.instrument.deleteMany({});
  await testPrisma.user.deleteMany({});

  // Clear Redis test data
  if (testRedis) {
    await testRedis.flushdb();
  }
}

export async function seedTestData(): Promise<{
  users: any[];
  instruments: any[];
  accounts: any[];
}> {
  if (!testPrisma) throw new Error('Test database not initialized');

  // Create test users
  const users = await Promise.all([
    testPrisma.user.create({
      data: {
        email: 'trader1@test.com',
        passwordHash: '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj/RK.s5uO.G', // 'password123'
        firstName: 'Test',
        lastName: 'Trader1',
        isEmailVerified: true,
      },
    }),
    testPrisma.user.create({
      data: {
        email: 'trader2@test.com',
        passwordHash: '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj/RK.s5uO.G', // 'password123'
        firstName: 'Test',
        lastName: 'Trader2',
        isEmailVerified: true,
      },
    }),
    testPrisma.user.create({
      data: {
        email: 'admin@test.com',
        passwordHash: '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj/RK.s5uO.G', // 'password123'
        firstName: 'Test',
        lastName: 'Admin',
        isEmailVerified: true,
        role: 'ADMIN',
      },
    }),
  ]);

  // Create test instruments
  const instruments = await Promise.all([
    testPrisma.instrument.create({
      data: {
        symbol: 'BTC-USD',
        name: 'Bitcoin/USD',
        type: 'CRYPTO',
        baseAsset: 'BTC',
        quoteAsset: 'USD',
        minOrderSize: '0.001',
        maxOrderSize: '1000',
        priceIncrement: '0.01',
        quantityIncrement: '0.001',
        isActive: true,
      },
    }),
    testPrisma.instrument.create({
      data: {
        symbol: 'ETH-USD',
        name: 'Ethereum/USD',
        type: 'CRYPTO',
        baseAsset: 'ETH',
        quoteAsset: 'USD',
        minOrderSize: '0.01',
        maxOrderSize: '10000',
        priceIncrement: '0.01',
        quantityIncrement: '0.01',
        isActive: true,
      },
    }),
    testPrisma.instrument.create({
      data: {
        symbol: 'LTC-USD',
        name: 'Litecoin/USD',
        type: 'CRYPTO',
        baseAsset: 'LTC',
        quoteAsset: 'USD',
        minOrderSize: '0.1',
        maxOrderSize: '100000',
        priceIncrement: '0.01',
        quantityIncrement: '0.1',
        isActive: true,
      },
    }),
  ]);

  // Create test accounts for users
  const accounts = await Promise.all(
    users.map(user =>
      testPrisma.account.create({
        data: {
          userId: user.id,
          balance: '100000.00', // $100,000 starting balance
          availableBalance: '100000.00',
          currency: 'USD',
        },
      })
    )
  );

  return { users, instruments, accounts };
}

export async function createTestAuthToken(userId: string): Promise<string> {
  const jwt = require('jsonwebtoken');
  return jwt.sign(
    { userId, type: 'access' },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

export async function createTestApiKey(userId: string): Promise<{ apiKey: string; hashedKey: string }> {
  const crypto = require('crypto');
  const apiKey = `ak_test_${crypto.randomBytes(32).toString('hex')}`;
  const hashedKey = crypto
    .createHmac('sha256', process.env.API_KEY_SECRET)
    .update(apiKey)
    .digest('hex');

  await testPrisma.apiKey.create({
    data: {
      key: hashedKey,
      name: 'Test API Key',
      userId,
      permissions: ['trading', 'market_data'],
      rateLimits: {
        windowMs: 60000,
        maxRequests: 1000,
      },
      throttling: {
        tokensPerInterval: 100,
        interval: 1000,
        burstLimit: 200,
      },
    },
  });

  return { apiKey, hashedKey };
}

// Helper function to make authenticated requests
export function createAuthenticatedRequest(app: FastifyInstance, token: string) {
  return {
    get: (url: string) =>
      app.inject({
        method: 'GET',
        url,
        headers: {
          authorization: `Bearer ${token}`,
        },
      }),
    post: (url: string, payload?: any) =>
      app.inject({
        method: 'POST',
        url,
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        payload,
      }),
    put: (url: string, payload?: any) =>
      app.inject({
        method: 'PUT',
        url,
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        payload,
      }),
    delete: (url: string) =>
      app.inject({
        method: 'DELETE',
        url,
        headers: {
          authorization: `Bearer ${token}`,
        },
      }),
  };
}

// Helper function to make API key authenticated requests
export function createApiKeyRequest(app: FastifyInstance, apiKey: string) {
  return {
    get: (url: string) =>
      app.inject({
        method: 'GET',
        url,
        headers: {
          'x-api-key': apiKey,
        },
      }),
    post: (url: string, payload?: any) =>
      app.inject({
        method: 'POST',
        url,
        headers: {
          'x-api-key': apiKey,
          'content-type': 'application/json',
        },
        payload,
      }),
    put: (url: string, payload?: any) =>
      app.inject({
        method: 'PUT',
        url,
        headers: {
          'x-api-key': apiKey,
          'content-type': 'application/json',
        },
        payload,
      }),
    delete: (url: string) =>
      app.inject({
        method: 'DELETE',
        url,
        headers: {
          'x-api-key': apiKey,
        },
      }),
  };
}

// Helper to wait for async operations
export const waitFor = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

// Helper to retry operations
export async function retry<T>(
  operation: () => Promise<T>,
  maxAttempts: number = 3,
  delayMs: number = 100
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxAttempts) {
        await waitFor(delayMs * attempt); // Exponential backoff
      }
    }
  }
  
  throw lastError!;
}

// Global test hooks
beforeAll(async () => {
  const { app, prisma, redis } = await setupIntegrationTests();
  (global as any).testApp = app;
  (global as any).testPrisma = prisma;
  (global as any).testRedis = redis;
});

afterAll(async () => {
  await teardownIntegrationTests();
});

beforeEach(async () => {
  await cleanupTestData();
});

export {};