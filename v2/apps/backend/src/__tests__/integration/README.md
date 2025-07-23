# Integration Testing Suite

This directory contains comprehensive integration tests for the trading exchange platform. Integration tests verify that different components work together correctly, including API endpoints, database interactions, WebSocket connections, and external service integrations.

## Test Structure

### Test Files

- **`setup.ts`** - Test setup, teardown, and utility functions
- **`auth.test.ts`** - Authentication and authorization integration tests
- **`trading.test.ts`** - Trading operations and order matching tests
- **`websocket.test.ts`** - WebSocket connection and real-time data tests
- **`database.test.ts`** - Database operations, transactions, and integrity tests

### Test Categories

#### Authentication Tests (`auth.test.ts`)
- User registration and validation
- Login/logout flows
- Token refresh mechanisms
- Password management
- Authentication middleware integration

#### Trading Tests (`trading.test.ts`)
- Order placement and validation
- Order matching and execution
- Position updates
- Balance management
- Risk management integration

#### WebSocket Tests (`websocket.test.ts`)
- Connection establishment and authentication
- Market data subscriptions
- Real-time order book updates
- Trade notifications
- User-specific notifications
- Connection management

#### Database Tests (`database.test.ts`)
- Transaction integrity
- Concurrent operations
- Data consistency
- Referential integrity
- Performance benchmarks
- Constraint enforcement

## Setup and Configuration

### Prerequisites

1. **Test Database**: A separate PostgreSQL database for testing
2. **Test Redis**: A separate Redis instance for testing (uses DB 15)
3. **Environment Variables**: Test-specific configuration

### Environment Variables

```bash
# Test database (separate from development)
TEST_DATABASE_URL=postgresql://test:test@localhost:5432/trading_exchange_test

# Test Redis (separate database)
TEST_REDIS_URL=redis://localhost:6379/15

# Test secrets
JWT_SECRET=test-jwt-secret-for-integration-tests
API_KEY_SECRET=test-api-key-secret-for-integration-tests
```

### Database Setup

1. Create test database:
```sql
CREATE DATABASE trading_exchange_test;
```

2. Run migrations on test database:
```bash
DATABASE_URL=postgresql://test:test@localhost:5432/trading_exchange_test npx prisma migrate deploy
```

## Running Tests

### All Integration Tests
```bash
npm run test:integration
```

### Specific Test Files
```bash
# Authentication tests
npx jest src/__tests__/integration/auth.test.ts

# Trading tests
npx jest src/__tests__/integration/trading.test.ts

# WebSocket tests
npx jest src/__tests__/integration/websocket.test.ts

# Database tests
npx jest src/__tests__/integration/database.test.ts
```

### With Coverage
```bash
npm run test:integration -- --coverage
```

### Watch Mode
```bash
npm run test:integration -- --watch
```

## Test Utilities

### Setup Functions

- **`setupIntegrationTests()`** - Initialize test environment
- **`teardownIntegrationTests()`** - Clean up test environment
- **`cleanupTestData()`** - Clear test data between tests
- **`seedTestData()`** - Create test data fixtures

### Authentication Helpers

- **`createTestAuthToken(userId)`** - Generate JWT token for testing
- **`createTestApiKey(userId)`** - Generate API key for testing
- **`createAuthenticatedRequest(app, token)`** - Create authenticated request helper
- **`createApiKeyRequest(app, apiKey)`** - Create API key request helper

### Utility Functions

- **`waitFor(ms)`** - Wait for async operations
- **`retry(operation, maxAttempts, delayMs)`** - Retry failed operations

## Test Data

### Default Test Users
- **trader1@test.com** - Test trader with $100,000 balance
- **trader2@test.com** - Test trader with $100,000 balance  
- **admin@test.com** - Test admin user

### Default Test Instruments
- **BTC-USD** - Bitcoin/USD trading pair
- **ETH-USD** - Ethereum/USD trading pair
- **LTC-USD** - Litecoin/USD trading pair

### Test Accounts
- Each user gets a USD account with $100,000 starting balance

## Best Practices

### Test Isolation
- Each test starts with a clean database state
- Tests should not depend on each other
- Use `beforeEach` to set up test data
- Use `afterEach` to clean up if needed

### Async Operations
- Always wait for async operations to complete
- Use appropriate timeouts for different operations
- Handle race conditions in concurrent tests

### Error Testing
- Test both success and failure scenarios
- Verify proper error codes and messages
- Test edge cases and boundary conditions

### Performance Testing
- Include performance assertions where appropriate
- Test with realistic data volumes
- Monitor test execution times

## Debugging Tests

### Verbose Output
```bash
npm run test:integration -- --verbose
```

### Debug Specific Test
```bash
npm run test:integration -- --testNamePattern="should place order"
```

### Database Inspection
Tests use a separate test database that persists between runs for debugging:
```bash
# Connect to test database
psql postgresql://test:test@localhost:5432/trading_exchange_test

# View test data
SELECT * FROM "User";
SELECT * FROM "Order";
SELECT * FROM "Trade";
```

### Logging
Enable debug logging by setting environment variables:
```bash
DEBUG=* npm run test:integration
```

## Common Issues

### Database Connection
- Ensure test database is running and accessible
- Check DATABASE_URL environment variable
- Verify database migrations are applied

### Redis Connection
- Ensure Redis is running
- Check REDIS_URL environment variable
- Verify Redis database 15 is available

### WebSocket Tests
- WebSocket tests require the full application to be running
- Ensure proper cleanup of WebSocket connections
- Handle connection timeouts appropriately

### Race Conditions
- Use proper waiting mechanisms for async operations
- Be aware of order matching timing
- Use retry mechanisms for flaky operations

## Continuous Integration

### GitHub Actions Example
```yaml
name: Integration Tests
on: [push, pull_request]

jobs:
  integration-tests:
    runs-on: ubuntu-latest
    
    services:
      postgres:
        image: postgres:14
        env:
          POSTGRES_PASSWORD: test
          POSTGRES_USER: test
          POSTGRES_DB: trading_exchange_test
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
      - run: npx prisma migrate deploy
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/trading_exchange_test
      
      - run: npm run test:integration
        env:
          TEST_DATABASE_URL: postgresql://test:test@localhost:5432/trading_exchange_test
          TEST_REDIS_URL: redis://localhost:6379/15
```

## Metrics and Reporting

### Coverage Reports
Integration tests contribute to overall code coverage:
- Line coverage
- Branch coverage  
- Function coverage
- Statement coverage

### Performance Metrics
Tests include performance assertions:
- API response times
- Database query performance
- WebSocket connection times
- Order matching latency

### Test Reports
Generate detailed test reports:
```bash
npm run test:integration -- --reporters=default --reporters=jest-html-reporters
```

## Maintenance

### Regular Tasks
1. **Update Test Data** - Keep test fixtures current with schema changes
2. **Review Performance** - Monitor test execution times
3. **Clean Up** - Remove obsolete tests and utilities
4. **Documentation** - Keep this README updated

### Schema Changes
When database schema changes:
1. Update test migrations
2. Update test data seeding
3. Update test assertions
4. Verify all tests pass

### API Changes
When API endpoints change:
1. Update request/response assertions
2. Update authentication tests
3. Update error handling tests
4. Verify backward compatibility

This integration testing suite provides comprehensive coverage of the trading platform's functionality, ensuring that all components work together correctly in a production-like environment.