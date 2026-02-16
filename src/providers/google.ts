/**
 * Google Provider
 * Uses the official @google/genai SDK (googleapis/js-genai)
 */

import { GoogleGenAI } from "@google/genai";
import { AIProvider, AIProviderConfig, GenerateHealPlanInput, HealPlanResult, DEFAULT_MODELS, cleanJson } from "./types";
import { HealPlan } from "../types";
import { healLog } from "../logger";

export class GoogleProvider implements AIProvider {
    readonly name = "google" as const;
    private ai: GoogleGenAI;
    private model: string;

    constructor(config: AIProviderConfig) {
        this.ai = new GoogleGenAI({ apiKey: config.apiKey });
        this.model = config.model ?? DEFAULT_MODELS.google;
    }

    async generateHealPlan(input: GenerateHealPlanInput): Promise<HealPlanResult> {
        try {
            // Combined prompt for Gemini (system + user)
            const combinedPrompt = `${input.systemPrompt}\n\n---\n\n${input.userContent}\n\nRespond with valid JSON matching this schema:\n${JSON.stringify(input.jsonSchema, null, 2)}`;

            const response = await this.ai.models.generateContent({
                model: this.model,
                contents: combinedPrompt,
                config: {
                    responseMimeType: "application/json",
                },
            });

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
