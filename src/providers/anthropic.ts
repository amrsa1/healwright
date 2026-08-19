/**
 * Anthropic Provider
 * Uses the official @anthropic-ai/sdk with structured outputs
 */

import Anthropic from "@anthropic-ai/sdk";
import { AIProvider, AIProviderConfig, GenerateHealPlanInput, HealPlanResult, DEFAULT_MODELS, cleanJson } from "./types";
import { HealPlan } from "../types";
import { healLog } from "../logger";

const STRUCTURED_OUTPUTS_BETA = "structured-outputs-2025-11-13";

/**
 * Build the request body.
 *
 * The schema is passed as `output_format` on the beta Messages endpoint. An
 * earlier version set the beta header without ever sending a schema, which
 * left the model to guess the response envelope from prose.
 */
export function buildAnthropicRequest(input: GenerateHealPlanInput, model: string): Record<string, unknown> {
    return {
        model,
        max_tokens: 4096,
        system: input.systemPrompt,
        messages: [
            { role: "user", content: input.userContent },
        ],
        output_format: {
            type: "json_schema",
            schema: input.jsonSchema,
        },
        betas: [STRUCTURED_OUTPUTS_BETA],
    };
}

export class AnthropicProvider implements AIProvider {
    readonly name = "anthropic" as const;
    private client: Anthropic;
    private model: string;

    constructor(config: AIProviderConfig) {
        this.client = new Anthropic({
            apiKey: config.apiKey,
            ...(config.baseURL ? { baseURL: config.baseURL } : {}),
        });
        this.model = config.model ?? DEFAULT_MODELS.anthropic;
    }

    async generateHealPlan(input: GenerateHealPlanInput): Promise<HealPlanResult> {
        try {
            const resp = await this.client.beta.messages.create(
                buildAnthropicRequest(input, this.model) as any,
            ) as any;

            // With `output_format` the SDK parses the response for us; fall back
            // to the raw text block for endpoints where the beta is unavailable.
            const parsed = resp.parsed_output ?? resp.structured_output;
            const content = parsed ?? resp.content?.[0]?.text;
            healLog.aiResponse(typeof content === "string" ? content.length : JSON.stringify(content ?? "").length);

            // Extract token usage from Anthropic response
            const usage = resp.usage;
            const tokenUsage = usage ? {
                inputTokens: usage.input_tokens ?? 0,
                outputTokens: usage.output_tokens ?? 0,
                totalTokens: (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0),
            } : null;

            if (!content) return { plan: null, tokenUsage };

            try {
                const value = typeof content === "string"
                    ? JSON.parse(cleanJson(content))
                    : content;
                return { plan: HealPlan.parse(value), tokenUsage };
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
