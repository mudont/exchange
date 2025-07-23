import axios, { AxiosResponse } from 'axios';
import { performance } from 'perf_hooks';
import { LoadTestScenario, LoadTestContext, LoadTestResult } from './load-test-runner';

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001';
const API_TIMEOUT = 10000; // 10 seconds

// Helper function to make HTTP requests with timing
async function makeRequest(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  url: string,
  data?: any,
  headers?: Record<string, string>
): Promise<LoadTestResult> {
  const startTime = performance.now();
  
  try {
    const response: AxiosResponse = await axios({
      method,
      url: `${BASE_URL}${url}`,
      data,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      timeout: API_TIMEOUT,
      validateStatus: () => true, // Don't throw on HTTP error status codes
    });

    const responseTime = performance.now() - startTime;
    const success = response.status >= 200 && response.status < 400;

    return {
      success,
      responseTime,
      statusCode: response.status,
      metadata: {
        method,
        url,
        responseSize: JSON.stringify(response.data).length,
      },
    };
  } catch (error) {
    const responseTime = performance.now() - startTime;
    
    return {
      success: false,
      responseTime,
      error: error instanceof Error ? error.message : 'Unknown error',
      metadata: {
        method,
        url,
      },
    };
  }
}

// Authentication helper
async function authenticate(email: string, password: string): Promise<string | null> {
  try {
    const response = await axios.post(`${BASE_URL}/api/auth/login`, {
      email,
      password,
    });

    if (response.status === 200 && response.data.success) {
      return response.data.data.accessToken;
    }
  } catch (error) {
    // Authentication failed
  }
  
  return null;
}

// Create test user helper
async function createTestUser(userIndex: number): Promise<{ email: string; password: string; token?: string }> {
  const email = `loadtest${userIndex}@example.com`;
  const password = 'LoadTest123!';
  
  try {
    // Try to register the user
    await axios.post(`${BASE_URL}/api/auth/register`, {
      email,
      password,
      firstName: `Load`,
      lastName: `Test${userIndex}`,
    });
  } catch (error) {
    // User might already exist, that's okay
  }

  // Authenticate to get token
  const token = await authenticate(email, password);
  
  return { email, password, token: token || undefined };
}

// Trading Scenarios

export const authenticationScenario: LoadTestScenario = {
  name: 'authentication',
  weight: 10,
  async execute(context: LoadTestContext): Promise<LoadTestResult> {
    const userIndex = context.iteration % 100; // Cycle through 100 test users
    const email = `loadtest${userIndex}@example.com`;
    const password = 'LoadTest123!';

    return makeRequest('POST', '/api/auth/login', {
      email,
      password,
    });
  },
};

export const marketDataScenario: LoadTestScenario = {
  name: 'market_data',
  weight: 30,
  async setup() {
    // Pre-create some test users and get their tokens
    const users = [];
    for (let i = 0; i < 10; i++) {
      const user = await createTestUser(i);
      users.push(user);
    }
    return { users };
  },
  async execute(context: LoadTestContext): Promise<LoadTestResult> {
    const endpoints = [
      '/api/instruments',
      '/api/market/quotes',
      '/api/market/orderbook/BTC-USD',
      '/api/market/trades/BTC-USD',
      '/api/market/stats',
    ];

    const endpoint = endpoints[Math.floor(Math.random() * endpoints.length)];
    return makeRequest('GET', endpoint);
  },
};

export const orderBookScenario: LoadTestScenario = {
  name: 'order_book',
  weight: 25,
  async execute(context: LoadTestContext): Promise<LoadTestResult> {
    const instruments = ['BTC-USD', 'ETH-USD', 'LTC-USD'];
    const instrument = instruments[Math.floor(Math.random() * instruments.length)];
    
    return makeRequest('GET', `/api/market/orderbook/${instrument}`);
  },
};

export const orderPlacementScenario: LoadTestScenario = {
  name: 'order_placement',
  weight: 20,
  async setup() {
    // Create test users with authentication tokens
    const users = [];
    for (let i = 0; i < 50; i++) {
      const user = await createTestUser(i);
      users.push(user);
    }
    return { users };
  },
  async execute(context: LoadTestContext): Promise<LoadTestResult> {
    const setupData = context.sessionData;
    if (!setupData?.users?.length) {
      return {
        success: false,
        responseTime: 0,
        error: 'No authenticated users available',
      };
    }

    const user = setupData.users[context.iteration % setupData.users.length];
    if (!user.token) {
      return {
        success: false,
        responseTime: 0,
        error: 'User not authenticated',
      };
    }

    const orderTypes = ['limit', 'market'];
    const sides = ['buy', 'sell'];
    const instruments = ['BTC-USD', 'ETH-USD'];

    const orderData = {
      instrumentId: instruments[Math.floor(Math.random() * instruments.length)],
      side: sides[Math.floor(Math.random() * sides.length)],
      type: orderTypes[Math.floor(Math.random() * orderTypes.length)],
      quantity: (Math.random() * 10 + 0.1).toFixed(8), // 0.1 to 10.1
      price: orderTypes[0] === 'limit' ? (Math.random() * 1000 + 100).toFixed(2) : undefined,
    };

    return makeRequest('POST', '/api/orders', orderData, {
      Authorization: `Bearer ${user.token}`,
    });
  },
};

export const portfolioScenario: LoadTestScenario = {
  name: 'portfolio',
  weight: 10,
  async setup() {
    // Create test users with authentication tokens
    const users = [];
    for (let i = 0; i < 20; i++) {
      const user = await createTestUser(i);
      users.push(user);
    }
    return { users };
  },
  async execute(context: LoadTestContext): Promise<LoadTestResult> {
    const setupData = context.sessionData;
    if (!setupData?.users?.length) {
      return {
        success: false,
        responseTime: 0,
        error: 'No authenticated users available',
      };
    }

    const user = setupData.users[context.iteration % setupData.users.length];
    if (!user.token) {
      return {
        success: false,
        responseTime: 0,
        error: 'User not authenticated',
      };
    }

    const endpoints = [
      '/api/accounts/balance',
      '/api/positions',
      '/api/orders',
      '/api/trades',
    ];

    const endpoint = endpoints[Math.floor(Math.random() * endpoints.length)];
    return makeRequest('GET', endpoint, undefined, {
      Authorization: `Bearer ${user.token}`,
    });
  },
};

export const orderCancellationScenario: LoadTestScenario = {
  name: 'order_cancellation',
  weight: 5,
  async setup() {
    // Create test users and place some orders to cancel
    const users = [];
    for (let i = 0; i < 10; i++) {
      const user = await createTestUser(i);
      if (user.token) {
        // Place a few orders that can be cancelled
        const orders = [];
        for (let j = 0; j < 3; j++) {
          try {
            const orderResponse = await axios.post(`${BASE_URL}/api/orders`, {
              instrumentId: 'BTC-USD',
              side: 'buy',
              type: 'limit',
              quantity: '0.1',
              price: '1000.00', // Very low price, unlikely to execute
            }, {
              headers: { Authorization: `Bearer ${user.token}` },
            });
            
            if (orderResponse.data.success) {
              orders.push(orderResponse.data.data.order.id);
            }
          } catch (error) {
            // Order placement failed, continue
          }
        }
        user.orders = orders;
      }
      users.push(user);
    }
    return { users };
  },
  async execute(context: LoadTestContext): Promise<LoadTestResult> {
    const setupData = context.sessionData;
    if (!setupData?.users?.length) {
      return {
        success: false,
        responseTime: 0,
        error: 'No authenticated users available',
      };
    }

    const user = setupData.users[context.iteration % setupData.users.length];
    if (!user.token || !user.orders?.length) {
      return {
        success: false,
        responseTime: 0,
        error: 'No orders available to cancel',
      };
    }

    const orderId = user.orders[Math.floor(Math.random() * user.orders.length)];
    return makeRequest('DELETE', `/api/orders/${orderId}`, undefined, {
      Authorization: `Bearer ${user.token}`,
    });
  },
};

// WebSocket scenario for real-time data
export const websocketScenario: LoadTestScenario = {
  name: 'websocket_connection',
  weight: 15,
  async execute(context: LoadTestContext): Promise<LoadTestResult> {
    const startTime = performance.now();
    
    return new Promise((resolve) => {
      try {
        // Simulate WebSocket connection test
        // In a real implementation, you would use a WebSocket client
        const simulatedLatency = Math.random() * 50 + 10; // 10-60ms
        
        setTimeout(() => {
          const responseTime = performance.now() - startTime;
          resolve({
            success: true,
            responseTime,
            metadata: {
              connectionType: 'websocket',
              simulatedLatency,
            },
          });
        }, simulatedLatency);
      } catch (error) {
        const responseTime = performance.now() - startTime;
        resolve({
          success: false,
          responseTime,
          error: error instanceof Error ? error.message : 'WebSocket connection failed',
        });
      }
    });
  },
};

// Export all scenarios
export const tradingScenarios: LoadTestScenario[] = [
  authenticationScenario,
  marketDataScenario,
  orderBookScenario,
  orderPlacementScenario,
  portfolioScenario,
  orderCancellationScenario,
  websocketScenario,
];

// Predefined load test configurations
export const loadTestConfigs = {
  // Light load test for development
  light: {
    name: 'Light Load Test',
    duration: 60, // 1 minute
    concurrency: 10,
    rampUpTime: 10,
    scenarios: tradingScenarios,
    warmupTime: 5,
    cooldownTime: 5,
  },
  
  // Medium load test for staging
  medium: {
    name: 'Medium Load Test',
    duration: 300, // 5 minutes
    concurrency: 50,
    rampUpTime: 30,
    targetRPS: 100,
    scenarios: tradingScenarios,
    warmupTime: 10,
    cooldownTime: 10,
  },
  
  // Heavy load test for production validation
  heavy: {
    name: 'Heavy Load Test',
    duration: 600, // 10 minutes
    concurrency: 200,
    rampUpTime: 60,
    targetRPS: 500,
    scenarios: tradingScenarios,
    warmupTime: 30,
    cooldownTime: 30,
  },
  
  // Spike test for resilience testing
  spike: {
    name: 'Spike Load Test',
    duration: 180, // 3 minutes
    concurrency: 500,
    rampUpTime: 10, // Quick ramp up
    scenarios: tradingScenarios,
    warmupTime: 5,
    cooldownTime: 15,
  },
  
  // Endurance test for stability
  endurance: {
    name: 'Endurance Load Test',
    duration: 1800, // 30 minutes
    concurrency: 100,
    rampUpTime: 60,
    targetRPS: 200,
    scenarios: tradingScenarios,
    warmupTime: 30,
    cooldownTime: 30,
  },
};