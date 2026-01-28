/**
 * healwright - AI-powered self-healing locators for Playwright
 * 
 * Supports multiple AI providers:
 * - OpenAI (default)
 * - Anthropic Claude
 * - Google Gemini
 */

export { withHealing, createHealingFixture } from './healwright';
export type { HealPage, HealMethods, HealOptions, HealErrorContext, ClickOptions, HealingLocator } from './types';
export { HealError } from './types';
export type { ProviderName, AIProvider } from './providers';
export { DEFAULT_MODELS } from './providers';
