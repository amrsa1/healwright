/**
 * OpenAI Provider
 * Uses the official OpenAI SDK with structured outputs (responses API)
 */

import OpenAI from "openai";
import { AIProvider, AIProviderConfig, GenerateHealPlanInput, DEFAULT_MODELS } from "./types";
import { HealPlan, HealPlanT } from "../types";
import { healLog } from "../logger";

export class OpenAIProvider implements AIProvider {
    readonly name = "openai" as const;
    private client: OpenAI;
    private model: string;

    constructor(config: AIProviderConfig) {
        this.client = new OpenAI({ apiKey: config.apiKey });
        this.model = config.model ?? DEFAULT_MODELS.openai;
    }

    async generateHealPlan(input: GenerateHealPlanInput): Promise<HealPlanT | null> {
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
            });

            const content = resp.output_text;
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
