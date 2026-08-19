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
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────┐            │
│   │    Local (Ollama)                                          │            │
│   │    Default: qwen3:4b · No API key · Fully offline          │            │
│   │                                                            │            │
│   │    Aliases: local, ollama                                  │            │
│   │    Host: OLLAMA_HOST or http://127.0.0.1:11434             │            │
│   └─────────────────────────────────────────────────────────────┘            │
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
├── utils.ts           # buildLocator, collectCandidates, rankCandidates, cache I/O
├── logger.ts          # Console logging with colours and token usage
└── providers/
    ├── index.ts       # Provider factory
    ├── types.ts       # AIProvider interface, TokenUsage/HealPlanResult types, cleanJson helper
    ├── openai.ts      # OpenAI implementation
    ├── anthropic.ts   # Anthropic implementation
    ├── google.ts      # Google Gemini implementation
    └── local.ts       # Local LLM via Ollama (no API key needed)
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
1. Collect DOM candidates (max elements configurable via `maxCandidates`)
2. Pre-filter with rankCandidates():
   - Score each candidate by keyword match, tag-type inference,
     ARIA role relevance, test-ID presence
   - Keep top 40 candidates (sorted by score, DOM-order tiebreak)
   - Log "analyzing N elements (filtered from M)" when filtering occurs
3. Create AI provider based on environment
4. Send filtered candidates to AI with context:
   - Action type (click/fill)
   - Context name ("Submit button")
   - Candidate list with attributes
   - JSON schema for structured output
5. AI returns ranked strategies with confidence scores
6. Extract token usage from provider response (input/output/total)
7. Validate each candidate (pickValid):
   - Build locator from strategy
   - Check count === 1
   - Check isVisible() === true (unless force: true)
8. Use first valid candidate
9. Save to cache (memory + disk)
10. Log token usage and execute action with healed locator
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
{"ts":"2026-01-28T20:00:00.000Z","url":"https://todomvc.com/...","key":"click::...","action":"click","contextName":"Submit button","used":"healed","success":true,"confidence":0.95,"why":"Button matches context","strategy":{"type":"role","role":"button","name":"Submit"},"tokenUsage":{"inputTokens":1350,"outputTokens":180,"totalTokens":1530}}
```

## Console Output

```
┌─ ◈ AI DETECT Submit button
│  ⬡ analyzing 16 elements (filtered from 24)...
│  ↳ received 892 chars
│  ↑ 1350 input · 180 output · 1530 total tokens
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
| Quick timeout (1s, `quickTimeout`) for initial attempts | Fail fast when locator is broken |
| Lazy-loaded disk cache | Read once, not on every action |
| In-memory cache (Map) | O(1) lookups during test run |
| Cached locator is retried first | A stale entry costs one failed lookup, then re-heals |
| Structured output (JSON schema) | Same schema to every provider, generated from Zod |
| `dispatchEvent` for force click | Works on `display: none` elements |
| Rank first, then truncate to `maxCandidates` | The right element cannot be cut by DOM order |
| Token usage tracking | Per-heal visibility in console & JSONL log |

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

- Cloud providers require AI API key and internet connection (local provider needs neither)
- AI responses add latency (~1-2s per heal with cloud, varies with local hardware)
- Candidates are collected (up to 1000), ranked, then truncated to `maxCandidates` (default 40)
- Cannot heal across iframes (yet) — only the main frame is searched
- Force click only works with `dispatchEvent` (no pointer coordinates)
- Local models may produce less accurate results than cloud providers depending on model size
- The cache is shared across parallel workers via a lock file; it is best-effort, not a database
- A heal that resolves to the *wrong* element still passes. Use `minConfidence`, `mode: 'warn'`,
  and `getHealSummary()` to keep that visible

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

  🔬 Strategies tried:
     • [testid] skipped: not visible
     • [css] rejected: count=0

  💡 Tips:
     • Make sure the element exists on the page
     • Try a more specific description
```
