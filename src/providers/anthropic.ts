/**
 * Anthropic Provider
 * Uses the official @anthropic-ai/sdk with structured outputs
 */

import Anthropic from "@anthropic-ai/sdk";
import { AIProvider, AIProviderConfig, GenerateHealPlanInput, HealPlanResult, DEFAULT_MODELS, cleanJson } from "./types";
import { HealPlan } from "../types";
import { healLog } from "../logger";

export class AnthropicProvider implements AIProvider {
    readonly name = "anthropic" as const;
    private client: Anthropic;
    private model: string;

    constructor(config: AIProviderConfig) {
        this.client = new Anthropic({ apiKey: config.apiKey });
        this.model = config.model ?? DEFAULT_MODELS.anthropic;
    }

    async generateHealPlan(input: GenerateHealPlanInput): Promise<HealPlanResult> {
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

            // Extract token usage from Anthropic response
            const usage = resp.usage;
            const tokenUsage = usage ? {
                inputTokens: usage.input_tokens ?? 0,
                outputTokens: usage.output_tokens ?? 0,
                totalTokens: (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0),
            } : null;

            if (!content) return { plan: null, tokenUsage };

            try {
                const raw = typeof content === "string" ? content : JSON.stringify(content);
                return { plan: HealPlan.parse(JSON.parse(cleanJson(raw))), tokenUsage };
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
