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

/**
 * Clean malformed JSON from LLM responses:
 *  - Strip markdown code fences
 *  - Remove trailing commas before } or ]
 */
export function cleanJson(raw: string): string {
    return raw
        .replace(/^```(?:json)?\s*/m, '')
        .replace(/```\s*$/m, '')
        .trim()
        .replace(/,\s*([}\]])/g, '$1');
}

export const DEFAULT_MODELS: Record<ProviderName, string> = {
    openai: "gpt-5-nano",
    gpt: "gpt-5-nano",
    anthropic: "claude-sonnet-4-20250514",
    claude: "claude-sonnet-4-20250514",
    google: "gemini-2.5-flash",
    gemini: "gemini-2.5-flash",
};
