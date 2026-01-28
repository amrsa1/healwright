/**
 * AI Provider Factory
 * Creates the appropriate AI provider based on configuration
 */

import { AIProvider, AIProviderConfig, ProviderName, DEFAULT_MODELS } from "./types";
import { OpenAIProvider } from "./openai";
import { AnthropicProvider } from "./anthropic";
import { GoogleProvider } from "./google";

export function createAIProvider(
    providerName: ProviderName,
    config: AIProviderConfig
): AIProvider {
    switch (providerName) {
        case "openai":
        case "gpt":
            return new OpenAIProvider(config);
        case "anthropic":
        case "claude":
            return new AnthropicProvider(config);
        case "google":
        case "gemini":
            return new GoogleProvider(config);
        default:
            throw new Error(`Unknown AI provider: ${providerName}. Supported: openai/gpt, anthropic/claude, google/gemini`);
    }
}

// Normalize aliases to canonical provider names
function normalizeProviderName(name: string): ProviderName {
    const normalized = name.toLowerCase();
    switch (normalized) {
        case "gpt":
            return "openai";
        case "claude":
            return "anthropic";
        case "gemini":
            return "google";
        default:
            return normalized as ProviderName;
    }
}

const VALID_PROVIDERS = ["openai", "gpt", "anthropic", "claude", "google", "gemini"];

export function getProviderFromEnv(): { provider: ProviderName; apiKey: string; model?: string } {
    const rawProvider = process.env.AI_PROVIDER?.toLowerCase() ?? "openai";
    const apiKey = process.env.AI_API_KEY;

    if (!apiKey) {
        throw new Error("AI_API_KEY environment variable is required");
    }

    // Validate provider name
    if (!VALID_PROVIDERS.includes(rawProvider)) {
        throw new Error(`Invalid AI_PROVIDER: ${rawProvider}. Must be one of: ${VALID_PROVIDERS.join(", ")}`);
    }

    const provider = normalizeProviderName(rawProvider);
    const model = process.env.AI_MODEL;

    return { provider, apiKey, model };
}

export type { AIProvider, AIProviderConfig, ProviderName } from "./types";
export { DEFAULT_MODELS } from "./types";

