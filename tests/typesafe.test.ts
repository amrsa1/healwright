import { describe, it, expect, afterEach, vi } from 'vitest';
import zlib from 'node:zlib';
import {
  describeCandidate,
  strategiesFor,
  buildTypeSafeRequest,
  planFromAnswers,
  TypeSafeProvider,
} from '../src/providers/typesafe';
import { createAIProvider, resolveApiKey, DEFAULT_MODELS } from '../src/providers';

const placeOrder = { tag: 'button', txt: 'Place order', tid: 'place-order', cls: 'btn btn-primary' };
const coupon = { tag: 'button', txt: 'Apply coupon' };
const email = { tag: 'input', type: 'email', ph: 'you@example.com', id: 'email' };
const heal = {
  url: 'https://shop.example/checkout',
  action: 'click',
  contextName: 'Place order button',
  candidates: [placeOrder, coupon, email],
};

describe('describeCandidate', () => {
  it('names each attribute so the model reads fields, not a raw object', () => {
    expect(describeCandidate(placeOrder)).toBe('button, text "Place order", test id "place-order", class "btn btn-primary"');
  });

  it('says when an element is hidden', () => {
    expect(describeCandidate({ tag: 'input', type: 'checkbox', hid: true })).toContain('hidden');
  });
});

describe('strategiesFor', () => {
  it('prefers the test id, then role and name, then text', () => {
    expect(strategiesFor(placeOrder)).toEqual([
      { type: 'testid', value: 'place-order' },
      { type: 'role', role: 'button', name: 'Place order', exact: true },
      { type: 'text', text: 'Place order', exact: true },
    ]);
  });

  it('uses the placeholder and id for a text input with no label', () => {
    expect(strategiesFor(email)).toEqual([
      { type: 'placeholder', text: 'you@example.com', exact: true },
      { type: 'css', selector: '#email' },
    ]);
  });

  it('matches loosely when the collected text was truncated', () => {
    const long = { tag: 'a', href: '/x', txt: 'x'.repeat(60) };
    expect(strategiesFor(long)[0]).toMatchObject({ type: 'role', role: 'link', exact: false });
  });

  it('quotes ids that are not plain identifiers', () => {
    expect(strategiesFor({ tag: 'div', id: 'a:b' })).toEqual([{ type: 'css', selector: 'div[id="a:b"]' }]);
  });
});

describe('buildTypeSafeRequest', () => {
  it('asks which collected element is meant, with a way to say none', () => {
    const { request, labels } = buildTypeSafeRequest(heal);
    const element: any = request.questions.element;
    expect(element.type).toBe('choice');
    expect(Object.keys(element.criteria)).toEqual(['e1', 'e2', 'e3', 'none']);
    expect(element.criteria.e1).toBe(describeCandidate(placeOrder));
    expect(labels).toEqual(['e1', 'e2', 'e3']);
    expect(request.state).toEqual({ target: 'Place order button', action: 'click', page: 'https://shop.example/checkout' });
  });

  it('asks in parallel whether the element is on the page at all', () => {
    const present: any = buildTypeSafeRequest(heal).request.questions.present;
    expect(present.type).toBe('noul');
    expect(JSON.stringify(present.instructions)).toContain('Apply coupon');
  });

  it('stays within the 255-option limit', () => {
    const many = Array.from({ length: 400 }, (_, i) => ({ tag: 'button', txt: `b${i}` }));
    const element: any = buildTypeSafeRequest({ ...heal, candidates: many }).request.questions.element;
    expect(Object.keys(element.criteria)).toHaveLength(255);
  });
});

describe('planFromAnswers', () => {
  const answers = (probabilities: Record<string, number>, present = 0.95) => ({
    element: {
      type: 'choice' as const,
      choice: Object.entries(probabilities).sort((a, b) => b[1] - a[1])[0][0],
      confidence: 0.9,
      probabilities,
    },
    present: { type: 'noul' as const, noul: present },
  });

  it("builds strategies from the chosen element, scored by its probability", () => {
    const plan = planFromAnswers(heal.candidates, ['e1', 'e2', 'e3'], answers({ e1: 0.93, e2: 0.04, e3: 0.01, none: 0.02 }));
    expect(plan.candidates.map(c => c.strategy.type)).toEqual(['testid', 'role', 'text']);
    expect(plan.candidates.every(c => c.confidence === 0.93)).toBe(true);
  });

  it('adds the runner-up only when the model was torn between two elements', () => {
    const torn = planFromAnswers(heal.candidates, ['e1', 'e2', 'e3'], answers({ e1: 0.55, e2: 0.4, e3: 0.02, none: 0.03 }));
    expect(torn.candidates.find(c => c.confidence === 0.4)).toMatchObject({ strategy: { type: 'role', name: 'Apply coupon' } });

    const clear = planFromAnswers(heal.candidates, ['e1', 'e2', 'e3'], answers({ e1: 0.9, e2: 0.08, e3: 0.01, none: 0.01 }));
    expect(clear.candidates.some(c => c.strategy.name === 'Apply coupon')).toBe(false);
  });

  it('returns no candidates when nothing on the page matches', () => {
    expect(planFromAnswers(heal.candidates, ['e1', 'e2', 'e3'], answers({ e1: 0.1, e2: 0.05, e3: 0.05, none: 0.8 })).candidates).toEqual([]);
    expect(planFromAnswers(heal.candidates, ['e1', 'e2', 'e3'], answers({ e1: 0.7, e2: 0.2, e3: 0.05, none: 0.05 }, 0.2)).candidates).toEqual([]);
  });
});

describe('TypeSafeProvider', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('calls the System One API and returns a plan with token usage', async () => {
    const requests: { url: string; headers: Record<string, string>; body: any }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: any) => {
      const headers = Object.fromEntries(new Headers(init.headers).entries());
      const raw = Buffer.from(init.body instanceof Uint8Array ? init.body : await new Response(init.body).arrayBuffer());
      const text = headers['content-encoding'] === 'zstd' ? zlib.zstdDecompressSync(raw).toString() : raw.toString();
      requests.push({ url, headers, body: JSON.parse(text) });
      return new Response(JSON.stringify({
        model: 'jev-1.14.0',
        answers: {
          element: { type: 'choice', choice: 'e1', confidence: 0.9, probabilities: { e1: 0.93, e2: 0.04, e3: 0.01, none: 0.02 } },
          present: { type: 'noul', noul: 0.97 },
        },
        usage: { input_tokens: 412, output_tokens: 6 },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }));

    const provider = new TypeSafeProvider({ apiKey: 'ts-key' });
    const result = await provider.generateHealPlan({ systemPrompt: '', userContent: JSON.stringify(heal), jsonSchema: {}, heal });

    expect(requests[0].url).toBe('https://api.typesafe.ai/v1/systemone');
    expect(requests[0].headers.authorization).toBe('Bearer ts-key');
    expect(requests[0].body.model).toBe('jev-latest');
    expect(result.plan?.candidates[0]).toMatchObject({ strategy: { type: 'testid', value: 'place-order' }, confidence: 0.93 });
    expect(result.tokenUsage).toEqual({ inputTokens: 412, outputTokens: 6, totalTokens: 418 });
  });
});

describe('provider wiring', () => {
  it('creates the TypeSafe provider for typesafe and jev', () => {
    expect(createAIProvider('typesafe', { apiKey: 'k' }).name).toBe('typesafe');
    expect(createAIProvider('jev', { apiKey: 'k' }).name).toBe('typesafe');
    expect(DEFAULT_MODELS.typesafe).toBe('jev-latest');
  });

  it("reads TypeSafe's own key first, so an AI_API_KEY for another provider is not sent to it", () => {
    const env = { AI_API_KEY: 'openai-key', TYPESAFE_API_KEY: 'ts-key' };
    expect(resolveApiKey('typesafe', undefined, env)).toBe('ts-key');
    expect(resolveApiKey('typesafe', undefined, { AI_API_KEY: 'only' })).toBe('only');
    expect(resolveApiKey('openai', undefined, env)).toBe('openai-key');
    expect(resolveApiKey('typesafe', 'explicit', env)).toBe('explicit');
  });
});
