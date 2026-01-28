import { Page, Locator } from "@playwright/test";
import OpenAI from "openai";
import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";

type Action = "click" | "fill" | "dblclick" | "check" | "hover" | "focus";

// ═══════════════════════════════════════════════════════════════════════════════
// Console styling - Clean, minimal, professional
// ═══════════════════════════════════════════════════════════════════════════════
const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  italic: "\x1b[3m",
  // Foreground colors
  gray: "\x1b[90m",
  red: "\x1b[91m",
  green: "\x1b[92m",
  yellow: "\x1b[93m",
  blue: "\x1b[94m",
  purple: "\x1b[95m",
  cyan: "\x1b[96m",
  white: "\x1b[97m",
  // Background
  bgPurple: "\x1b[48;5;99m",
  bgGreen: "\x1b[48;5;28m",
  bgRed: "\x1b[48;5;124m",
  bgBlue: "\x1b[48;5;24m",
};

const healLog = {
  banner: () => {
    console.log();
    console.log(`${c.bgPurple}${c.bold}${c.white}  ✦ healwright  ${c.reset}`);
  },
  
  actionFailed: (action: string, contextName: string) => {
    console.log(`${c.gray}  │${c.reset}`);
    console.log(`${c.gray}  ├─${c.reset} ${c.yellow}⚡${c.reset} ${c.dim}${action.toUpperCase()}${c.reset} ${c.white}${contextName}${c.reset}`);
  },
  
  askingAI: (contextName: string, candidateCount: number) => {
    console.log(`${c.gray}  │  ${c.purple}⬡${c.reset} ${c.dim}analyzing ${candidateCount} elements...${c.reset}`);
  },
  
  aiResponse: (length: number) => {
    console.log(`${c.gray}  │  ${c.dim}↳ received ${length} chars${c.reset}`);
  },
  
  candidateRejected: (type: string, reason: string) => {
    console.log(`${c.gray}  │  ${c.dim}↳ [${type}] skipped: ${reason}${c.reset}`);
  },
  
  candidateError: (type: string, error: string) => {
    console.log(`${c.gray}  │  ${c.red}↳ [${type}] error: ${error}${c.reset}`);
  },
  
  healed: (contextName: string, strategy: StrategyT) => {
    const strategyStr = formatStrategy(strategy);
    console.log(`${c.gray}  │${c.reset}`);
    console.log(`${c.gray}  └─${c.reset} ${c.green}✓${c.reset} ${c.bold}${c.white}${contextName}${c.reset}`);
    console.log(`${c.gray}     ${c.dim}→ ${strategyStr}${c.reset}`);
    console.log();
  },
  
  usedCache: (contextName: string) => {
    console.log(`${c.gray}  │  ${c.cyan}◆${c.reset} ${c.dim}cached${c.reset}`);
  },
  
  cacheMiss: (contextName: string) => {
    console.log(`${c.gray}  │  ${c.yellow}○${c.reset} ${c.dim}cache stale, re-healing...${c.reset}`);
  },
  
  healFailed: (contextName: string, error: string) => {
    console.log(`${c.gray}  │${c.reset}`);
    console.log(`${c.gray}  └─${c.reset} ${c.red}✕${c.reset} ${c.red}${contextName}${c.reset}`);
    console.log(`${c.gray}     ${c.dim}${error}${c.reset}`);
    console.log();
  },
  
  aiDetectMode: (action: string, contextName: string) => {
    console.log(`${c.gray}  │${c.reset}`);
    console.log(`${c.gray}  ├─${c.reset} ${c.purple}◈${c.reset} ${c.dim}AI DETECT${c.reset} ${c.white}${contextName}${c.reset}`);
  },
  
  noValidCandidate: (contextName: string) => {
    console.log(`${c.gray}  │  ${c.red}↳ no valid candidate found${c.reset}`);
  },
};

function formatStrategy(s: StrategyT): string {
  switch (s.type) {
    case "testid": return `getByTestId("${s.value}")`;
    case "role": return `getByRole("${s.role}"${s.name ? `, { name: "${s.name}" }` : ""})`;
    case "label": return `getByLabel("${s.text}")`;
    case "placeholder": return `getByPlaceholder("${s.text}")`;
    case "text": return `getByText("${s.text}")`;
    case "css": return `locator("${s.selector}")`;
    default: return JSON.stringify(s);
  }
}

// Strategy schema
const Strategy = z.object({
  type: z.enum(["testid", "role", "label", "placeholder", "text", "css"]),
  value: z.string().nullable().optional(),
  selector: z.string().nullable().optional(),
  role: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  text: z.string().nullable().optional(),
  exact: z.boolean().nullable().optional(),
});

const HealPlan = z.object({
  candidates: z.array(z.object({
    strategy: Strategy,
    confidence: z.number(),
    why: z.string(),
  })),
});

type StrategyT = z.infer<typeof Strategy>;
type CacheEntryT = StrategyT & { context: string; testName?: string };
type CacheT = Record<string, CacheEntryT>;
type LocatorOrEmpty = Locator | string;

function isValidLocator(target: LocatorOrEmpty): target is Locator {
  return typeof target !== 'string' || target !== '';
}

function buildLocator(page: Page, s: StrategyT): Locator {
  switch (s.type) {
    case "testid":
      if (!s.value) throw new Error("testid strategy requires 'value'");
      return page.getByTestId(s.value);
    case "role":
      if (!s.role) throw new Error("role strategy requires 'role'");
      return page.getByRole(s.role as any, { name: s.name ?? undefined, exact: s.exact ?? undefined });
    case "label":
      if (!s.text) throw new Error("label strategy requires 'text'");
      return page.getByLabel(s.text, { exact: s.exact ?? undefined });
    case "placeholder":
      if (!s.text) throw new Error("placeholder strategy requires 'text'");
      return page.getByPlaceholder(s.text, { exact: s.exact ?? undefined });
    case "text":
      if (!s.text) throw new Error("text strategy requires 'text'");
      return page.getByText(s.text, { exact: s.exact ?? undefined });
    case "css":
      if (!s.selector) throw new Error("css strategy requires 'selector'");
      return page.locator(s.selector);
  }
  throw new Error(`Unknown strategy type: ${s.type}`);
}

async function waitForReady(loc: Locator, _action: string, timeout: number): Promise<void> {
  await loc.waitFor({ state: "visible", timeout });
}

async function waitForStable(page: Page): Promise<void> {
  await page.waitForLoadState("domcontentloaded");
}

async function collectCandidates(page: Page, action: Action, limit = 120) {
  const selector =
    action === "click"
      ? "button,[role='button'],a,input[type='button'],input[type='submit'],[onclick],[role='menuitem'],[role='tab'],[role='combobox'],select"
      : "input,textarea,[contenteditable='true'],[role='textbox'],select,[role='combobox']";

  return page.evaluate(({ selector, limit }) => {
    const els = Array.from(document.querySelectorAll(selector)).slice(0, limit);
    const pickTest = (el: Element) => {
      for (const a of ["data-testid", "data-test", "data-test-id", "data-qa", "data-cy"]) {
        const v = el.getAttribute(a);
        if (v) return { attr: a, value: v };
      }
      return null;
    };
    const isVisible = (el: Element) => {
      const e = el as HTMLElement;
      const s = window.getComputedStyle(e);
      if (s.display === "none" || s.visibility === "hidden") return false;
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const norm = (t: string) => t.replace(/\s+/g, " ").trim().slice(0, 80);
    return els.map(el => ({
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute("role"),
      ariaLabel: el.getAttribute("aria-label"),
      nameAttr: el.getAttribute("name"),
      placeholder: el.getAttribute("placeholder"),
      type: el.getAttribute("type"),
      href: el.getAttribute("href"),
      id: (el as HTMLElement).id || null,
      test: pickTest(el),
      text: norm((el as HTMLElement).innerText || el.textContent || ""),
      visible: isVisible(el),
    }));
  }, { selector, limit });
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try { return JSON.parse(await fs.readFile(file, "utf8")); } catch { return fallback; }
}

async function writeAtomic(file: string, data: unknown) {
  const dir = path.dirname(file);
  try { await fs.mkdir(dir, { recursive: true }); } catch { /* ignore */ }
  const tmp = file + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tmp, file);
}

// ═══════════════════════════════════════════════════════════════════════════════
// HealPage Interface - Extends Page with healing capabilities
// ═══════════════════════════════════════════════════════════════════════════════

export interface HealMethods {
  click(target: LocatorOrEmpty, contextName: string): Promise<void>;
  fill(target: LocatorOrEmpty, contextName: string, value: string): Promise<void>;
  selectOption(target: LocatorOrEmpty, contextName: string, value: string): Promise<void>;
  dblclick(target: LocatorOrEmpty, contextName: string): Promise<void>;
  check(target: LocatorOrEmpty, contextName: string): Promise<void>;
  hover(target: LocatorOrEmpty, contextName: string): Promise<void>;
  focus(target: LocatorOrEmpty, contextName: string): Promise<void>;
  setTestName(name: string): void;
}

export interface HealPage extends Page {
  heal: HealMethods;
}

export interface HealOptions {
  enabled?: boolean;
  model?: string;
  cacheFile?: string;
  reportFile?: string;
  maxAiTries?: number;
  timeout?: number;
  testName?: string;
  apiKey?: string;
}

// Symbol to store heal instance on page
const HEAL_SYMBOL = Symbol.for('healwright');

/**
 * Enhance a Playwright Page with self-healing capabilities.
 * 
 * @example
 * ```typescript
 * import { withHealing, HealPage } from 'healwright';
 * 
 * test('my test', async ({ page }) => {
 *   const healPage = withHealing(page);
 *   
 *   // Use with locator (heals if fails)
 *   await healPage.heal.click(page.getByRole('button'), 'Submit button');
 *   
 *   // Use with AI-only detection (empty string)
 *   await healPage.heal.click('', 'Submit button');
 *   await healPage.heal.fill('', 'Email input', 'test@example.com');
 * });
 * ```
 */
export function withHealing(page: Page, opts?: HealOptions): HealPage {
  // Return existing heal instance if already attached
  if ((page as any)[HEAL_SYMBOL]) {
    return page as HealPage;
  }

  const enabled = opts?.enabled ?? (process.env.SELF_HEAL === "1" || process.env.AI_SELF_HEAL === "true");
  const apiKey = opts?.apiKey ?? process.env.AI_API_KEY;
  const openai = enabled && apiKey ? new OpenAI({ apiKey }) : null;

  const cacheFile = opts?.cacheFile ?? path.join(process.cwd(), ".self-heal", "healed_locators.json");
  const reportFile = opts?.reportFile ?? path.join(process.cwd(), ".self-heal", "heal_events.jsonl");
  const model = opts?.model ?? process.env.AI_MODEL ?? "gpt-4o-mini";
  const maxAiTries = opts?.maxAiTries ?? 4;
  const timeout = opts?.timeout ?? 5000;
  const quickTimeout = enabled ? 1000 : timeout;

  let currentTestName = opts?.testName;
  let bannerShownForTest: string | undefined;

  const mem = new Map<string, StrategyT>();
  let diskCacheLoaded = false;
  let diskCache: CacheT = {};

  async function ensureDiskCacheLoaded(): Promise<CacheT> {
    if (!diskCacheLoaded) {
      diskCache = await readJson(cacheFile, {});
      diskCacheLoaded = true;
    }
    return diskCache;
  }

  function setTestName(name: string) {
    currentTestName = name;
  }

  function showBannerOnce() {
    if (bannerShownForTest !== currentTestName) {
      healLog.banner();
      bannerShownForTest = currentTestName;
    }
  }

  const keyFor = (action: Action, contextName: string) => {
    const u = new URL(page.url());
    return `${action}::${u.origin}${u.pathname}::${contextName}`;
  };

  const log = (e: any) => {
    const dir = path.dirname(reportFile);
    fs.mkdir(dir, { recursive: true }).catch(() => {});
    fs.appendFile(reportFile, JSON.stringify(e) + "\n", "utf8").catch(() => {});
  };

  async function askAI(action: Action, contextName: string) {
    if (!openai) throw new Error("Healing disabled or API key not set");

    const candidates = await collectCandidates(page, action);
    const systemPrompt = [
      "You are a Playwright locator expert.",
      "Use contextName to identify the intended element from the candidates list.",
      "Return robust strategies ranked by preference: testid > role+name > label > placeholder > text > css.",
      "Avoid XPath and brittle selectors.",
      "Prefer strategies that match a single visible element.",
    ].join("\n");

    const userContent = JSON.stringify({ url: page.url(), action, contextName, candidates });
    healLog.askingAI(contextName, candidates.length);

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
            schema: {
              type: "object",
              properties: {
                candidates: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      strategy: {
                        type: "object",
                        properties: {
                          type: { type: "string", enum: ["testid", "role", "label", "placeholder", "text", "css"] },
                          value: { type: ["string", "null"] },
                          selector: { type: ["string", "null"] },
                          role: { type: ["string", "null"] },
                          name: { type: ["string", "null"] },
                          text: { type: ["string", "null"] },
                          exact: { type: ["boolean", "null"] },
                        },
                        required: ["type", "value", "selector", "role", "name", "text", "exact"],
                        additionalProperties: false,
                      },
                      confidence: { type: "number" },
                      why: { type: "string" },
                    },
                    required: ["strategy", "confidence", "why"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["candidates"],
              additionalProperties: false,
            },
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

  function validateStrategy(s: StrategyT): string | null {
    switch (s.type) {
      case "testid": if (!s.value) return "missing 'value'"; break;
      case "role": if (!s.role) return "missing 'role'"; break;
      case "label":
      case "placeholder":
      case "text": if (!s.text) return "missing 'text'"; break;
      case "css": if (!s.selector) return "missing 'selector'"; break;
    }
    return null;
  }

  async function pickValid(plan: z.infer<typeof HealPlan>) {
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

  // ═══════════════════════════════════════════════════════════════════════════════
  // Heal Methods
  // ═══════════════════════════════════════════════════════════════════════════════

  async function click(target: LocatorOrEmpty, contextName: string) {
    const ts = new Date().toISOString();
    const action: Action = "click";
    const key = keyFor(action, contextName);
    const aiOnlyMode = !isValidLocator(target);

    if (!aiOnlyMode) {
      try {
        await waitForReady(target as Locator, "click", quickTimeout);
        await (target as Locator).click({ timeout });
        return;
      } catch (originalErr: any) {
        if (!enabled) throw originalErr;
      }
    }

    {
      const originalErr = aiOnlyMode ? new Error(`AI detect mode for: ${contextName}`) : null;
      if (!enabled && aiOnlyMode) throw new Error("AI detection requires healing to be enabled");

      showBannerOnce();
      if (aiOnlyMode) {
        healLog.aiDetectMode("click", contextName);
      } else {
        healLog.actionFailed("click", contextName);
      }

      const cache = await ensureDiskCacheLoaded();
      const cached = mem.get(key) ?? cache[key];

      if (cached) {
        try {
          const cachedLoc = buildLocator(page, cached);
          await waitForReady(cachedLoc, "click", timeout);
          await cachedLoc.click({ timeout });
          await waitForStable(page);
          await log({ ts, url: page.url(), key, action, contextName, used: "cache", success: true, strategy: cached });
          healLog.usedCache(contextName);
          return;
        } catch {
          healLog.cacheMiss(contextName);
        }
      }

      try {
        const plan = await askAI(action, contextName);
        const choice = await pickValid(plan!);

        if (!choice) {
          await log({ ts, url: page.url(), key, action, contextName, used: "healed", success: false, error: "No valid candidate" });
          healLog.noValidCandidate(contextName);
          throw originalErr ?? new Error(`No valid candidate for: ${contextName}`);
        }

        mem.set(key, choice.strategy);
        cache[key] = { ...choice.strategy, context: contextName, testName: currentTestName };
        await writeAtomic(cacheFile, cache);

        const healedLoc = buildLocator(page, choice.strategy);
        await waitForReady(healedLoc, "click", timeout);
        await healedLoc.click({ timeout });
        await waitForStable(page);

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
  }

  async function fill(target: LocatorOrEmpty, contextName: string, value: string) {
    const ts = new Date().toISOString();
    const action: Action = "fill";
    const key = keyFor(action, contextName);
    const aiOnlyMode = !isValidLocator(target);

    if (!aiOnlyMode) {
      try {
        await waitForReady(target as Locator, "fill", quickTimeout);
        await (target as Locator).fill(value, { timeout });
        return;
      } catch (originalErr: any) {
        if (!enabled) throw originalErr;
      }
    }

    {
      const originalErr = aiOnlyMode ? new Error(`AI detect mode for: ${contextName}`) : null;
      if (!enabled && aiOnlyMode) throw new Error("AI detection requires healing to be enabled");

      showBannerOnce();
      if (aiOnlyMode) {
        healLog.aiDetectMode("fill", contextName);
      } else {
        healLog.actionFailed("fill", contextName);
      }

      const cache = await ensureDiskCacheLoaded();
      const cached = mem.get(key) ?? cache[key];

      if (cached) {
        try {
          const cachedLoc = buildLocator(page, cached);
          await waitForReady(cachedLoc, "fill", timeout);
          await cachedLoc.fill(value, { timeout });
          await log({ ts, url: page.url(), key, action, contextName, used: "cache", success: true, strategy: cached });
          healLog.usedCache(contextName);
          return;
        } catch {
          healLog.cacheMiss(contextName);
        }
      }

      try {
        const plan = await askAI(action, contextName);
        const choice = await pickValid(plan!);

        if (!choice) {
          await log({ ts, url: page.url(), key, action, contextName, used: "healed", success: false, error: "No valid candidate" });
          healLog.noValidCandidate(contextName);
          throw originalErr ?? new Error(`No valid candidate for: ${contextName}`);
        }

        mem.set(key, choice.strategy);
        cache[key] = { ...choice.strategy, context: contextName, testName: currentTestName };
        await writeAtomic(cacheFile, cache);

        const healedLoc = buildLocator(page, choice.strategy);
        await waitForReady(healedLoc, "fill", timeout);
        await healedLoc.fill(value, { timeout });

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
  }

  async function selectOption(target: LocatorOrEmpty, contextName: string, value: string) {
    const ts = new Date().toISOString();
    const action: Action = "click";
    const key = keyFor(action, contextName);
    const aiOnlyMode = !isValidLocator(target);

    if (!aiOnlyMode) {
      try {
        await waitForReady(target as Locator, "click", quickTimeout);
        await (target as Locator).selectOption(value, { timeout });
        return;
      } catch (originalErr: any) {
        if (!enabled) throw originalErr;
      }
    }

    {
      const originalErr = aiOnlyMode ? new Error(`AI detect mode for: ${contextName}`) : null;
      if (!enabled && aiOnlyMode) throw new Error("AI detection requires healing to be enabled");

      showBannerOnce();
      if (aiOnlyMode) {
        healLog.aiDetectMode("select", contextName);
      } else {
        healLog.actionFailed("select", contextName);
      }

      const cache = await ensureDiskCacheLoaded();
      const cached = mem.get(key) ?? cache[key];

      if (cached) {
        try {
          const cachedLoc = buildLocator(page, cached);
          await waitForReady(cachedLoc, "click", timeout);
          await cachedLoc.selectOption(value, { timeout });
          await log({ ts, url: page.url(), key, action, contextName, used: "cache", success: true, strategy: cached });
          healLog.usedCache(contextName);
          return;
        } catch {
          healLog.cacheMiss(contextName);
        }
      }

      try {
        const plan = await askAI(action, contextName);
        const choice = await pickValid(plan!);

        if (!choice) {
          await log({ ts, url: page.url(), key, action, contextName, used: "healed", success: false, error: "No valid candidate" });
          healLog.noValidCandidate(contextName);
          throw originalErr ?? new Error(`No valid candidate for: ${contextName}`);
        }

        mem.set(key, choice.strategy);
        cache[key] = { ...choice.strategy, context: contextName, testName: currentTestName };
        await writeAtomic(cacheFile, cache);

        const healedLoc = buildLocator(page, choice.strategy);
        await waitForReady(healedLoc, "click", timeout);
        await healedLoc.selectOption(value, { timeout });

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
  }

  async function dblclick(target: LocatorOrEmpty, contextName: string) {
    const ts = new Date().toISOString();
    const action: Action = "dblclick";
    const key = keyFor(action, contextName);
    const aiOnlyMode = !isValidLocator(target);

    if (!aiOnlyMode) {
      try {
        await waitForReady(target as Locator, "dblclick", quickTimeout);
        await (target as Locator).dblclick({ timeout });
        return;
      } catch (originalErr: any) {
        if (!enabled) throw originalErr;
      }
    }

    {
      const originalErr = aiOnlyMode ? new Error(`AI detect mode for: ${contextName}`) : null;
      if (!enabled && aiOnlyMode) throw new Error("AI detection requires healing to be enabled");

      showBannerOnce();
      if (aiOnlyMode) {
        healLog.aiDetectMode("dblclick", contextName);
      } else {
        healLog.actionFailed("dblclick", contextName);
      }

      const cache = await ensureDiskCacheLoaded();
      const cached = mem.get(key) ?? cache[key];

      if (cached) {
        try {
          const cachedLoc = buildLocator(page, cached);
          await waitForReady(cachedLoc, "dblclick", timeout);
          await cachedLoc.dblclick({ timeout });
          await waitForStable(page);
          await log({ ts, url: page.url(), key, action, contextName, used: "cache", success: true, strategy: cached });
          healLog.usedCache(contextName);
          return;
        } catch {
          healLog.cacheMiss(contextName);
        }
      }

      try {
        const plan = await askAI("click", contextName);
        const choice = await pickValid(plan!);

        if (!choice) {
          await log({ ts, url: page.url(), key, action, contextName, used: "healed", success: false, error: "No valid candidate" });
          healLog.noValidCandidate(contextName);
          throw originalErr ?? new Error(`No valid candidate for: ${contextName}`);
        }

        mem.set(key, choice.strategy);
        cache[key] = { ...choice.strategy, context: contextName, testName: currentTestName };
        await writeAtomic(cacheFile, cache);

        const healedLoc = buildLocator(page, choice.strategy);
        await waitForReady(healedLoc, "dblclick", timeout);
        await healedLoc.dblclick({ timeout });
        await waitForStable(page);

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
  }

  async function check(target: LocatorOrEmpty, contextName: string) {
    const ts = new Date().toISOString();
    const action: Action = "check";
    const key = keyFor(action, contextName);
    const aiOnlyMode = !isValidLocator(target);

    if (!aiOnlyMode) {
      try {
        await waitForReady(target as Locator, "check", quickTimeout);
        await (target as Locator).check({ timeout });
        return;
      } catch (originalErr: any) {
        if (!enabled) throw originalErr;
      }
    }

    {
      const originalErr = aiOnlyMode ? new Error(`AI detect mode for: ${contextName}`) : null;
      if (!enabled && aiOnlyMode) throw new Error("AI detection requires healing to be enabled");

      showBannerOnce();
      if (aiOnlyMode) {
        healLog.aiDetectMode("check", contextName);
      } else {
        healLog.actionFailed("check", contextName);
      }

      const cache = await ensureDiskCacheLoaded();
      const cached = mem.get(key) ?? cache[key];

      if (cached) {
        try {
          const cachedLoc = buildLocator(page, cached);
          await waitForReady(cachedLoc, "check", timeout);
          await cachedLoc.check({ timeout });
          await log({ ts, url: page.url(), key, action, contextName, used: "cache", success: true, strategy: cached });
          healLog.usedCache(contextName);
          return;
        } catch {
          healLog.cacheMiss(contextName);
        }
      }

      try {
        const plan = await askAI("fill", contextName);
        const choice = await pickValid(plan!);

        if (!choice) {
          await log({ ts, url: page.url(), key, action, contextName, used: "healed", success: false, error: "No valid candidate" });
          healLog.noValidCandidate(contextName);
          throw originalErr ?? new Error(`No valid candidate for: ${contextName}`);
        }

        mem.set(key, choice.strategy);
        cache[key] = { ...choice.strategy, context: contextName, testName: currentTestName };
        await writeAtomic(cacheFile, cache);

        const healedLoc = buildLocator(page, choice.strategy);
        await waitForReady(healedLoc, "check", timeout);
        await healedLoc.check({ timeout });

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
  }

  async function hover(target: LocatorOrEmpty, contextName: string) {
    const ts = new Date().toISOString();
    const action: Action = "hover";
    const key = keyFor(action, contextName);
    const aiOnlyMode = !isValidLocator(target);

    if (!aiOnlyMode) {
      try {
        await waitForReady(target as Locator, "hover", quickTimeout);
        await (target as Locator).hover({ timeout });
        return;
      } catch (originalErr: any) {
        if (!enabled) throw originalErr;
      }
    }

    {
      const originalErr = aiOnlyMode ? new Error(`AI detect mode for: ${contextName}`) : null;
      if (!enabled && aiOnlyMode) throw new Error("AI detection requires healing to be enabled");

      showBannerOnce();
      if (aiOnlyMode) {
        healLog.aiDetectMode("hover", contextName);
      } else {
        healLog.actionFailed("hover", contextName);
      }

      const cache = await ensureDiskCacheLoaded();
      const cached = mem.get(key) ?? cache[key];

      if (cached) {
        try {
          const cachedLoc = buildLocator(page, cached);
          await waitForReady(cachedLoc, "hover", timeout);
          await cachedLoc.hover({ timeout });
          await log({ ts, url: page.url(), key, action, contextName, used: "cache", success: true, strategy: cached });
          healLog.usedCache(contextName);
          return;
        } catch {
          healLog.cacheMiss(contextName);
        }
      }

      try {
        const plan = await askAI("click", contextName);
        const choice = await pickValid(plan!);

        if (!choice) {
          await log({ ts, url: page.url(), key, action, contextName, used: "healed", success: false, error: "No valid candidate" });
          healLog.noValidCandidate(contextName);
          throw originalErr ?? new Error(`No valid candidate for: ${contextName}`);
        }

        mem.set(key, choice.strategy);
        cache[key] = { ...choice.strategy, context: contextName, testName: currentTestName };
        await writeAtomic(cacheFile, cache);

        const healedLoc = buildLocator(page, choice.strategy);
        await waitForReady(healedLoc, "hover", timeout);
        await healedLoc.hover({ timeout });

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
  }

  async function focus(target: LocatorOrEmpty, contextName: string) {
    const ts = new Date().toISOString();
    const action: Action = "focus";
    const key = keyFor(action, contextName);
    const aiOnlyMode = !isValidLocator(target);

    if (!aiOnlyMode) {
      try {
        await waitForReady(target as Locator, "focus", quickTimeout);
        await (target as Locator).focus({ timeout });
        return;
      } catch (originalErr: any) {
        if (!enabled) throw originalErr;
      }
    }

    {
      const originalErr = aiOnlyMode ? new Error(`AI detect mode for: ${contextName}`) : null;
      if (!enabled && aiOnlyMode) throw new Error("AI detection requires healing to be enabled");

      showBannerOnce();
      if (aiOnlyMode) {
        healLog.aiDetectMode("focus", contextName);
      } else {
        healLog.actionFailed("focus", contextName);
      }

      const cache = await ensureDiskCacheLoaded();
      const cached = mem.get(key) ?? cache[key];

      if (cached) {
        try {
          const cachedLoc = buildLocator(page, cached);
          await waitForReady(cachedLoc, "focus", timeout);
          await cachedLoc.focus({ timeout });
          await log({ ts, url: page.url(), key, action, contextName, used: "cache", success: true, strategy: cached });
          healLog.usedCache(contextName);
          return;
        } catch {
          healLog.cacheMiss(contextName);
        }
      }

      try {
        const plan = await askAI("fill", contextName);
        const choice = await pickValid(plan!);

        if (!choice) {
          await log({ ts, url: page.url(), key, action, contextName, used: "healed", success: false, error: "No valid candidate" });
          healLog.noValidCandidate(contextName);
          throw originalErr ?? new Error(`No valid candidate for: ${contextName}`);
        }

        mem.set(key, choice.strategy);
        cache[key] = { ...choice.strategy, context: contextName, testName: currentTestName };
        await writeAtomic(cacheFile, cache);

        const healedLoc = buildLocator(page, choice.strategy);
        await waitForReady(healedLoc, "focus", timeout);
        await healedLoc.focus({ timeout });

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
  }

  // Attach heal methods to page
  const healMethods: HealMethods = {
    click,
    fill,
    selectOption,
    dblclick,
    check,
    hover,
    focus,
    setTestName,
  };

  // Mark as enhanced
  (page as any)[HEAL_SYMBOL] = true;
  (page as any).heal = healMethods;

  return page as HealPage;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Playwright Test Fixture Integration
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create a Playwright test fixture that overrides the default `page` with healing capabilities.
 * 
 * The enhanced page provides BOTH:
 * - All standard Playwright Page methods (goto, fill, click, etc.)
 * - AI-powered healing methods via `page.heal.*`
 * 
 * @example
 * ```typescript
 * // fixtures.ts
 * import { test as base } from '@playwright/test';
 * import { createHealingFixture, HealPage } from 'healwright';
 * 
 * export const test = base.extend<{ page: HealPage }>(
 *   createHealingFixture()
 * );
 * 
 * // my-test.spec.ts
 * import { test } from './fixtures';
 * 
 * test('example', async ({ page }) => {
 *   await page.goto('https://example.com');
 *   
 *   // AI-powered healing - finds element by description
 *   await page.heal.click('', 'Login button');
 *   await page.heal.fill('', 'Email input', 'test@example.com');
 *   
 *   // Regular Playwright - standard locators, no AI
 *   await page.fill('#password', 'secret123');
 *   await page.click('button[type="submit"]');
 *   
 *   // Mix both: AI heals only if locator fails
 *   await page.heal.click(page.getByRole('button', { name: 'Submit' }), 'Submit button');
 * });
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

// Default export for convenience
export default withHealing;
