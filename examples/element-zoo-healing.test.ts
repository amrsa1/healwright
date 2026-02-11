/**
 * Element Zoo — AI Self-Healing Tests
 *
 * Every locator in this file is INTENTIONALLY BROKEN.
 * Each test uses page.heal.* with a wrong selector + semantic description
 * so the AI must detect the correct element via self-healing.
 *
 * Two modes are tested:
 *   1) Self-Healing Mode — a broken Playwright locator is passed as the first arg
 *   2) AI-Only Mode — empty string '' is passed (no selector at all)
 *
 * Requires a valid AI provider key (OPENAI_API_KEY, ANTHROPIC_API_KEY, or GOOGLE_API_KEY).
 */

import { test as base, expect } from '@playwright/test';
import { createHealingFixture, HealPage } from '../src';
import path from 'node:path';

const test = base.extend<{ page: HealPage }>(createHealingFixture());

const FIXTURE = `file://${path.resolve(__dirname, 'fixtures/element-zoo.html')}`;

/** Helper — read the #log element's text. */
const logText = (page: HealPage) => page.locator('#log').textContent();

// ═══════════════════════════════════════════════════════════════════
//  SELF-HEALING MODE — broken locators
//  Every selector is WRONG. The AI must find the real element.
// ═══════════════════════════════════════════════════════════════════

test.describe('Self-Healing — Click', () => {
  test.beforeEach(async ({ page }) => { await page.goto(FIXTURE); });

  test('heal broken button locator', async ({ page }) => {
    const broken = page.locator('[data-testid="wrong-btn-primary"]');
    await page.heal.click(broken, 'Primary Button');
    expect(await logText(page)).toBe('button clicked');
  });

  test('heal broken input[type=button] locator', async ({ page }) => {
    const broken = page.locator('#nonexistent-input-btn');
    await page.heal.click(broken, 'Input Button');
    expect(await logText(page)).toBe('input-button clicked');
  });

  test('heal broken submit button locator', async ({ page }) => {
    const broken = page.locator('.fake-submit-class');
    await page.heal.click(broken, 'Submit button');
    expect(await logText(page)).toBe('submit clicked');
  });

  test('heal broken reset button locator', async ({ page }) => {
    const broken = page.locator('[data-test-id="wrong-reset"]');
    await page.heal.click(broken, 'Reset button');
    expect(await logText(page)).toBe('reset clicked');
  });

  test('heal broken image input locator', async ({ page }) => {
    const broken = page.locator('input[alt="Wrong Alt"]');
    await page.heal.click(broken, 'Image submit input with alt Go');
    expect(await logText(page)).toBe('image-input clicked');
  });

  test('heal broken link locator', async ({ page }) => {
    const broken = page.locator('a.nonexistent-nav-class');
    await page.heal.click(broken, 'Navigation Link');
    expect(await logText(page)).toBe('link clicked');
  });

  test('heal broken role button locator', async ({ page }) => {
    const broken = page.locator('#fake-role-btn');
    await page.heal.click(broken, 'Role Button div element');
    expect(await logText(page)).toBe('role-button clicked');
  });

  test('heal broken span button with aria-label', async ({ page }) => {
    const broken = page.locator('span.wrong-class');
    await page.heal.click(broken, 'Span button with aria-label Icon action');
    expect(await logText(page)).toBe('span-button clicked');
  });

  test('heal broken label for hidden checkbox', async ({ page }) => {
    const broken = page.locator('label.nonexistent-label');
    await page.heal.click(broken, 'Label with text Toggle hidden checkbox');
    expect(await logText(page)).toContain('css-hidden checkbox');
  });

  test('heal broken image element locator', async ({ page }) => {
    const broken = page.locator('img.wrong-bell-class');
    await page.heal.click(broken, 'Notification bell image icon');
    expect(await logText(page)).toBe('img clicked');
  });

  test('heal broken list item locator', async ({ page }) => {
    const broken = page.locator('li.nonexistent-item');
    await page.heal.click(broken, 'First clickable list item in the list');
    expect(await logText(page)).toBe('list item 1 clicked');
  });

  test('heal broken summary locator', async ({ page }) => {
    const broken = page.locator('summary.wrong-class');
    await page.heal.click(broken, 'Summary element with text Click to expand');
    await expect(page.locator('#details-content')).toBeVisible();
  });

  test('heal broken custom tabindex element', async ({ page }) => {
    const broken = page.locator('#nonexistent-custom-element');
    await page.heal.click(broken, 'Custom focusable div button');
    expect(await logText(page)).toBe('tabindex div clicked');
  });
});

test.describe('Self-Healing — Fill', () => {
  test.beforeEach(async ({ page }) => { await page.goto(FIXTURE); });

  test('heal broken name input', async ({ page }) => {
    const broken = page.locator('#wrong-name-input');
    await page.heal.locator('#wrong-name-input', 'Full name text input field').fill('John Doe');
    await expect(page.locator('[data-testid="input-name"]')).toHaveValue('John Doe');
  });

  test('heal broken email input', async ({ page }) => {
    const broken = page.locator('[data-testid="wrong-email"]');
    await page.heal.locator('[data-testid="wrong-email"]', 'Email address input field').fill('test@example.com');
    await expect(page.locator('[data-testid="input-email"]')).toHaveValue('test@example.com');
  });

  test('heal broken password input', async ({ page }) => {
    await page.heal.fill(
      page.locator('.fake-password-input'),
      'Password input field',
      'secret123'
    );
    await expect(page.locator('[data-testid="input-password"]')).toHaveValue('secret123');
  });

  test('heal broken search input', async ({ page }) => {
    await page.heal.fill(
      page.locator('#nonexistent-search'),
      'Search input field',
      'healwright'
    );
    await expect(page.locator('[data-testid="input-search"]')).toHaveValue('healwright');
  });

  test('heal broken textarea', async ({ page }) => {
    await page.heal.fill(
      page.locator('textarea.wrong-comment'),
      'Comment textarea box',
      'Great library!'
    );
    await expect(page.locator('[data-testid="textarea-comment"]')).toHaveValue('Great library!');
  });

  test('heal broken number input', async ({ page }) => {
    await page.heal.fill(
      page.locator('[data-testid="wrong-number"]'),
      'Quantity number input field',
      '42'
    );
    await expect(page.locator('[data-testid="input-number"]')).toHaveValue('42');
  });
});

test.describe('Self-Healing — Check / Uncheck', () => {
  test.beforeEach(async ({ page }) => { await page.goto(FIXTURE); });

  test('heal broken agree checkbox', async ({ page }) => {
    await page.heal.check(
      page.locator('[data-testid="wrong-agree-cb"]'),
      'I agree to terms checkbox'
    );
    await expect(page.locator('[data-testid="cb-agree"]')).toBeChecked();
  });

  test('heal broken newsletter checkbox — check then uncheck', async ({ page }) => {
    await page.heal.check(
      page.locator('#fake-newsletter'),
      'Subscribe to newsletter checkbox'
    );
    await expect(page.locator('[data-testid="cb-newsletter"]')).toBeChecked();

    await page.heal.uncheck(
      page.locator('#fake-newsletter'),
      'Subscribe to newsletter checkbox'
    );
    await expect(page.locator('[data-testid="cb-newsletter"]')).not.toBeChecked();
  });

  test('heal broken radio button', async ({ page }) => {
    await page.heal.check(
      page.locator('[data-testid="wrong-radio"]'),
      'Pro plan radio button'
    );
    await expect(page.locator('[data-testid="radio-pro"]')).toBeChecked();
  });
});

test.describe('Self-Healing — Select Option', () => {
  test.beforeEach(async ({ page }) => { await page.goto(FIXTURE); });

  test('heal broken color select', async ({ page }) => {
    await page.heal.selectOption(
      page.locator('#nonexistent-color-select'),
      'Color dropdown select',
      'blue'
    );
    await expect(page.locator('[data-testid="select-color"]')).toHaveValue('blue');
  });
});

test.describe('Self-Healing — Double Click', () => {
  test.beforeEach(async ({ page }) => { await page.goto(FIXTURE); });

  test('heal broken dblclick target', async ({ page }) => {
    await page.heal.dblclick(
      page.locator('.nonexistent-dblclick-span'),
      'Span element with text Double-click to edit me'
    );
    expect(await logText(page)).toBe('dblclick to edit');
  });
});

test.describe('Self-Healing — Hover', () => {
  test.beforeEach(async ({ page }) => { await page.goto(FIXTURE); });

  test('heal broken hover container to reveal button', async ({ page }) => {
    await page.heal.hover(
      page.locator('#wrong-hover-area'),
      'Hover container with testid hover-container'
    );
    await expect(page.locator('[data-testid="hover-reveal-btn"]')).toBeVisible();
  });

  test('heal broken hover then click revealed button', async ({ page }) => {
    // First hover to reveal
    await page.heal.hover(
      page.locator('#wrong-hover-area'),
      'Hover container with testid hover-container'
    );
    // Then click the revealed button
    await page.heal.click(
      page.locator('.fake-reveal-btn'),
      'Button with testid hover-reveal-btn',
      { force: true }
    );
    expect(await logText(page)).toBe('hover-reveal clicked');
  });

  test('heal broken tooltip trigger', async ({ page }) => {
    await page.heal.hover(
      page.locator('.wrong-tooltip-trigger'),
      'Tooltip trigger element with aria-label Element with tooltip'
    );
    await expect(page.locator('#tooltip-box')).toBeVisible();
  });
});

test.describe('Self-Healing — Focus', () => {
  test.beforeEach(async ({ page }) => { await page.goto(FIXTURE); });

  test('heal broken focus input', async ({ page }) => {
    await page.heal.focus(
      page.locator('#wrong-focus-input'),
      'Input element with placeholder text Focus me'
    );
    expect(await logText(page)).toBe('input focused');
  });

  test('heal broken focus button', async ({ page }) => {
    await page.heal.focus(
      page.locator('.fake-focus-btn'),
      'Button with text Focusable Button'
    );
    expect(await logText(page)).toBe('button focused');
  });
});

test.describe('Self-Healing — Tabs', () => {
  test.beforeEach(async ({ page }) => { await page.goto(FIXTURE); });

  test('heal broken tab selector', async ({ page }) => {
    await page.heal.click(
      page.locator('[data-testid="wrong-tab-details"]'),
      'Tab element with text Details and testid tab-details'
    );
    await expect(page.locator('#panel-details')).toBeVisible();
    await expect(page.locator('#panel-overview')).not.toBeVisible();
  });
});

test.describe('Self-Healing — Menu', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(FIXTURE);
    // Open menu first with working locator
    await page.locator('[data-testid="menu-trigger"]').click();
  });

  test('heal broken Cut menu item', async ({ page }) => {
    await page.heal.click(
      page.locator('[data-testid="wrong-menu-cut"]'),
      'Cut menu item with scissors icon'
    );
    expect(await logText(page)).toBe('cut');
  });

  test('heal broken Copy menu item', async ({ page }) => {
    await page.heal.click(
      page.locator('#fake-menu-copy'),
      'Copy menu item with clipboard icon'
    );
    expect(await logText(page)).toBe('copy');
  });
});

test.describe('Self-Healing — Tree View', () => {
  test.beforeEach(async ({ page }) => { await page.goto(FIXTURE); });

  test('heal broken tree item', async ({ page }) => {
    await page.heal.click(
      page.locator('[data-testid="wrong-tree-item"]'),
      'Tree item for index.ts file'
    );
    await expect(page.locator('[data-testid="tree-index"]')).toHaveClass(/selected/);
  });
});

test.describe('Self-Healing — Data Grid', () => {
  test.beforeEach(async ({ page }) => { await page.goto(FIXTURE); });

  test('heal broken grid row', async ({ page }) => {
    await page.heal.click(
      page.locator('tr.nonexistent-row'),
      'Table row with testid grid-row-1 containing Alice'
    );
    await expect(page.locator('[data-testid="grid-row-1"]')).toHaveClass(/selected/);
  });
});

test.describe('Self-Healing — ARIA Switch', () => {
  test.beforeEach(async ({ page }) => { await page.goto(FIXTURE); });

  test('heal broken switch toggle', async ({ page }) => {
    await page.heal.click(
      page.locator('#nonexistent-dark-mode-switch'),
      'Dark mode toggle switch'
    );
    await expect(page.locator('[data-testid="switch-dark"]')).toHaveAttribute('aria-checked', 'true');
  });
});

test.describe('Self-Healing — ARIA Checkbox', () => {
  test.beforeEach(async ({ page }) => { await page.goto(FIXTURE); });

  test('heal broken ARIA checkbox', async ({ page }) => {
    await page.heal.click(
      page.locator('.fake-aria-checkbox'),
      'ARIA Checkbox custom element'
    );
    await expect(page.locator('[data-testid="aria-checkbox"]')).toHaveAttribute('aria-checked', 'true');
  });
});

// ═══════════════════════════════════════════════════════════════════
//  AI-ONLY MODE — no selector at all (empty string)
//  The AI must find every element purely from the description.
// ═══════════════════════════════════════════════════════════════════

test.describe('AI-Only — Click', () => {
  test.beforeEach(async ({ page }) => { await page.goto(FIXTURE); });

  test('find primary button', async ({ page }) => {
    await page.heal.click('', 'Primary Button');
    expect(await logText(page)).toBe('button clicked');
  });

  test('find secondary button', async ({ page }) => {
    await page.heal.click('', 'Secondary Button');
    expect(await logText(page)).toBe('secondary clicked');
  });

  test('find navigation link', async ({ page }) => {
    await page.heal.click('', 'Navigation Link on the page');
    expect(await logText(page)).toBe('link clicked');
  });

  test('find notification bell image', async ({ page }) => {
    await page.heal.click('', 'Notification bell image icon');
    expect(await logText(page)).toBe('img clicked');
  });

  test('find list item by description', async ({ page }) => {
    await page.heal.click('', 'Clickable list item 2 in the unordered list');
    expect(await logText(page)).toBe('list item 2 clicked');
  });

  test('find summary to expand details', async ({ page }) => {
    await page.heal.click('', 'Summary element with text Click to expand');
    await expect(page.locator('#details-content')).toBeVisible();
  });

  test('find CSS-hidden checkbox label', async ({ page }) => {
    await page.heal.click('', 'Label with text Toggle hidden checkbox');
    expect(await logText(page)).toContain('css-hidden checkbox');
  });

  test('find custom focusable div button', async ({ page }) => {
    await page.heal.click('', 'Custom focusable div element that acts as a button');
    expect(await logText(page)).toBe('tabindex div clicked');
  });
});

test.describe('AI-Only — Fill', () => {
  test.beforeEach(async ({ page }) => { await page.goto(FIXTURE); });

  test('find name input', async ({ page }) => {
    await page.heal.fill('', 'Full name text input field', 'John Doe');
    await expect(page.locator('[data-testid="input-name"]')).toHaveValue('John Doe');
  });

  test('find email input', async ({ page }) => {
    await page.heal.fill('', 'Email address input field', 'test@example.com');
    await expect(page.locator('[data-testid="input-email"]')).toHaveValue('test@example.com');
  });

  test('find password input', async ({ page }) => {
    await page.heal.fill('', 'Password input field', 'secret123');
    await expect(page.locator('[data-testid="input-password"]')).toHaveValue('secret123');
  });

  test('find search input', async ({ page }) => {
    await page.heal.fill('', 'Search input field', 'healwright');
    await expect(page.locator('[data-testid="input-search"]')).toHaveValue('healwright');
  });

  test('find comment textarea', async ({ page }) => {
    await page.heal.fill('', 'Comment textarea', 'Great library!');
    await expect(page.locator('[data-testid="textarea-comment"]')).toHaveValue('Great library!');
  });

  test('find phone input', async ({ page }) => {
    await page.heal.fill('', 'Telephone input with placeholder Phone number', '+1234567890');
    await expect(page.locator('[data-testid="input-tel"]')).toHaveValue('+1234567890');
  });

  test('find URL input', async ({ page }) => {
    await page.heal.fill('', 'Website URL input field', 'https://healwright.dev');
    await expect(page.locator('[data-testid="input-url"]')).toHaveValue('https://healwright.dev');
  });

  test('find quantity number input', async ({ page }) => {
    await page.heal.fill('', 'Quantity number input field', '42');
    await expect(page.locator('[data-testid="input-number"]')).toHaveValue('42');
  });
});

test.describe('AI-Only — Check / Uncheck', () => {
  test.beforeEach(async ({ page }) => { await page.goto(FIXTURE); });

  test('find agree checkbox', async ({ page }) => {
    await page.heal.check('', 'I agree to terms checkbox');
    await expect(page.locator('[data-testid="cb-agree"]')).toBeChecked();
  });

  test('find and uncheck newsletter', async ({ page }) => {
    // Check first
    await page.locator('[data-testid="cb-newsletter"]').check();
    // AI uncheck
    await page.heal.uncheck('', 'Subscribe to newsletter checkbox');
    await expect(page.locator('[data-testid="cb-newsletter"]')).not.toBeChecked();
  });

  test('find Pro radio button', async ({ page }) => {
    await page.heal.check('', 'Pro plan radio button');
    await expect(page.locator('[data-testid="radio-pro"]')).toBeChecked();
  });
});

test.describe('AI-Only — Select Option', () => {
  test.beforeEach(async ({ page }) => { await page.goto(FIXTURE); });

  test('find color dropdown and select blue', async ({ page }) => {
    await page.heal.selectOption('', 'Color dropdown select', 'blue');
    await expect(page.locator('[data-testid="select-color"]')).toHaveValue('blue');
  });
});

test.describe('AI-Only — Double Click', () => {
  test.beforeEach(async ({ page }) => { await page.goto(FIXTURE); });

  test('find double-click text element', async ({ page }) => {
    await page.heal.dblclick('', 'Span element with text Double-click to edit me');
    expect(await logText(page)).toBe('dblclick to edit');
  });
});

test.describe.only('AI-Only — Hover', () => {
  test.beforeEach(async ({ page }) => { await page.goto(FIXTURE); });

  test('find hover container to reveal button', async ({ page }) => {
    await page.heal.hover('', 'Hover container with testid hover-container');
    await expect(page.locator('[data-testid="hover-reveal-btn"]')).toBeVisible();
  });

  test('find tooltip trigger element', async ({ page }) => {
    await page.heal.hover('', 'Tooltip trigger element with aria-label Element with tooltip');
    await expect(page.locator('#tooltip-box')).toBeVisible();
  });
});

test.describe('AI-Only — Focus', () => {
  test.beforeEach(async ({ page }) => { await page.goto(FIXTURE); });

  test('find focus input', async ({ page }) => {
    await page.heal.focus('', 'Input element with placeholder text Focus me');
    expect(await logText(page)).toBe('input focused');
  });

  test('find focusable button', async ({ page }) => {
    await page.heal.focus('', 'Button with text Focusable Button');
    expect(await logText(page)).toBe('button focused');
  });
});

test.describe.only('AI-Only — Tabs', () => {
  test.beforeEach(async ({ page }) => { await page.goto(FIXTURE); });

  test('find Details tab', async ({ page }) => {
    await page.heal.click('', 'Details tab in the tab bar');
    await expect(page.locator('#panel-details')).toBeVisible();
    await expect(page.locator('#panel-overview')).not.toBeVisible();
  });

  test('find Reviews tab', async ({ page }) => {
    await page.heal.click('', 'Reviews tab in the tab bar');
    await expect(page.locator('#panel-reviews')).toBeVisible();
  });
});

test.describe('AI-Only — Menu', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(FIXTURE);
    await page.heal.click('', 'Open Menu button');
  });

  test('find Cut menu item', async ({ page }) => {
    await page.heal.click('', 'Cut menu item');
    expect(await logText(page)).toBe('cut');
  });

  test('find Paste menu item', async ({ page }) => {
    await page.heal.click('', 'Paste menu item');
    expect(await logText(page)).toBe('paste');
  });
});

test.describe('AI-Only — Tree View', () => {
  test.beforeEach(async ({ page }) => { await page.goto(FIXTURE); });

  test('find index.ts tree item', async ({ page }) => {
    await page.heal.click('', 'Tree item for index.ts file');
    await expect(page.locator('[data-testid="tree-index"]')).toHaveClass(/selected/);
  });
});

test.describe('AI-Only — Data Grid', () => {
  test.beforeEach(async ({ page }) => { await page.goto(FIXTURE); });

  test('find first grid row with Alice', async ({ page }) => {
    await page.heal.click('', 'Table row with testid grid-row-1 containing Alice');
    await expect(page.locator('[data-testid="grid-row-1"]')).toHaveClass(/selected/);
  });
});

test.describe('AI-Only — Switch', () => {
  test.beforeEach(async ({ page }) => { await page.goto(FIXTURE); });

  test('find dark mode switch', async ({ page }) => {
    await page.heal.click('', 'Dark mode toggle switch');
    await expect(page.locator('[data-testid="switch-dark"]')).toHaveAttribute('aria-checked', 'true');
  });
});

// ═══════════════════════════════════════════════════════════════════
//  SELF-HEALING — HealingLocator API (page.heal.locator)
//  Tests the chainable locator API with broken selectors.
// ═══════════════════════════════════════════════════════════════════

test.describe('HealingLocator API', () => {
  test.beforeEach(async ({ page }) => { await page.goto(FIXTURE); });

  test('locator.fill — broken selector heals to name input', async ({ page }) => {
    await page.heal.locator('#totally-wrong-selector', 'Full name text input').fill('Jane Smith');
    await expect(page.locator('[data-testid="input-name"]')).toHaveValue('Jane Smith');
  });

  test('locator.click — broken selector heals to primary button', async ({ page }) => {
    await page.heal.locator('.nonexistent-btn', 'Primary Button').click();
    expect(await logText(page)).toBe('button clicked');
  });

  test('locator.dblclick — broken selector heals to editable text', async ({ page }) => {
    await page.heal.locator('span.wrong-dbl', 'Span element with text Double-click to edit me').dblclick();
    expect(await logText(page)).toBe('dblclick to edit');
  });

  test('locator.hover — broken selector heals to hover container', async ({ page }) => {
    await page.heal.locator('#wrong-hover', 'Hover container with testid hover-container').hover();
    await expect(page.locator('[data-testid="hover-reveal-btn"]')).toBeVisible();
  });

  test('locator.check — broken selector heals to agree checkbox', async ({ page }) => {
    await page.heal.locator('[data-testid="wrong-cb"]', 'I agree to terms checkbox').check();
    await expect(page.locator('[data-testid="cb-agree"]')).toBeChecked();
  });

  test('locator.uncheck — broken selector heals to newsletter checkbox', async ({ page }) => {
    await page.locator('[data-testid="cb-newsletter"]').check();
    await page.heal.locator('#fake-newsletter-cb', 'Subscribe to newsletter checkbox').uncheck();
    await expect(page.locator('[data-testid="cb-newsletter"]')).not.toBeChecked();
  });

  test('locator.focus — broken selector heals to focus input', async ({ page }) => {
    await page.heal.locator('.wrong-focus', 'Input element with placeholder text Focus me').focus();
    expect(await logText(page)).toBe('input focused');
  });

  test('locator.selectOption — broken selector heals to color select', async ({ page }) => {
    await page.heal.locator('#wrong-color-select', 'Color dropdown select').selectOption('green');
    await expect(page.locator('[data-testid="select-color"]')).toHaveValue('green');
  });
});
