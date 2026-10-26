/**
 * AI Provider Factory
 * Creates the appropriate AI provider based on configuration
 */

import { AIProvider, AIProviderConfig, ProviderName } from "./types";
import { OpenAIProvider } from "./openai";
import { AnthropicProvider } from "./anthropic";
import { GoogleProvider } from "./google";
import { LocalProvider } from "./local";
import { TypeSafeProvider } from "./typesafe";

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
        case "local":
        case "ollama":
            return new LocalProvider(config);
        case "typesafe":
        case "jev":
            return new TypeSafeProvider(config);
        default:
            throw new Error(`Unknown AI provider: ${providerName}. Supported: openai/gpt, anthropic/claude, google/gemini, local/ollama, typesafe/jev`);
    }
}

/**
 * The API key for a provider. TypeSafe has its own variable, read first, so an
 * AI_API_KEY meant for another provider is never sent to it.
 */
export function resolveApiKey(
    providerName: ProviderName,
    explicit: string | undefined,
    env: Record<string, string | undefined>,
): string | undefined {
    if (explicit) return explicit;
    if (providerName === "typesafe" || providerName === "jev") return env.TYPESAFE_API_KEY ?? env.AI_API_KEY;
    return env.AI_API_KEY;
}

export type { AIProvider, AIProviderConfig, GenerateHealPlanInput, HealRequest, ProviderName, TokenUsage, HealPlanResult } from "./types";
export { isReasoningModel, strictJsonSchema } from "./types";
export { DEFAULT_MODELS } from "./types";

