/**
 * Google Provider
 * Uses the official @google/genai SDK (googleapis/js-genai)
 */

import type { GoogleGenAI } from "@google/genai";
import { AIProvider, AIProviderConfig, GenerateHealPlanInput, HealPlanResult, DEFAULT_MODELS, PROVIDER_TIMEOUT_MS, cleanJson } from "./types";
import { HealPlan } from "../types";
import { healLog } from "../logger";
import { loadSdk } from "./load";

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
    private ai: Promise<GoogleGenAI> | null = null;
    private model: string;

    constructor(private readonly config: AIProviderConfig) {
        this.model = config.model ?? DEFAULT_MODELS.google;
    }

    private getClient(): Promise<GoogleGenAI> {
        this.ai ??= loadSdk("@google/genai", "Gemini", () => import("@google/genai"))
            .then(({ GoogleGenAI }) => new GoogleGenAI(googleClientOptions(this.config)));
        return this.ai;
    }

    async generateHealPlan(input: GenerateHealPlanInput): Promise<HealPlanResult> {
        try {
            const ai = await this.getClient();
            const response = await ai.models.generateContent(
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
