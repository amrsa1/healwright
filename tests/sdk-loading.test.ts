import { describe, it, expect, afterEach, vi } from 'vitest';
import { loadSdk } from '../src/providers/load';

const input = { systemPrompt: 's', userContent: '{}', jsonSchema: {} };
const missing = (pkg: string) =>
  Object.assign(new Error(`Cannot find package '${pkg}' imported from /app/dist/index.mjs`), { code: 'ERR_MODULE_NOT_FOUND' });

describe('loadSdk', () => {
  it('says which package to install when a provider SDK is missing', async () => {
    await expect(loadSdk('openai', 'OpenAI', async () => { throw missing('openai'); }))
      .rejects.toThrow('the OpenAI provider needs the "openai" package. Install it with: npm install openai');
  });

  it('understands the CommonJS flavour of the error too', async () => {
    const err = Object.assign(new Error("Cannot find module '@google/genai'"), { code: 'MODULE_NOT_FOUND' });
    await expect(loadSdk('@google/genai', 'Gemini', async () => { throw err; })).rejects.toThrow('npm install @google/genai');
  });

  it('passes other failures through untouched', async () => {
    const boom = new Error('SyntaxError in the SDK');
    await expect(loadSdk('openai', 'OpenAI', async () => { throw boom; })).rejects.toBe(boom);
    await expect(loadSdk('openai', 'OpenAI', async () => { throw missing('some-other-dep'); })).rejects.toThrow('some-other-dep');
  });
});

describe('provider SDKs load on first use', () => {
  afterEach(() => {
    vi.doUnmock('openai');
    vi.resetModules();
  });

  it('constructs a provider without touching its SDK', async () => {
    vi.resetModules();
    vi.doMock('openai', () => { throw missing('openai'); });
    const { OpenAIProvider } = await import('../src/providers/openai');

    const provider = new OpenAIProvider({ apiKey: 'k' });

    await expect(provider.generateHealPlan(input)).rejects.toThrow();
  });
});
