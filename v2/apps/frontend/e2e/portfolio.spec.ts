import { test, expect } from '@playwright/test';

test.describe('Portfolio and Dashboard', () => {
  // Use authenticated state for trader1
  test.use({ storageState: 'e2e/auth/trader1-auth.json' });

  test('should display dashboard correctly', async ({ page }) => {
    await page.goto('/dashboard');
    
    // Check main dashboard components
    await expect(page.locator('[data-testid="dashboard-layout"]')).toBeVisible();
    await expect(page.locator('[data-testid="portfolio-summary"]')).toBeVisible();
    await expect(page.locator('[data-testid="recent-trades"]')).toBeVisible();
    await expect(page.locator('[data-testid="active-orders"]')).toBeVisible();
    await expect(page.locator('[data-testid="market-overview"]')).toBeVisible();
    
    // Check user greeting
    await expect(page.locator('[data-testid="user-greeting"]')).toContainText('Welcome, E2E Trader1');
  });

  test('should display portfolio summary with correct data', async ({ page }) => {
    await page.goto('/portfolio');
    
    // Check portfolio summary section
    await expect(page.locator('[data-testid="portfolio-summary"]')).toBeVisible();
    await expect(page.locator('[data-testid="total-balance"]')).toBeVisible();
    await expect(page.locator('[data-testid="available-balance"]')).toBeVisible();
    await expect(page.locator('[data-testid="total-pnl"]')).toBeVisible();
    await expect(page.locator('[data-testid="unrealized-pnl"]')).toBeVisible();
    await expect(page.locator('[data-testid="realized-pnl"]')).toBeVisible();
    
    // Check that balance shows initial amount
    await expect(page.locator('[data-testid="total-balance"]')).toContainText('100,000.00');
    await expect(page.locator('[data-testid="balance-currency"]')).toContainText('USD');
  });

  test('should display positions table correctly', async ({ page }) => {
    await page.goto('/portfolio');
    
    // Check positions table
    await expect(page.locator('[data-testid="positions-table"]')).toBeVisible();
    await expect(page.locator('[data-testid="positions-table-header"]')).toContainText('Instrument');
    await expect(page.locator('[data-testid="positions-table-header"]')).toContainText('Quantity');
    await expect(page.locator('[data-testid="positions-table-header"]')).toContainText('Avg Price');
    await expect(page.locator('[data-testid="positions-table-header"]')).toContainText('Market Price');
    await expect(page.locator('[data-testid="positions-table-header"]')).toContainText('Unrealized P&L');
    
    // If no positions, should show empty state
    const positionRows = page.locator('[data-testid="position-row"]');
    const positionCount = await positionRows.count();
    
    if (positionCount === 0) {
      await expect(page.locator('[data-testid="no-positions-message"]')).toBeVisible();
      await expect(page.locator('[data-testid="no-positions-message"]')).toContainText('No positions found');
    }
  });

  test('should create position after executing trade', async ({ page }) => {
    // First, execute a trade to create a position
    await page.goto('/trading');
    
    // Place a market buy order (assuming there are sell orders available)
    await page.selectOption('[data-testid="order-side-select"]', 'buy');
    await page.selectOption('[data-testid="order-type-select"]', 'market');
    await page.fill('[data-testid="quantity-input"]', '0.01');
    
    await page.click('[data-testid="place-order-button"]');
    await page.click('[data-testid="confirm-order-button"]');
    
    // Wait for order execution
    await page.waitForTimeout(2000);
    
    // Navigate to portfolio
    await page.goto('/portfolio');
    
    // Should now have a position
    await expect(page.locator('[data-testid="position-row"]')).toBeVisible();
    await expect(page.locator('[data-testid="position-instrument"]')).toContainText('BTC-USD');
    await expect(page.locator('[data-testid="position-quantity"]')).toContainText('0.01');
    
    // Position should show positive quantity for buy
    const quantity = await page.locator('[data-testid="position-quantity"]').textContent();
    expect(parseFloat(quantity || '0')).toBeGreaterThan(0);
  });

  test('should display trade history correctly', async ({ page }) => {
    await page.goto('/portfolio');
    
    // Navigate to trade history tab
    await page.click('[data-testid="trade-history-tab"]');
    
    // Check trade history table
    await expect(page.locator('[data-testid="trade-history-table"]')).toBeVisible();
    await expect(page.locator('[data-testid="trade-history-header"]')).toContainText('Date');
    await expect(page.locator('[data-testid="trade-history-header"]')).toContainText('Instrument');
    await expect(page.locator('[data-testid="trade-history-header"]')).toContainText('Side');
    await expect(page.locator('[data-testid="trade-history-header"]')).toContainText('Quantity');
    await expect(page.locator('[data-testid="trade-history-header"]')).toContainText('Price');
    await expect(page.locator('[data-testid="trade-history-header"]')).toContainText('Total');
    
    // Check if trades are displayed correctly
    const tradeRows = page.locator('[data-testid="trade-history-row"]');
    const tradeCount = await tradeRows.count();
    
    if (tradeCount > 0) {
      const firstTrade = tradeRows.first();
      await expect(firstTrade.locator('[data-testid="trade-date"]')).toBeVisible();
      await expect(firstTrade.locator('[data-testid="trade-instrument"]')).toBeVisible();
      await expect(firstTrade.locator('[data-testid="trade-side"]')).toBeVisible();
      await expect(firstTrade.locator('[data-testid="trade-quantity"]')).toBeVisible();
      await expect(firstTrade.locator('[data-testid="trade-price"]')).toBeVisible();
      await expect(firstTrade.locator('[data-testid="trade-total"]')).toBeVisible();
    }
  });

  test('should display order history correctly', async ({ page }) => {
    await page.goto('/portfolio');
    
    // Navigate to order history tab
    await page.click('[data-testid="order-history-tab"]');
    
    // Check order history table
    await expect(page.locator('[data-testid="order-history-table"]')).toBeVisible();
    await expect(page.locator('[data-testid="order-history-header"]')).toContainText('Date');
    await expect(page.locator('[data-testid="order-history-header"]')).toContainText('Instrument');
    await expect(page.locator('[data-testid="order-history-header"]')).toContainText('Type');
    await expect(page.locator('[data-testid="order-history-header"]')).toContainText('Side');
    await expect(page.locator('[data-testid="order-history-header"]')).toContainText('Quantity');
    await expect(page.locator('[data-testid="order-history-header"]')).toContainText('Price');
    await expect(page.locator('[data-testid="order-history-header"]')).toContainText('Status');
    
    // Place an order first to ensure we have order history
    await page.goto('/trading');
    await page.selectOption('[data-testid="order-side-select"]', 'buy');
    await page.selectOption('[data-testid="order-type-select"]', 'limit');
    await page.fill('[data-testid="quantity-input"]', '0.1');
    await page.fill('[data-testid="price-input"]', '45000');
    await page.click('[data-testid="place-order-button"]');
    await page.click('[data-testid="confirm-order-button"]');
    
    // Go back to portfolio and check order history
    await page.goto('/portfolio');
    await page.click('[data-testid="order-history-tab"]');
    
    // Should show the order we just placed
    await expect(page.locator('[data-testid="order-history-row"]')).toBeVisible();
    await expect(page.locator('[data-testid="order-instrument"]')).toContainText('BTC-USD');
    await expect(page.locator('[data-testid="order-side"]')).toContainText('Buy');
    await expect(page.locator('[data-testid="order-quantity"]')).toContainText('0.1');
    await expect(page.locator('[data-testid="order-price"]')).toContainText('45000');
  });

  test('should filter trade and order history', async ({ page }) => {
    await page.goto('/portfolio');
    await page.click('[data-testid="trade-history-tab"]');
    
    // Test instrument filter
    if (await page.locator('[data-testid="instrument-filter"]').isVisible()) {
      await page.selectOption('[data-testid="instrument-filter"]', 'BTC-USD');
      
      // Wait for filter to apply
      await page.waitForTimeout(500);
      
      // All visible trades should be for BTC-USD
      const tradeRows = page.locator('[data-testid="trade-history-row"]');
      const tradeCount = await tradeRows.count();
      
      for (let i = 0; i < tradeCount; i++) {
        const instrument = await tradeRows.nth(i).locator('[data-testid="trade-instrument"]').textContent();
        expect(instrument).toContain('BTC-USD');
      }
    }
    
    // Test date range filter
    if (await page.locator('[data-testid="date-range-filter"]').isVisible()) {
      await page.click('[data-testid="date-range-filter"]');
      await page.click('[data-testid="last-7-days-option"]');
      
      // Wait for filter to apply
      await page.waitForTimeout(500);
    }
    
    // Test side filter for order history
    await page.click('[data-testid="order-history-tab"]');
    
    if (await page.locator('[data-testid="side-filter"]').isVisible()) {
      await page.selectOption('[data-testid="side-filter"]', 'buy');
      
      // Wait for filter to apply
      await page.waitForTimeout(500);
      
      // All visible orders should be buy orders
      const orderRows = page.locator('[data-testid="order-history-row"]');
      const orderCount = await orderRows.count();
      
      for (let i = 0; i < orderCount; i++) {
        const side = await orderRows.nth(i).locator('[data-testid="order-side"]').textContent();
        expect(side?.toLowerCase()).toContain('buy');
      }
    }
  });

  test('should export trade history', async ({ page }) => {
    await page.goto('/portfolio');
    await page.click('[data-testid="trade-history-tab"]');
    
    // Check if export button is available
    if (await page.locator('[data-testid="export-trades-button"]').isVisible()) {
      // Set up download handler
      const downloadPromise = page.waitForEvent('download');
      
      // Click export button
      await page.click('[data-testid="export-trades-button"]');
      
      // Wait for download
      const download = await downloadPromise;
      
      // Verify download
      expect(download.suggestedFilename()).toMatch(/trade-history.*\.csv/);
    }
  });

  test('should display portfolio performance charts', async ({ page }) => {
    await page.goto('/portfolio');
    
    // Check if performance chart is visible
    if (await page.locator('[data-testid="portfolio-chart"]').isVisible()) {
      await expect(page.locator('[data-testid="portfolio-chart"]')).toBeVisible();
      
      // Test chart time range selectors
      await page.click('[data-testid="chart-1d-button"]');
      await page.waitForTimeout(500);
      
      await page.click('[data-testid="chart-7d-button"]');
      await page.waitForTimeout(500);
      
      await page.click('[data-testid="chart-30d-button"]');
      await page.waitForTimeout(500);
      
      // Check chart legend
      await expect(page.locator('[data-testid="chart-legend"]')).toBeVisible();
    }
  });

  test('should display real-time balance updates', async ({ page }) => {
    await page.goto('/portfolio');
    
    // Get initial balance
    const initialBalance = await page.locator('[data-testid="available-balance"]').textContent();
    
    // Place an order to change balance
    await page.goto('/trading');
    await page.selectOption('[data-testid="order-side-select"]', 'buy');
    await page.selectOption('[data-testid="order-type-select"]', 'limit');
    await page.fill('[data-testid="quantity-input"]', '0.1');
    await page.fill('[data-testid="price-input"]', '45000');
    await page.click('[data-testid="place-order-button"]');
    await page.click('[data-testid="confirm-order-button"]');
    
    // Go back to portfolio
    await page.goto('/portfolio');
    
    // Balance should have changed (reduced by order amount)
    const newBalance = await page.locator('[data-testid="available-balance"]').textContent();
    expect(newBalance).not.toBe(initialBalance);
    
    // Available balance should be less than initial balance
    const initialAmount = parseFloat(initialBalance?.replace(/[,$]/g, '') || '0');
    const newAmount = parseFloat(newBalance?.replace(/[,$]/g, '') || '0');
    expect(newAmount).toBeLessThan(initialAmount);
  });

  test('should handle position P&L calculations', async ({ page }) => {
    // First create a position by executing a trade
    await page.goto('/trading');
    
    // Place a market order to create position
    await page.selectOption('[data-testid="order-side-select"]', 'buy');
    await page.selectOption('[data-testid="order-type-select"]', 'market');
    await page.fill('[data-testid="quantity-input"]', '0.01');
    await page.click('[data-testid="place-order-button"]');
    await page.click('[data-testid="confirm-order-button"]');
    
    // Wait for trade execution
    await page.waitForTimeout(2000);
    
    // Go to portfolio
    await page.goto('/portfolio');
    
    // Check position P&L display
    const positionRows = page.locator('[data-testid="position-row"]');
    const positionCount = await positionRows.count();
    
    if (positionCount > 0) {
      const firstPosition = positionRows.first();
      
      // Check P&L elements are visible
      await expect(firstPosition.locator('[data-testid="unrealized-pnl"]')).toBeVisible();
      
      // P&L should be a number (positive or negative)
      const pnlText = await firstPosition.locator('[data-testid="unrealized-pnl"]').textContent();
      const pnlValue = parseFloat(pnlText?.replace(/[,$]/g, '') || '0');
      expect(typeof pnlValue).toBe('number');
      
      // P&L color should indicate profit/loss
      const pnlElement = firstPosition.locator('[data-testid="unrealized-pnl"]');
      const pnlClass = await pnlElement.getAttribute('class');
      
      if (pnlValue > 0) {
        expect(pnlClass).toContain('profit');
      } else if (pnlValue < 0) {
        expect(pnlClass).toContain('loss');
      }
    }
  });

  test('should display portfolio allocation chart', async ({ page }) => {
    await page.goto('/portfolio');
    
    // Check if allocation chart is visible
    if (await page.locator('[data-testid="allocation-chart"]').isVisible()) {
      await expect(page.locator('[data-testid="allocation-chart"]')).toBeVisible();
      
      // Check chart shows different assets
      await expect(page.locator('[data-testid="allocation-legend"]')).toBeVisible();
      
      // Should show USD and any crypto positions
      await expect(page.locator('[data-testid="allocation-legend"]')).toContainText('USD');
    }
  });
});