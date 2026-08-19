/**
 * healwright - AI-powered self-healing locators for Playwright
 */

import type { Page, Locator } from "playwright-core";
import path from "node:path";

import { createAIProvider, AIProvider, ProviderName, TokenUsage } from "./providers";

import { healLog } from "./logger";
import { buildSystemPrompt, buildUserContent } from "./prompt";
import { recordHealEvent } from "./summary";
import {
  Action,
  LocatorOrEmpty,
  StrategyT,
  CacheT,
  HealMethods,
  HealingLocator,
  HealMode,
  HealPage,
  HealOptions,
  HealPlan,
  HealError,
  GetLocatorOptions,
  healPlanJsonSchema,
} from "./types";
import {
  isAiOnlyTarget,
  toLocator,
  buildLocator,
  validateStrategy,
  waitForReady,
  waitForStable,
  collectCandidates,
  rankCandidates,
  readJson,
  updateJson,
  appendLog,
  cacheKey,
  meetsConfidence,
  normalizeConfidence,
  withRetry,
  CANDIDATE_COLLECTION_CAP,
} from "./utils";

// Symbol to identify enhanced pages
const HEAL_SYMBOL = Symbol.for('healwright');

const DISABLED_HINT =
  "healwright: AI detection is off, so a description-only target cannot be resolved. " +
  "Set SELF_HEAL=1 (and AI_API_KEY, unless AI_PROVIDER=local) to enable it, " +
  "or pass a selector instead of an empty string.";

/**
 * Enhance a Playwright Page with self-healing capabilities.
 * 
 * @example
 * ```typescript
 * import { withHealing } from 'healwright';
 * 
 * const healPage = withHealing(page);
 * await healPage.heal.click(page.getByRole('button'), 'Submit button');
 * await healPage.heal.fill('', 'Email input', 'test@example.com');
 * ```
 */
export function withHealing(page: Page, opts?: HealOptions): HealPage {
  // Return existing instance if already enhanced
  if ((page as any)[HEAL_SYMBOL]) {
    return page as HealPage;
  }

  // Configuration
  const mode: HealMode = opts?.mode ?? (process.env.HEALWRIGHT_MODE as HealMode | undefined) ?? "heal";
  const envEnabled = process.env.SELF_HEAL === "1" || process.env.AI_SELF_HEAL === "true";
  const enabled = mode === "off" ? false : (opts?.enabled ?? envEnabled);
  const apiKey = opts?.apiKey ?? process.env.AI_API_KEY;
  const providerName = (opts?.provider ?? process.env.AI_PROVIDER?.toLowerCase() ?? "openai") as ProviderName;
  const model = opts?.model ?? process.env.AI_MODEL;
  const baseURL = opts?.baseURL ?? process.env.AI_BASE_URL;
  const isLocalProvider = providerName === "local" || providerName === "ollama";

  healLog.configure({
    level: opts?.logLevel ?? (process.env.HEALWRIGHT_LOG as any),
    color: opts?.color,
  });

  // Create AI provider if enabled.
  // A caller-supplied provider wins — that is the extension point for any model
  // healwright does not ship a client for.
  // Local providers (Ollama) don't require an API key — they connect to a local instance
  let aiProvider: AIProvider | null = null;
  if (enabled) {
    if (opts?.aiProvider) {
      aiProvider = opts.aiProvider;
    } else if (apiKey || isLocalProvider) {
      aiProvider = createAIProvider(providerName, {
        apiKey: isLocalProvider ? (baseURL ?? process.env.OLLAMA_HOST ?? "") : (apiKey ?? ""),
        model,
        baseURL,
      });
    }
  }

  const cacheFile = opts?.cacheFile ?? path.join(process.cwd(), ".self-heal", "healed_locators.json");
  const reportFile = opts?.reportFile ?? path.join(process.cwd(), ".self-heal", "heal_events.jsonl");
  const maxAiTries = opts?.maxAiTries ?? 4;
  const maxCandidates = opts?.maxCandidates ?? 40;
  const timeout = opts?.timeout ?? 5000;
  const minConfidence = opts?.minConfidence ?? Number(process.env.HEALWRIGHT_MIN_CONFIDENCE ?? 0);
  // How long the original locator gets before healing takes over. Short by
  // design (a broken selector should fail fast), but explicit and overridable —
  // it changes what counts as "broken", so it must not be a hidden constant.
  const quickTimeout = opts?.quickTimeout ?? (enabled ? 1000 : timeout);

  // State
  let currentTestName = opts?.testName;
  let bannerShownForTest: string | undefined;
  const mem = new Map<string, StrategyT>();
  let diskCacheLoaded = false;
  let diskCache: CacheT = {};

  // Internal helpers
  async function ensureDiskCacheLoaded(): Promise<CacheT> {
    if (!diskCacheLoaded) {
      diskCache = await readJson(cacheFile, {});
      diskCacheLoaded = true;
    }
    return diskCache;
  }

  function showBannerOnce() {
    if (bannerShownForTest !== currentTestName) {
      healLog.banner();
      bannerShownForTest = currentTestName;
    }
  }

  async function log(entry: Record<string, unknown>) {
    await appendLog(reportFile, entry);
  }

  interface AskAIResult {
    plan: import("./types").HealPlanT | null;
    candidatesAnalyzed: number;
    tokenUsage: TokenUsage | null;
  }

  async function askAI(action: Action, contextName: string): Promise<AskAIResult> {
    if (!aiProvider) throw new Error("Healing disabled or API key not set");

    // Collect widely, then rank — ranking after truncation would hide the right
    // element behind whatever happens to appear first in the DOM.
    const allCandidates = await collectCandidates(page, action, CANDIDATE_COLLECTION_CAP);
    const candidates = rankCandidates(allCandidates, contextName, maxCandidates);
    healLog.askingAI(contextName, candidates.length, allCandidates.length);

    const result = await withRetry(
      () => aiProvider!.generateHealPlan({
        systemPrompt: buildSystemPrompt(),
        userContent: buildUserContent(page.url(), action, contextName, candidates),
        jsonSchema: healPlanJsonSchema,
      }),
      2, // 2 retries (3 total attempts)
      1000,
    );

    return { plan: result.plan, candidatesAnalyzed: candidates.length, tokenUsage: result.tokenUsage };
  }

  interface PickResult {
    choice: ReturnType<typeof HealPlan.parse>["candidates"][0] | null;
    strategiesTried: Array<{ type: string; reason: string }>;
    /** Set when a candidate resolved but scored below `minConfidence`. */
    rejectedForConfidence: { confidence: number; strategy: StrategyT } | null;
  }

  interface PickValidOptions {
    skipVisibilityCheck?: boolean;
  }

  async function pickValid(plan: ReturnType<typeof HealPlan.parse>, options?: PickValidOptions): Promise<PickResult> {
    const strategiesTried: Array<{ type: string; reason: string }> = [];
    const skipVisibilityCheck = options?.skipVisibilityCheck ?? false;
    let rejectedForConfidence: PickResult["rejectedForConfidence"] = null;

    for (const c of plan.candidates.slice(0, maxAiTries)) {
      const validationError = validateStrategy(c.strategy);
      if (validationError) {
        healLog.candidateRejected(c.strategy.type, validationError);
        strategiesTried.push({ type: c.strategy.type, reason: validationError });
        continue;
      }
      try {
        const loc = buildLocator(page, c.strategy);
        const count = await loc.count();
        if (count !== 1) {
          const reason = count === 0 ? "element not found" : `matched ${count} elements (must be unique)`;
          healLog.candidateRejected(c.strategy.type, `count=${count}`);
          strategiesTried.push({ type: c.strategy.type, reason });
          continue;
        }

        // Skip visibility check if force option is used
        if (!skipVisibilityCheck) {
          const visible = await loc.first().isVisible();
          if (!visible) {
            healLog.candidateRejected(c.strategy.type, "not visible");
            strategiesTried.push({ type: c.strategy.type, reason: "element exists but not visible" });
            continue;
          }
        }

        // The element resolves — but a low-confidence match is exactly the case
        // that turns a real regression into a silently passing test.
        if (!meetsConfidence(c.confidence, minConfidence)) {
          const score = normalizeConfidence(c.confidence);
          const reason = `confidence ${score.toFixed(2)} below minConfidence ${minConfidence}`;
          healLog.candidateRejected(c.strategy.type, reason);
          strategiesTried.push({ type: c.strategy.type, reason });
          rejectedForConfidence = { confidence: score, strategy: c.strategy };
          continue;
        }

        return { choice: c, strategiesTried, rejectedForConfidence };
      } catch (err: any) {
        const reason = err?.message ?? "unknown error";
        healLog.candidateError(c.strategy.type, reason);
        strategiesTried.push({ type: c.strategy.type, reason: `error: ${reason}` });
        continue;
      }
    }
    return { choice: null, strategiesTried, rejectedForConfidence };
  }

  async function saveToCache(key: string, strategy: StrategyT, contextName: string) {
    mem.set(key, strategy);
    const entry = { ...strategy, context: contextName, testName: currentTestName };
    // Re-read and merge under a lock: other workers write the same file.
    diskCache = await updateJson<CacheT>(cacheFile, current => ({ ...current, [key]: entry }));
    diskCacheLoaded = true;
  }

  // Generic heal action handler
  interface HealActionOptions {
    aiAction?: Action; // Override action type for AI (e.g., check uses "fill" candidates)
    forceClick?: boolean; // Skip visibility check for hover-dependent buttons
  }

  async function healAction(
    action: Action,
    target: LocatorOrEmpty,
    contextName: string,
    performAction: (loc: Locator) => Promise<void>,
    options?: HealActionOptions
  ): Promise<void> {
    const ts = new Date().toISOString();
    const key = cacheKey(page, action, contextName);
    const aiOnlyMode = isAiOnlyTarget(target);
    const url = page.url();
    let originalError: Error | null = null;

    // Try original locator first
    if (!aiOnlyMode) {
      try {
        const originalLoc = toLocator(page, target);
        await waitForReady(originalLoc, action, quickTimeout);
        await performAction(originalLoc);
        return;
      } catch (err: any) {
        if (!enabled) throw err;
        originalError = err;
      }
    }

    // Nothing to fall back to: no selector was given and healing is off.
    if (!enabled && aiOnlyMode) {
      healLog.aiDisabled();
      throw new Error(`${DISABLED_HINT}\n  Looking for: "${contextName}" (${action})`);
    }

    showBannerOnce();
    if (aiOnlyMode) {
      healLog.aiDetectMode(action, contextName);
    } else {
      healLog.actionFailed(action, contextName);
    }

    // Try cache
    const cache = await ensureDiskCacheLoaded();
    const cached = mem.get(key) ?? cache[key];

    if (cached) {
      try {
        const cachedLoc = buildLocator(page, cached);
        await waitForReady(cachedLoc, action, timeout);
        await performAction(cachedLoc);
        if (action === "click" || action === "dblclick" || action === "selectOption") await waitForStable(page);
        await log({ ts, url, key, action, contextName, used: "cache", success: true, strategy: cached });
        recordHealEvent({ outcome: "cache", action, contextName, url, strategy: cached, testName: currentTestName });
        healLog.usedCache(contextName);
        return;
      } catch {
        healLog.cacheMiss(contextName);
      }
    }

    // Ask AI
    let candidatesAnalyzed = 0;
    let strategiesTried: Array<{ type: string; reason: string }> = [];
    let tokenUsage: TokenUsage | null = null;

    try {
      const aiResult = await askAI(options?.aiAction ?? action, contextName);
      candidatesAnalyzed = aiResult.candidatesAnalyzed;
      tokenUsage = aiResult.tokenUsage;

      if (!aiResult.plan) {
        await log({ ts, url, key, action, contextName, used: "healed", success: false, error: "AI returned no plan", tokenUsage });
        healLog.noValidCandidate(contextName);
        if (tokenUsage) healLog.tokenUsage(tokenUsage.inputTokens, tokenUsage.outputTokens, tokenUsage.totalTokens);
        throw new HealError("AI returned no suggestions", {
          action,
          contextName,
          url,
          candidatesAnalyzed,
          strategiesTried: [],
          originalError: originalError?.message,
        });
      }

      const pickResult = await pickValid(aiResult.plan, { skipVisibilityCheck: options?.forceClick });
      strategiesTried = pickResult.strategiesTried;
      const choice = pickResult.choice;

      if (!choice) {
        const lowConfidence = pickResult.rejectedForConfidence;
        const outcome = lowConfidence ? "belowConfidence" : "failed";
        await log({
          ts, url, key, action, contextName, used: "healed", success: false,
          error: lowConfidence ? "Below minConfidence" : "No valid candidate",
          confidence: lowConfidence?.confidence,
          tokenUsage,
        });
        recordHealEvent({
          outcome, action, contextName, url,
          confidence: lowConfidence?.confidence,
          strategy: lowConfidence?.strategy,
          testName: currentTestName,
        });
        healLog.noValidCandidate(contextName);
        if (tokenUsage) healLog.tokenUsage(tokenUsage.inputTokens, tokenUsage.outputTokens, tokenUsage.totalTokens);
        throw new HealError(
          lowConfidence
            ? `Best match scored ${lowConfidence.confidence.toFixed(2)}, below the configured minConfidence of ${minConfidence}`
            : "Could not find a matching element",
          {
            action,
            contextName,
            url,
            candidatesAnalyzed,
            strategiesTried,
            originalError: originalError?.message,
          },
        );
      }

      // Report-only mode: say what would have happened, then let the original
      // failure stand so the suite still reflects the state of the app.
      if (mode === "warn") {
        await log({
          ts, url, key, action, contextName, used: "warn", success: false,
          confidence: choice.confidence, why: choice.why, strategy: choice.strategy, tokenUsage,
        });
        recordHealEvent({
          outcome: "wouldHeal", action, contextName, url,
          confidence: normalizeConfidence(choice.confidence),
          strategy: choice.strategy,
          testName: currentTestName,
        });
        healLog.wouldHeal(contextName, choice.strategy);
        if (tokenUsage) healLog.tokenUsage(tokenUsage.inputTokens, tokenUsage.outputTokens, tokenUsage.totalTokens);
        if (originalError) throw originalError;
        throw new HealError("Healing is in report-only mode (mode: 'warn'), so no action was taken", {
          action, contextName, url, candidatesAnalyzed, strategiesTried,
        });
      }

      await saveToCache(key, choice.strategy, contextName);

      const healedLoc = buildLocator(page, choice.strategy);
      // Skip visibility wait when force is used (for hover-dependent elements)
      if (!options?.forceClick) {
        await waitForReady(healedLoc, action, timeout);
      }
      await performAction(healedLoc);
      if (action === "click" || action === "dblclick" || action === "selectOption") await waitForStable(page);

      await log({
        ts, url, key, action, contextName,
        used: "healed", success: true,
        confidence: choice.confidence, why: choice.why,
        strategy: choice.strategy,
        tokenUsage,
      });
      recordHealEvent({
        outcome: "healed", action, contextName, url,
        confidence: normalizeConfidence(choice.confidence),
        strategy: choice.strategy,
        testName: currentTestName,
      });
      healLog.healed(contextName, choice.strategy);
      if (tokenUsage) healLog.tokenUsage(tokenUsage.inputTokens, tokenUsage.outputTokens, tokenUsage.totalTokens);
    } catch (healErr: any) {
      // If it's already a HealError, just re-throw it
      if (healErr instanceof HealError) {
        await log({
          ts, url, key, action, contextName,
          used: "healed", success: false,
          error: healErr.message,
        });
        healLog.healFailed(contextName, "No matching element found");
        throw healErr;
      }

      // In warn mode the original failure is the intended outcome, not a bug.
      if (mode === "warn" && originalError && healErr === originalError) throw healErr;

      // Otherwise wrap it in a HealError for better context
      await log({
        ts, url, key, action, contextName,
        used: "healed", success: false,
        error: `Heal failed: ${String(healErr?.message ?? healErr)}`,
      });
      recordHealEvent({ outcome: "failed", action, contextName, url, testName: currentTestName });
      healLog.healFailed(contextName, String(healErr?.message ?? healErr));

      throw new HealError(String(healErr?.message ?? healErr), {
        action,
        contextName,
        url,
        candidatesAnalyzed,
        strategiesTried,
        originalError: originalError?.message,
      });
    }
  }

  /**
   * Resolve a description to a real Playwright Locator.
   *
   * Unlike the action helpers this returns the Locator itself, so it composes
   * with everything Playwright offers — `expect()` assertions, `.nth()`,
   * `.filter()`, `press()`, and any method healwright does not wrap.
   */
  async function getLocator(
    selector: string,
    contextName: string,
    options?: GetLocatorOptions,
  ): Promise<Locator> {
    const action: Action = options?.as ?? "locate";
    const url = page.url();

    if (!isAiOnlyTarget(selector)) {
      const original = toLocator(page, selector);
      try {
        if (await original.count() > 0) return original;
      } catch { /* fall through to healing */ }
    }

    if (!enabled) {
      healLog.aiDisabled();
      throw new Error(`${DISABLED_HINT}\n  Looking for: "${contextName}" (${action})`);
    }

    showBannerOnce();
    healLog.aiDetectMode(action, contextName);

    const key = cacheKey(page, action, contextName);
    const cache = await ensureDiskCacheLoaded();
    const cached = mem.get(key) ?? cache[key];
    if (cached) {
      try {
        const cachedLoc = buildLocator(page, cached);
        if (await cachedLoc.count() === 1) {
          recordHealEvent({ outcome: "cache", action, contextName, url, strategy: cached, testName: currentTestName });
          healLog.usedCache(contextName);
          return cachedLoc;
        }
      } catch { /* stale cache — re-heal below */ }
      healLog.cacheMiss(contextName);
    }

    const { plan, candidatesAnalyzed, tokenUsage } = await askAI(action, contextName);
    const pickResult = plan
      ? await pickValid(plan)
      : { choice: null, strategiesTried: [], rejectedForConfidence: null };

    if (!pickResult.choice) {
      const lowConfidence = pickResult.rejectedForConfidence;
      recordHealEvent({
        outcome: lowConfidence ? "belowConfidence" : "failed",
        action, contextName, url,
        confidence: lowConfidence?.confidence,
        strategy: lowConfidence?.strategy,
        testName: currentTestName,
      });
      healLog.noValidCandidate(contextName);
      throw new HealError(
        lowConfidence
          ? `Best match scored ${lowConfidence.confidence.toFixed(2)}, below the configured minConfidence of ${minConfidence}`
          : "Could not find a matching element",
        { action, contextName, url, candidatesAnalyzed, strategiesTried: pickResult.strategiesTried },
      );
    }

    const choice = pickResult.choice;

    if (mode === "warn") {
      recordHealEvent({
        outcome: "wouldHeal", action, contextName, url,
        confidence: normalizeConfidence(choice.confidence),
        strategy: choice.strategy,
        testName: currentTestName,
      });
      healLog.wouldHeal(contextName, choice.strategy);
      throw new HealError("Healing is in report-only mode (mode: 'warn'), so the locator was not replaced", {
        action, contextName, url, candidatesAnalyzed, strategiesTried: pickResult.strategiesTried,
      });
    }

    await saveToCache(key, choice.strategy, contextName);
    await log({
      ts: new Date().toISOString(), url, key, action, contextName,
      used: "healed", success: true,
      confidence: choice.confidence, why: choice.why, strategy: choice.strategy, tokenUsage,
    });
    recordHealEvent({
      outcome: "healed", action, contextName, url,
      confidence: normalizeConfidence(choice.confidence),
      strategy: choice.strategy,
      testName: currentTestName,
    });
    healLog.healed(contextName, choice.strategy);
    if (tokenUsage) healLog.tokenUsage(tokenUsage.inputTokens, tokenUsage.outputTokens, tokenUsage.totalTokens);

    return buildLocator(page, choice.strategy);
  }

  // Heal methods
  const healMethods: HealMethods = {
    click: (target, contextName, clickOptions) => healAction(
      "click", target, contextName,
      // For display:none elements (force mode), use dispatchEvent which bypasses
      // the need for element dimensions. Regular click() fails on display:none.
      clickOptions?.force
        ? (loc) => loc.dispatchEvent('click')
        : (loc) => loc.click({ timeout }),
      { forceClick: clickOptions?.force }
    ),

    fill: (target, contextName, value) => healAction(
      "fill", target, contextName,
      (loc) => loc.fill(value, { timeout })
    ),

    selectOption: (target, contextName, value) => healAction(
      "selectOption", target, contextName,
      async (loc) => { await loc.selectOption(value, { timeout }); }
    ),

    dblclick: (target, contextName) => healAction(
      "dblclick", target, contextName,
      (loc) => loc.dblclick({ timeout }),
      { aiAction: "click" } // Use click candidates for dblclick
    ),

    check: (target, contextName) => healAction(
      "check", target, contextName,
      (loc) => loc.check({ timeout }),
      { aiAction: "fill" } // Use fill candidates for check (inputs)
    ),

    uncheck: (target, contextName) => healAction(
      "uncheck", target, contextName,
      (loc) => loc.uncheck({ timeout }),
      { aiAction: "fill" } // Use fill candidates for uncheck (inputs)
    ),

    hover: (target, contextName) => healAction(
      "hover", target, contextName,
      (loc) => loc.hover({ timeout }),
      { aiAction: "click" } // Use click candidates for hover
    ),

    // Focus applies to buttons and text inputs alike, so it uses its own
    // candidate set rather than borrowing the clickable one.
    focus: (target, contextName) => healAction(
      "focus", target, contextName,
      (loc) => loc.focus({ timeout })
    ),

    setTestName: (name) => { currentTestName = name; },

    getLocator,

    // Create a self-healing locator with semantic description fallback
    locator: (selector: string, contextName: string): HealingLocator => {
      const baseLoc = page.locator(selector);
      return {
        click: (options) => healMethods.click(baseLoc, contextName, options),
        fill: (value) => healMethods.fill(baseLoc, contextName, value),
        dblclick: () => healMethods.dblclick(baseLoc, contextName),
        check: () => healMethods.check(baseLoc, contextName),
        uncheck: () => healMethods.uncheck(baseLoc, contextName),
        hover: () => healMethods.hover(baseLoc, contextName),
        focus: () => healMethods.focus(baseLoc, contextName),
        selectOption: (value) => healMethods.selectOption(baseLoc, contextName, value),
      };
    },
  };

  // Attach to page
  (page as any)[HEAL_SYMBOL] = true;
  (page as any).heal = healMethods;

  return page as HealPage;
}

/**
 * Create a Playwright test fixture with healing capabilities.
 * 
 * @example
 * ```typescript
 * import { test as base } from '@playwright/test';
 * import { createHealingFixture, HealPage } from 'healwright';
 * 
 * export const test = base.extend<{ page: HealPage }>(createHealingFixture());
 * ```
 */
export function createHealingFixture(opts?: HealOptions) {
  return {
    page: async (
      { page }: { page: Page },
      use: (page: HealPage) => Promise<void>,
      testInfo?: { title?: string },
    ) => {
      const healPage = withHealing(page, opts);
      // Tag cache entries and summary rows with the test that produced them.
      if (testInfo?.title) healPage.heal.setTestName(testInfo.title);
      await use(healPage);
    },
  };
}

export default withHealing;
