/**
 * Example tests demonstrating healwright capabilities
 * using the TodoMVC React demo app.
 * 
 * These tests show both:
 * 1. AI-only mode (empty string locator) - AI finds elements by description
 * 2. Self-healing mode - broken locators are healed by AI
 */

import { test as base, expect } from '@playwright/test';
import { createHealingFixture, HealPage } from '../src';

// Create test fixture with healing enabled
const test = base.extend<{ page: HealPage }>(createHealingFixture());

test.describe('healwright - AI-Only Mode', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/examples/react/dist/');
  });

  test('should add a todo using AI detection', async ({ page }) => {
    // AI-only mode: empty string locator, AI finds element by description
    await page.heal.fill('', 'Input field to add new todo items', 'Buy groceries');
    await page.keyboard.press('Enter');

    // Verify todo was added
    await expect(page.getByText('Buy groceries')).toBeVisible();
  });

  test('should complete a todo using AI detection', async ({ page }) => {
    // Using heal.locator() - combines CSS selector with semantic description
    // If '.new-todo' fails, AI will find element using the description
    await page.heal.locator('.ngfg', 'Input field for adding new todos').fill('Learn healwright');
    await page.keyboard.press('Enter');

    // Use AI to find and click the checkbox
    await page.heal.click('', 'Checkbox to mark the todo item as complete');

    // Verify todo is completed
    await expect(page.locator('.todo-list li')).toHaveClass(/completed/);
  });

  test('should delete a todo using AI detection', async ({ page }) => {
    // Add a todo
    await page.locator('.new-todo').fill('Task to delete');
    await page.keyboard.press('Enter');

    // The delete button (×) in TodoMVC only appears on hover.
    // We use { force: true } to allow clicking hidden elements.
    // This tells healwright to skip the visibility check.

    // First, hover over the todo item to reveal the delete button
    await page.heal.hover('', 'Todo item in the list');

    // Click the delete button using AI detection with force: true
    // (this allows clicking even though the button may not be "visible")
    await page.heal.click('', 'Delete button for the todo item', { force: true });

    // Verify todo is gone
    await expect(page.getByText('Task to delete')).not.toBeVisible();
  });
});

test.describe('healwright - Self-Healing Mode', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('https://todomvc.com/examples/react/dist/');
  });

  test('should heal a broken checkbox locator', async ({ page }) => {
    // Add a todo
    await page.locator('.new-todo').fill('Test self-healing');
    await page.keyboard.press('Enter');

    // Use intentionally BROKEN locator - AI will heal it
    const brokenCheckbox = page.locator('[data-testid="nonexistent-toggle"]');
    await page.heal.click(brokenCheckbox, 'Toggle checkbox for the todo item');

    // Verify todo is completed
    await expect(page.locator('.todo-list li')).toHaveClass(/completed/);
  });

  test('should heal a broken filter link', async ({ page }) => {
    // Add two todos
    await page.locator('.new-todo').fill('Active task');
    await page.keyboard.press('Enter');
    await page.locator('.new-todo').fill('Completed task');
    await page.keyboard.press('Enter');

    // Complete the second todo
    await page.locator('.todo-list li').nth(1).locator('.toggle').click();

    // Use broken locator for filter - AI will heal
    const brokenFilter = page.locator('a[href="#/wrong-active-path"]');
    await page.heal.click(brokenFilter, 'Filter link to show only active/incomplete todos');

    // Verify filter works
    await expect(page.getByText('Active task')).toBeVisible();
    await expect(page.getByText('Completed task')).not.toBeVisible();
  });

  test('should heal a broken clear completed button', async ({ page }) => {
    // Add and complete a todo
    await page.locator('.new-todo').fill('Task to clear');
    await page.keyboard.press('Enter');
    await page.locator('.toggle').click();

    // Use broken locator - AI will heal
    const brokenClearBtn = page.locator('button.wrong-clear-class');
    await page.heal.click(brokenClearBtn, 'Button to clear all completed todos');

    // Verify cleared
    await expect(page.getByText('Task to clear')).not.toBeVisible();
  });
});

test.describe('healwright - Mixed Mode', () => {

  test('demonstrates mixing regular Playwright with healwright', async ({ page }) => {
    await page.goto('https://todomvc.com/examples/react/dist/');

    // Regular Playwright - when you have reliable selectors
    await page.locator('.new-todo').fill('Regular Playwright todo');
    await page.keyboard.press('Enter');

    // healwright AI-only - when you want AI to find elements
    await page.heal.fill('', 'New todo input field', 'AI found this input');
    await page.keyboard.press('Enter');

    // Both approaches work together seamlessly
    await expect(page.locator('.todo-list li')).toHaveCount(2);
  });
});
