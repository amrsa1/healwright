/**
 * AI Provider abstraction for healwright
 * Supports multiple AI backends: OpenAI, Anthropic, Google, Local (Ollama)
 */

import { HealPlanT } from "../types";

export type ProviderName = "openai" | "gpt" | "anthropic" | "claude" | "google" | "gemini" | "local" | "ollama";

export interface AIProviderConfig {
    apiKey: string;
    model?: string;
}

export interface GenerateHealPlanInput {
    systemPrompt: string;
    userContent: string;
    jsonSchema: object;
}

export interface TokenUsage {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
}

export interface HealPlanResult {
    plan: HealPlanT | null;
    tokenUsage: TokenUsage | null;
}

export interface AIProvider {
    readonly name: ProviderName;
    generateHealPlan(input: GenerateHealPlanInput): Promise<HealPlanResult>;
}

/**
 * Clean malformed JSON from LLM responses.
 * Handles: markdown fences, comments, trailing commas,
 * unescaped control chars inside strings, and extracts
 * the first valid JSON object if surrounded by junk.
 */
export function cleanJson(raw: string): string {
    let s = raw
        // Strip markdown code fences
        .replace(/^```(?:json)?\s*/gm, '')
        .replace(/```\s*$/gm, '')
        .trim();

    // Remove single-line comments (// ...) that are NOT inside strings
    s = s.replace(/^(\s*)\/\/.*$/gm, '$1');

    // Remove multi-line comments /* ... */
    s = s.replace(/\/\*[\s\S]*?\*\//g, '');

    // Remove trailing commas before } or ]
    s = s.replace(/,\s*([}\]])/g, '$1');

    // Try parsing as-is first
    try {
        JSON.parse(s);
        return s;
    } catch {
        // Continue with more aggressive fixes
    }

    // Extract the first complete JSON object/array from the string
    const jsonStart = s.search(/[{\[]/);
    if (jsonStart >= 0) {
        s = s.slice(jsonStart);
        // Find the matching closing bracket
        const openChar = s[0];
        const closeChar = openChar === '{' ? '}' : ']';
        let depth = 0;
        let inString = false;
        let escaped = false;
        for (let i = 0; i < s.length; i++) {
            const ch = s[i];
            if (escaped) { escaped = false; continue; }
            if (ch === '\\') { escaped = true; continue; }
            if (ch === '"') { inString = !inString; continue; }
            if (inString) continue;
            if (ch === openChar) depth++;
            else if (ch === closeChar) {
                depth--;
                if (depth === 0) {
                    s = s.slice(0, i + 1);
                    break;
                }
            }
        }
    }

    // Replace literal newlines/tabs inside JSON string values
    s = s.replace(/(?<="[^"]*?)\n(?=[^"]*?")/g, '\\n');
    s = s.replace(/(?<="[^"]*?)\t(?=[^"]*?")/g, '\\t');

    // Final trailing comma cleanup
    s = s.replace(/,\s*([}\]])/g, '$1');

    return s.trim();
}

export const DEFAULT_MODELS: Record<ProviderName, string> = {
    openai: "gpt-5-nano",
    gpt: "gpt-5-nano",
    anthropic: "claude-sonnet-4-20250514",
    claude: "claude-sonnet-4-20250514",
    google: "gemini-2.5-flash",
    gemini: "gemini-2.5-flash",
    local: "qwen3:4b",
    ollama: "qwen3:4b",
};
