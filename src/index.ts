/**
 * healwright - AI-powered self-healing locators for Playwright
 * 
 * Supports multiple AI providers:
 * - OpenAI (default)
 * - Anthropic Claude
 * - Google Gemini
 * - Local models via Ollama
 */

export { withHealing, createHealingFixture } from './healwright';
export { default } from './healwright';
export type {
  HealPage,
  HealMethods,
  HealOptions,
  HealErrorContext,
  ClickOptions,
  HealingLocator,
  HealMode,
  HealLogLevel,
  GetLocatorOptions,
  Action,
} from './types';
export { HealError } from './types';
export type { ProviderName, AIProvider, AIProviderConfig, GenerateHealPlanInput, HealPlanResult, TokenUsage } from './providers';
export { DEFAULT_MODELS } from './providers';
export { getHealSummary, resetHealSummary } from './summary';
export type { HealSummary, HealSummaryEntry, HealOutcome } from './summary';
