/**
 * OpenAI Provider
 * Uses the official OpenAI SDK with structured outputs (responses API)
 */

import OpenAI from "openai";
import {
    AIProvider,
    AIProviderConfig,
    GenerateHealPlanInput,
    HealPlanResult,
    DEFAULT_MODELS,
    cleanJson,
    isReasoningModel,
} from "./types";
import { HealPlan } from "../types";
import { healLog } from "../logger";

/**
 * Build the request body. Kept separate from the call so the shape is testable
 * without an API key — notably the `reasoning` parameter, which is only valid
 * for reasoning models and is a hard request error on the rest.
 */
export function buildOpenAIRequest(input: GenerateHealPlanInput, model: string): Record<string, unknown> {
    const request: Record<string, unknown> = {
        model,
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
    };

    if (isReasoningModel(model)) {
        request.reasoning = { effort: "low" };
    }

    return request;
}

export class OpenAIProvider implements AIProvider {
    readonly name = "openai" as const;
    private client: OpenAI;
    private model: string;

    constructor(config: AIProviderConfig) {
        this.client = new OpenAI({
            apiKey: config.apiKey,
            ...(config.baseURL ? { baseURL: config.baseURL } : {}),
        });
        this.model = config.model ?? DEFAULT_MODELS.openai;
    }

    async generateHealPlan(input: GenerateHealPlanInput): Promise<HealPlanResult> {
        try {
            const resp = await this.client.responses.create(
                buildOpenAIRequest(input, this.model) as any,
            ) as any;

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
