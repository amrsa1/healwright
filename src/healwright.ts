/**
 * healwright - AI-powered self-healing locators for Playwright
 */

import { Page, Locator } from "@playwright/test";
import OpenAI from "openai";
import path from "node:path";

import { healLog } from "./logger";
import {
  Action,
  LocatorOrEmpty,
  StrategyT,
  CacheT,
  HealMethods,
  HealPage,
  HealOptions,
  HealPlan,
  healPlanJsonSchema,
} from "./types";
import {
  isValidLocator,
  buildLocator,
  validateStrategy,
  waitForReady,
  waitForStable,
  collectCandidates,
  readJson,
  writeAtomic,
  appendLog,
  cacheKey,
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
  const openai = enabled && apiKey ? new OpenAI({ apiKey }) : null;
  const cacheFile = opts?.cacheFile ?? path.join(process.cwd(), ".self-heal", "healed_locators.json");
  const reportFile = opts?.reportFile ?? path.join(process.cwd(), ".self-heal", "heal_events.jsonl");
  const model = opts?.model ?? process.env.AI_MODEL ?? "gpt-4o-mini";
  const maxAiTries = opts?.maxAiTries ?? 4;
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

  async function askAI(action: Action, contextName: string) {
    if (!openai) throw new Error("Healing disabled or API key not set");

    const candidates = await collectCandidates(page, action);
    healLog.askingAI(contextName, candidates.length);

    const systemPrompt = [
      "You are a Playwright locator expert.",
      "Use contextName to identify the intended element from the candidates list.",
      "Return robust strategies ranked by preference: testid > role+name > label > placeholder > text > css.",
      "Avoid XPath and brittle selectors.",
      "Prefer strategies that match a single visible element.",
    ].join("\n");

    const userContent = JSON.stringify({ url: page.url(), action, contextName, candidates });

    try {
      const resp = await (openai as any).responses.create({
        model,
        input: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "HealPlan",
            strict: true,
            schema: healPlanJsonSchema,
          },
        },
        store: false,
      });

      const content = resp.output_text;
      healLog.aiResponse(content?.length ?? 0);
      
      if (!content) return null;
      
      try {
        return HealPlan.parse(JSON.parse(content));
      } catch {
        healLog.candidateError("parse", "Failed to parse AI response");
        return null;
      }
    } catch (aiErr: any) {
      healLog.candidateError("api", aiErr?.message ?? String(aiErr));
      throw aiErr;
    }
  }

  async function pickValid(plan: ReturnType<typeof HealPlan.parse>) {
    for (const c of plan.candidates.slice(0, maxAiTries)) {
      const validationError = validateStrategy(c.strategy);
      if (validationError) {
        healLog.candidateRejected(c.strategy.type, validationError);
        continue;
      }
      try {
        const loc = buildLocator(page, c.strategy);
        const count = await loc.count();
        if (count !== 1) {
          healLog.candidateRejected(c.strategy.type, `count=${count}`);
          continue;
        }
        const visible = await loc.first().isVisible();
        if (!visible) {
          healLog.candidateRejected(c.strategy.type, "not visible");
          continue;
        }
        return c;
      } catch (err: any) {
        healLog.candidateError(c.strategy.type, err?.message);
        continue;
      }
    }
    return null;
  }

  async function saveToCache(key: string, strategy: StrategyT, contextName: string) {
    mem.set(key, strategy);
    const cache = await ensureDiskCacheLoaded();
    cache[key] = { ...strategy, context: contextName, testName: currentTestName };
    await writeAtomic(cacheFile, cache);
  }

  // Generic heal action handler
  async function healAction(
    action: Action,
    target: LocatorOrEmpty,
    contextName: string,
    performAction: (loc: Locator) => Promise<void>,
    aiAction?: Action // Override action type for AI (e.g., check uses "fill" candidates)
  ): Promise<void> {
    const ts = new Date().toISOString();
    const key = cacheKey(page, action, contextName);
    const aiOnlyMode = !isValidLocator(target);

    // Try original locator first
    if (!aiOnlyMode) {
      try {
        await waitForReady(target as Locator, action, quickTimeout);
        await performAction(target as Locator);
        return;
      } catch (originalErr: any) {
        if (!enabled) throw originalErr;
      }
    }

    // AI healing flow
    const originalErr = aiOnlyMode ? new Error(`AI detect mode for: ${contextName}`) : null;
    if (!enabled && aiOnlyMode) throw new Error("AI detection requires healing to be enabled");

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
        if (action === "click" || action === "dblclick") await waitForStable(page);
        await log({ ts, url: page.url(), key, action, contextName, used: "cache", success: true, strategy: cached });
        healLog.usedCache(contextName);
        return;
      } catch {
        healLog.cacheMiss(contextName);
      }
    }

    // Ask AI
    try {
      const plan = await askAI(aiAction ?? action, contextName);
      const choice = await pickValid(plan!);

      if (!choice) {
        await log({ ts, url: page.url(), key, action, contextName, used: "healed", success: false, error: "No valid candidate" });
        healLog.noValidCandidate(contextName);
        throw originalErr ?? new Error(`No valid candidate for: ${contextName}`);
      }

      await saveToCache(key, choice.strategy, contextName);

      const healedLoc = buildLocator(page, choice.strategy);
      await waitForReady(healedLoc, action, timeout);
      await performAction(healedLoc);
      if (action === "click" || action === "dblclick") await waitForStable(page);

      await log({
        ts, url: page.url(), key, action, contextName,
        used: "healed", success: true,
        confidence: choice.confidence, why: choice.why,
        strategy: choice.strategy,
      });
      healLog.healed(contextName, choice.strategy);
    } catch (healErr: any) {
      await log({
        ts, url: page.url(), key, action, contextName,
        used: "healed", success: false,
        error: `Heal failed: ${String(healErr?.message ?? healErr)}`,
      });
      healLog.healFailed(contextName, String(healErr?.message ?? healErr));
      throw aiOnlyMode ? healErr : originalErr;
    }
  }

  // Heal methods
  const healMethods: HealMethods = {
    click: (target, contextName) => healAction(
      "click", target, contextName,
      (loc) => loc.click({ timeout })
    ),

    fill: (target, contextName, value) => healAction(
      "fill", target, contextName,
      (loc) => loc.fill(value, { timeout })
    ),

    selectOption: (target, contextName, value) => healAction(
      "click", target, contextName,
      async (loc) => { await loc.selectOption(value, { timeout }); }
    ),

    dblclick: (target, contextName) => healAction(
      "dblclick", target, contextName,
      (loc) => loc.dblclick({ timeout }),
      "click" // Use click candidates for dblclick
    ),

    check: (target, contextName) => healAction(
      "check", target, contextName,
      (loc) => loc.check({ timeout }),
      "fill" // Use fill candidates for check (inputs)
    ),

    hover: (target, contextName) => healAction(
      "hover", target, contextName,
      (loc) => loc.hover({ timeout }),
      "click" // Use click candidates for hover
    ),

    focus: (target, contextName) => healAction(
      "focus", target, contextName,
      (loc) => loc.focus({ timeout }),
      "fill" // Use fill candidates for focus
    ),

    setTestName: (name) => { currentTestName = name; },
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
