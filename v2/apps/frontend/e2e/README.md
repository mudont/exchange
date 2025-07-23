# End-to-End Testing Suite

This directory contains comprehensive end-to-end tests for the trading exchange platform using Playwright. E2E tests validate complete user journeys from the frontend through to the backend, ensuring the entire application works correctly from a user's perspective.

## Test Structure

### Test Files

- **`global-setup.ts`** - Global test setup, database seeding, and user authentication
- **`global-teardown.ts`** - Global test cleanup and resource management
- **`auth.spec.ts`** - Authentication and authorization user flows
- **`trading.spec.ts`** - Trading operations and order management flows
- **`portfolio.spec.ts`** - Portfolio management and dashboard flows

### Test Categories

#### Authentication Tests (`auth.spec.ts`)
- Login/logout flows with validation
- User registration with form validation
- Password reset and forgot password flows
- Social authentication (Google, Facebook)
- Authentication state persistence
- Protected route access control

#### Trading Tests (`trading.spec.ts`)
- Order placement (limit, market orders)
- Order validation and error handling
- Order cancellation and modification
- Real-time order book updates
- Trade execution and matching
- Multi-instrument trading
- WebSocket real-time updates

#### Portfolio Tests (`portfolio.spec.ts`)
- Dashboard overview and navigation
- Portfolio summary and balance display
- Position management and P&L calculations
- Trade and order history
- Data filtering and export functionality
- Real-time balance updates
- Performance charts and analytics

## Setup and Configuration

### Prerequisites

1. **Node.js 18+** - Required for Playwright
2. **Test Database** - Separate PostgreSQL database for E2E tests
3. **Test Redis** - Separate Redis instance (uses DB 14)
4. **Frontend and Backend** - Both applications running

### Environment Variables

```bash
# E2E test configuration
E2E_BASE_URL=http://localhost:3000
E2E_DATABASE_URL=postgresql://test:test@localhost:5432/trading_exchange_e2e
E2E_REDIS_URL=redis://localhost:6379/14

# Cleanup configuration
E2E_CLEANUP_DB=false  # Set to true to clean database after tests
```

### Database Setup

1. Create E2E test database:
```sql
CREATE DATABASE trading_exchange_e2e;
```

2. Run migrations on E2E database:
```bash
DATABASE_URL=postgresql://test:test@localhost:5432/trading_exchange_e2e npx prisma migrate deploy
```

### Playwright Installation

```bash
# Install Playwright
npm install -D @playwright/test

# Install browsers
npx playwright install
```

## Running Tests

### All E2E Tests
```bash
npm run test:e2e
```

### Specific Test Files
```bash
# Authentication tests
npx playwright test auth.spec.ts

# Trading tests
npx playwright test trading.spec.ts

# Portfolio tests
npx playwright test portfolio.spec.ts
```

### Specific Browsers
```bash
# Chrome only
npx playwright test --project=chromium

# Firefox only
npx playwright test --project=firefox

# Mobile Chrome
npx playwright test --project="Mobile Chrome"
```

### Debug Mode
```bash
# Run with debug UI
npx playwright test --debug

# Run specific test with debug
npx playwright test auth.spec.ts --debug
```

### Headed Mode (Visible Browser)
```bash
npx playwright test --headed
```

## Test Data Management

### Test Users

The global setup creates these test users:

- **e2e.trader1@test.com** - Primary test trader ($100,000 balance)
- **e2e.trader2@test.com** - Secondary test trader ($100,000 balance)
- **e2e.admin@test.com** - Admin user for administrative tests

All users have the password: `password123`

### Test Instruments

- **BTC-USD** - Bitcoin/USD trading pair
- **ETH-USD** - Ethereum/USD trading pair

### Authentication States

Pre-authenticated browser states are saved for faster test execution:
- `e2e/auth/trader1-auth.json`
- `e2e/auth/trader2-auth.json`
- `e2e/auth/admin-auth.json`

## Test Patterns

### Page Object Model

Tests use data-testid attributes for reliable element selection:

```typescript
// Good - Stable selector
await page.click('[data-testid="login-button"]');

// Avoid - Fragile selectors
await page.click('.btn-primary'); // CSS class
await page.click('button:has-text("Login")'); // Text content
```

### Authentication

Tests use pre-authenticated states for efficiency:

```typescript
test.describe('Trading Flow', () => {
  // Use pre-authenticated state
  test.use({ storageState: 'e2e/auth/trader1-auth.json' });
  
  test('should place order', async ({ page }) => {
    // User is already logged in
    await page.goto('/trading');
    // ... test logic
  });
});
```

### Async Operations

Handle async operations with proper waiting:

```typescript
// Wait for navigation
await page.click('[data-testid="login-button"]');
await expect(page).toHaveURL('/dashboard');

// Wait for elements
await expect(page.locator('[data-testid="success-toast"]')).toBeVisible();

// Wait for API calls
await page.waitForTimeout(1000); // Use sparingly
await page.waitForResponse(response => response.url().includes('/api/orders'));
```

### Multi-User Scenarios

Test interactions between multiple users:

```typescript
test('should match orders between users', async ({ page }) => {
  // Create second browser context for trader2
  const context2 = await page.context().browser()?.newContext({ 
    storageState: 'e2e/auth/trader2-auth.json' 
  });
  const page2 = await context2?.newPage();
  
  // Trader2 places sell order
  await page2.goto('/trading');
  // ... place sell order
  
  // Trader1 places matching buy order
  await page.goto('/trading');
  // ... place buy order
  
  // Verify trade execution
  // ... assertions
  
  // Cleanup
  await page2.close();
  await context2?.close();
});
```

## Test Data Attributes

### Required Data Test IDs

All interactive elements should have data-testid attributes:

#### Authentication
- `login-form`, `register-form`
- `email-input`, `password-input`
- `login-button`, `register-button`
- `error-message`, `success-message`

#### Trading
- `trading-layout`, `order-form`
- `order-side-select`, `order-type-select`
- `quantity-input`, `price-input`
- `place-order-button`, `cancel-order-button`
- `order-book`, `trades-table`, `orders-table`

#### Portfolio
- `portfolio-summary`, `positions-table`
- `total-balance`, `available-balance`
- `trade-history-table`, `order-history-table`

#### Navigation
- `user-menu`, `logout-button`
- `dashboard-link`, `trading-link`, `portfolio-link`

## Browser Support

Tests run on multiple browsers and devices:

### Desktop Browsers
- **Chromium** - Chrome/Edge engine
- **Firefox** - Mozilla Firefox
- **WebKit** - Safari engine

### Mobile Browsers
- **Mobile Chrome** - Android Chrome simulation
- **Mobile Safari** - iOS Safari simulation

### Branded Browsers
- **Microsoft Edge** - Real Edge browser
- **Google Chrome** - Real Chrome browser

## Debugging and Troubleshooting

### Visual Debugging

```bash
# Generate test report with screenshots
npx playwright test --reporter=html

# Take screenshots on failure (default)
npx playwright test --screenshot=only-on-failure

# Record video on failure (default)
npx playwright test --video=retain-on-failure
```

### Trace Viewer

```bash
# Enable tracing
npx playwright test --trace=on

# View trace
npx playwright show-trace trace.zip
```

### Common Issues

#### Element Not Found
```typescript
// Wait for element to be visible
await expect(page.locator('[data-testid="element"]')).toBeVisible();

// Wait for element to be attached to DOM
await page.waitForSelector('[data-testid="element"]');
```

#### Timing Issues
```typescript
// Wait for network requests
await page.waitForLoadState('networkidle');

// Wait for specific response
await page.waitForResponse(response => 
  response.url().includes('/api/orders') && response.status() === 200
);
```

#### Authentication Issues
```typescript
// Verify authentication state
await expect(page.locator('[data-testid="user-menu"]')).toBeVisible();

// Re-authenticate if needed
if (!(await page.locator('[data-testid="user-menu"]').isVisible())) {
  await page.goto('/auth/login');
  // ... login flow
}
```

## Performance Testing

### Metrics Collection

Tests can collect performance metrics:

```typescript
test('should load trading page quickly', async ({ page }) => {
  const startTime = Date.now();
  
  await page.goto('/trading');
  await expect(page.locator('[data-testid="trading-layout"]')).toBeVisible();
  
  const loadTime = Date.now() - startTime;
  expect(loadTime).toBeLessThan(3000); // 3 seconds
});
```

### Network Monitoring

```typescript
test('should handle API errors gracefully', async ({ page }) => {
  // Intercept API calls
  await page.route('/api/orders', route => {
    route.fulfill({ status: 500, body: 'Server Error' });
  });
  
  await page.goto('/trading');
  // ... test error handling
});
```

## Continuous Integration

### GitHub Actions Example

```yaml
name: E2E Tests
on: [push, pull_request]

jobs:
  e2e-tests:
    runs-on: ubuntu-latest
    
    services:
      postgres:
        image: postgres:14
        env:
          POSTGRES_PASSWORD: test
          POSTGRES_USER: test
          POSTGRES_DB: trading_exchange_e2e
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
      
      redis:
        image: redis:7
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - run: npm ci
      - run: npx playwright install --with-deps
      
      - run: npm run build
      - run: npx prisma migrate deploy
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/trading_exchange_e2e
      
      - run: npm run test:e2e
        env:
          E2E_DATABASE_URL: postgresql://test:test@localhost:5432/trading_exchange_e2e
          E2E_REDIS_URL: redis://localhost:6379/14
      
      - uses: actions/upload-artifact@v3
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
```

### Parallel Execution

```bash
# Run tests in parallel (default)
npx playwright test

# Control worker count
npx playwright test --workers=4

# Disable parallel execution
npx playwright test --workers=1
```

## Best Practices

### Test Organization
1. **Group Related Tests** - Use describe blocks for logical grouping
2. **Independent Tests** - Each test should be able to run independently
3. **Clear Test Names** - Use descriptive test names that explain the scenario
4. **Setup and Teardown** - Use beforeEach/afterEach for test isolation

### Element Selection
1. **Use Data Test IDs** - Prefer `[data-testid="..."]` selectors
2. **Avoid Fragile Selectors** - Don't rely on CSS classes or text content
3. **Semantic Selectors** - Use role-based selectors when appropriate
4. **Stable Selectors** - Choose selectors that won't change frequently

### Assertions
1. **Explicit Waits** - Use `expect().toBeVisible()` instead of `waitForTimeout()`
2. **Meaningful Assertions** - Assert on user-visible behavior
3. **Multiple Assertions** - Verify multiple aspects of the expected state
4. **Error Messages** - Include helpful error messages in custom assertions

### Test Data
1. **Isolated Data** - Each test should use its own test data
2. **Realistic Data** - Use data that represents real user scenarios
3. **Data Cleanup** - Clean up test data between tests
4. **Seed Data** - Use consistent seed data for predictable tests

This E2E testing suite provides comprehensive coverage of user journeys, ensuring the trading platform works correctly from a user's perspective across different browsers and devices.