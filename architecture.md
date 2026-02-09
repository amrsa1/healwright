# Healwright - Technical Architecture

## Overview

Healwright is an AI-powered self-healing locator system for Playwright. When a locator fails, it captures a DOM snapshot, asks AI to identify the correct element, validates the suggestion, and caches the healed strategy for future runs.

**Key Features:**
- Multi-provider support (OpenAI, Anthropic Claude, Google Gemini)
- Self-healing locators with semantic fallback
- Chainable `heal.locator()` API for clean syntax
- Force click support for hover-dependent elements
- Smart caching to minimize API calls

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              TEST EXECUTION                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌──────────────┐     ┌──────────────┐     ┌─────────────────┐             │
│   │  Test File   │────▶│  Fixture     │────▶│  withHealing()  │             │
│   │  (.test.ts)  │     │  (HealPage)  │     │  (healwright.ts)│             │
│   └──────────────┘     └──────────────┘     └────────┬────────┘             │
│                                                       │                      │
│                              ┌────────────────────────┼────────────────┐     │
│                              │                        ▼                │     │
│                              │           ┌────────────────────┐        │     │
│                              │           │  Original Locator  │        │     │
│                              │           │     Attempt        │        │     │
│                              │           └─────────┬──────────┘        │     │
│                              │                     │                   │     │
│                              │           ┌─────────▼──────────┐        │     │
│                              │           │    Success?        │        │     │
│                              │           └─────────┬──────────┘        │     │
│                              │                YES  │  NO               │     │
│                              │              ┌──────┴──────┐            │     │
│                              │              ▼             ▼            │     │
│                              │         ┌────────┐  ┌─────────────┐     │     │
│                              │         │ Return │  │ Check Cache │     │     │
│                              │         └────────┘  └──────┬──────┘     │     │
│                              │                            │            │     │
│                              │                  ┌─────────▼──────────┐ │     │
│                              │                  │   Cache Hit?       │ │     │
│                              │                  └─────────┬──────────┘ │     │
│                              │                       YES  │  NO        │     │
│                              │                     ┌──────┴──────┐     │     │
│                              │                     ▼             ▼     │     │
│                              │              ┌──────────┐  ┌─────────┐  │     │
│                              │              │Use Cached│  │ Ask AI  │  │     │
│                              │              │ Strategy │  │Provider │  │     │
│                              │              └────┬─────┘  └────┬────┘  │     │
│                              │                   │             │       │     │
│                              │                   │   ┌─────────▼─────┐ │     │
│                              │                   │   │ Validate &    │ │     │
│                              │                   │   │ Pick Best     │ │     │
│                              │                   │   └───────┬───────┘ │     │
│                              │                   │           │         │     │
│                              │                   │   ┌───────▼───────┐ │     │
│                              │                   │   │ Save to Cache │ │     │
│                              │                   │   └───────┬───────┘ │     │
│                              │                   │           │         │     │
│                              │                   └─────┬─────┘         │     │
│                              │                         ▼               │     │
│                              │                ┌────────────────┐       │     │
│                              │                │ Execute Action │       │     │
│                              │                └────────────────┘       │     │
│                              │                                         │     │
│                              │          HEALWRIGHT (healwright.ts)     │     │
│                              └─────────────────────────────────────────┘     │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│                              AI PROVIDERS                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐            │
│   │    OpenAI       │   │   Anthropic     │   │     Google      │            │
│   │  (gpt-4o-mini)  │   │  (claude-sonnet)│   │ (gemini-2.5)    │            │
│   │                 │   │                 │   │                 │            │
│   │ Aliases: gpt    │   │ Aliases: claude │   │ Aliases: gemini │            │
│   └─────────────────┘   └─────────────────┘   └─────────────────┘            │
│              │                   │                    │                      │
│              └───────────────────┼────────────────────┘                      │
│                                  ▼                                           │
│                     ┌────────────────────────┐                               │
│                     │   AIProvider Interface │                               │
│                     │   generateHealPlan()   │                               │
│                     └────────────────────────┘                               │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│                              FILE SYSTEM                                     │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   .self-heal/                                                                │
│   ├── healed_locators.json    # Cached strategies (commit to repo)           │
│   └── heal_events.jsonl       # Event log (gitignore)                        │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. Main API (`src/healwright.ts`)

The library exports two main functions:

```typescript
import { withHealing, createHealingFixture, HealPage } from 'healwright';

// Option 1: Wrap a page directly
const healPage = withHealing(page);

// Option 2: Use as a Playwright fixture
const test = base.extend<{ page: HealPage }>(createHealingFixture());
```

### 2. HealMethods Interface

Available methods on `page.heal`:

| Method | Signature | Description |
|--------|-----------|-------------|
| `locator` | `locator(selector, desc): HealingLocator` | Chainable self-healing locator |
| `click` | `click(loc, desc, opts?): Promise<void>` | Click with optional `{ force: true }` |
| `fill` | `fill(loc, desc, value): Promise<void>` | Fill input field |
| `selectOption` | `selectOption(loc, desc, value): Promise<void>` | Select dropdown option |
| `check` | `check(loc, desc): Promise<void>` | Check checkbox/radio |
| `dblclick` | `dblclick(loc, desc): Promise<void>` | Double-click |
| `hover` | `hover(loc, desc): Promise<void>` | Hover over element |
| `focus` | `focus(loc, desc): Promise<void>` | Focus element |
| `setTestName` | `setTestName(name): void` | Set test name for cache metadata |

### 3. HealingLocator Interface

Chainable locator with self-healing:

```typescript
// Returns a HealingLocator that can be chained
const input = page.heal.locator('.new-todo', 'Input for new todos');
await input.fill('Buy milk');
await input.click();
await input.hover();
```

### 4. AI Provider Abstraction (`src/providers/`)

```
src/providers/
├── types.ts      # AIProvider interface, ProviderName, DEFAULT_MODELS
├── index.ts      # Factory function and exports
├── openai.ts     # OpenAI provider implementation
├── anthropic.ts  # Anthropic Claude provider
└── google.ts     # Google Gemini provider
```

**Provider Interface:**
```typescript
interface AIProvider {
  readonly name: ProviderName;
  generateHealPlan(input: GenerateHealPlanInput): Promise<HealPlanT | null>;
}
```

**Supported Providers and Aliases:**

| Provider | Alias | Default Model |
|----------|-------|---------------|
| `openai` | `gpt` | `gpt-4o-mini` |
| `anthropic` | `claude` | `claude-sonnet-4-20250514` |
| `google` | `gemini` | `gemini-2.5-flash` |

### 5. Strategy Types

The AI can suggest 6 locator strategies:

| Type | Playwright Method | Example |
|------|------------------|---------|
| `testid` | `getByTestId()` | `page.getByTestId("submit-btn")` |
| `role` | `getByRole()` | `page.getByRole("button", { name: "Submit" })` |
| `label` | `getByLabel()` | `page.getByLabel("Email")` |
| `placeholder` | `getByPlaceholder()` | `page.getByPlaceholder("Enter email")` |
| `text` | `getByText()` | `page.getByText("Click here")` |
| `css` | `locator()` | `page.locator("#submit-btn")` |

### 6. Candidate Collection

When healing, the system collects potential elements from the DOM:

- **For click actions**: `button, [role='button'], a, input[type='button'], input[type='submit'], [onclick], [role='menuitem'], [role='tab'], [role='combobox'], select`
- **For fill actions**: `input, textarea, [contenteditable='true'], [role='textbox'], select, [role='combobox']`

Each candidate includes:
- `tag` - HTML tag name
- `role` - ARIA role
- `ariaLabel` - aria-label attribute
- `nameAttr` - name attribute
- `placeholder` - placeholder attribute
- `type` - input type
- `href` - link href
- `id` - element id
- `test` - data-testid (with attribute name)
- `text` - visible text content
- `visible` - visibility status

## Execution Flow

### Phase 1: Initial Attempt
```
1. Test calls page.heal.click(locator, "Submit button")
2. Check if target is a valid locator (not empty string)
3. If valid: waitForReady() → execute action
4. If SUCCESS → return immediately
5. If FAIL → proceed to Phase 2
```

### Phase 2: Cache Lookup
```
1. Generate cache key: "{action}::{origin}{pathname}::{contextName}"
   Example: "click::https://example.com/login::Submit button"
2. Check in-memory cache (Map)
3. If miss, check disk cache (.self-heal/healed_locators.json)
4. If HIT → build locator, validate, execute action
5. If stale (element changed) → proceed to Phase 3
6. If MISS → proceed to Phase 3
```

### Phase 3: AI Healing
```
1. Collect DOM candidates (max 120 elements)
2. Create AI provider based on environment
3. Send to AI with context:
   - Action type (click/fill)
   - Context name ("Submit button")
   - Candidate list with attributes
   - JSON schema for structured output
4. AI returns ranked strategies with confidence scores
5. Validate each candidate (pickValid):
   - Build locator from strategy
   - Check count === 1
   - Check isVisible() === true (unless force: true)
6. Use first valid candidate
7. Save to cache (memory + disk)
8. Execute action with healed locator
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `SELF_HEAL` | Enable healing (`"1"`) | disabled |
| `AI_API_KEY` | API key for chosen provider | required |
| `AI_PROVIDER` | `openai`/`gpt`, `anthropic`/`claude`, `google`/`gemini` | `openai` |
| `AI_MODEL` | Override default model | provider default |

### HealOptions

```typescript
interface HealOptions {
  enabled?: boolean;        // Enable/disable healing
  provider?: ProviderName;  // AI provider to use
  model?: string;           // Override default model
  apiKey?: string;          // API key (or use AI_API_KEY env)
  cacheFile?: string;       // Default: ".self-heal/healed_locators.json"
  reportFile?: string;      // Default: ".self-heal/heal_events.jsonl"
  maxAiTries?: number;      // Max candidates to validate (default: 4)
  timeout?: number;         // Timeout for healed locators (default: 5000)
  testName?: string;        // For cache metadata
}
```

### ClickOptions

```typescript
interface ClickOptions {
  force?: boolean;  // Click hidden elements (hover-dependent)
}
```

When `force: true`:
- Skips visibility check in `pickValid`
- Skips `waitForReady` before action
- Uses `dispatchEvent('click')` instead of regular click (works on `display: none`)

## Cache Format

### `healed_locators.json`

```json
{
  "click::https://todomvc.com/examples/react/dist/::Todo item checkbox": {
    "type": "css",
    "selector": "li .toggle",
    "context": "Todo item checkbox",
    "testName": "AI-Only Mode: complete todo"
  },
  "fill::https://example.com/login::Email input": {
    "type": "placeholder",
    "text": "Enter your email",
    "exact": true,
    "context": "Email input",
    "testName": "Login flow test"
  }
}
```

### `heal_events.jsonl`

```json
{"ts":"2026-01-28T20:00:00.000Z","url":"https://todomvc.com/...","key":"click::...","action":"click","contextName":"Submit button","used":"healed","success":true,"confidence":0.95,"why":"Button matches context","strategy":{"type":"role","role":"button","name":"Submit"}}
```

## Usage Examples

### Basic Usage with Fixture

```typescript
// fixtures.ts
import { test as base } from '@playwright/test';
import { createHealingFixture, HealPage } from 'healwright';

export const test = base.extend<{ page: HealPage }>(createHealingFixture());
export { expect } from '@playwright/test';
```

```typescript
// my.test.ts
import { test, expect } from './fixtures';

test('login flow', async ({ page }) => {
  await page.goto('https://example.com');
  
  // Chainable self-healing locator
  await page.heal.locator('.email-input', 'Email input field').fill('user@example.com');
  
  // AI-only mode (empty locator)
  await page.heal.click('', 'Login button');
  
  // Regular Playwright still works
  await expect(page.locator('.dashboard')).toBeVisible();
});
```

### Handling Hover-Dependent Elements

```typescript
test('delete todo', async ({ page }) => {
  // Hover to reveal delete button
  await page.heal.hover('', 'Todo item in list');
  
  // Force click the hidden button
  await page.heal.click('', 'Delete button', { force: true });
});
```

### Self-Healing Mode (Broken Locators)

```typescript
test('heal broken locator', async ({ page }) => {
  // This locator is wrong, but healing will fix it
  const brokenLocator = page.locator('.wrong-selector');
  
  await page.heal.click(brokenLocator, 'Submit button');
  // AI finds the correct element based on the description
});
```

### Running Tests

```bash
# Normal run (no healing)
npx playwright test

# With self-healing enabled (OpenAI default)
SELF_HEAL=1 AI_API_KEY=sk-... npx playwright test

# With Anthropic Claude
SELF_HEAL=1 AI_PROVIDER=claude AI_API_KEY=sk-ant-... npx playwright test

# With Google Gemini
SELF_HEAL=1 AI_PROVIDER=gemini AI_API_KEY=... npx playwright test
```

## File Structure

```
healwright/
├── src/
│   ├── index.ts           # Public exports
│   ├── healwright.ts      # Main healing logic (withHealing, createHealingFixture)
│   ├── types.ts           # TypeScript types, Zod schemas, HealError
│   ├── utils.ts           # Utility functions (buildLocator, collectCandidates)
│   ├── logger.ts          # Console logging with colors
│   └── providers/
│       ├── index.ts       # Provider factory
│       ├── types.ts       # AIProvider interface
│       ├── openai.ts      # OpenAI implementation
│       ├── anthropic.ts   # Anthropic implementation
│       └── google.ts      # Google Gemini implementation
├── examples/
│   └── todomvc.test.ts    # Example tests
├── docs/
│   ├── index.html         # GitHub Pages landing
│   ├── get-started.html   # Getting started guide
│   └── style.css          # Documentation styles
├── .self-heal/
│   ├── healed_locators.json
│   └── heal_events.jsonl
└── dist/                  # Built output (ESM + CJS + types)
```

## Console Output

```
┌─ ◈ AI DETECT Submit button
│  ⬡ analyzing 16 elements...
│  ↳ received 892 chars
│
└─ ✓ Submit button
   → getByRole("button", { name: "Submit" })

┌─ ⚡ CLICK Toggle checkbox
│  ◆ cached
│
└─ ✓ Healed from cache

┌─ ◈ AI DETECT Delete button
│  ⬡ analyzing 12 elements...
│  ↳ [testid] skipped: not visible
│
└─ ✓ Delete button
   → locator("button.destroy")
```

## Performance Optimizations

| Optimization | Impact |
|--------------|--------|
| Quick timeout (1s) for initial attempts | Fail fast when locator is broken |
| Lazy-loaded disk cache | Read once, not on every action |
| In-memory cache (Map) | O(1) lookups during test run |
| Cache staleness detection | Re-heal only when DOM changes |
| Structured output (JSON schema) | More reliable AI responses |
| `dispatchEvent` for force click | Works on `display: none` elements |

## Best Practices

1. **Use descriptive context names** - The AI uses this to identify elements
   ```typescript
   // Good
   await page.heal.click('', 'Submit feedback button');
   
   // Bad
   await page.heal.click('', 'button');
   ```

2. **Use `heal.locator()` for chainable syntax**
   ```typescript
   await page.heal.locator('.submit', 'Submit button').click();
   ```

3. **Use `force: true` for hover-dependent elements**
   ```typescript
   await page.heal.hover('', 'Todo item');
   await page.heal.click('', 'Delete button', { force: true });
   ```

4. **Commit healed_locators.json** - Share cached strategies with team

5. **Review heal_events.jsonl** - Monitor which locators need healing

6. **Fix source locators eventually** - Self-healing is a safety net, not permanent

## Limitations

- Requires AI API key and internet connection
- AI responses add latency (~1-2s per heal)
- Max 120 candidates collected per heal
- Cannot heal across iframes (yet)
- Force click only works with `dispatchEvent` (no pointer coordinates)

## Error Handling

Custom `HealError` class provides detailed context:

```
HealError:
╭───────────────────────────────────────────────────────────╮
│  🔍 HEALWRIGHT: Element Not Found                       │
╰───────────────────────────────────────────────────────────╯

  ❌ Could not find a matching element

  📋 Context:
     • Action: CLICK
     • Looking for: "Delete button"
     • Page URL: https://todomvc.com/examples/react/dist/
     • Candidates analyzed: 16

  ⚠️  Strategies tried:
     • [testid] skipped: not visible
     • [css] rejected: count=0

  💡 Tips:
     • Make sure the element exists on the page
     • Try a more specific description
```
