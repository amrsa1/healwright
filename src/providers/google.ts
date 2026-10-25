/**
 * Google Provider
 * Uses the official @google/genai SDK (googleapis/js-genai)
 */

import { GoogleGenAI } from "@google/genai";
import { AIProvider, AIProviderConfig, GenerateHealPlanInput, HealPlanResult, DEFAULT_MODELS, PROVIDER_TIMEOUT_MS, cleanJson } from "./types";
import { HealPlan } from "../types";
import { healLog } from "../logger";

/**
 * Build the request. The schema goes through `responseJsonSchema` rather than
 * being serialised into the prompt — same enforcement, far fewer input tokens.
 */
export function buildGoogleRequest(input: GenerateHealPlanInput, model: string): Record<string, unknown> {
    return {
        model,
        contents: `${input.systemPrompt}\n\n---\n\n${input.userContent}`,
        config: {
            responseMimeType: "application/json",
            responseJsonSchema: input.jsonSchema,
        },
    };
}

/**
 * Client options. The SDK otherwise makes five attempts with up to 60 s
 * between them, on top of healwright's own retries.
 */
export function googleClientOptions(config: Pick<AIProviderConfig, "apiKey" | "baseURL">) {
    return {
        apiKey: config.apiKey,
        httpOptions: {
            timeout: PROVIDER_TIMEOUT_MS,
            retryOptions: { attempts: 1 },
            ...(config.baseURL ? { baseUrl: config.baseURL } : {}),
        },
    };
}

export class GoogleProvider implements AIProvider {
    readonly name = "google" as const;
    private ai: GoogleGenAI;
    private model: string;

    constructor(config: AIProviderConfig) {
        this.ai = new GoogleGenAI(googleClientOptions(config));
        this.model = config.model ?? DEFAULT_MODELS.google;
    }

    async generateHealPlan(input: GenerateHealPlanInput): Promise<HealPlanResult> {
        try {
            const response = await this.ai.models.generateContent(
                buildGoogleRequest(input, this.model) as any,
            );

            const content = response.text;
            healLog.aiResponse(content?.length ?? 0);

            // Extract token usage from Gemini response
            // Note: totalTokenCount may include thinking/reasoning tokens,
            // so we compute total from input + output for accuracy
            const usage = (response as any).usageMetadata;
            const tokenUsage = usage ? {
                inputTokens: usage.promptTokenCount ?? 0,
                outputTokens: usage.candidatesTokenCount ?? 0,
                totalTokens: (usage.promptTokenCount ?? 0) + (usage.candidatesTokenCount ?? 0),
            } : null;

            if (!content) return { plan: null, tokenUsage };

            try {
                return { plan: HealPlan.parse(JSON.parse(cleanJson(content))), tokenUsage };
            } catch (parseErr: any) {
                healLog.candidateError("parse", `Failed to parse AI response: ${parseErr?.message ?? ''}`);
                return { plan: null, tokenUsage };
            }
        } catch (aiErr: any) {
            healLog.candidateError("api", aiErr?.message ?? String(aiErr));
            throw aiErr;
        }
    }
}
