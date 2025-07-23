import { FullConfig } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

async function globalTeardown(config: FullConfig) {
  console.log('🧹 Starting E2E test teardown...');

  // Clean up authentication files
  const authDir = path.join(__dirname, 'auth');
  if (fs.existsSync(authDir)) {
    const authFiles = fs.readdirSync(authDir);
    for (const file of authFiles) {
      if (file.endsWith('-auth.json')) {
        fs.unlinkSync(path.join(authDir, file));
      }
    }
    console.log('✅ Authentication files cleaned up');
  }

  // Clean up test database (optional - keep data for debugging)
  if (process.env.E2E_CLEANUP_DB === 'true') {
    const prisma = new PrismaClient({
      datasources: {
        db: {
          url: process.env.E2E_DATABASE_URL || 'postgresql://test:test@localhost:5432/trading_exchange_e2e',
        },
      },
    });

    try {
      // Clean up test data
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
      
      console.log('✅ E2E test database cleaned up');
    } catch (error) {
      console.error('❌ Failed to clean up E2E test database:', error);
    } finally {
      await prisma.$disconnect();
    }
  }

  console.log('✅ E2E test teardown completed');
}

export default globalTeardown;