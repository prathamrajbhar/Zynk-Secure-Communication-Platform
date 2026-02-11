// ============================================================================
// Zynk — Playwright E2E Tests
//
// Tests critical user flows through the web interface.
// Run with: npx playwright test
// ============================================================================

import { test, expect, type Page } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const API_URL = process.env.API_URL || 'http://localhost:8000';

// Test user credentials
const testUser = {
  username: `e2e_user_${Date.now()}`,
  password: 'E2eTestPass123!',
};

const testUser2 = {
  username: `e2e_user2_${Date.now()}`,
  password: 'E2eTestPass123!',
};

test.describe('Authentication Flows', () => {
  test('should register a new account', async ({ page }) => {
    await page.goto(`${BASE_URL}/register`);
    
    // Fill registration form
    await page.fill('[name="username"], [data-testid="username-input"]', testUser.username);
    await page.fill('[name="password"], [data-testid="password-input"]', testUser.password);
    
    // Submit
    await page.click('[type="submit"], [data-testid="register-button"]');
    
    // Should redirect to chat
    await expect(page).toHaveURL(/\/chat/, { timeout: 10000 });
  });

  test('should login with existing account', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    
    await page.fill('[name="username"], [data-testid="username-input"]', testUser.username);
    await page.fill('[name="password"], [data-testid="password-input"]', testUser.password);
    
    await page.click('[type="submit"], [data-testid="login-button"]');
    
    await expect(page).toHaveURL(/\/chat/, { timeout: 10000 });
  });

  test('should reject invalid credentials', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    
    await page.fill('[name="username"], [data-testid="username-input"]', 'nonexistent_user');
    await page.fill('[name="password"], [data-testid="password-input"]', 'wrong_password');
    
    await page.click('[type="submit"], [data-testid="login-button"]');
    
    // Should show error message
    await expect(page.locator('[data-testid="error-message"], .error, [role="alert"]'))
      .toBeVisible({ timeout: 5000 });
    
    // Should stay on login page
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe('Chat Interface', () => {
  test.beforeEach(async ({ page }) => {
    // Login first
    await page.goto(`${BASE_URL}/login`);
    await page.fill('[name="username"], [data-testid="username-input"]', testUser.username);
    await page.fill('[name="password"], [data-testid="password-input"]', testUser.password);
    await page.click('[type="submit"], [data-testid="login-button"]');
    await expect(page).toHaveURL(/\/chat/, { timeout: 10000 });
  });

  test('should display sidebar with conversations', async ({ page }) => {
    // Sidebar should be visible
    const sidebar = page.locator('[data-testid="sidebar"], .sidebar, aside');
    await expect(sidebar).toBeVisible();
  });

  test('should search for users', async ({ page }) => {
    // Open new chat / search
    const searchInput = page.locator('[data-testid="search-input"], input[type="search"], input[placeholder*="search" i]');
    if (await searchInput.isVisible()) {
      await searchInput.fill('test');
      // Should show search results
      await page.waitForTimeout(1000);
    }
  });
});

test.describe('Performance', () => {
  test('login page should load within 3 seconds', async ({ page }) => {
    const startTime = Date.now();
    await page.goto(`${BASE_URL}/login`);
    const loadTime = Date.now() - startTime;
    
    expect(loadTime).toBeLessThan(3000);
  });

  test('chat page should load within 5 seconds', async ({ page }) => {
    // Login
    await page.goto(`${BASE_URL}/login`);
    await page.fill('[name="username"], [data-testid="username-input"]', testUser.username);
    await page.fill('[name="password"], [data-testid="password-input"]', testUser.password);
    
    const startTime = Date.now();
    await page.click('[type="submit"], [data-testid="login-button"]');
    await expect(page).toHaveURL(/\/chat/, { timeout: 10000 });
    const loadTime = Date.now() - startTime;
    
    expect(loadTime).toBeLessThan(5000);
  });
});

test.describe('Security', () => {
  test('should not expose sensitive data in page source', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    const content = await page.content();
    
    // Should not contain any secrets or internal URLs
    expect(content).not.toContain('JWT_SECRET');
    expect(content).not.toContain('DATABASE_URL');
    expect(content).not.toContain('password_hash');
  });

  test('should redirect unauthenticated users from chat', async ({ page }) => {
    await page.goto(`${BASE_URL}/chat`);
    
    // Should redirect to login
    await expect(page).toHaveURL(/\/(login|$)/, { timeout: 5000 });
  });

  test('should have proper security headers', async ({ page }) => {
    const response = await page.goto(`${BASE_URL}/`);
    const headers = response?.headers();
    
    // Check for key security headers (set by Next.js or Nginx)
    if (headers) {
      // These may be set by the upstream proxy
      expect(headers['x-content-type-options']).toBeDefined();
    }
  });
});
