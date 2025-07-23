import { test, expect } from '@playwright/test';

test.describe('Trading Flow', () => {
  // Use authenticated state for trader1
  test.use({ storageState: 'e2e/auth/trader1-auth.json' });

  test.beforeEach(async ({ page }) => {
    // Navigate to trading page
    await page.goto('/trading');
    await expect(page).toHaveURL('/trading');
  });

  test('should display trading interface correctly', async ({ page }) => {
    // Check main trading components are visible
    await expect(page.locator('[data-testid="trading-layout"]')).toBeVisible();
    await expect(page.locator('[data-testid="order-form"]')).toBeVisible();
    await expect(page.locator('[data-testid="order-book"]')).toBeVisible();
    await expect(page.locator('[data-testid="trades-table"]')).toBeVisible();
    await expect(page.locator('[data-testid="orders-table"]')).toBeVisible();
    
    // Check instrument selector
    await expect(page.locator('[data-testid="instrument-selector"]')).toBeVisible();
    await expect(page.locator('[data-testid="instrument-selector"]')).toContainText('BTC-USD');
  });

  test('should place a limit buy order successfully', async ({ page }) => {
    // Fill order form
    await page.selectOption('[data-testid="order-side-select"]', 'buy');
    await page.selectOption('[data-testid="order-type-select"]', 'limit');
    await page.fill('[data-testid="quantity-input"]', '0.1');
    await page.fill('[data-testid="price-input"]', '45000');
    
    // Check order total calculation
    await expect(page.locator('[data-testid="order-total"]')).toContainText('4500.00');
    
    // Submit order
    await page.click('[data-testid="place-order-button"]');
    
    // Should show confirmation dialog
    await expect(page.locator('[data-testid="order-confirmation-dialog"]')).toBeVisible();
    await expect(page.locator('[data-testid="confirmation-details"]')).toContainText('Buy 0.1 BTC at $45,000.00');
    
    // Confirm order
    await page.click('[data-testid="confirm-order-button"]');
    
    // Should show success message
    await expect(page.locator('[data-testid="success-toast"]')).toBeVisible();
    await expect(page.locator('[data-testid="success-toast"]')).toContainText('Order placed successfully');
    
    // Order should appear in orders table
    await expect(page.locator('[data-testid="orders-table"]')).toContainText('0.1');
    await expect(page.locator('[data-testid="orders-table"]')).toContainText('45000.00');
    await expect(page.locator('[data-testid="orders-table"]')).toContainText('Buy');
    await expect(page.locator('[data-testid="orders-table"]')).toContainText('Pending');
  });

  test('should place a limit sell order successfully', async ({ page }) => {
    // Fill order form for sell order
    await page.selectOption('[data-testid="order-side-select"]', 'sell');
    await page.selectOption('[data-testid="order-type-select"]', 'limit');
    await page.fill('[data-testid="quantity-input"]', '0.05');
    await page.fill('[data-testid="price-input"]', '55000');
    
    // Submit order
    await page.click('[data-testid="place-order-button"]');
    await page.click('[data-testid="confirm-order-button"]');
    
    // Should show success message
    await expect(page.locator('[data-testid="success-toast"]')).toBeVisible();
    
    // Order should appear in orders table
    await expect(page.locator('[data-testid="orders-table"]')).toContainText('0.05');
    await expect(page.locator('[data-testid="orders-table"]')).toContainText('55000.00');
    await expect(page.locator('[data-testid="orders-table"]')).toContainText('Sell');
  });

  test('should place a market buy order successfully', async ({ page }) => {
    // First, place a sell order to match against (using second browser context)
    const context2 = await page.context().browser()?.newContext({ 
      storageState: 'e2e/auth/trader2-auth.json' 
    });
    const page2 = await context2?.newPage();
    
    if (page2) {
      await page2.goto('/trading');
      await page2.selectOption('[data-testid="order-side-select"]', 'sell');
      await page2.selectOption('[data-testid="order-type-select"]', 'limit');
      await page2.fill('[data-testid="quantity-input"]', '0.2');
      await page2.fill('[data-testid="price-input"]', '50000');
      await page2.click('[data-testid="place-order-button"]');
      await page2.click('[data-testid="confirm-order-button"]');
      await expect(page2.locator('[data-testid="success-toast"]')).toBeVisible();
    }
    
    // Now place market buy order
    await page.selectOption('[data-testid="order-side-select"]', 'buy');
    await page.selectOption('[data-testid="order-type-select"]', 'market');
    await page.fill('[data-testid="quantity-input"]', '0.1');
    
    // Price input should be disabled for market orders
    await expect(page.locator('[data-testid="price-input"]')).toBeDisabled();
    
    // Submit order
    await page.click('[data-testid="place-order-button"]');
    await page.click('[data-testid="confirm-order-button"]');
    
    // Should show success message
    await expect(page.locator('[data-testid="success-toast"]')).toBeVisible();
    
    // Wait for order execution
    await page.waitForTimeout(1000);
    
    // Order should appear as filled in orders table
    await expect(page.locator('[data-testid="orders-table"]')).toContainText('Filled');
    
    // Trade should appear in trades table
    await expect(page.locator('[data-testid="trades-table"]')).toContainText('0.1');
    
    // Clean up
    if (page2) {
      await page2.close();
      await context2?.close();
    }
  });

  test('should validate order form inputs', async ({ page }) => {
    // Try to submit empty form
    await page.click('[data-testid="place-order-button"]');
    
    // Should show validation errors
    await expect(page.locator('[data-testid="quantity-error"]')).toBeVisible();
    await expect(page.locator('[data-testid="quantity-error"]')).toContainText('Quantity is required');
    
    // For limit orders, price is required
    await page.selectOption('[data-testid="order-type-select"]', 'limit');
    await page.click('[data-testid="place-order-button"]');
    await expect(page.locator('[data-testid="price-error"]')).toBeVisible();
    
    // Test minimum quantity validation
    await page.fill('[data-testid="quantity-input"]', '0.0001'); // Below minimum
    await page.fill('[data-testid="price-input"]', '50000');
    await page.click('[data-testid="place-order-button"]');
    
    await expect(page.locator('[data-testid="quantity-error"]')).toContainText('Minimum quantity is 0.001');
    
    // Test maximum quantity validation
    await page.fill('[data-testid="quantity-input"]', '1001'); // Above maximum
    await page.click('[data-testid="place-order-button"]');
    
    await expect(page.locator('[data-testid="quantity-error"]')).toContainText('Maximum quantity is 1000');
  });

  test('should check sufficient balance before placing order', async ({ page }) => {
    // Try to place order that exceeds balance
    await page.selectOption('[data-testid="order-side-select"]', 'buy');
    await page.selectOption('[data-testid="order-type-select"]', 'limit');
    await page.fill('[data-testid="quantity-input"]', '100'); // Very large quantity
    await page.fill('[data-testid="price-input"]', '50000');
    
    await page.click('[data-testid="place-order-button"]');
    
    // Should show insufficient balance error
    await expect(page.locator('[data-testid="error-toast"]')).toBeVisible();
    await expect(page.locator('[data-testid="error-toast"]')).toContainText('Insufficient balance');
  });

  test('should cancel pending order successfully', async ({ page }) => {
    // First place an order
    await page.selectOption('[data-testid="order-side-select"]', 'buy');
    await page.selectOption('[data-testid="order-type-select"]', 'limit');
    await page.fill('[data-testid="quantity-input"]', '0.1');
    await page.fill('[data-testid="price-input"]', '40000'); // Low price, unlikely to fill
    
    await page.click('[data-testid="place-order-button"]');
    await page.click('[data-testid="confirm-order-button"]');
    await expect(page.locator('[data-testid="success-toast"]')).toBeVisible();
    
    // Wait for order to appear in table
    await expect(page.locator('[data-testid="orders-table"]')).toContainText('Pending');
    
    // Cancel the order
    await page.click('[data-testid="cancel-order-button"]:first-child');
    
    // Should show confirmation dialog
    await expect(page.locator('[data-testid="cancel-confirmation-dialog"]')).toBeVisible();
    await page.click('[data-testid="confirm-cancel-button"]');
    
    // Should show success message
    await expect(page.locator('[data-testid="success-toast"]')).toBeVisible();
    await expect(page.locator('[data-testid="success-toast"]')).toContainText('Order cancelled');
    
    // Order status should update to cancelled
    await expect(page.locator('[data-testid="orders-table"]')).toContainText('Cancelled');
  });

  test('should display order book with real-time updates', async ({ page }) => {
    // Check order book structure
    await expect(page.locator('[data-testid="order-book-bids"]')).toBeVisible();
    await expect(page.locator('[data-testid="order-book-asks"]')).toBeVisible();
    await expect(page.locator('[data-testid="order-book-spread"]')).toBeVisible();
    
    // Place an order and check if it appears in order book
    await page.selectOption('[data-testid="order-side-select"]', 'buy');
    await page.selectOption('[data-testid="order-type-select"]', 'limit');
    await page.fill('[data-testid="quantity-input"]', '0.1');
    await page.fill('[data-testid="price-input"]', '49000');
    
    await page.click('[data-testid="place-order-button"]');
    await page.click('[data-testid="confirm-order-button"]');
    
    // Wait for order book update
    await page.waitForTimeout(500);
    
    // Order should appear in bids section
    await expect(page.locator('[data-testid="order-book-bids"]')).toContainText('49000');
    await expect(page.locator('[data-testid="order-book-bids"]')).toContainText('0.1');
  });

  test('should switch between different instruments', async ({ page }) => {
    // Switch to ETH-USD
    await page.selectOption('[data-testid="instrument-selector"]', 'ETH-USD');
    
    // Check that the interface updates
    await expect(page.locator('[data-testid="current-instrument"]')).toContainText('ETH-USD');
    
    // Order form should reflect new instrument
    await expect(page.locator('[data-testid="order-form-title"]')).toContainText('ETH-USD');
    
    // Place an order for ETH
    await page.selectOption('[data-testid="order-side-select"]', 'buy');
    await page.selectOption('[data-testid="order-type-select"]', 'limit');
    await page.fill('[data-testid="quantity-input"]', '1.0');
    await page.fill('[data-testid="price-input"]', '2500');
    
    await page.click('[data-testid="place-order-button"]');
    await page.click('[data-testid="confirm-order-button"]');
    
    // Should show success message
    await expect(page.locator('[data-testid="success-toast"]')).toBeVisible();
    
    // Order should appear in orders table for ETH-USD
    await expect(page.locator('[data-testid="orders-table"]')).toContainText('ETH-USD');
    await expect(page.locator('[data-testid="orders-table"]')).toContainText('1.0');
    await expect(page.locator('[data-testid="orders-table"]')).toContainText('2500.00');
  });

  test('should display trade history correctly', async ({ page }) => {
    // Check trades table structure
    await expect(page.locator('[data-testid="trades-table"]')).toBeVisible();
    await expect(page.locator('[data-testid="trades-table-header"]')).toContainText('Time');
    await expect(page.locator('[data-testid="trades-table-header"]')).toContainText('Price');
    await expect(page.locator('[data-testid="trades-table-header"]')).toContainText('Quantity');
    await expect(page.locator('[data-testid="trades-table-header"]')).toContainText('Side');
    
    // If there are trades, check their format
    const tradeRows = page.locator('[data-testid="trade-row"]');
    const tradeCount = await tradeRows.count();
    
    if (tradeCount > 0) {
      // Check first trade row format
      const firstTrade = tradeRows.first();
      await expect(firstTrade.locator('[data-testid="trade-time"]')).toBeVisible();
      await expect(firstTrade.locator('[data-testid="trade-price"]')).toBeVisible();
      await expect(firstTrade.locator('[data-testid="trade-quantity"]')).toBeVisible();
      await expect(firstTrade.locator('[data-testid="trade-side"]')).toBeVisible();
    }
  });

  test('should handle WebSocket connection for real-time updates', async ({ page }) => {
    // Check WebSocket status indicator
    await expect(page.locator('[data-testid="websocket-status"]')).toBeVisible();
    await expect(page.locator('[data-testid="websocket-status"]')).toContainText('Connected');
    
    // Place an order and verify real-time update
    await page.selectOption('[data-testid="order-side-select"]', 'sell');
    await page.selectOption('[data-testid="order-type-select"]', 'limit');
    await page.fill('[data-testid="quantity-input"]', '0.1');
    await page.fill('[data-testid="price-input"]', '52000');
    
    await page.click('[data-testid="place-order-button"]');
    await page.click('[data-testid="confirm-order-button"]');
    
    // Wait for real-time update
    await page.waitForTimeout(500);
    
    // Order should appear in order book immediately
    await expect(page.locator('[data-testid="order-book-asks"]')).toContainText('52000');
  });

  test('should handle order form quick actions', async ({ page }) => {
    // Test percentage buttons for quantity
    await page.click('[data-testid="quantity-25-percent"]');
    
    // Should calculate 25% of available balance
    const quantity25 = await page.locator('[data-testid="quantity-input"]').inputValue();
    expect(parseFloat(quantity25)).toBeGreaterThan(0);
    
    // Test 50% button
    await page.click('[data-testid="quantity-50-percent"]');
    const quantity50 = await page.locator('[data-testid="quantity-input"]').inputValue();
    expect(parseFloat(quantity50)).toBeGreaterThan(parseFloat(quantity25));
    
    // Test 100% button
    await page.click('[data-testid="quantity-100-percent"]');
    const quantity100 = await page.locator('[data-testid="quantity-input"]').inputValue();
    expect(parseFloat(quantity100)).toBeGreaterThan(parseFloat(quantity50));
    
    // Test price quick actions (if available)
    if (await page.locator('[data-testid="price-best-bid"]').isVisible()) {
      await page.click('[data-testid="price-best-bid"]');
      const priceValue = await page.locator('[data-testid="price-input"]').inputValue();
      expect(parseFloat(priceValue)).toBeGreaterThan(0);
    }
  });

  test('should display order and trade filters', async ({ page }) => {
    // Check if filter controls are present
    await expect(page.locator('[data-testid="orders-filter"]')).toBeVisible();
    
    // Test status filter
    await page.selectOption('[data-testid="order-status-filter"]', 'pending');
    
    // Wait for filter to apply
    await page.waitForTimeout(500);
    
    // All visible orders should be pending
    const orderRows = page.locator('[data-testid="order-row"]');
    const orderCount = await orderRows.count();
    
    for (let i = 0; i < orderCount; i++) {
      const status = await orderRows.nth(i).locator('[data-testid="order-status"]').textContent();
      expect(status?.toLowerCase()).toContain('pending');
    }
    
    // Test date range filter if available
    if (await page.locator('[data-testid="date-range-filter"]').isVisible()) {
      await page.click('[data-testid="date-range-filter"]');
      await page.click('[data-testid="last-24h-option"]');
      
      // Wait for filter to apply
      await page.waitForTimeout(500);
    }
  });
});