/**
 * OpenAI Provider
 * Uses the official OpenAI SDK with structured outputs (responses API)
 */

import OpenAI from "openai";
import { AIProvider, AIProviderConfig, GenerateHealPlanInput, HealPlanResult, DEFAULT_MODELS, cleanJson } from "./types";
import { HealPlan } from "../types";
import { healLog } from "../logger";

export class OpenAIProvider implements AIProvider {
    readonly name = "openai" as const;
    private client: OpenAI;
    private model: string;

    constructor(config: AIProviderConfig) {
        this.client = new OpenAI({ apiKey: config.apiKey });
        this.model = config.model ?? DEFAULT_MODELS.openai;
    }

    async generateHealPlan(input: GenerateHealPlanInput): Promise<HealPlanResult> {
        try {
            const resp = await (this.client as any).responses.create({
                model: this.model,
                input: [
                    { role: "system", content: input.systemPrompt },
                    { role: "user", content: input.userContent },
                ],
                text: {
                    format: {
                        type: "json_schema",
                        name: "HealPlan",
                        strict: true,
                        schema: input.jsonSchema,
                    },
                },
                store: false,
                reasoning: {"effort": "low"},
            });

            const content = resp.output_text;
            healLog.aiResponse(content?.length ?? 0);

            // Extract token usage from OpenAI response
            const usage = resp.usage;
            const tokenUsage = usage ? {
                inputTokens: usage.input_tokens ?? usage.prompt_tokens ?? 0,
                outputTokens: usage.output_tokens ?? usage.completion_tokens ?? 0,
                totalTokens: (usage.input_tokens ?? usage.prompt_tokens ?? 0) + (usage.output_tokens ?? usage.completion_tokens ?? 0),
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
