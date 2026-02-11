import { test as base, expect } from '@playwright/test';
import { createHealingFixture, HealPage } from '../src';

const test = base.extend<{ page: HealPage }>(createHealingFixture());

test.describe('healwright - AI-Only Mode', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/examples/react/dist/');
  });

  test('should add a todo using AI detection', async ({ page }) => {
    await page.heal.fill('', 'Input field to add new todo items', 'Buy groceries');
    await page.keyboard.press('Enter');

    await expect(page.getByText('Buy groceries')).toBeVisible();
  });

  test('should complete a todo using AI detection', async ({ page }) => {
    await page.heal.locator('.ngfg', 'Input field for adding new todos').fill('Learn healwright');
    await page.keyboard.press('Enter');

    await page.heal.click('', 'Checkbox to mark the todo item as complete');

    await expect(page.locator('.todo-list li')).toHaveClass(/completed/);
  });

  test('should delete a todo using AI detection', async ({ page }) => {
    await page.locator('.new-todo').fill('Task to delete');
    await page.keyboard.press('Enter');

    await page.heal.hover('', 'Todo item in the list');
    await page.heal.click('', 'Delete button for the todo item', { force: true });

    await expect(page.getByText('Task to delete')).not.toBeVisible();
  });
});

test.describe('healwright - Self-Healing Mode', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('https://todomvc.com/examples/react/dist/');
  });

  test('should heal a broken checkbox locator', async ({ page }) => {
    await page.locator('.new-todo').fill('Test self-healing');
    await page.keyboard.press('Enter');

    const brokenCheckbox = page.locator('[data-testid="nonexistent-toggle"]');
    await page.heal.click(brokenCheckbox, 'Toggle checkbox for the todo item');

    await expect(page.locator('.todo-list li')).toHaveClass(/completed/);
  });

  test('should heal a broken filter link', async ({ page }) => {
    await page.locator('.new-todo').fill('Active task');
    await page.keyboard.press('Enter');
    await page.locator('.new-todo').fill('Completed task');
    await page.keyboard.press('Enter');

    await page.locator('.todo-list li').nth(1).locator('.toggle').click();

    const brokenFilter = page.locator('a[href="#/wrong-active-path"]');
    await page.heal.click(brokenFilter, 'Filter link to show only active/incomplete todos');

    await expect(page.getByText('Active task')).toBeVisible();
    await expect(page.getByText('Completed task')).not.toBeVisible();
  });

  test('should heal a broken clear completed button', async ({ page }) => {
    await page.locator('.new-todo').fill('Task to clear');
    await page.keyboard.press('Enter');
    await page.locator('.toggle').click();

    const brokenClearBtn = page.locator('button.wrong-clear-class');
    await page.heal.click(brokenClearBtn, 'Button to clear all completed todos');

    await expect(page.getByText('Task to clear')).not.toBeVisible();
  });
});

test.describe('healwright - Mixed Mode', () => {

  test('demonstrates mixing regular Playwright with healwright', async ({ page }) => {
    await page.goto('https://todomvc.com/examples/react/dist/');

    await page.locator('.new-todo').fill('Regular Playwright todo');
    await page.keyboard.press('Enter');

    await page.heal.fill('', 'New todo input field', 'AI found this input');
    await page.keyboard.press('Enter');

    await expect(page.locator('.todo-list li')).toHaveCount(2);
  });
});
