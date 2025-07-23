import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Start from the home page
    await page.goto('/');
  });

  test('should display login page correctly', async ({ page }) => {
    await page.click('[data-testid="login-link"]');
    
    await expect(page).toHaveURL('/auth/login');
    await expect(page.locator('[data-testid="login-form"]')).toBeVisible();
    await expect(page.locator('[data-testid="email-input"]')).toBeVisible();
    await expect(page.locator('[data-testid="password-input"]')).toBeVisible();
    await expect(page.locator('[data-testid="login-button"]')).toBeVisible();
    await expect(page.locator('[data-testid="register-link"]')).toBeVisible();
  });

  test('should login successfully with valid credentials', async ({ page }) => {
    await page.goto('/auth/login');
    
    // Fill in login form
    await page.fill('[data-testid="email-input"]', 'e2e.trader1@test.com');
    await page.fill('[data-testid="password-input"]', 'password123');
    
    // Submit form
    await page.click('[data-testid="login-button"]');
    
    // Should redirect to dashboard
    await expect(page).toHaveURL('/dashboard');
    
    // Should show user info
    await expect(page.locator('[data-testid="user-menu"]')).toBeVisible();
    await expect(page.locator('[data-testid="user-name"]')).toContainText('E2E Trader1');
  });

  test('should show error for invalid credentials', async ({ page }) => {
    await page.goto('/auth/login');
    
    // Fill in login form with invalid credentials
    await page.fill('[data-testid="email-input"]', 'invalid@test.com');
    await page.fill('[data-testid="password-input"]', 'wrongpassword');
    
    // Submit form
    await page.click('[data-testid="login-button"]');
    
    // Should show error message
    await expect(page.locator('[data-testid="error-message"]')).toBeVisible();
    await expect(page.locator('[data-testid="error-message"]')).toContainText('Invalid email or password');
    
    // Should stay on login page
    await expect(page).toHaveURL('/auth/login');
  });

  test('should validate required fields', async ({ page }) => {
    await page.goto('/auth/login');
    
    // Try to submit empty form
    await page.click('[data-testid="login-button"]');
    
    // Should show validation errors
    await expect(page.locator('[data-testid="email-error"]')).toBeVisible();
    await expect(page.locator('[data-testid="password-error"]')).toBeVisible();
  });

  test('should display register page correctly', async ({ page }) => {
    await page.goto('/auth/register');
    
    await expect(page.locator('[data-testid="register-form"]')).toBeVisible();
    await expect(page.locator('[data-testid="email-input"]')).toBeVisible();
    await expect(page.locator('[data-testid="password-input"]')).toBeVisible();
    await expect(page.locator('[data-testid="confirm-password-input"]')).toBeVisible();
    await expect(page.locator('[data-testid="first-name-input"]')).toBeVisible();
    await expect(page.locator('[data-testid="last-name-input"]')).toBeVisible();
    await expect(page.locator('[data-testid="register-button"]')).toBeVisible();
    await expect(page.locator('[data-testid="login-link"]')).toBeVisible();
  });

  test('should register new user successfully', async ({ page }) => {
    await page.goto('/auth/register');
    
    const timestamp = Date.now();
    const email = `e2e.newuser${timestamp}@test.com`;
    
    // Fill in registration form
    await page.fill('[data-testid="email-input"]', email);
    await page.fill('[data-testid="password-input"]', 'SecurePassword123!');
    await page.fill('[data-testid="confirm-password-input"]', 'SecurePassword123!');
    await page.fill('[data-testid="first-name-input"]', 'New');
    await page.fill('[data-testid="last-name-input"]', 'User');
    
    // Submit form
    await page.click('[data-testid="register-button"]');
    
    // Should show success message or redirect to verification page
    await expect(page.locator('[data-testid="success-message"]')).toBeVisible();
    await expect(page.locator('[data-testid="success-message"]')).toContainText('Registration successful');
  });

  test('should validate password requirements', async ({ page }) => {
    await page.goto('/auth/register');
    
    // Fill form with weak password
    await page.fill('[data-testid="email-input"]', 'test@example.com');
    await page.fill('[data-testid="password-input"]', '123');
    await page.fill('[data-testid="confirm-password-input"]', '123');
    await page.fill('[data-testid="first-name-input"]', 'Test');
    await page.fill('[data-testid="last-name-input"]', 'User');
    
    // Submit form
    await page.click('[data-testid="register-button"]');
    
    // Should show password validation error
    await expect(page.locator('[data-testid="password-error"]')).toBeVisible();
    await expect(page.locator('[data-testid="password-error"]')).toContainText('Password must be at least 8 characters');
  });

  test('should validate password confirmation', async ({ page }) => {
    await page.goto('/auth/register');
    
    // Fill form with mismatched passwords
    await page.fill('[data-testid="email-input"]', 'test@example.com');
    await page.fill('[data-testid="password-input"]', 'SecurePassword123!');
    await page.fill('[data-testid="confirm-password-input"]', 'DifferentPassword123!');
    await page.fill('[data-testid="first-name-input"]', 'Test');
    await page.fill('[data-testid="last-name-input"]', 'User');
    
    // Submit form
    await page.click('[data-testid="register-button"]');
    
    // Should show password confirmation error
    await expect(page.locator('[data-testid="confirm-password-error"]')).toBeVisible();
    await expect(page.locator('[data-testid="confirm-password-error"]')).toContainText('Passwords do not match');
  });

  test('should logout successfully', async ({ page }) => {
    // Login first
    await page.goto('/auth/login');
    await page.fill('[data-testid="email-input"]', 'e2e.trader1@test.com');
    await page.fill('[data-testid="password-input"]', 'password123');
    await page.click('[data-testid="login-button"]');
    await expect(page).toHaveURL('/dashboard');
    
    // Logout
    await page.click('[data-testid="user-menu"]');
    await page.click('[data-testid="logout-button"]');
    
    // Should redirect to home page
    await expect(page).toHaveURL('/');
    
    // Should not show user menu
    await expect(page.locator('[data-testid="user-menu"]')).not.toBeVisible();
    
    // Should show login link
    await expect(page.locator('[data-testid="login-link"]')).toBeVisible();
  });

  test('should redirect to login when accessing protected routes', async ({ page }) => {
    // Try to access dashboard without authentication
    await page.goto('/dashboard');
    
    // Should redirect to login
    await expect(page).toHaveURL('/auth/login');
    
    // Should show message about authentication required
    await expect(page.locator('[data-testid="auth-required-message"]')).toBeVisible();
  });

  test('should remember user after page refresh', async ({ page }) => {
    // Login
    await page.goto('/auth/login');
    await page.fill('[data-testid="email-input"]', 'e2e.trader1@test.com');
    await page.fill('[data-testid="password-input"]', 'password123');
    await page.click('[data-testid="login-button"]');
    await expect(page).toHaveURL('/dashboard');
    
    // Refresh page
    await page.reload();
    
    // Should still be logged in
    await expect(page).toHaveURL('/dashboard');
    await expect(page.locator('[data-testid="user-menu"]')).toBeVisible();
  });

  test('should handle social login buttons', async ({ page }) => {
    await page.goto('/auth/login');
    
    // Check social login buttons are present
    await expect(page.locator('[data-testid="google-login-button"]')).toBeVisible();
    await expect(page.locator('[data-testid="facebook-login-button"]')).toBeVisible();
    
    // Click Google login (should redirect to OAuth provider)
    const [popup] = await Promise.all([
      page.waitForEvent('popup'),
      page.click('[data-testid="google-login-button"]')
    ]);
    
    // Verify popup opened (OAuth flow would continue in real scenario)
    expect(popup.url()).toContain('google');
    await popup.close();
  });

  test('should display forgot password page', async ({ page }) => {
    await page.goto('/auth/login');
    await page.click('[data-testid="forgot-password-link"]');
    
    await expect(page).toHaveURL('/auth/forgot-password');
    await expect(page.locator('[data-testid="forgot-password-form"]')).toBeVisible();
    await expect(page.locator('[data-testid="email-input"]')).toBeVisible();
    await expect(page.locator('[data-testid="reset-password-button"]')).toBeVisible();
  });

  test('should handle forgot password flow', async ({ page }) => {
    await page.goto('/auth/forgot-password');
    
    // Fill email
    await page.fill('[data-testid="email-input"]', 'e2e.trader1@test.com');
    
    // Submit form
    await page.click('[data-testid="reset-password-button"]');
    
    // Should show success message
    await expect(page.locator('[data-testid="success-message"]')).toBeVisible();
    await expect(page.locator('[data-testid="success-message"]')).toContainText('Password reset email sent');
  });
});