# AI Self-Healing Locators - Technical Architecture

## Overview

The AI Self-Healing system automatically fixes broken Playwright locators at runtime using OpenAI's GPT models. When a locator fails, the system captures a DOM snapshot, asks AI to identify the correct element, validates the suggestion, and caches the healed strategy for future runs.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              TEST EXECUTION                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌──────────────┐     ┌──────────────┐     ┌──────────────┐                │
│   │  Test File   │────▶│  Page Object │────▶│ Heal Wrapper │                │
│   │  (.test.ts)  │     │  (.ts)       │     │  (heal.ts)   │                │
│   └──────────────┘     └──────────────┘     └──────┬───────┘                │
│                                                     │                       │
│                              ┌──────────────────────┼──────────────────┐    │
│                              │                      ▼                  │    │
│                              │         ┌────────────────────┐          │    │
│                              │         │  Original Locator  │          │    │
│                              │         │     Attempt        │          │    │
│                              │         └─────────┬──────────┘          │    │
│                              │                   │                     │    │
│                              │         ┌─────────▼──────────┐          │    │
│                              │         │    Success?        │          │    │
│                              │         └─────────┬──────────┘          │    │
│                              │              YES  │  NO                 │    │
│                              │            ┌──────┴──────┐              │    │
│                              │            ▼             ▼              │    │
│                              │       ┌────────┐  ┌─────────────┐       │    │
│                              │       │ Return │  │ Check Cache │       │    │
│                              │       └────────┘  └──────┬──────┘       │    │
│                              │                          │              │    │
│                              │                ┌─────────▼──────────┐   │    │
│                              │                │   Cache Hit?       │   │    │
│                              │                └─────────┬──────────┘   │    │
│                              │                     YES  │  NO          │    │
│                              │                   ┌──────┴──────┐       │    │
│                              │                   ▼             ▼       │    │
│                              │            ┌──────────┐  ┌───────────┐  │    │
│                              │            │Use Cached│  │  Ask AI   │  │    │
│                              │            │ Strategy │  │ (OpenAI)  │  │    │
│                              │            └────┬─────┘  └─────┬─────┘  │    │
│                              │                 │              │        │    │
│                              │                 │    ┌─────────▼─────┐  │    │
│                              │                 │    │ Validate &    │  │    │
│                              │                 │    │ Pick Best     │  │    │
│                              │                 │    └───────┬───────┘  │    │
│                              │                 │            │          │    │
│                              │                 │    ┌───────▼───────┐  │    │
│                              │                 │    │ Save to Cache │  │    │
│                              │                 │    └───────┬───────┘  │    │
│                              │                 │            │          │    │
│                              │                 └─────┬──────┘          │    │
│                              │                       ▼                 │    │
│                              │              ┌────────────────┐         │    │
│                              │              │ Execute Action │         │    │
│                              │              └────────────────┘         │    │
│                              │                                         │    │
│                              │            HEAL WRAPPER (heal.ts)       │    │
│                              └─────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                              EXTERNAL SERVICES                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌──────────────────┐              ┌──────────────────────────────────┐    │
│   │    OpenAI API    │              │         File System              │    │
│   │   (gpt-4o-mini)  │              │                                  │    │
│   │                  │              │  .self-heal/                     │    │
│   │  - DOM Analysis  │              │  ├── healed_locators.json        │    │
│   │  - Strategy Gen  │              │  └── heal_events.jsonl           │    │
│   └──────────────────┘              └──────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. Heal Wrapper (`src/utils/heal.ts`)

The main entry point that wraps Playwright actions with self-healing capabilities.

```typescript
import { heal } from "../utils/heal";

// Available methods (match Playwright API)
await heal.click(page, locator, "Button description");
await heal.fill(page, locator, "Input description", value);
await heal.selectOption(page, locator, "Dropdown description", value);
await heal.dblclick(page, locator, "Element description");
await heal.check(page, locator, "Checkbox description");
await heal.hover(page, locator, "Element description");
await heal.focus(page, locator, "Element description");

// Set test name for cache metadata
heal.setTestName(testInfo.title);
```

### 2. Strategy Types

The AI can suggest 6 locator strategies:

| Type | Playwright Method | Example |
|------|------------------|---------|
| `testid` | `getByTestId()` | `page.getByTestId("submit-btn")` |
| `role` | `getByRole()` | `page.getByRole("button", { name: "Submit" })` |
| `label` | `getByLabel()` | `page.getByLabel("Email")` |
| `placeholder` | `getByPlaceholder()` | `page.getByPlaceholder("Enter email")` |
| `text` | `getByText()` | `page.getByText("Click here")` |
| `css` | `locator()` | `page.locator("#submit-btn")` |

### 3. Candidate Collection

When healing, the system collects potential elements from the DOM:

- **For click actions**: `button, [role='button'], a, input[type='button'], input[type='submit'], [onclick], [role='menuitem'], [role='tab'], [role='combobox'], select`
- **For fill actions**: `input, textarea, [contenteditable='true'], [role='textbox'], select, [role='combobox']`

Each candidate includes:
- `testId` - data-testid attribute
- `id` - element id
- `role` - ARIA role
- `name` - accessible name
- `tag` - HTML tag
- `text` - visible text
- `placeholder` - placeholder attribute

## Execution Flow

### Phase 1: Initial Attempt
```
1. Test calls heal.click(page, locator, "Submit button")
2. waitForReady() - wait for element visibility (quickTimeout: 1s)
3. Execute action (click/fill/etc)
4. If SUCCESS → return immediately
5. If FAIL → proceed to Phase 2
```

### Phase 2: Cache Lookup
```
1. Generate cache key: "{action}::{url}::{contextName}"
   Example: "click::http://localhost:3001/feedback::Submit button"
2. Check in-memory cache (Map)
3. If miss, check disk cache (.self-heal/healed_locators.json)
4. If HIT → build locator, execute action
5. If MISS → proceed to Phase 3
```

### Phase 3: AI Healing
```
1. Collect DOM candidates (max 120 elements)
2. Send to OpenAI with context:
   - Action type (click/fill)
   - Context name ("Submit button")
   - Candidate list with attributes
3. AI returns ranked strategies with confidence scores
4. Validate each candidate:
   - Build locator from strategy
   - Check count === 1
   - Check isVisible() === true
5. Use first valid candidate
6. Save to cache (memory + disk)
7. Execute action with healed locator
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `SELF_HEAL` | Enable healing (`"1"`) | disabled |
| `AI_API_KEY` | OpenAI API key | required |
| `AI_MODEL` | Model to use | `gpt-4o-mini` |

### Healer Options

```typescript
const heal = createHealer({
  enabled: true,           // Enable/disable healing
  model: "gpt-4o-mini",   // OpenAI model
  cacheFile: ".self-heal/healed_locators.json",
  reportFile: ".self-heal/heal_events.jsonl",
  maxAiTries: 4,          // Max candidates to validate
  timeout: 5000,          // Timeout for healed locators
  testName: "Test name",  // For cache metadata
});
```

### Timeouts

| Timeout | Value | Purpose |
|---------|-------|---------|
| `quickTimeout` | 1000ms | Initial attempt (fail fast) |
| `timeout` | 5000ms | Healed locator validation |

## Cache Format

### `healed_locators.json`

```json
{
  "click::http://localhost:3001/feedback::Create new feedback button": {
    "type": "role",
    "value": null,
    "selector": null,
    "role": "button",
    "name": "Create New",
    "text": null,
    "exact": true,
    "context": "Create new feedback button",
    "testName": "[Mobile/Desktop] Should be able to submit new feedback"
  },
  "fill::http://localhost:3001/feedback::Feedback title input": {
    "type": "css",
    "value": null,
    "selector": "input#title",
    "role": null,
    "name": null,
    "text": null,
    "exact": null,
    "context": "Feedback title input",
    "testName": "[Mobile/Desktop] Should be able to submit new feedback"
  }
}
```

### `heal_events.jsonl`

```json
{"ts":"2026-01-19T12:00:00.000Z","url":"http://localhost:3001/feedback","key":"click::http://localhost:3001/feedback::Submit button","action":"click","contextName":"Submit button","used":"healed","success":true,"confidence":0.95,"why":"Button with accessible name 'Submit' matches the context","strategy":{"type":"role","role":"button","name":"Submit"}}
```

## Usage Examples

### Page Object Pattern

```typescript
// src/pages/feedbackPage.ts
import { Page } from "playwright-core";
import { heal } from "../utils/heal";

export default class FeedbackPage {
  constructor(private page: Page) {}

  // Locators (can be broken - healing will fix them)
  get submitButton() {
    return this.page.getByTestId("wrong-test-id");
  }

  // Actions use heal wrapper
  async submitFeedback() {
    await heal.click(this.page, this.submitButton, "Submit feedback button");
  }
}
```

### Test Fixture Integration

```typescript
// src/utils/fixture.ts
import { test as base } from "@playwright/test";
import { heal } from "./heal";

const fixtures = base.extend({
  feedbackPage: async ({ page }, use, testInfo) => {
    // Set test name for cache metadata
    heal.setTestName(testInfo.title);
    const feedbackPage = new FeedbackPage(page);
    await use(feedbackPage);
  },
});
```

### Running Tests

```bash
# Normal run (no healing)
npx playwright test

# With self-healing enabled
SELF_HEAL=1 npx playwright test

# With specific model
SELF_HEAL=1 AI_MODEL=gpt-4o npx playwright test
```

## Performance Optimizations

| Optimization | Impact |
|--------------|--------|
| Quick timeout (1s) for initial attempts | Fail fast when locator is broken |
| Lazy-loaded disk cache | Read once, not on every action |
| In-memory cache (Map) | O(1) lookups during test run |
| Non-blocking logging | Fire and forget, no await |
| Simplified waitForReady | Only visibility check, Playwright handles the rest |
| Single banner per test | Cleaner console output |

### Performance Comparison

| Scenario | Without Optimization | With Optimization |
|----------|---------------------|-------------------|
| 5 healed actions (cached) | ~28s | ~9s |

## Console Output

```
 🔧 AI SELF-HEALING 
──────────────────────────────────────────────────
⚠️ CLICK failed for "Create new feedback button"
💾 Using cached strategy for "Create new feedback button"
⚠️ FILL failed for "Feedback title input"
🤖 Asking AI to heal "Feedback title input" (3 candidates)...
   • AI response received (778 chars)
   • Candidate [testid] rejected: count=0
   • Candidate [placeholder] rejected: missing 'text'
✅ HEALED "Feedback title input" → locator("input#title")
──────────────────────────────────────────────────
```

## File Structure

```
qa-world/
├── src/
│   ├── pages/
│   │   └── feedbackPage.ts    # Page objects use heal wrapper
│   ├── tests/
│   │   └── feedbackPage.test.ts
│   └── utils/
│       ├── heal.ts            # Self-healing implementation
│       └── fixture.ts         # Test fixtures with heal integration
├── .self-heal/
│   ├── healed_locators.json   # Cached strategies (commit to repo)
│   └── heal_events.jsonl      # Event log (gitignore)
└── docs/
    └── AI_SELF_HEALING.md     # This document
```

## Best Practices

1. **Use descriptive context names** - The AI uses this to identify elements
   ```typescript
   // Good
   await heal.click(page, locator, "Submit feedback button");
   
   // Bad
   await heal.click(page, locator, "button");
   ```

2. **Commit healed_locators.json** - Share cached strategies with team

3. **Review heal_events.jsonl** - Monitor which locators need healing

4. **Fix source locators** - Self-healing is a safety net, not a permanent solution

5. **Use semantic locators in code** - Even if broken, prefer `getByRole` over CSS

## Limitations

- Requires OpenAI API key and internet connection
- AI responses add latency (~1-2s per heal)
- Max 120 candidates collected per heal
- Only works with visible elements
- Cannot heal across iframes (yet)
