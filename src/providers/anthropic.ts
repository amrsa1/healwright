/**
 * Anthropic Provider
 * Uses the official @anthropic-ai/sdk with structured outputs
 */

import type Anthropic from "@anthropic-ai/sdk";
import {
    AIProvider,
    AIProviderConfig,
    GenerateHealPlanInput,
    HealPlanResult,
    DEFAULT_MODELS,
    PROVIDER_TIMEOUT_MS,
    cleanJson,
} from "./types";
import { HealPlan } from "../types";
import { healLog } from "../logger";
import { loadSdk } from "./load";

const SERVER_FALLBACK_BETA = "server-side-fallback-2026-07-01";

/** Models that take `output_config.effort`; older ones reject the field. */
function supportsEffort(model: string): boolean {
    return /^claude-(fable|mythos|opus|sonnet|haiku)-([5-9]|\d{2})/.test(model)
        || /^claude-opus-4-[5-8]/.test(model)
        || model.startsWith("claude-sonnet-4-6");
}

/** Models that accept the server-side `fallbacks: "default"` form. */
function supportsServerFallback(model: string): boolean {
    return /^claude-(sonnet-5-5|opus-5-5|opus-5|fable-5-1)$/.test(model);
}

export interface AnthropicRequestOptions {
    /** True when requests go through a custom `baseURL` rather than the Claude API. */
    gateway?: boolean;
}

/**
 * Build the request body.
 *
 * Choosing among a few dozen elements is a classification-sized decision, so
 * effort stays low where the model supports it. On the Claude API a declined
 * request is retried on another model by the server; a gateway may not
 * understand that parameter, so it is only sent directly.
 */
export function buildAnthropicRequest(
    input: GenerateHealPlanInput,
    model: string,
    options: AnthropicRequestOptions = {},
): Record<string, unknown> {
    const request: Record<string, unknown> = {
        model,
        max_tokens: 8192,
        system: input.systemPrompt,
        messages: [
            { role: "user", content: input.userContent },
        ],
        output_config: {
            format: { type: "json_schema", schema: input.jsonSchema },
            ...(supportsEffort(model) ? { effort: "low" } : {}),
        },
    };
    if (!options.gateway && supportsServerFallback(model)) {
        request.betas = [SERVER_FALLBACK_BETA];
        request.fallbacks = "default";
    }
    return request;
}

/**
 * The JSON text of a response. Current models may open with thinking blocks,
 * so the first text block is read rather than the first block. A refusal
 * carries no usable answer.
 */
export function anthropicText(resp: any): string | null {
    if (!resp || resp.stop_reason === "refusal") return null;
    const block = (resp.content ?? []).find((b: any) => b?.type === "text");
    return typeof block?.text === "string" ? block.text : null;
}

/**
 * Client options. SDK 1.x sends the key as `Authorization: Bearer`; a custom
 * endpoint keeps receiving it as `X-Api-Key`, which is what gateways built
 * for the earlier SDK read.
 */
export function anthropicClientOptions(config: Pick<AIProviderConfig, "apiKey" | "baseURL">): Record<string, unknown> {
    return {
        apiKey: config.apiKey,
        timeout: PROVIDER_TIMEOUT_MS,
        maxRetries: 0,
        ...(config.baseURL
            ? { baseURL: config.baseURL, defaultHeaders: { "X-Api-Key": config.apiKey, Authorization: null } }
            : {}),
    };
}

export class AnthropicProvider implements AIProvider {
    readonly name = "anthropic" as const;
    private client: Promise<Anthropic> | null = null;
    private model: string;
    private gateway: boolean;

    constructor(private readonly config: AIProviderConfig) {
        this.model = config.model ?? DEFAULT_MODELS.anthropic;
        this.gateway = Boolean(config.baseURL);
    }

    private getClient(): Promise<Anthropic> {
        this.client ??= loadSdk("@anthropic-ai/sdk", "Anthropic", () => import("@anthropic-ai/sdk"))
            .then(({ default: Anthropic }) => new Anthropic(anthropicClientOptions(this.config) as any));
        return this.client;
    }

    async generateHealPlan(input: GenerateHealPlanInput): Promise<HealPlanResult> {
        try {
            const client = await this.getClient();
            const request = buildAnthropicRequest(input, this.model, { gateway: this.gateway });
            const resp = request.betas
                ? await client.beta.messages.create(request as any) as any
                : await client.messages.create(request as any) as any;

            const content = anthropicText(resp);
            healLog.aiResponse(content?.length ?? 0);

            const usage = resp.usage;
            const tokenUsage = usage ? {
                inputTokens: usage.input_tokens ?? 0,
                outputTokens: usage.output_tokens ?? 0,
                totalTokens: (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0),
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
