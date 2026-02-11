# Healwright — Technical Architecture

> For usage, installation, API reference, and configuration see the [README](readme.md).

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
│   │  (gpt-5.2)      │   │(claude-sonnet)  │   │ (gemini-3)      │            │
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

## Source Layout

```
src/
├── index.ts           # Public exports
├── healwright.ts      # Main healing logic (withHealing, createHealingFixture)
├── types.ts           # TypeScript types, Zod schemas, HealError
├── utils.ts           # buildLocator, collectCandidates, cache I/O
├── logger.ts          # Console logging with colours
└── providers/
    ├── index.ts       # Provider factory
    ├── types.ts       # AIProvider interface, cleanJson helper
    ├── openai.ts      # OpenAI implementation
    ├── anthropic.ts   # Anthropic implementation
    └── google.ts      # Google Gemini implementation
```

### Candidate Collection

When healing, the system collects potential elements from the DOM:

- **Click actions**: `button, [role='button'], a, input[type='button'], input[type='submit'], [onclick], [ondblclick], [onmouseenter], [onmouseover], [role='menuitem'], [role='tab'], [role='treeitem'], [role='switch'], [role='combobox'], select, [data-testid], [data-test], [data-test-id], [data-qa], [data-cy]` and more
- **Fill actions**: `input, textarea, [contenteditable='true'], [role='textbox'], select, [role='combobox'], [data-testid], ...`
- **selectOption actions**: `select, [role='listbox'], [role='combobox'], [data-testid], ...`

Each candidate is sent as compact JSON with short keys: `tag`, `hid`, `role`, `aria`, `name`, `ph`, `type`, `href`, `alt`, `title`, `for`, `id`, `cls`, `tid`, `txt`.

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
1. Collect DOM candidates (max 30 elements, configurable via `maxCandidates`)
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

## Force Click Internals

When `force: true` is passed:
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
- Max 30 candidates collected per heal (configurable via `maxCandidates`)
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
