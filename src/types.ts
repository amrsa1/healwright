/**
 * Type definitions and Zod schemas for healwright
 */

import { z } from "zod";
import type { Page, Locator } from "playwright-core";
import { strictJsonSchema, type JsonSchemaObject } from "./jsonSchema";
import type { AIProvider } from "./providers/types";

export type Action =
  | "click"
  | "fill"
  | "dblclick"
  | "check"
  | "uncheck"
  | "hover"
  | "focus"
  | "selectOption"
  /** Resolve an element without acting on it (used by `heal.getLocator`). */
  | "locate";

export type LocatorOrEmpty = Locator | string;

// Zod schemas
export const Strategy = z.object({
  type: z.enum(["testid", "role", "label", "placeholder", "text", "altText", "title", "css"]),
  value: z.string().nullable().optional(),
  selector: z.string().nullable().optional(),
  role: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  text: z.string().nullable().optional(),
  exact: z.boolean().nullable().optional(),
});

export const HealPlan = z.object({
  candidates: z.array(z.object({
    strategy: Strategy,
    confidence: z.number(),
    why: z.string(),
  })),
});

// Derived types
export type StrategyT = z.infer<typeof Strategy>;
export type HealPlanT = z.infer<typeof HealPlan>;
export type CacheEntryT = StrategyT & { context: string; testName?: string };
export type CacheT = Record<string, CacheEntryT>;

// Custom error for better debugging
export interface HealErrorContext {
  action: string;
  contextName: string;
  url: string;
  candidatesAnalyzed: number;
  strategiesTried: Array<{ type: string; reason: string }>;
  aiResponse?: string;
  originalError?: string;
}

export class HealError extends Error {
  public readonly context: HealErrorContext;

  constructor(message: string, context: HealErrorContext) {
    const detailedMessage = HealError.formatMessage(message, context);
    super(detailedMessage);
    this.name = "HealError";
    this.context = context;

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, HealError);
    }
  }

  static formatMessage(message: string, ctx: HealErrorContext): string {
    const lines = [
      `\n╭───────────────────────────────────────────────────────────╮`,
      `│  🔍 HEALWRIGHT: Element Not Found                          │`,
      `╰───────────────────────────────────────────────────────────╯`,
      ``,
      `  ❌ ${message}`,
      ``,
      `  📋 Context:`,
      `     • Action: ${ctx.action.toUpperCase()}`,
      `     • Looking for: "${ctx.contextName}"`,
      `     • Page URL: ${ctx.url}`,
      `     • Candidates analyzed: ${ctx.candidatesAnalyzed}`,
    ];

    if (ctx.originalError) {
      lines.push(`     • Original error: ${ctx.originalError}`);
    }

    if (ctx.strategiesTried.length > 0) {
      lines.push(``, `  🔬 Strategies tried:`);
      ctx.strategiesTried.forEach((s, i) => {
        lines.push(`     ${i + 1}. [${s.type}] → ${s.reason}`);
      });
    } else {
      lines.push(``, `  ⚠️  No strategies were returned by AI`);
    }

    lines.push(
      ``,
      `  💡 Tips:`,
      `     • Make sure the element exists on the page`,
      `     • Try a more specific description`,
      `     • Check if the element is visible and not hidden`,
      ``
    );

    return lines.join("\n");
  }
}

// Interfaces
export interface ClickOptions {
  /** Force click even if element is not visible (for hover-dependent buttons) */
  force?: boolean;
}

/**
 * A locator that automatically falls back to AI healing if the original selector fails.
 * Provides a subset of Playwright Locator methods with self-healing capabilities.
 */
export interface HealingLocator {
  /** Click the element, with AI fallback if selector fails */
  click(options?: ClickOptions): Promise<void>;
  /** Fill the element with text, with AI fallback if selector fails */
  fill(value: string): Promise<void>;
  /** Double-click the element, with AI fallback if selector fails */
  dblclick(): Promise<void>;
  /** Check the checkbox/radio, with AI fallback if selector fails */
  check(): Promise<void>;
  /** Hover over the element, with AI fallback if selector fails */
  hover(): Promise<void>;
  /** Focus the element, with AI fallback if selector fails */
  focus(): Promise<void>;
  /** Uncheck a checkbox/radio, with AI fallback if selector fails */
  uncheck(): Promise<void>;
  /** Select an option in a dropdown, with AI fallback if selector fails */
  selectOption(value: string): Promise<void>;
}

/**
 * How healing behaves when a locator fails.
 * - `heal`  — find the element and continue (default)
 * - `warn`  — find the element, report it, but let the original failure stand
 * - `off`   — no healing at all
 */
export type HealMode = "heal" | "warn" | "off";

export type HealLogLevel = "silent" | "error" | "info";

export interface GetLocatorOptions {
  /** Which candidate set to search. Defaults to `locate` (everything). */
  as?: Action;
}

export interface HealMethods {
  click(target: LocatorOrEmpty, contextName: string, options?: ClickOptions): Promise<void>;
  fill(target: LocatorOrEmpty, contextName: string, value: string): Promise<void>;
  selectOption(target: LocatorOrEmpty, contextName: string, value: string): Promise<void>;
  dblclick(target: LocatorOrEmpty, contextName: string): Promise<void>;
  check(target: LocatorOrEmpty, contextName: string): Promise<void>;
  uncheck(target: LocatorOrEmpty, contextName: string): Promise<void>;
  hover(target: LocatorOrEmpty, contextName: string): Promise<void>;
  focus(target: LocatorOrEmpty, contextName: string): Promise<void>;
  setTestName(name: string): void;
  /** 
   * Create a self-healing locator with a semantic description fallback.
   * @param selector CSS selector or Playwright locator string
   * @param contextName Semantic description for AI fallback
   * @returns A HealingLocator that can be used like a regular locator
   * @example
   * await page.heal.locator('.new-todo', 'Input field for new todos').fill('Buy milk');
   */
  locator(selector: string, contextName: string): HealingLocator;
  /**
   * Resolve a description to a real Playwright `Locator`.
   *
   * The returned value is an ordinary Locator, so it works with everything
   * Playwright offers — assertions included — rather than the fixed method set
   * `heal.locator()` wraps.
   *
   * @example
   * ```typescript
   * const badge = await page.heal.getLocator('.cart-count', 'Cart item count badge');
   * await expect(badge).toHaveText('1');
   * ```
   */
  getLocator(selector: string, contextName: string, options?: GetLocatorOptions): Promise<Locator>;
}

export interface HealPage extends Page {
  heal: HealMethods;
}

export interface HealOptions {
  /** Master switch. Defaults to `SELF_HEAL=1` / `AI_SELF_HEAL=true`. */
  enabled?: boolean;
  /** `heal` (default), `warn` (report only), or `off`. Env: `HEALWRIGHT_MODE`. */
  mode?: HealMode;
  provider?: "openai" | "gpt" | "anthropic" | "claude" | "google" | "gemini" | "local" | "ollama";
  /**
   * Use your own provider implementation instead of the built-in clients —
   * any model reachable from Node, including ones healwright has no client for.
   */
  aiProvider?: AIProvider;
  model?: string;
  /** Override the provider API endpoint (Azure, OpenRouter, vLLM, a gateway…). Env: `AI_BASE_URL`. */
  baseURL?: string;
  apiKey?: string;
  cacheFile?: string;
  reportFile?: string;
  /** How many AI-suggested strategies to validate before giving up. Default 4. */
  maxAiTries?: number;
  /** How many ranked elements are sent to the model. Default 40. */
  maxCandidates?: number;
  /** Timeout for the healed locator and the action itself. Default 5000ms. */
  timeout?: number;
  /**
   * Timeout for the *original* locator before healing takes over.
   * Defaults to 1000ms when healing is enabled, so a broken selector fails fast.
   * Raise it if legitimate elements in your app appear slowly — a too-short
   * value turns "slow" into "broken" and spends an AI call on it.
   */
  quickTimeout?: number;
  /**
   * Reject heals whose reported confidence (0-1) falls below this.
   * Default 0 (accept anything). Env: `HEALWRIGHT_MIN_CONFIDENCE`.
   */
  minConfidence?: number;
  testName?: string;
  /** Console verbosity. Default `info`. Env: `HEALWRIGHT_LOG`. */
  logLevel?: HealLogLevel;
  /** Force ANSI colour on or off. Defaults to TTY detection and `NO_COLOR`. */
  color?: boolean;
}

/**
 * JSON schema for structured output — generated from the Zod schema above so
 * the two can never drift, then normalised for strict structured-output modes.
 */
export const healPlanJsonSchema: JsonSchemaObject = strictJsonSchema(
  z.toJSONSchema(HealPlan, { io: "output" }) as JsonSchemaObject,
);
