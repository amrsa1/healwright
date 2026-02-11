/**
 * Anthropic Provider
 * Uses the official @anthropic-ai/sdk with structured outputs
 */

import Anthropic from "@anthropic-ai/sdk";
import { AIProvider, AIProviderConfig, GenerateHealPlanInput, DEFAULT_MODELS, cleanJson } from "./types";
import { HealPlan, HealPlanT } from "../types";
import { healLog } from "../logger";

export class AnthropicProvider implements AIProvider {
    readonly name = "anthropic" as const;
    private client: Anthropic;
    private model: string;

    constructor(config: AIProviderConfig) {
        this.client = new Anthropic({ apiKey: config.apiKey });
        this.model = config.model ?? DEFAULT_MODELS.anthropic;
    }

    async generateHealPlan(input: GenerateHealPlanInput): Promise<HealPlanT | null> {
        try {
            const resp = await this.client.messages.create({
                model: this.model,
                max_tokens: 4096,
                system: input.systemPrompt,
                messages: [
                    { role: "user", content: input.userContent },
                ],
            }, {
                headers: {
                    "anthropic-beta": "structured-outputs-2025-11-13",
                },
            }) as any;

            // Handle structured output response
            const content = resp.structured_output ?? resp.content?.[0]?.text;
            healLog.aiResponse(typeof content === "string" ? content.length : JSON.stringify(content).length);

            if (!content) return null;

            try {
                const raw = typeof content === "string" ? content : JSON.stringify(content);
                return HealPlan.parse(JSON.parse(cleanJson(raw)));
            } catch (parseErr: any) {
                healLog.candidateError("parse", `Failed to parse AI response: ${parseErr?.message ?? ''}`);
                return null;
            }
        } catch (aiErr: any) {
            healLog.candidateError("api", aiErr?.message ?? String(aiErr));
            throw aiErr;
        }
    }
}
