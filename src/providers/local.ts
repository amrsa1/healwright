/**
 * Local LLM Provider (Ollama)
 * Connects to a locally running Ollama instance for completely private,
 * offline AI healing — no API keys or cloud calls needed.
 * Default model: qwen3:4b (2.5 GB, 256K context, tools + thinking support)
 */

import { Ollama } from "ollama";
import { AIProvider, AIProviderConfig, GenerateHealPlanInput, HealPlanResult, DEFAULT_MODELS, cleanJson } from "./types";
import { HealPlan } from "../types";
import { healLog } from "../logger";

/**
 * Normalises common response shapes that small models produce.
 * Models sometimes flatten `{ type, value, confidence, why }` instead of
 * nesting under `{ strategy: { type, value }, confidence, why }`.
 * This function fixes that before Zod validation.
 */
function normalizeResponse(raw: any): any {
    if (!raw || typeof raw !== "object") return raw;

    // If it already has the correct `candidates[].strategy` shape, return as-is
    if (Array.isArray(raw.candidates) && raw.candidates.length > 0 && raw.candidates[0].strategy) {
        return raw;
    }

    // If 'candidates' exists but items are flat (no `strategy` key), reshape each
    if (Array.isArray(raw.candidates)) {
        raw.candidates = raw.candidates.map((c: any) => {
            if (c.strategy) return c; // already correct

            // Extract strategy fields from the flat object
            const strategyFields = ["type", "value", "selector", "role", "name", "text", "exact"];
            const strategy: any = {};
            const rest: any = {};
            for (const [k, v] of Object.entries(c)) {
                if (strategyFields.includes(k)) strategy[k] = v;
                else rest[k] = v;
            }
            if (strategy.type) {
                return { strategy, ...rest };
            }
            return c; // can't fix, pass through
        });
        return raw;
    }

    // Some models return a single object instead of wrapped in candidates array
    if (raw.type && (raw.confidence !== undefined || raw.why)) {
        const strategyFields = ["type", "value", "selector", "role", "name", "text", "exact"];
        const strategy: any = {};
        const rest: any = {};
        for (const [k, v] of Object.entries(raw)) {
            if (strategyFields.includes(k)) strategy[k] = v;
            else rest[k] = v;
        }
        return { candidates: [{ strategy, ...rest }] };
    }

    // Some models wrap in "result" or "response"
    for (const wrapper of ["result", "response", "data", "output"]) {
        if (raw[wrapper]) return normalizeResponse(raw[wrapper]);
    }

    return raw;
}

export class LocalProvider implements AIProvider {
    readonly name = "local" as const;
    private client: Ollama;
    private model: string;

    constructor(config: AIProviderConfig) {
        const host = config.apiKey || process.env.OLLAMA_HOST || "http://127.0.0.1:11434";
        this.client = new Ollama({ host });
        this.model = config.model ?? DEFAULT_MODELS.local;
    }

    async generateHealPlan(input: GenerateHealPlanInput): Promise<HealPlanResult> {
        try {
            // Build the Ollama format schema for structured output
            const formatSchema = input.jsonSchema ?? "json";

            // Augment the system prompt with an explicit JSON example
            // so smaller models have a concrete target structure
            const augmentedPrompt = [
                input.systemPrompt,
                "",
                "You MUST respond with ONLY valid JSON. No markdown, no triple-backticks.",
                "Use this EXACT structure:",
                '{"candidates":[{"strategy":{"type":"testid","value":"submit-btn","selector":null,"role":null,"name":null,"text":null,"exact":null},"confidence":0.95,"why":"matches data-testid"}]}',
                "strategy.type must be one of: testid, role, label, placeholder, text, altText, title, css.",
                "The 'confidence' field is a number between 0 and 1. The 'why' field explains WHY this element matches.",
            ].join("\n");

            const resp = await this.client.chat({
                model: this.model,
                messages: [
                    { role: "system", content: augmentedPrompt },
                    { role: "user", content: input.userContent },
                ],
                format: formatSchema as any,
                stream: false,
                options: { temperature: 0 },
            });

            const content = resp.message?.content;
            healLog.aiResponse(content?.length ?? 0);

            // Extract token usage from Ollama response
            const tokenUsage = (resp as any).prompt_eval_count != null ? {
                inputTokens: (resp as any).prompt_eval_count ?? 0,
                outputTokens: (resp as any).eval_count ?? 0,
                totalTokens: ((resp as any).prompt_eval_count ?? 0) + ((resp as any).eval_count ?? 0),
            } : null;

            if (!content) return { plan: null, tokenUsage };

            try {
                const parsed = JSON.parse(cleanJson(content));
                const normalized = normalizeResponse(parsed);
                return { plan: HealPlan.parse(normalized), tokenUsage };
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
