/**
 * AI Provider Factory
 * Creates the appropriate AI provider based on configuration
 */

import { AIProvider, AIProviderConfig, ProviderName } from "./types";
import { OpenAIProvider } from "./openai";
import { AnthropicProvider } from "./anthropic";
import { GoogleProvider } from "./google";
import { LocalProvider } from "./local";

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
        default:
            throw new Error(`Unknown AI provider: ${providerName}. Supported: openai/gpt, anthropic/claude, google/gemini, local/ollama`);
    }
}

export type { AIProvider, AIProviderConfig, ProviderName, TokenUsage, HealPlanResult } from "./types";
export { DEFAULT_MODELS } from "./types";

