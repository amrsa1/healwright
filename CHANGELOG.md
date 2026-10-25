# Changelog

All notable changes to healwright are documented here.
This project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- `mode: 'warn'` no longer applies cached heals. A committed `healed_locators.json` made report-only
  runs click the cached element and pass; the cached heal is now reported like any other.
- `getHealSummary()` works from `globalTeardown`. The tally only lived in each worker's memory, so
  the runner process always read zero. Outcomes are now also written to
  `.self-heal/heal_summary.jsonl`, and only the current run is counted.
- `heal.getLocator()` in `mode: 'warn'` writes its report to `heal_events.jsonl`, like the actions do.
- The Anthropic provider defaults to `claude-sonnet-5-5`. The previous default was retired, so
  `AI_PROVIDER=anthropic` without `AI_MODEL` failed.
- Anthropic responses that open with thinking blocks are parsed. Structured output moves to
  `output_config.format`, effort stays low on models that support it, and declined requests fall back
  to another model on the Claude API.
- Custom Anthropic endpoints keep receiving the key as `X-Api-Key`; SDK 1.x would otherwise send it as
  `Authorization: Bearer`, which some gateways don't read.
- Provider calls time out after 30 seconds, and the SDKs no longer retry underneath healwright's own
  retries (Gemini alone could make 15 attempts per heal).
- A cached heal for a `force: true` click is reused. Hover-only controls are never visible, so the
  cache was always skipped and the model asked again.
- A heal the model had no answer for is counted as failed in `getHealSummary()`.
- Page URLs reach the model and the logs without their query string or fragment, which can carry
  session tokens.
- `heal.check()` and `heal.uncheck()` search custom checkboxes and switches (`role="checkbox"`,
  `role="switch"`, labels), not only text inputs.

### Changed

- Dependencies updated to their latest versions, including `@anthropic-ai/sdk` 1.x, `vitest` 5 and `tsup` 9.
- Requires Node.js 22 or newer, which the current OpenAI SDK already needs.

### Docs

- New website and getting-started guide, a rewritten README with an animated demo, and a new social
  preview image.

## [1.8.0] - 2026-08-19

Bug fixes, a confidence policy so healing can't quietly hide a regression, and support for custom endpoints.

### Added

- `minConfidence` — reject heals the model isn't sure about instead of taking the guess.
- `mode: 'warn'` — report what *would* have healed and let the original failure stand. Good for auditing CI.
- `getHealSummary()` — a run-level tally of every heal, so a global teardown can fail the build when locators drift.
- `heal.getLocator()` — returns a real Playwright `Locator`, so healed elements work with `expect()` and everything else.
- `baseURL` / `AI_BASE_URL` — point any provider at Azure, OpenRouter, vLLM, or your own gateway.
- `aiProvider` — plug in a model healwright ships no client for.
- `quickTimeout` — control how long the original locator gets before healing takes over.
- `logLevel`, plus `NO_COLOR` / `FORCE_COLOR` and TTY detection.

### Fixed

- Selector strings passed to `heal.*` are used as selectors. They were treated as Locators and crashed.
- Clear error when healing is off and no selector was given, instead of an empty-selector crash.
- Anthropic actually receives the JSON schema now — it was sending the beta header without one.
- Candidates are ranked before they're truncated. The right element could previously be cut off by DOM order.
- `heal.focus` searches text inputs. It was borrowing the click candidate set, which excludes them.
- The cache survives parallel workers. Concurrent runs used to drop each other's entries.
- OpenAI's `reasoning` param only goes to reasoning models, so `AI_MODEL=gpt-4o` works.
- Google gets the schema via `responseJsonSchema` instead of it being stuffed into the prompt.
- `maxCandidates` means what it says (default 40). It was silently capped at 40 internally.
- Type declarations build again under TypeScript 7.

### Changed

- `playwright-core` is a dev + optional peer dependency, not a runtime one. It was only ever used for types.
- CI runs lint and typecheck, and `forbidOnly` blocks stray `test.only` — five of them had shrunk the e2e gate to 5 of 76 tests.

## [1.7.0]

See the [GitHub releases](https://github.com/amrsa1/healwright/releases) for versions up to 1.7.0.
