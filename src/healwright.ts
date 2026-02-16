/**
 * healwright - AI-powered self-healing locators for Playwright
 */

import type { Page, Locator } from "playwright-core";
import path from "node:path";

import { createAIProvider, AIProvider, ProviderName, TokenUsage } from "./providers";

import { healLog } from "./logger";
import {
  Action,
  LocatorOrEmpty,
  StrategyT,
  CacheT,
  HealMethods,
  HealingLocator,
  HealPage,
  HealOptions,
  HealPlan,
  HealError,
  healPlanJsonSchema,
} from "./types";
import {
  isValidLocator,
  buildLocator,
  validateStrategy,
  waitForReady,
  waitForStable,
  collectCandidates,
  rankCandidates,
  readJson,
  writeAtomic,
  appendLog,
  cacheKey,
  withRetry,
} from "./utils";

// Symbol to identify enhanced pages
const HEAL_SYMBOL = Symbol.for('healwright');

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
  const enabled = opts?.enabled ?? (process.env.SELF_HEAL === "1" || process.env.AI_SELF_HEAL === "true");
  const apiKey = opts?.apiKey ?? process.env.AI_API_KEY;
  const providerName = (opts?.provider ?? process.env.AI_PROVIDER?.toLowerCase() ?? "openai") as ProviderName;
  const model = opts?.model ?? process.env.AI_MODEL;

  // Create AI provider if enabled
  let aiProvider: AIProvider | null = null;
  if (enabled && apiKey) {
    aiProvider = createAIProvider(providerName, { apiKey, model });
  }

  const cacheFile = opts?.cacheFile ?? path.join(process.cwd(), ".self-heal", "healed_locators.json");
  const reportFile = opts?.reportFile ?? path.join(process.cwd(), ".self-heal", "heal_events.jsonl");
  const maxAiTries = opts?.maxAiTries ?? 4;
  const maxCandidates = opts?.maxCandidates ?? 80;
  const timeout = opts?.timeout ?? 5000;
  const quickTimeout = enabled ? 1000 : timeout;

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

    const allCandidates = await collectCandidates(page, action, maxCandidates);
    const candidates = rankCandidates(allCandidates, contextName, Math.min(maxCandidates, 40));
    healLog.askingAI(contextName, candidates.length, allCandidates.length);

    const systemPrompt = [
      "You are a Playwright locator expert. Given a list of candidate elements from the page, identify the one matching contextName.",
      "Return up to 3 strategy alternatives. Prefer: testid > role+name > label > placeholder > text > altText > title > css.",
      "Candidate keys: tag=tagName, tid=data-testid, aria=aria-label, ph=placeholder, txt=innerText, alt=alt, title=title, for=htmlFor, cls=className, hid=hidden. id/name/role/type/href as named.",
      "Strategy types: testid(value=testid), role(role+name, exact optional), label(text), placeholder(text), text(text, exact optional), altText(text), title(text), css(selector). No XPath.",
      "IMPORTANT: For label/placeholder/text/altText/title strategies, the 'text' field is REQUIRED and must be the actual text/label/placeholder value.",
      "For testid strategy, the 'value' field is REQUIRED. For css, the 'selector' field is REQUIRED. For role, the 'role' field is REQUIRED.",
      "Elements with hid:true may be CSS-hidden inputs (opacity:0) or offscreen — they are still valid targets if they match contextName.",
    ].join("\n");

    const userContent = JSON.stringify({ url: page.url(), action, contextName, candidates });

    const result = await withRetry(
      () => aiProvider!.generateHealPlan({
        systemPrompt,
        userContent,
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
  }

  interface PickValidOptions {
    skipVisibilityCheck?: boolean;
  }

  async function pickValid(plan: ReturnType<typeof HealPlan.parse>, options?: PickValidOptions): Promise<PickResult> {
    const strategiesTried: Array<{ type: string; reason: string }> = [];
    const skipVisibilityCheck = options?.skipVisibilityCheck ?? false;

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

        return { choice: c, strategiesTried };
      } catch (err: any) {
        const reason = err?.message ?? "unknown error";
        healLog.candidateError(c.strategy.type, reason);
        strategiesTried.push({ type: c.strategy.type, reason: `error: ${reason}` });
        continue;
      }
    }
    return { choice: null, strategiesTried };
  }

  async function saveToCache(key: string, strategy: StrategyT, contextName: string) {
    mem.set(key, strategy);
    const cache = await ensureDiskCacheLoaded();
    cache[key] = { ...strategy, context: contextName, testName: currentTestName };
    await writeAtomic(cacheFile, cache);
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
    const aiOnlyMode = !isValidLocator(target);
    let originalError: Error | null = null;

    // Try original locator first
    if (!aiOnlyMode) {
      try {
        await waitForReady(target as Locator, action, quickTimeout);
        await performAction(target as Locator);
        return;
      } catch (err: any) {
        if (!enabled) throw err;
        originalError = err;
      }
    }

    // AI healing flow — when disabled, fall back to native Playwright behavior
    if (!enabled && aiOnlyMode) {
      healLog.nativeFallback(action, contextName);
      const selector = typeof target === 'string' ? target : '';
      const nativeLoc = page.locator(selector);
      await performAction(nativeLoc);
      return;
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
        await log({ ts, url: page.url(), key, action, contextName, used: "cache", success: true, strategy: cached });
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
        await log({ ts, url: page.url(), key, action, contextName, used: "healed", success: false, error: "AI returned no plan", tokenUsage });
        healLog.noValidCandidate(contextName);
        if (tokenUsage) healLog.tokenUsage(tokenUsage.inputTokens, tokenUsage.outputTokens, tokenUsage.totalTokens);
        throw new HealError("AI returned no suggestions", {
          action,
          contextName,
          url: page.url(),
          candidatesAnalyzed,
          strategiesTried: [],
          originalError: originalError?.message,
        });
      }

      const pickResult = await pickValid(aiResult.plan, { skipVisibilityCheck: options?.forceClick });
      strategiesTried = pickResult.strategiesTried;
      const choice = pickResult.choice;

      if (!choice) {
        await log({ ts, url: page.url(), key, action, contextName, used: "healed", success: false, error: "No valid candidate", tokenUsage });
        healLog.noValidCandidate(contextName);
        if (tokenUsage) healLog.tokenUsage(tokenUsage.inputTokens, tokenUsage.outputTokens, tokenUsage.totalTokens);
        throw new HealError("Could not find a matching element", {
          action,
          contextName,
          url: page.url(),
          candidatesAnalyzed,
          strategiesTried,
          originalError: originalError?.message,
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
        ts, url: page.url(), key, action, contextName,
        used: "healed", success: true,
        confidence: choice.confidence, why: choice.why,
        strategy: choice.strategy,
        tokenUsage,
      });
      healLog.healed(contextName, choice.strategy);
      if (tokenUsage) healLog.tokenUsage(tokenUsage.inputTokens, tokenUsage.outputTokens, tokenUsage.totalTokens);
    } catch (healErr: any) {
      // If it's already a HealError, just re-throw it
      if (healErr instanceof HealError) {
        await log({
          ts, url: page.url(), key, action, contextName,
          used: "healed", success: false,
          error: healErr.message,
        });
        healLog.healFailed(contextName, "No matching element found");
        throw healErr;
      }

      // Otherwise wrap it in a HealError for better context
      await log({
        ts, url: page.url(), key, action, contextName,
        used: "healed", success: false,
        error: `Heal failed: ${String(healErr?.message ?? healErr)}`,
      });
      healLog.healFailed(contextName, String(healErr?.message ?? healErr));

      throw new HealError(String(healErr?.message ?? healErr), {
        action,
        contextName,
        url: page.url(),
        candidatesAnalyzed,
        strategiesTried,
        originalError: originalError?.message,
      });
    }
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

    focus: (target, contextName) => healAction(
      "focus", target, contextName,
      (loc) => loc.focus({ timeout }),
      { aiAction: "click" } // Use click candidates — focusable elements include buttons, divs, etc.
    ),

    setTestName: (name) => { currentTestName = name; },

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
    page: async ({ page }: { page: Page }, use: (page: HealPage) => Promise<void>) => {
      const healPage = withHealing(page, opts);
      await use(healPage);
    },
  };
}

export default withHealing;
