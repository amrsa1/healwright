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

// Interfaces
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
