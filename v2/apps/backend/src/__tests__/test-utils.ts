import { Order, OrderSide, OrderType, Trade, User, Instrument } from '@trading-exchange/shared';

/**
 * Test utilities for creating mock data and helper functions
 */

export const createMockUser = (overrides: Partial<User> = {}): User => ({
  id: 'test-user-id',
  email: 'test@example.com',
  firstName: 'Test',
  lastName: 'User',
  isEmailVerified: true,
  createdAt: new Date('2023-01-01T00:00:00Z'),
  updatedAt: new Date('2023-01-01T00:00:00Z'),
  ...overrides,
});

export const createMockInstrument = (overrides: Partial<Instrument> = {}): Instrument => ({
  id: 'test-instrument-id',
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
  createdAt: new Date('2023-01-01T00:00:00Z'),
  updatedAt: new Date('2023-01-01T00:00:00Z'),
  ...overrides,
});

export const createMockOrder = (overrides: Partial<Order> = {}): Order => ({
  id: 'test-order-id',
  userId: 'test-user-id',
  instrumentId: 'test-instrument-id',
  side: OrderSide.BUY,
  type: OrderType.LIMIT,
  quantity: '1.0',
  price: '50000.00',
  status: 'pending',
  createdAt: new Date('2023-01-01T00:00:00Z'),
  updatedAt: new Date('2023-01-01T00:00:00Z'),
  ...overrides,
});

export const createMockTrade = (overrides: Partial<Trade> = {}): Trade => ({
  id: 'test-trade-id',
  buyOrderId: 'test-buy-order-id',
  sellOrderId: 'test-sell-order-id',
  instrumentId: 'test-instrument-id',
  quantity: '1.0',
  price: '50000.00',
  executedAt: new Date('2023-01-01T00:00:00Z'),
  createdAt: new Date('2023-01-01T00:00:00Z'),
  ...overrides,
});

export const createMockBuyOrder = (overrides: Partial<Order> = {}): Order =>
  createMockOrder({
    id: 'buy-order-id',
    side: OrderSide.BUY,
    ...overrides,
  });

export const createMockSellOrder = (overrides: Partial<Order> = {}): Order =>
  createMockOrder({
    id: 'sell-order-id',
    side: OrderSide.SELL,
    ...overrides,
  });

export const createMockMarketOrder = (side: OrderSide, overrides: Partial<Order> = {}): Order =>
  createMockOrder({
    id: `market-${side}-order-id`,
    side,
    type: OrderType.MARKET,
    price: null,
    ...overrides,
  });

/**
 * Helper function to create multiple mock orders
 */
export const createMockOrders = (count: number, baseOrder: Partial<Order> = {}): Order[] => {
  return Array.from({ length: count }, (_, index) =>
    createMockOrder({
      id: `order-${index + 1}`,
      ...baseOrder,
    })
  );
};

/**
 * Helper function to create orders at different price levels
 */
export const createOrdersAtPriceLevels = (
  side: OrderSide,
  priceLevels: string[],
  quantity: string = '1.0'
): Order[] => {
  return priceLevels.map((price, index) =>
    createMockOrder({
      id: `${side}-order-${index + 1}`,
      side,
      price,
      quantity,
    })
  );
};

/**
 * Helper function to create a sequence of orders with timestamps
 */
export const createTimestampedOrders = (
  count: number,
  baseTimestamp: Date,
  intervalMs: number = 1000
): Order[] => {
  return Array.from({ length: count }, (_, index) =>
    createMockOrder({
      id: `timestamped-order-${index + 1}`,
      createdAt: new Date(baseTimestamp.getTime() + index * intervalMs),
      updatedAt: new Date(baseTimestamp.getTime() + index * intervalMs),
    })
  );
};

/**
 * Mock Fastify request object
 */
export const createMockRequest = (overrides: any = {}) => ({
  ip: '127.0.0.1',
  url: '/api/test',
  method: 'GET',
  headers: {},
  query: {},
  params: {},
  body: {},
  user: undefined,
  ...overrides,
});

/**
 * Mock Fastify reply object
 */
export const createMockReply = () => {
  const reply = {
    status: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
    header: jest.fn().mockReturnThis(),
    headers: jest.fn().mockReturnThis(),
    code: jest.fn().mockReturnThis(),
  };
  return reply;
};

/**
 * Helper to wait for async operations in tests
 */
export const waitFor = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * Helper to create a promise that resolves after a delay
 */
export const delay = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * Helper to create a rejected promise
 */
export const createRejectedPromise = (error: Error): Promise<never> => {
  return Promise.reject(error);
};

/**
 * Helper to create a resolved promise
 */
export const createResolvedPromise = <T>(value: T): Promise<T> => {
  return Promise.resolve(value);
};

/**
 * Mock Redis client for testing
 */
export const createMockRedis = () => ({
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  exists: jest.fn(),
  expire: jest.fn(),
  pexpire: jest.fn(),
  pttl: jest.fn(),
  incr: jest.fn(),
  multi: jest.fn(() => ({
    incr: jest.fn().mockReturnThis(),
    pttl: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue([[null, 1], [null, 60000]]),
  })),
  eval: jest.fn(),
  disconnect: jest.fn(),
});

/**
 * Mock Prisma client for testing
 */
export const createMockPrisma = () => ({
  user: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  instrument: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  order: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  trade: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  position: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    upsert: jest.fn(),
  },
  account: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  apiKey: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  refreshToken: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  passwordResetToken: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  $transaction: jest.fn(),
  $disconnect: jest.fn(),
});

/**
 * Helper to assert that a function throws an error
 */
export const expectToThrow = async (fn: () => Promise<any>, expectedError?: string | RegExp) => {
  try {
    await fn();
    throw new Error('Expected function to throw, but it did not');
  } catch (error) {
    if (expectedError) {
      if (typeof expectedError === 'string') {
        expect(error.message).toContain(expectedError);
      } else {
        expect(error.message).toMatch(expectedError);
      }
    }
  }
};

/**
 * Helper to create a mock WebSocket connection
 */
export const createMockWebSocket = () => ({
  send: jest.fn(),
  close: jest.fn(),
  on: jest.fn(),
  emit: jest.fn(),
  readyState: 1, // OPEN
});

/**
 * Helper to create mock JWT tokens
 */
export const createMockTokens = () => ({
  accessToken: 'mock.access.token',
  refreshToken: 'mock.refresh.token',
});

/**
 * Helper to create mock API response
 */
export const createMockApiResponse = <T>(data: T, success: boolean = true) => ({
  success,
  data,
  timestamp: new Date().toISOString(),
});

/**
 * Helper to create mock error response
 */
export const createMockErrorResponse = (code: string, message: string) => ({
  success: false,
  error: {
    code,
    message,
  },
  timestamp: new Date().toISOString(),
});

/**
 * Helper to generate random test data
 */
export const generateRandomString = (length: number = 10): string => {
  return Math.random().toString(36).substring(2, 2 + length);
};

export const generateRandomNumber = (min: number = 0, max: number = 100): number => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

export const generateRandomPrice = (min: number = 1000, max: number = 100000): string => {
  return (Math.random() * (max - min) + min).toFixed(2);
};

export const generateRandomQuantity = (min: number = 0.001, max: number = 100): string => {
  return (Math.random() * (max - min) + min).toFixed(8);
};

/**
 * Helper to create test environment variables
 */
export const setTestEnvVars = () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-jwt-secret';
  process.env.API_KEY_SECRET = 'test-api-key-secret';
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_db';
  process.env.REDIS_URL = 'redis://localhost:6379/1';
};

/**
 * Helper to clean up test environment
 */
export const cleanupTestEnv = () => {
  // Reset environment variables if needed
  delete process.env.TEST_VAR;
};

/**
 * Helper to create a test database transaction
 */
export const createTestTransaction = () => {
  const mockTransaction = createMockPrisma();
  return mockTransaction;
};

/**
 * Performance testing helpers
 */
export const measureExecutionTime = async <T>(fn: () => Promise<T>): Promise<{ result: T; time: number }> => {
  const start = performance.now();
  const result = await fn();
  const end = performance.now();
  return { result, time: end - start };
};

export const runMultipleTimes = async <T>(fn: () => Promise<T>, times: number): Promise<T[]> => {
  const results: T[] = [];
  for (let i = 0; i < times; i++) {
    results.push(await fn());
  }
  return results;
};

/**
 * Date helpers for testing
 */
export const createDateInPast = (daysAgo: number): Date => {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date;
};

export const createDateInFuture = (daysFromNow: number): Date => {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  return date;
};

/**
 * Assertion helpers
 */
export const expectDateToBeRecent = (date: Date, withinMs: number = 1000) => {
  const now = new Date();
  const diff = Math.abs(now.getTime() - date.getTime());
  expect(diff).toBeLessThan(withinMs);
};

export const expectArrayToBeOrdered = <T>(array: T[], compareFn: (a: T, b: T) => number) => {
  for (let i = 1; i < array.length; i++) {
    expect(compareFn(array[i - 1], array[i])).toBeLessThanOrEqual(0);
  }
};