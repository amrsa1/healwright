# AI Self-Healing (Playwright)

This project includes an **AI-assisted self-healing layer** for Playwright tests.
It is designed to automatically (a) review failures and (b) optionally propose + apply locator fixes on the fly using a retry strategy.

Key idea: **Playwright can’t change a failed test result after the fact**, so ‘healing’ is implemented by writing a healed locator mapping and letting **Playwright retry** the test. If the retry passes, the overall run becomes green.

## Components (Infra)

These are the core files involved:

- `src/utils/fixture.ts`: Auto-runs the self-healing pipeline after each test.
- `src/utils/aiSelfHealing.ts`: Calls OpenAI **Responses API** to generate a failure review and (optionally) a healed selector suggestion.
- `src/utils/selfHealingLocator.ts`: Stores and resolves selector mappings from `.self-heal/locator-map.json`.
- `configlist.ts`: Enables Playwright retries when `AI_SELF_HEAL=true`.
- Page objects (e.g. `src/pages/feedbackPage.ts`): Route CSS selectors through `resolveSelector(...)` so healed selectors are used automatically on retry.

Artifacts:
- `.self-heal/locator-map.json`: The persistent mapping `{ originalSelector: healedSelector }`.
- `test-results/ai-logs/`: AI analysis logs for audit + debugging.

## Configuration (Environment Variables)

Set these in your `.env`:

```dotenv
# Enable/disable auto-heal + retry behavior
AI_SELF_HEAL=true

# Provider tracking (logged in ai-logs)
AI_PROVIDER=openai

# OpenAI model name (logged in ai-logs)
AI_MODEL=gpt-4o-mini

# OpenAI API key
AI_API_KEY=YOUR_KEY_HERE
```

Notes:
- `AI_PROVIDER` is logged for audit, and currently only supports `openai`.
- If `AI_SELF_HEAL` is not `true`, you still get **failure review logs**, but no retry-based healing is attempted.
- The script redacts common tokens/keys before sending content to the model and before writing logs.

## Runtime Flow (Process)

### Level 1 — Failure Review (Always)
1. A test runs normally.
2. If the test fails, the auto fixture captures:
   - failure message (`testInfo.error?.message`)
   - page HTML (`page.content()`)
3. The AI is called through `responses.create(...)`.
4. The AI output is written to `test-results/ai-logs/` including:
   - Provider, Model, ResponseId
   - Test title, error message
   - Suggested locator fix guidance

### Level 2 — Self-Heal via Retry (Only when `AI_SELF_HEAL=true`)
1. On the first failure attempt only (`testInfo.retry === 0`):
   - Extract an original selector from the Playwright error text if possible (example: `locator('#headerTitle')`).
   - Ask AI for a `healedSelector` suggestion (JSON output).
   - Validate the suggested selector using `page.locator(healed).count() > 0`.
   - If valid, store the mapping in `.self-heal/locator-map.json`.
2. Playwright re-runs the same test automatically (retry = 1).
3. Page Objects resolve selectors via `resolveSelector(original)` and use the healed selector.
4. If the retry passes, the overall run is green.

Important: this approach does not mutate test status after failure; it relies on Playwright retry semantics.

## How to Run

Run tests normally:

```bash
npm run test
```

Expected outputs:
- AI review logs: `test-results/ai-logs/ai_healing_<provider>_<model>_<test>_<timestamp>.log`
- Healed locator map: `.self-heal/locator-map.json` (only when a healed selector is produced and validated)

To disable healing (but keep review logs), set:

```dotenv
AI_SELF_HEAL=false
```

## Limitations + Next Steps

Current healing scope:
- The auto-heal mapping currently targets **CSS selectors used via `page.locator('...')`**.
- `getByRole(...)` and other role-based locators are not auto-remapped yet.

Recommended improvements:
- Extend healing to store a ‘locator spec’ (e.g. `{ type: 'role', role: 'button', name: 'Logout' }`) for `getByRole` healing.
- Add more failure context to the prompt (URL, project name, screenshot text).
- Optional approval workflow before persisting healed mappings (for stricter control).