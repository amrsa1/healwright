import { describe, it, expect } from 'vitest';
import { healPlanJsonSchema, HealPlan } from '../src/types';
import { strictJsonSchema, isReasoningModel, DEFAULT_MODELS, PROVIDER_TIMEOUT_MS } from '../src/providers/types';
import { buildOpenAIRequest, openaiClientOptions } from '../src/providers/openai';
import { buildAnthropicRequest, anthropicText, anthropicClientOptions } from '../src/providers/anthropic';
import { buildGoogleRequest, googleClientOptions } from '../src/providers/google';
import { buildSystemPrompt } from '../src/prompt';

const input = {
  systemPrompt: 'system',
  userContent: '{"url":"https://x"}',
  jsonSchema: healPlanJsonSchema,
};

describe('healPlanJsonSchema', () => {
  it('is derived from the Zod schema so the two cannot drift', () => {
    const props = healPlanJsonSchema.properties.candidates.items.properties.strategy.properties;
    const zodKeys = Object.keys(HealPlan.shape.candidates.element.shape.strategy.shape);
    expect(Object.keys(props).sort()).toEqual(zodKeys.sort());
  });

  it('marks every property required, as strict structured outputs demand', () => {
    const strategy = healPlanJsonSchema.properties.candidates.items.properties.strategy;
    expect(strategy.required.sort()).toEqual(Object.keys(strategy.properties).sort());
  });

  it('omits keywords that strict mode rejects', () => {
    const serialized = JSON.stringify(healPlanJsonSchema);
    expect(serialized).not.toContain('maxItems');
    expect(serialized).not.toContain('$schema');
  });
});

describe('strictJsonSchema', () => {
  it('promotes every property into required', () => {
    const out: any = strictJsonSchema({
      type: 'object',
      properties: { a: { type: 'string' }, b: { type: 'number' } },
      required: ['a'],
    });
    expect(out.required.sort()).toEqual(['a', 'b']);
  });

  it('forbids additional properties at every level', () => {
    const out: any = strictJsonSchema({
      type: 'object',
      properties: { nested: { type: 'object', properties: { c: { type: 'string' } } } },
    });
    expect(out.additionalProperties).toBe(false);
    expect(out.properties.nested.additionalProperties).toBe(false);
  });

  it('strips $schema and array size keywords', () => {
    const out: any = strictJsonSchema({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'array',
      maxItems: 3,
      minItems: 1,
      items: { type: 'string' },
    });
    expect(out.$schema).toBeUndefined();
    expect(out.maxItems).toBeUndefined();
    expect(out.minItems).toBeUndefined();
  });
});

describe('isReasoningModel', () => {
  it.each(['gpt-5-nano', 'gpt-5.2', 'o3-mini', 'o4-mini'])('recognises %s', (model) => {
    expect(isReasoningModel(model)).toBe(true);
  });

  it.each(['gpt-4o', 'gpt-4.1', 'gpt-3.5-turbo'])('does not claim %s is one', (model) => {
    expect(isReasoningModel(model)).toBe(false);
  });
});

describe('buildOpenAIRequest', () => {
  it('sends the schema as a strict structured output', () => {
    const req: any = buildOpenAIRequest(input, 'gpt-5-nano');
    expect(req.text.format.type).toBe('json_schema');
    expect(req.text.format.strict).toBe(true);
    expect(req.text.format.schema).toBe(healPlanJsonSchema);
  });

  it('sets reasoning effort only for reasoning models', () => {
    expect((buildOpenAIRequest(input, 'gpt-5-nano') as any).reasoning).toEqual({ effort: 'low' });
    expect((buildOpenAIRequest(input, 'gpt-4o') as any).reasoning).toBeUndefined();
  });
});

describe('buildAnthropicRequest', () => {
  it('asks for structured output through output_config', () => {
    const req: any = buildAnthropicRequest(input, 'claude-sonnet-5-5');
    expect(req.output_config.format).toEqual({ type: 'json_schema', schema: healPlanJsonSchema });
    expect(req.output_format).toBeUndefined();
  });

  it('keeps the system prompt and user content intact', () => {
    const req: any = buildAnthropicRequest(input, 'claude-sonnet-5-5');
    expect(req.system).toBe('system');
    expect(req.messages[0].content).toBe(input.userContent);
  });

  it('keeps effort low on models that accept it, and omits it elsewhere', () => {
    expect((buildAnthropicRequest(input, 'claude-sonnet-5-5') as any).output_config.effort).toBe('low');
    expect((buildAnthropicRequest(input, 'claude-haiku-4-5') as any).output_config.effort).toBeUndefined();
  });

  it('opts into server-side refusal fallback only when calling the Claude API directly', () => {
    const direct: any = buildAnthropicRequest(input, 'claude-sonnet-5-5');
    expect(direct.fallbacks).toBe('default');
    expect(direct.betas).toContain('server-side-fallback-2026-07-01');

    const viaGateway: any = buildAnthropicRequest(input, 'claude-sonnet-5-5', { gateway: true });
    expect(viaGateway.fallbacks).toBeUndefined();
    expect(viaGateway.betas).toBeUndefined();

    expect((buildAnthropicRequest(input, 'claude-haiku-4-5') as any).fallbacks).toBeUndefined();
  });
});

describe('anthropicText', () => {
  it('reads the text block even when thinking blocks come first', () => {
    const resp = { stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: '{"candidates":[]}' }] };
    expect(anthropicText(resp)).toBe('{"candidates":[]}');
  });

  it('returns nothing when the model declined', () => {
    expect(anthropicText({ stop_reason: 'refusal', content: [{ type: 'text', text: 'partial' }] })).toBeNull();
  });
});

describe('anthropicClientOptions', () => {
  it('keeps sending X-Api-Key to a custom endpoint', () => {
    const o: any = anthropicClientOptions({ apiKey: 'k', baseURL: 'https://gateway.example' });
    expect(o.baseURL).toBe('https://gateway.example');
    expect(o.defaultHeaders).toEqual({ 'X-Api-Key': 'k', Authorization: null });
  });

  it("uses the SDK's own authentication against the Claude API", () => {
    expect((anthropicClientOptions({ apiKey: 'k' }) as any).defaultHeaders).toBeUndefined();
  });
});

describe('provider clients', () => {
  it('leave retries to healwright and bound every request', () => {
    for (const o of [anthropicClientOptions({ apiKey: 'k' }), openaiClientOptions({ apiKey: 'k' })] as any[]) {
      expect(o.maxRetries).toBe(0);
      expect(o.timeout).toBe(PROVIDER_TIMEOUT_MS);
    }
    const g: any = googleClientOptions({ apiKey: 'k' });
    expect(g.httpOptions.retryOptions).toEqual({ attempts: 1 });
    expect(g.httpOptions.timeout).toBe(PROVIDER_TIMEOUT_MS);
  });
});

describe('DEFAULT_MODELS', () => {
  it('points Anthropic at a current Claude model', () => {
    expect(DEFAULT_MODELS.anthropic).toBe('claude-sonnet-5-5');
    expect(DEFAULT_MODELS.claude).toBe('claude-sonnet-5-5');
  });
});

describe('buildGoogleRequest', () => {
  it('passes the schema through config rather than stuffing it in the prompt', () => {
    const req: any = buildGoogleRequest(input, 'gemini-2.5-flash');
    expect(req.config.responseJsonSchema).toBe(healPlanJsonSchema);
    expect(req.config.responseMimeType).toBe('application/json');
    expect(JSON.stringify(req.contents)).not.toContain('"properties"');
  });
});

describe('buildSystemPrompt', () => {
  it('states the JSON envelope the model must return', () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain('candidates');
    expect(prompt).toContain('strategy');
    expect(prompt).toContain('confidence');
  });

  it('asks for JSON only, so providers without schema enforcement still comply', () => {
    expect(buildSystemPrompt()).toMatch(/JSON/);
  });
});
