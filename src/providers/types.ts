/**
 * AI Provider abstraction for healwright
 * Supports multiple AI backends: OpenAI, Anthropic, Google
 */

import { HealPlanT } from "../types";

export type ProviderName = "openai" | "gpt" | "anthropic" | "claude" | "google" | "gemini";

export interface AIProviderConfig {
    apiKey: string;
    model?: string;
}

export interface GenerateHealPlanInput {
    systemPrompt: string;
    userContent: string;
    jsonSchema: object;
}

export interface AIProvider {
    readonly name: ProviderName;
    generateHealPlan(input: GenerateHealPlanInput): Promise<HealPlanT | null>;
}

export const DEFAULT_MODELS: Record<ProviderName, string> = {
    openai: "gpt-4o-mini",
    gpt: "gpt-4o-mini",
    anthropic: "claude-sonnet-4-20250514",
    claude: "claude-sonnet-4-20250514",
    google: "gemini-2.5-flash",
    gemini: "gemini-2.5-flash",
};
