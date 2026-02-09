import { test as base, expect } from '@playwright/test';
import { createHealingFixture, HealPage } from '../src';

const test = base.extend<{ page: HealPage }>(createHealingFixture());

test.describe('healwright - AI-Only Mode (Sauce Demo)', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('https://www.saucedemo.com/');
  });

  test('should login using AI detection', async ({ page }) => {
    await page.heal.fill('', 'Username input field', 'standard_user');
    await page.heal.fill('', 'Password input field', 'secret_sauce');
    await page.heal.click('', 'Login button');

    await expect(page.locator('.inventory_list')).toBeVisible();
  });

  test('should add item to cart using AI detection', async ({ page }) => {
    // Login first
    await page.locator('#user-name').fill('standard_user');
    await page.locator('#password').fill('secret_sauce');
    await page.locator('#login-button').click();

    // Add item using AI
    await page.heal.click('', 'Add to cart button for the first product');

    await expect(page.locator('.shopping_cart_badge')).toHaveText('1');
  });

  test('should navigate to cart using AI detection', async ({ page }) => {
    // Login first
    await page.locator('#user-name').fill('standard_user');
    await page.locator('#password').fill('secret_sauce');
    await page.locator('#login-button').click();

    // Add item and go to cart
    await page.locator('[data-test="add-to-cart-sauce-labs-backpack"]').click();
    await page.heal.click('', 'Shopping cart icon/link');

    await expect(page.locator('.cart_list')).toBeVisible();
  });

  test('should sort products using AI detection', async ({ page }) => {
    // Login first
    await page.locator('#user-name').fill('standard_user');
    await page.locator('#password').fill('secret_sauce');
    await page.locator('#login-button').click();

    // Sort products using AI
    await page.heal.click('', 'Product sort dropdown');
    await page.heal.click('', 'Option to sort by price low to high');

    const firstPrice = page.locator('.inventory_item_price').first();
    await expect(firstPrice).toHaveText('$29.99');
  });
});

test.describe('healwright - Self-Healing Mode (Sauce Demo)', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('https://www.saucedemo.com/');
    // Login
    await page.locator('#user-name').fill('standard_user');
    await page.locator('#password').fill('secret_sauce');
    await page.locator('#login-button').click();
  });

  test('should heal a broken add to cart button', async ({ page }) => {
    const brokenAddBtn = page.locator('[data-test="nonexistent-add-button"]');
    await page.heal.click(brokenAddBtn, 'Add to cart button for Sauce Labs Backpack');

    await expect(page.locator('.shopping_cart_badge')).toBeVisible();
  });

  test('should heal a broken menu button', async ({ page }) => {
    const brokenMenuBtn = page.locator('#wrong-menu-id');
    await page.heal.click(brokenMenuBtn, 'Hamburger menu button');

    await expect(page.locator('.bm-menu')).toBeVisible();
  });

  test('should heal a broken product link', async ({ page }) => {
    const brokenProductLink = page.locator('a.wrong-product-class');
    await page.heal.click(brokenProductLink, 'Link to Sauce Labs Backpack product details');

    await expect(page.locator('.inventory_details_name')).toContainText('Sauce Labs Backpack');
  });

  test('should heal a broken remove button', async ({ page }) => {
    // Add item first
    await page.locator('[data-test="add-to-cart-sauce-labs-backpack"]').click();

    const brokenRemoveBtn = page.locator('[data-test="wrong-remove-button"]');
    await page.heal.click(brokenRemoveBtn, 'Remove button for the item in cart');

    await expect(page.locator('.shopping_cart_badge')).not.toBeVisible();
  });
});

test.describe('healwright - Checkout Flow (Sauce Demo)', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('https://www.saucedemo.com/');
    // Login
    await page.locator('#user-name').fill('standard_user');
    await page.locator('#password').fill('secret_sauce');
    await page.locator('#login-button').click();
  });

  test('should complete checkout using AI detection', async ({ page }) => {
    // Add item to cart
    await page.locator('[data-test="add-to-cart-sauce-labs-backpack"]').click();
    await page.locator('.shopping_cart_link').click();

    // Proceed to checkout using AI
    await page.heal.click('', 'Checkout button');

    // Fill checkout form using AI
    await page.heal.fill('', 'First name input field', 'John');
    await page.heal.fill('', 'Last name input field', 'Doe');
    await page.heal.fill('', 'Postal/Zip code input field', '12345');

    await page.heal.click('', 'Continue button');

    // Complete purchase
    await page.heal.click('', 'Finish button to complete the order');

    await expect(page.locator('.complete-header')).toHaveText('Thank you for your order!');
  });

  test('should heal broken checkout form fields', async ({ page }) => {
    // Add item and go to checkout
    await page.locator('[data-test="add-to-cart-sauce-labs-backpack"]').click();
    await page.locator('.shopping_cart_link').click();
    await page.locator('[data-test="checkout"]').click();

    // Use broken selectors that need healing
    const brokenFirstName = page.locator('#wrong-firstname');
    const brokenLastName = page.locator('#wrong-lastname');
    const brokenZip = page.locator('#wrong-postal');

    await page.heal.fill(brokenFirstName, 'First name input', 'Jane');
    await page.heal.fill(brokenLastName, 'Last name input', 'Smith');
    await page.heal.fill(brokenZip, 'Zip/Postal code input', '54321');

    await page.locator('[data-test="continue"]').click();

    await expect(page.locator('.summary_info')).toBeVisible();
  });
});

test.describe('healwright - Mixed Mode (Sauce Demo)', () => {

  test('demonstrates mixing regular Playwright with healwright', async ({ page }) => {
    await page.goto('https://www.saucedemo.com/');

    // Regular Playwright for login
    await page.locator('#user-name').fill('standard_user');
    await page.locator('#password').fill('secret_sauce');
    await page.locator('#login-button').click();

    // AI for adding items
    await page.heal.click('', 'Add to cart button for the backpack');
    await page.heal.click('', 'Add to cart button for the bike light');

    // Regular Playwright for verification
    await expect(page.locator('.shopping_cart_badge')).toHaveText('2');

    // AI for navigation
    await page.heal.click('', 'Shopping cart icon');

    // Regular Playwright for final verification
    await expect(page.locator('.cart_item')).toHaveCount(2);
  });

  test('should logout using AI detection', async ({ page }) => {
    await page.goto('https://www.saucedemo.com/');

    // Login with regular Playwright
    await page.locator('#user-name').fill('standard_user');
    await page.locator('#password').fill('secret_sauce');
    await page.locator('#login-button').click();

    // Logout using AI
    await page.heal.click('', 'Menu/hamburger button');
    await page.heal.click('', 'Logout link/button');

    await expect(page.locator('#login-button')).toBeVisible();
  });
});
