import { chromium, FullConfig } from '@playwright/test';
import { PrismaClient } from '@prisma/client';

async function globalSetup(config: FullConfig) {
  console.log('🚀 Starting E2E test setup...');

  // Database setup
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: process.env.E2E_DATABASE_URL || 'postgresql://test:test@localhost:5432/trading_exchange_e2e',
      },
    },
  });

  try {
    // Clean up existing test data
    await cleanupTestData(prisma);
    
    // Seed test data
    await seedE2ETestData(prisma);
    
    console.log('✅ E2E test data seeded successfully');
  } catch (error) {
    console.error('❌ Failed to setup E2E test data:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }

  // Browser setup for authentication
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  try {
    // Pre-authenticate test users and store auth state
    await authenticateTestUsers(page);
    console.log('✅ Test users authenticated');
  } catch (error) {
    console.error('❌ Failed to authenticate test users:', error);
    throw error;
  } finally {
    await browser.close();
  }

  console.log('✅ E2E test setup completed');
}

async function cleanupTestData(prisma: PrismaClient) {
  // Clean up in reverse dependency order
  await prisma.trade.deleteMany({});
  await prisma.order.deleteMany({});
  await prisma.position.deleteMany({});
  await prisma.account.deleteMany({});
  await prisma.apiKey.deleteMany({});
  await prisma.refreshToken.deleteMany({});
  await prisma.passwordResetToken.deleteMany({});
  await prisma.emailVerificationToken.deleteMany({});
  await prisma.instrument.deleteMany({});
  await prisma.user.deleteMany({});
}

async function seedE2ETestData(prisma: PrismaClient) {
  // Create test users
  const users = await Promise.all([
    prisma.user.create({
      data: {
        email: 'e2e.trader1@test.com',
        passwordHash: '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj/RK.s5uO.G', // 'password123'
        firstName: 'E2E',
        lastName: 'Trader1',
        isEmailVerified: true,
      },
    }),
    prisma.user.create({
      data: {
        email: 'e2e.trader2@test.com',
        passwordHash: '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj/RK.s5uO.G', // 'password123'
        firstName: 'E2E',
        lastName: 'Trader2',
        isEmailVerified: true,
      },
    }),
    prisma.user.create({
      data: {
        email: 'e2e.admin@test.com',
        passwordHash: '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj/RK.s5uO.G', // 'password123'
        firstName: 'E2E',
        lastName: 'Admin',
        isEmailVerified: true,
        role: 'ADMIN',
      },
    }),
  ]);

  // Create test instruments
  const instruments = await Promise.all([
    prisma.instrument.create({
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
    prisma.instrument.create({
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
  ]);

  // Create test accounts
  await Promise.all(
    users.map(user =>
      prisma.account.create({
        data: {
          userId: user.id,
          balance: '100000.00', // $100,000 starting balance
          availableBalance: '100000.00',
          currency: 'USD',
        },
      })
    )
  );

  return { users, instruments };
}

async function authenticateTestUsers(page: any) {
  const baseURL = process.env.E2E_BASE_URL || 'http://localhost:3000';
  
  // Authenticate trader1
  await page.goto(`${baseURL}/auth/login`);
  await page.fill('[data-testid="email-input"]', 'e2e.trader1@test.com');
  await page.fill('[data-testid="password-input"]', 'password123');
  await page.click('[data-testid="login-button"]');
  await page.waitForURL(`${baseURL}/dashboard`);
  
  // Save auth state for trader1
  await page.context().storageState({ path: 'e2e/auth/trader1-auth.json' });
  
  // Logout
  await page.click('[data-testid="user-menu"]');
  await page.click('[data-testid="logout-button"]');
  
  // Authenticate trader2
  await page.goto(`${baseURL}/auth/login`);
  await page.fill('[data-testid="email-input"]', 'e2e.trader2@test.com');
  await page.fill('[data-testid="password-input"]', 'password123');
  await page.click('[data-testid="login-button"]');
  await page.waitForURL(`${baseURL}/dashboard`);
  
  // Save auth state for trader2
  await page.context().storageState({ path: 'e2e/auth/trader2-auth.json' });
  
  // Logout
  await page.click('[data-testid="user-menu"]');
  await page.click('[data-testid="logout-button"]');
  
  // Authenticate admin
  await page.goto(`${baseURL}/auth/login`);
  await page.fill('[data-testid="email-input"]', 'e2e.admin@test.com');
  await page.fill('[data-testid="password-input"]', 'password123');
  await page.click('[data-testid="login-button"]');
  await page.waitForURL(`${baseURL}/dashboard`);
  
  // Save auth state for admin
  await page.context().storageState({ path: 'e2e/auth/admin-auth.json' });
}

export default globalSetup;