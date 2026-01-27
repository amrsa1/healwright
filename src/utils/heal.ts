import { Page, Locator } from "@playwright/test";
import OpenAI from "openai";
import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";

type Action = "click" | "fill" | "dblclick" | "check" | "hover" | "focus";

// ═══════════════════════════════════════════════════════════════════════════════
// Console styling utilities for better readability
// ═══════════════════════════════════════════════════════════════════════════════
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  
  // Foreground
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  
  // Background
  bgRed: "\x1b[41m",
  bgGreen: "\x1b[42m",
  bgYellow: "\x1b[43m",
  bgBlue: "\x1b[44m",
  bgMagenta: "\x1b[45m",
  bgCyan: "\x1b[46m",
};

const icons = {
  heal: "🔧",
  search: "🔍",
  ai: "🤖",
  success: "✅",
  fail: "❌",
  cache: "💾",
  warning: "⚠️",
  arrow: "→",
  bullet: "•",
};

const healLog = {
  banner: () => {
    console.log(`\n${colors.bgMagenta}${colors.bright}${colors.white} ${icons.heal} AI SELF-HEALING ${colors.reset}`);
    console.log(`${colors.dim}${"─".repeat(50)}${colors.reset}`);
  },
  
  actionFailed: (action: string, contextName: string) => {
    console.log(`${colors.yellow}${icons.warning} ${colors.bright}${action.toUpperCase()}${colors.reset}${colors.yellow} failed for "${colors.cyan}${contextName}${colors.yellow}"${colors.reset}`);
  },
  
  askingAI: (contextName: string, candidateCount: number) => {
    console.log(`${colors.blue}${icons.ai} Asking AI to heal "${colors.cyan}${contextName}${colors.blue}" (${candidateCount} candidates)...${colors.reset}`);
  },
  
  aiResponse: (length: number) => {
    console.log(`${colors.dim}   ${icons.bullet} AI response received (${length} chars)${colors.reset}`);
  },
  
  candidateRejected: (type: string, reason: string) => {
    console.log(`${colors.dim}   ${icons.bullet} Candidate [${type}] rejected: ${reason}${colors.reset}`);
  },
  
  candidateError: (type: string, error: string) => {
    console.log(`${colors.red}   ${icons.bullet} Candidate [${type}] error: ${error}${colors.reset}`);
  },
  
  healed: (contextName: string, strategy: StrategyT) => {
    const strategyStr = formatStrategy(strategy);
    console.log(`${colors.green}${icons.success} ${colors.bright}HEALED${colors.reset}${colors.green} "${colors.cyan}${contextName}${colors.green}" ${icons.arrow} ${colors.white}${strategyStr}${colors.reset}`);
    console.log(`${colors.dim}${"─".repeat(50)}${colors.reset}\n`);
  },
  
  usedCache: (contextName: string) => {
    console.log(`${colors.magenta}${icons.cache} Using cached strategy for "${colors.cyan}${contextName}${colors.magenta}"${colors.reset}`);
  },
  
  cacheMiss: (contextName: string) => {
    console.log(`${colors.yellow}${icons.warning} Cached strategy stale for "${colors.cyan}${contextName}${colors.yellow}", asking AI...${colors.reset}`);
  },
  
  healFailed: (contextName: string, error: string) => {
    console.log(`${colors.red}${icons.fail} ${colors.bright}HEAL FAILED${colors.reset}${colors.red} for "${colors.cyan}${contextName}${colors.red}": ${error}${colors.reset}`);
    console.log(`${colors.dim}${"─".repeat(50)}${colors.reset}\n`);
  },
  
  aiDetectMode: (action: string, contextName: string) => {
    console.log(`${colors.blue}${icons.search} ${colors.bright}AI DETECT${colors.reset}${colors.blue} mode for ${action.toUpperCase()}: "${colors.cyan}${contextName}${colors.blue}"${colors.reset}`);
  },
  
  noValidCandidate: (contextName: string) => {
    console.log(`${colors.red}${icons.fail} No valid candidate found for "${colors.cyan}${contextName}${colors.red}"${colors.reset}`);
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

// Strategy schema - accepts null values from AI response
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

// Cached entry includes context and test info for better debugging and filtering
type CacheEntryT = StrategyT & { context: string; testName?: string };
type CacheT = Record<string, CacheEntryT>;

// Type for target that can be either a Locator or empty string for AI-only detection
type LocatorOrEmpty = Locator | string;

// Check if target is a valid locator (not empty string)
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

/**
 * Ensures element is ready before interaction.
 * Playwright handles most actionability checks, so we only wait for visibility.
 */
async function waitForReady(
  loc: Locator,
  _action: "click" | "fill" | "select" | "dblclick" | "check" | "hover" | "focus",
  timeout: number
): Promise<void> {
  // Just wait for element to be visible - Playwright handles the rest
  await loc.waitFor({ state: "visible", timeout });
}

/**
 * Wait for page to be stable after an action that might trigger navigation or modals
 */
async function waitForStable(page: Page): Promise<void> {
  // Wait for any pending network requests to settle
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

export function createHealer(opts?: {
  enabled?: boolean;
  model?: string;
  cacheFile?: string;
  reportFile?: string;
  maxAiTries?: number;
  timeout?: number;
  testName?: string;
}) {
  const enabled = opts?.enabled ?? true;
  let currentTestName = opts?.testName;
  let bannerShownForTest: string | undefined;
  const openai = enabled ? new OpenAI({ apiKey: process.env.AI_API_KEY }) : null;

  const cacheFile = opts?.cacheFile ?? path.join(process.cwd(), ".self-heal", "healed_locators.json");
  const reportFile = opts?.reportFile ?? path.join(process.cwd(), ".self-heal", "heal_events.jsonl");
  const model = opts?.model ?? process.env.AI_MODEL ?? "gpt-4o-mini";
  const maxAiTries = opts?.maxAiTries ?? 4;
  const timeout = opts?.timeout ?? 5000;
  // Shorter timeout for initial attempt when healing is enabled (fail fast to heal)
  const quickTimeout = enabled ? 1000 : timeout;

  // In-memory cache for fast lookups (loaded from disk once)
  const mem = new Map<string, StrategyT>();
  let diskCacheLoaded = false;
  let diskCache: CacheT = {};

  // Load disk cache once (lazy)
  async function ensureDiskCacheLoaded(): Promise<CacheT> {
    if (!diskCacheLoaded) {
      diskCache = await readJson(cacheFile, {});
      diskCacheLoaded = true;
    }
    return diskCache;
  }

  // Allow setting test name dynamically for better cache metadata
  function setTestName(name: string) {
    currentTestName = name;
  }

  // Show banner only once per test
  function showBannerOnce() {
    if (bannerShownForTest !== currentTestName) {
      healLog.banner();
      bannerShownForTest = currentTestName;
    }
  }

  const keyFor = (page: Page, action: Action, contextName: string) => {
    const u = new URL(page.url());
    return `${action}::${u.origin}${u.pathname}::${contextName}`;
  };

  // Non-blocking log (fire and forget)
  const log = (e: any) => {
    const dir = path.dirname(reportFile);
    fs.mkdir(dir, { recursive: true }).catch(() => {});
    fs.appendFile(reportFile, JSON.stringify(e) + "\n", "utf8").catch(() => {});
  };

  async function askAI(page: Page, action: Action, contextName: string) {
    if (!openai) throw new Error("Healing disabled");

    const candidates = await collectCandidates(page, action);

    const systemPrompt = [
      "You are a Playwright locator expert.",
      "Use contextName to identify the intended element from the candidates list.",
      "Return robust strategies ranked by preference: testid > role+name > label > placeholder > text > css.",
      "Avoid XPath and brittle selectors.",
      "Prefer strategies that match a single visible element.",
    ].join("\n");

    const userContent = JSON.stringify({
      url: page.url(),
      action,
      contextName,
      candidates,
    });

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
      } catch (parseErr) {
        healLog.candidateError("parse", "Failed to parse AI response");
        return null;
      }
    } catch (aiErr: any) {
      healLog.candidateError("api", aiErr?.message ?? String(aiErr));
      throw aiErr;
    }
  }

  // Validate strategy has required fields before building locator
  function validateStrategy(s: StrategyT): string | null {
    switch (s.type) {
      case "testid":
        if (!s.value) return "missing 'value'";
        break;
      case "role":
        if (!s.role) return "missing 'role'";
        break;
      case "label":
      case "placeholder":
      case "text":
        if (!s.text) return "missing 'text'";
        break;
      case "css":
        if (!s.selector) return "missing 'selector'";
        break;
    }
    return null;
  }

  async function pickValid(page: Page, plan: z.infer<typeof HealPlan>) {
    for (const c of plan.candidates.slice(0, maxAiTries)) {
      // Validate required fields first
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

  async function click(page: Page, target: LocatorOrEmpty, contextName: string) {
    const ts = new Date().toISOString();
    const action: Action = "click";
    const key = keyFor(page, action, contextName);
    const aiOnlyMode = !isValidLocator(target);

    // If AI-only mode (empty string passed), skip initial attempt
    if (!aiOnlyMode) {
      try {
        await waitForReady(target as Locator, "click", quickTimeout);
        await (target as Locator).click({ timeout });
        return;
      } catch (originalErr: any) {
        if (!enabled) throw originalErr;
      }
    }

    // AI healing/detection flow
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

      // Try cached strategy first
      if (cached) {
        try {
          const cachedLoc = buildLocator(page, cached);
          await waitForReady(cachedLoc, "click", timeout);
          await cachedLoc.click({ timeout });
          await waitForStable(page); // Wait for any modals/transitions
          await log({ ts, url: page.url(), key, action, contextName, used: "cache", success: true, strategy: cached });
          healLog.usedCache(contextName);
          return;
        } catch {
          healLog.cacheMiss(contextName);
        }
      }

      // AI heal
      try {
        const plan = await askAI(page, action, contextName);
        const choice = await pickValid(page, plan!);

        if (!choice) {
          await log({ ts, url: page.url(), key, action, contextName, used: "healed", success: false, error: "No valid candidate" });
          healLog.noValidCandidate(contextName);
          throw originalErr;
        }

        mem.set(key, choice.strategy);
        cache[key] = { ...choice.strategy, context: contextName, testName: currentTestName };
        await writeAtomic(cacheFile, cache);

        const healedLoc = buildLocator(page, choice.strategy);
        await waitForReady(healedLoc, "click", timeout);
        await healedLoc.click({ timeout });
        await waitForStable(page); // Wait for any modals/transitions

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

  async function fill(page: Page, target: LocatorOrEmpty, contextName: string, value: string) {
    const ts = new Date().toISOString();
    const action: Action = "fill";
    const key = keyFor(page, action, contextName);
    const aiOnlyMode = !isValidLocator(target);

    // If AI-only mode (empty string passed), skip initial attempt
    if (!aiOnlyMode) {
      try {
        await waitForReady(target as Locator, "fill", quickTimeout);
        await (target as Locator).fill(value, { timeout });
        return;
      } catch (originalErr: any) {
        if (!enabled) throw originalErr;
      }
    }

    // AI healing/detection flow
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
        const plan = await askAI(page, action, contextName);
        const choice = await pickValid(page, plan!);

        if (!choice) {
          await log({ ts, url: page.url(), key, action, contextName, used: "healed", success: false, error: "No valid candidate" });
          healLog.noValidCandidate(contextName);
          throw originalErr;
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

  async function selectOption(page: Page, target: LocatorOrEmpty, contextName: string, value: string) {
    const ts = new Date().toISOString();
    const action: Action = "click"; // treat select as click-like for candidate collection
    const key = keyFor(page, action, contextName);
    const aiOnlyMode = !isValidLocator(target);

    // If AI-only mode (empty string passed), skip initial attempt
    if (!aiOnlyMode) {
      try {
        await waitForReady(target as Locator, "select", quickTimeout);
        await (target as Locator).selectOption(value, { timeout });
        return;
      } catch (originalErr: any) {
        if (!enabled) throw originalErr;
      }
    }

    // AI healing/detection flow
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
          await waitForReady(cachedLoc, "select", timeout);
          await cachedLoc.selectOption(value, { timeout });
          await log({ ts, url: page.url(), key, action, contextName, used: "cache", success: true, strategy: cached });
          healLog.usedCache(contextName);
          return;
        } catch {
          healLog.cacheMiss(contextName);
        }
      }

      try {
        const plan = await askAI(page, action, contextName);
        const choice = await pickValid(page, plan!);

        if (!choice) {
          await log({ ts, url: page.url(), key, action, contextName, used: "healed", success: false, error: "No valid candidate" });
          healLog.noValidCandidate(contextName);
          throw originalErr;
        }

        mem.set(key, choice.strategy);
        cache[key] = { ...choice.strategy, context: contextName, testName: currentTestName };
        await writeAtomic(cacheFile, cache);

        const healedLoc = buildLocator(page, choice.strategy);
        await waitForReady(healedLoc, "select", timeout);
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

  async function dblclick(page: Page, target: LocatorOrEmpty, contextName: string) {
    const ts = new Date().toISOString();
    const action: Action = "dblclick";
    const key = keyFor(page, action, contextName);
    const aiOnlyMode = !isValidLocator(target);

    // If AI-only mode (empty string passed), skip initial attempt
    if (!aiOnlyMode) {
      try {
        await waitForReady(target as Locator, "dblclick", quickTimeout);
        await (target as Locator).dblclick({ timeout });
        return;
      } catch (originalErr: any) {
        if (!enabled) throw originalErr;
      }
    }

    // AI healing/detection flow
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
        const plan = await askAI(page, "click", contextName); // use click candidates for dblclick
        const choice = await pickValid(page, plan!);

        if (!choice) {
          await log({ ts, url: page.url(), key, action, contextName, used: "healed", success: false, error: "No valid candidate" });
          healLog.noValidCandidate(contextName);
          throw originalErr;
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

  async function check(page: Page, target: LocatorOrEmpty, contextName: string) {
    const ts = new Date().toISOString();
    const action: Action = "check";
    const key = keyFor(page, action, contextName);
    const aiOnlyMode = !isValidLocator(target);

    // If AI-only mode (empty string passed), skip initial attempt
    if (!aiOnlyMode) {
      try {
        await waitForReady(target as Locator, "check", quickTimeout);
        await (target as Locator).check({ timeout });
        return;
      } catch (originalErr: any) {
        if (!enabled) throw originalErr;
      }
    }

    // AI healing/detection flow
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
        const plan = await askAI(page, "fill", contextName); // use fill candidates for checkboxes
        const choice = await pickValid(page, plan!);

        if (!choice) {
          await log({ ts, url: page.url(), key, action, contextName, used: "healed", success: false, error: "No valid candidate" });
          healLog.noValidCandidate(contextName);
          throw originalErr;
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

  async function hover(page: Page, target: LocatorOrEmpty, contextName: string) {
    const ts = new Date().toISOString();
    const action: Action = "hover";
    const key = keyFor(page, action, contextName);
    const aiOnlyMode = !isValidLocator(target);

    // If AI-only mode (empty string passed), skip initial attempt
    if (!aiOnlyMode) {
      try {
        await waitForReady(target as Locator, "hover", quickTimeout);
        await (target as Locator).hover({ timeout });
        return;
      } catch (originalErr: any) {
        if (!enabled) throw originalErr;
      }
    }

    // AI healing/detection flow
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
        const plan = await askAI(page, "click", contextName); // use click candidates for hover
        const choice = await pickValid(page, plan!);

        if (!choice) {
          await log({ ts, url: page.url(), key, action, contextName, used: "healed", success: false, error: "No valid candidate" });
          healLog.noValidCandidate(contextName);
          throw originalErr;
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

  async function focus(page: Page, target: LocatorOrEmpty, contextName: string) {
    const ts = new Date().toISOString();
    const action: Action = "focus";
    const key = keyFor(page, action, contextName);
    const aiOnlyMode = !isValidLocator(target);

    // If AI-only mode (empty string passed), skip initial attempt
    if (!aiOnlyMode) {
      try {
        await waitForReady(target as Locator, "focus", quickTimeout);
        await (target as Locator).focus({ timeout });
        return;
      } catch (originalErr: any) {
        if (!enabled) throw originalErr;
      }
    }

    // AI healing/detection flow
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
        const plan = await askAI(page, "fill", contextName); // use fill candidates for focusable elements
        const choice = await pickValid(page, plan!);

        if (!choice) {
          await log({ ts, url: page.url(), key, action, contextName, used: "healed", success: false, error: "No valid candidate" });
          healLog.noValidCandidate(contextName);
          throw originalErr;
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

  return { click, fill, selectOption, dblclick, check, hover, focus, setTestName };
}

// Default healer instance
export const heal = createHealer({
  enabled: process.env.SELF_HEAL === "1" || process.env.AI_SELF_HEAL === "true",
});
