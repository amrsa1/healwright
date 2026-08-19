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
- **Multi-provider** - OpenAI, Anthropic, Google, or run locally with Ollama — your choice
- **Local LLM support** - Run completely offline with Ollama. No API keys, no cloud, full privacy
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

# Local LLM via Ollama — no API key, no cloud, fully offline!
export AI_PROVIDER=local
export SELF_HEAL=1
# Optional: pick a different model (default: gemma3:4b)
# export AI_MODEL="mistral"
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
| `heal.getLocator(selector, desc)` | Resolve to a real Playwright `Locator` (works with `expect`) |

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

### Assertions — `heal.getLocator()`

`heal.locator()` wraps a fixed set of actions. When you need the element itself — for an assertion,
for `.nth()`, for `press()`, for anything Playwright offers — use `getLocator()`. It returns a real
`Locator`, healed if the selector no longer matches:

```typescript
const badge = await page.heal.getLocator('.cart-count', 'Cart item count badge');
await expect(badge).toHaveText('1');

// Everything on Locator is available, because it *is* a Locator
const rows = await page.heal.getLocator('.order-row', 'Order history rows');
await expect(rows).toHaveCount(3);
await rows.nth(0).click();
```

This is usually the method you want. `heal.click(...)` and friends remain useful when you want the
action and the healing in one call.

### Trusting the Heal — confidence, modes, and the run summary

Self-healing has a failure mode that a crash does not: it can turn a real regression into a passing
test. If someone deletes the checkout button and the AI confidently clicks a different one, your
suite goes green and nobody finds out. Three controls exist so you decide when that is acceptable.

**`minConfidence`** rejects weak matches outright:

```typescript
createHealingFixture({ minConfidence: 0.75 })  // or HEALWRIGHT_MIN_CONFIDENCE=0.75
```

The model reports how sure it is about each strategy. Below the threshold, healwright fails the
action instead of guessing — the test breaks, which is the honest answer.

**`mode: 'warn'`** audits without changing behaviour. Healing runs, reports what it *would* have
done, then lets the original failure stand:

```bash
HEALWRIGHT_MODE=warn npx playwright test
```

Use it in CI to see how far your locators have drifted without letting healing paper over it.

**`getHealSummary()`** gives you the tally, so a build can fail on drift:

```typescript
// global-teardown.ts
import { getHealSummary } from 'healwright';

export default function () {
  const { healed, fromCache, entries } = getHealSummary();
  if (healed > 0) {
    console.error(`${healed} locator(s) needed healing — update the source selectors:`);
    for (const e of entries.filter(e => e.outcome === 'healed')) {
      console.error(`  ${e.action} "${e.contextName}" → ${JSON.stringify(e.strategy)}`);
    }
    process.exitCode = 1;
  }
}
```

Point `globalTeardown` at that file in `playwright.config.ts` and healing becomes a signal you act
on rather than one that hides.

### Custom Endpoints and Providers

Any OpenAI-compatible gateway works through `baseURL`:

```bash
export AI_PROVIDER=openai
export AI_BASE_URL="https://openrouter.ai/api/v1"
export AI_API_KEY="your-key"
export AI_MODEL="anthropic/claude-sonnet-4"
```

For anything else, implement `AIProvider` and pass it in — healwright never constructs a client of
its own when you do:

```typescript
import { createHealingFixture, type AIProvider } from 'healwright';

const myProvider: AIProvider = {
  name: 'openai',
  async generateHealPlan({ systemPrompt, userContent, jsonSchema }) {
    const plan = await callYourModel(systemPrompt, userContent, jsonSchema);
    return { plan, tokenUsage: null };
  },
};

export const test = base.extend<{ page: HealPage }>(
  createHealingFixture({ aiProvider: myProvider })
);
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
| `AI_PROVIDER` | `openai`/`gpt`, `anthropic`/`claude`, `google`/`gemini`, or `local`/`ollama` |
| `AI_MODEL` | Override the default model (optional) |
| `AI_BASE_URL` | Point a provider at a different endpoint — Azure, OpenRouter, vLLM, a gateway |
| `HEALWRIGHT_MODE` | `heal` (default), `warn` (report only), or `off` |
| `HEALWRIGHT_MIN_CONFIDENCE` | Reject heals scoring below this (0-1, default `0`) |
| `HEALWRIGHT_LOG` | `info` (default), `error`, or `silent` |
| `OLLAMA_HOST` | Ollama server URL (default: `http://127.0.0.1:11434`) |

**Default models by provider:**
- **OpenAI:** `gpt-5-nano`
- **Anthropic:** `claude-sonnet-4-20250514`
- **Google:** `gemini-2.5-flash`
- **Local (Ollama):** `gemma3:4b`

### Fixture Options

You can pass options when creating the healing fixture:

```typescript
const test = base.extend<{ page: HealPage }>(createHealingFixture({
  maxCandidates: 40,     // Ranked elements sent to the AI (default: 40)
  maxAiTries: 4,         // Max AI strategies to validate (default: 4)
  timeout: 5000,         // Healed-locator and action timeout in ms (default: 5000)
  quickTimeout: 1000,    // How long the original locator gets first (default: 1000 when healing)
  minConfidence: 0,      // Reject heals below this confidence, 0-1 (default: 0 = accept any)
  mode: 'heal',          // 'heal' | 'warn' (report only) | 'off'
  provider: 'openai',    // AI provider (default: 'openai')
  model: 'gpt-5-nano',   // Override default model
  baseURL: undefined,    // Custom API endpoint (Azure, OpenRouter, vLLM, gateway)
  logLevel: 'info',      // 'info' | 'error' | 'silent'
}));
```

> **A note on `quickTimeout`.** When healing is on, the original locator only gets 1 second before
> the AI takes over — a broken selector should fail fast. If your app legitimately renders slowly,
> raise this. Leaving it too low turns "slow" into "broken" and spends an AI call on it.

### Token Optimization

Healwright is designed to minimize AI token consumption and keep costs low:

- **Compact candidates** — Only non-null attributes are sent. Null/empty fields are stripped, and short keys are used (`tid` instead of `data-testid`, `txt` instead of `text`, etc.)
- **Hidden elements are marked, not dropped** — Elements that are `display: none`, `visibility: hidden` or zero-size are still sent, flagged with `hid: true`. Real apps hide the element you actually want (styled checkboxes, hover-revealed buttons), so excluding them would break more heals than it saves tokens on
- **Rank, then truncate** — Everything matching is collected first, then `rankCandidates()` scores each element by keyword match, tag-type inference, ARIA role relevance and test-ID presence. Only the top `maxCandidates` are sent. Ranking before truncation matters: cutting the list in DOM order first would hide the target on a long page
- **Capped output** — The AI is asked to return a maximum of 3 strategies per request
- **Configurable limit** — `maxCandidates` controls how many ranked elements reach the model

Lower `maxCandidates` = fewer tokens = lower cost and faster responses. The default of 40 works well for most pages:

```typescript
// Simple pages — fewer candidates, faster & cheaper
createHealingFixture({ maxCandidates: 15 })

// Complex pages — more candidates, better accuracy
createHealingFixture({ maxCandidates: 80 })
```

### Token Usage Visibility

Each healing call logs the token consumption reported by the AI provider:

```
↑ 1350 input · 180 output · 1530 total tokens
```

Token usage is also recorded in `.self-heal/heal_events.jsonl` for cost tracking and analysis across test runs.

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

Keep this in mind if your application contains sensitive data in the DOM (e.g., PII, financial data, internal URLs). Note that hidden elements are included in that snapshot (flagged `hid: true`), because the element
you want is often deliberately hidden. The page URL is also sent.

You can:
- **Use a local LLM** with `AI_PROVIDER=local` — data never leaves your machine
- **Point at a self-hosted or on-premise endpoint** with `AI_BASE_URL` (or the `baseURL` option) — works with Azure OpenAI, OpenRouter, vLLM, LiteLLM, or any OpenAI-compatible gateway
- **Bring your own provider** with the `aiProvider` option, for full control over what is sent
- Limit healing to non-production environments
- Review the candidate data sent via the `.self-heal/heal_events.jsonl` log

### Local LLM with Ollama

For maximum privacy and zero cost, run healing entirely on your machine with [Ollama](https://ollama.com):

```bash
# 1. Install Ollama (https://ollama.com) and pull a model
ollama pull gemma3:4b

# 2. Configure healwright
export AI_PROVIDER=local
export SELF_HEAL=1
```

That's it — no API keys, no cloud calls, no usage fees. Ollama runs the model locally and healwright talks to it directly.

**Recommended models for healing** (sorted by size):

| Model | Size | Context | Tested | Good for |
|-------|------|---------|--------|----------|
| `llama3.2:3b` ⭐ | 2.0 GB | 128K | 5/5 pass | Best overall choice — fast, accurate, and lightweight |
| `mistral` ⭐ | 4.1 GB | 128K | 5/5 pass | Most accurate response, but slowest (~1.4 min per run) |
| `gemma3:4b` | 3.3 GB | 128K | 4/5 pass | Faster than mistral (~53s), but slightly less accurate |

> **Best results were achieved with `mistral`, `gemma3:4b`, and `llama3.2:3b`** — these three models consistently produced the most accurate healing across our test suite. `llama3.2:3b` stands out as the best overall choice, combining top accuracy with a small footprint. We recommend starting with one of them.

> **Tip:** Small models (1B–4B) may struggle with ambiguous elements (e.g. multiple checkboxes on the same page). If accuracy matters more than speed, use `mistral` or a larger model.

You can use **any model** from the [Ollama library](https://ollama.com/library) — just set `AI_MODEL`:

```bash
export AI_MODEL=llama3.2:3b   #or mistral, etc.
```

Custom Ollama host (e.g., running on another machine):

```bash
export OLLAMA_HOST=http://192.168.1.100:11434
```

## Development

```bash
npm install
npm run build
SELF_HEAL=1 npm test
```

## License

MIT
