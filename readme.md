<div align="center">
  <img src="./healw_icon.png" alt="Healwright Logo" width="300"/>
  
  # healwright

  AI-powered self-healing locators for Playwright. When your selectors break, healwright figures out what you meant and finds the element anyway.

  [![npm version](https://badge.fury.io/js/healwright.svg)](https://www.npmjs.com/package/healwright)
  [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
</div>

## Why?

We've all been there. You write a solid test suite, everything passes, then the frontend team refactors something and half your locators break. You spend hours updating selectors instead of writing actual tests.

Healwright fixes this. It wraps your Playwright page with AI-powered healing that kicks in when locators fail. You can also skip selectors entirely and just describe what you're looking for in plain English.

## Features

- **Self-healing locators** - When a selector breaks, AI analyzes the page and finds the right element
- **AI-only mode** - Just describe the element, no selector needed
- **Caching** - Healed selectors are saved so you don't burn API calls on every run
- **Drop-in** - Works with your existing Playwright setup

## Installation

```bash
npm install healwright
```

## Quick Start

Set your API key and enable healing:

```bash
export AI_API_KEY="your-openai-key"
export SELF_HEAL=1
```

Create a fixture:

```typescript
// fixtures.ts
import { test as base } from '@playwright/test';
import { createHealingFixture, HealPage } from 'healwright';

export const test = base.extend<{ page: HealPage }>(createHealingFixture());
export { expect } from '@playwright/test';
```

Use it in your tests:

```typescript
import { test, expect } from './fixtures';

test('login flow', async ({ page }) => {
  await page.goto('https://example.com');
  
  // If this selector breaks, AI will find the right element
  await page.heal.click(
    page.locator('[data-testid="submit-btn"]'),
    'Submit button on form'
  );
  
  // Or skip the selector entirely - just describe what you want
  await page.heal.fill('', 'Email input field', 'user@example.com');
});
```

## API

### `withHealing(page)`

Wraps a Playwright page with healing methods:

```typescript
import { withHealing } from 'healwright';

const healPage = withHealing(page);
await healPage.heal.click(locator, 'Button description');
```

### `createHealingFixture()`

Creates a test fixture that automatically wraps the page:

```typescript
import { test as base } from '@playwright/test';
import { createHealingFixture, HealPage } from 'healwright';

export const test = base.extend<{ page: HealPage }>(createHealingFixture());
```

### Available Methods

All methods take a locator (or empty string for AI-only) and a description:

| Method | What it does |
|--------|-------------|
| `heal.click(locator, desc)` | Click an element |
| `heal.fill(locator, desc, value)` | Fill an input |
| `heal.selectOption(locator, desc, value)` | Select from dropdown |
| `heal.check(locator, desc)` | Check a checkbox |
| `heal.dblclick(locator, desc)` | Double-click |
| `heal.hover(locator, desc)` | Hover over element |
| `heal.focus(locator, desc)` | Focus element |

### AI-Only Mode

Pass an empty string as the locator and let AI find the element:

```typescript
await page.heal.click('', 'Login button');
await page.heal.fill('', 'Search input', 'my query');
```

This is useful when you don't have good selectors or want to make tests more readable.

### Mixing Healing with Regular Playwright

Just because you've added healwright doesn't mean you have to use `page.heal.*` for everything. The wrapped page still works exactly like a normal Playwright page, so you can mix and match as needed:

```typescript
// Use healing for elements that tend to break
await page.heal.fill('', 'Input field for new todo items', 'Buy groceries');

// Use regular Playwright for stable selectors
await page.fill('#username', 'testuser');
await page.click('button[type="submit"]');
```

Pick the approach that makes sense for each action. Maybe you use healing for that flaky third-party widget but stick with regular locators for your own well-structured components. It's your call.

## Configuration

### Environment Variables

| Variable | Description |
|----------|-------------|
| `SELF_HEAL` | Set to `1` to enable healing |
| `AI_API_KEY` | Your OpenAI API key |

### Cache

Healed selectors get cached in `.self-heal/`. Add it to your `.gitignore`:

```
.self-heal/
```

## How It Works

1. Try the original locator
2. If it fails, check the cache for a previously healed selector
3. If not cached, send page context to the AI and ask it to find the element
4. Cache the result for next time

## Example

```typescript
import { test as base, expect } from '@playwright/test';
import { createHealingFixture, HealPage } from 'healwright';

const test = base.extend<{ page: HealPage }>(createHealingFixture());

test('checkout flow', async ({ page }) => {
  await page.goto('/shop');
  
  // These might break when the UI changes, but healwright will adapt
  await page.heal.click(
    page.locator('[data-testid="add-to-cart"]'),
    'Add to cart button'
  );
  
  await page.heal.click(
    page.locator('.cart-icon'),
    'Shopping cart icon'
  );
  
  await page.heal.fill(
    page.locator('#email'),
    'Email field in checkout',
    'customer@example.com'
  );
  
  // No selector at all - just describe it
  await page.heal.click('', 'Place order button');
});
```

## Development

```bash
npm install
npm run build
SELF_HEAL=1 npm test
```

## License

MIT
