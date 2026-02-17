import { test as base, expect } from '@playwright/test';
import { createHealingFixture, HealPage } from 'healwright';

const test = base.extend<{ page: HealPage }>(createHealingFixture({maxCandidates:30}));

test.describe('healwright smoke test', () => {
  test('heal broken click locator on demo page', async ({ page }) => {
    await page.goto('https://demo.playwright.dev/todomvc/');

    // Broken locator — AI should heal to the real input
    await page.heal.fill(
      page.locator('#wrong-todo-input'),
      'Input field for what needs to be done',
      'Buy groceries'
    );

    await page.keyboard.press('Enter');
    await expect(page.locator('.todo-list li')).toHaveCount(1);
  });

  test('AI-only mode — no selector', async ({ page }) => {
    await page.goto('https://demo.playwright.dev/todomvc/');

    await page.heal.fill('', 'Input field for what needs to be done', 'Walk the dog');
    await page.keyboard.press('Enter');

    await page.heal.fill('', 'Input field for what needs to be done', 'Read a book');
    await page.keyboard.press('Enter');

    await expect(page.locator('.todo-list li')).toHaveCount(2);
  });
});
