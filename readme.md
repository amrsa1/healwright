<div align="center">
  <img src="./docs/owl.png" alt="Healwright Logo" width="150" style="margin-bottom: 20px;"/>
  
  # Healwright

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
# OpenAI (default) - also accepts AI_PROVIDER=gpt
export AI_API_KEY="your-openai-key"
export SELF_HEAL=1

# Anthropic Claude - also accepts AI_PROVIDER=claude
export AI_PROVIDER=anthropic
export AI_API_KEY="your-anthropic-key"
export SELF_HEAL=1

# Google Gemini - also accepts AI_PROVIDER=gemini  
export AI_PROVIDER=google
export AI_API_KEY="your-google-key"
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
| `heal.click(locator, desc, options?)` | Click an element |
| `heal.fill(locator, desc, value)` | Fill an input |
| `heal.selectOption(locator, desc, value)` | Select from dropdown |
| `heal.check(locator, desc)` | Check a checkbox |
| `heal.uncheck(locator, desc)` | Uncheck a checkbox |
| `heal.dblclick(locator, desc)` | Double-click |
| `heal.hover(locator, desc)` | Hover over element |
| `heal.focus(locator, desc)` | Focus element |
| `heal.locator(selector, desc)` | Create self-healing locator for chaining |

### Self-Healing Locator

Create a locator that combines a CSS selector with a semantic description. If the selector fails, AI takes over:

```typescript
// Combines selector with semantic fallback - best of both worlds
await page.heal.locator('.new-todo', 'Input field for new todos').fill('Buy milk');
await page.heal.locator('.submit-btn', 'Submit button').click();
await page.heal.locator('.toggle', 'Checkbox').check();
```

### AI-Only Mode

Pass an empty string as the locator and let AI find the element:

```typescript
await page.heal.click('', 'Login button');
await page.heal.fill('', 'Search input', 'my query');
```

This is useful when you don't have good selectors or want to make tests more readable.

### Force Click (Hidden Elements)

Some elements only appear on hover (like delete buttons). Use `{ force: true }` to click hidden elements:

```typescript
// First hover to reveal the element
await page.heal.hover('', 'Todo item in the list');

// Then force-click the hidden delete button
await page.heal.click('', 'Delete button', { force: true });
```

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
| `AI_API_KEY` | Your AI provider API key |
| `AI_PROVIDER` | `openai`/`gpt`, `anthropic`/`claude`, or `google`/`gemini` |
| `AI_MODEL` | Override the default model (optional) |

**Default models by provider:**
- **OpenAI:** `gpt-5.2`
- **Anthropic:** `claude-sonnet-4-5`
- **Google:** `gemini-3-flash`

### Fixture Options

You can pass options when creating the healing fixture:

```typescript
const test = base.extend<{ page: HealPage }>(createHealingFixture({
  maxCandidates: 30,  // Max DOM elements sent to AI (default: 30)
  maxAiTries: 4,      // Max AI strategies to validate (default: 4)
  timeout: 5000,      // Locator timeout in ms (default: 5000)
  provider: 'openai', // AI provider (default: 'openai')
  model: 'gpt-5.2',   // Override default model
}));
```

### Token Optimization

Healwright is designed to minimize AI token consumption and keep costs low:

- **Compact candidates** — Only non-null attributes are sent. Null/empty fields are stripped, and short keys are used (`tid` instead of `data-testid`, `txt` instead of `text`, etc.)
- **Invisible elements filtered** — Hidden elements (`display: none`, `visibility: hidden`, zero-size) are excluded before sending to the AI
- **Capped output** — The AI is asked to return a maximum of 3 strategies per request
- **Configurable limit** — Control how many DOM elements are analyzed with `maxCandidates`

Lower `maxCandidates` = fewer tokens = lower cost and faster responses. The default of 30 works well for most pages. For complex pages with many interactive elements, you can increase it:

```typescript
// Simple pages — fewer candidates, faster & cheaper
createHealingFixture({ maxCandidates: 15 })

// Complex pages — more candidates, better accuracy
createHealingFixture({ maxCandidates: 50 })
```

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

## Live Demo

<div align="center">
  <a href="https://youtu.be/qyHSG0K99i4">
    <img src="https://img.youtube.com/vi/qyHSG0K99i4/0.jpg" alt="healwright Demo Video" width="600"/>
  </a>
  <p><em>▶ Click to watch the demo on YouTube</em></p>
</div>

Want to see healwright in action without touching your own project? Check out the **[`test-published`](https://github.com/amrsa1/healwright/tree/test-published)** branch — a standalone mini-project that imports the published npm package and runs tests with intentionally broken selectors.

```bash
git clone -b test-published https://github.com/amrsa1/healwright.git healwright-demo
cd healwright-demo
npm install && npx playwright install chromium
cp example.env .env   # add your API key
npm test
```

It includes two smoke tests:
- **Broken locator** — uses a wrong selector (`#wrong-todo-input`), AI heals it to the real input
- **AI-only mode** — no selector at all, AI finds the element from a plain-English description

## Privacy & Security

When healing is triggered, healwright sends a **DOM snapshot** of candidate elements (tag names, roles, aria labels, text content, test IDs, etc.) to the configured AI provider's API. **No screenshots or full page HTML are sent** — only a structured list of relevant elements.

Keep this in mind if your application contains sensitive data in the DOM (e.g., PII, financial data, internal URLs). You can:
- Use a self-hosted or on-premise LLM by configuring a custom `AI_MODEL` and API endpoint
- Limit healing to non-production environments
- Review the candidate data sent via the `.self-heal/heal_events.jsonl` log

## Development

```bash
npm install
npm run build
SELF_HEAL=1 npm test
```

## License

MIT
