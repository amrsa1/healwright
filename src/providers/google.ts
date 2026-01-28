/**
 * Google Provider
 * Uses the official @google/genai SDK (googleapis/js-genai)
 */

import { GoogleGenAI } from "@google/genai";
import { AIProvider, AIProviderConfig, GenerateHealPlanInput, DEFAULT_MODELS } from "./types";
import { HealPlan, HealPlanT } from "../types";
import { healLog } from "../logger";

export class GoogleProvider implements AIProvider {
    readonly name = "google" as const;
    private ai: GoogleGenAI;
    private model: string;

    constructor(config: AIProviderConfig) {
        this.ai = new GoogleGenAI({ apiKey: config.apiKey });
        this.model = config.model ?? DEFAULT_MODELS.google;
    }

    async generateHealPlan(input: GenerateHealPlanInput): Promise<HealPlanT | null> {
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

            if (!content) return null;

            try {
                return HealPlan.parse(JSON.parse(content));
            } catch {
                healLog.candidateError("parse", "Failed to parse AI response");
                return null;
            }
        } catch (aiErr: any) {
            healLog.candidateError("api", aiErr?.message ?? String(aiErr));
            throw aiErr;
        }
    }
}
