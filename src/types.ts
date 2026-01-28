/**
 * Type definitions and Zod schemas for healwright
 */

import { z } from "zod";
import type { Page, Locator } from "@playwright/test";

export type Action = "click" | "fill" | "dblclick" | "check" | "hover" | "focus";

export type LocatorOrEmpty = Locator | string;

// Zod schemas
export const Strategy = z.object({
  type: z.enum(["testid", "role", "label", "placeholder", "text", "css"]),
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
      `│  🔍 HEALWRIGHT: Element Not Found                       │`,
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
  /** Select an option in a dropdown, with AI fallback if selector fails */
  selectOption(value: string): Promise<void>;
}

export interface HealMethods {
  click(target: LocatorOrEmpty, contextName: string, options?: ClickOptions): Promise<void>;
  fill(target: LocatorOrEmpty, contextName: string, value: string): Promise<void>;
  selectOption(target: LocatorOrEmpty, contextName: string, value: string): Promise<void>;
  dblclick(target: LocatorOrEmpty, contextName: string): Promise<void>;
  check(target: LocatorOrEmpty, contextName: string): Promise<void>;
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
}

export interface HealPage extends Page {
  heal: HealMethods;
}

export interface HealOptions {
  enabled?: boolean;
  provider?: "openai" | "gpt" | "anthropic" | "claude" | "google" | "gemini";
  model?: string;
  cacheFile?: string;
  reportFile?: string;
  maxAiTries?: number;
  timeout?: number;
  testName?: string;
  apiKey?: string;
}

// JSON schema for OpenAI structured output
export const healPlanJsonSchema = {
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
} as const;
