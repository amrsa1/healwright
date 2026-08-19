import { vi } from 'vitest';

export interface FakeElement {
  selector: string;
  visible?: boolean;
  count?: number;
}

/**
 * A minimal stand-in for a Playwright Page + Locator, good enough to drive the
 * healing pipeline end to end without a browser.
 */
export function createFakePage(opts: {
  url?: string;
  /** Selectors that resolve to exactly one visible element. */
  present?: string[];
  candidates?: Record<string, unknown>[];
} = {}) {
  const url = opts.url ?? 'https://example.test/checkout';
  const present = new Set(opts.present ?? []);
  const calls: { action: string; selector: string }[] = [];
  const evaluateArgs: any[] = [];

  const makeLocator = (selector: string) => {
    const exists = present.has(selector);
    const locator: any = {
      __selector: selector,
      count: vi.fn(async () => (exists ? 1 : 0)),
      isVisible: vi.fn(async () => exists),
      first: vi.fn(() => locator),
      waitFor: vi.fn(async ({ timeout }: { timeout?: number } = {}) => {
        calls.push({ action: `waitFor:${timeout}`, selector });
        if (!exists) throw new Error(`locator not found: ${selector}`);
      }),
      click: vi.fn(async () => { calls.push({ action: 'click', selector }); }),
      dblclick: vi.fn(async () => { calls.push({ action: 'dblclick', selector }); }),
      fill: vi.fn(async () => { calls.push({ action: 'fill', selector }); }),
      check: vi.fn(async () => { calls.push({ action: 'check', selector }); }),
      uncheck: vi.fn(async () => { calls.push({ action: 'uncheck', selector }); }),
      hover: vi.fn(async () => { calls.push({ action: 'hover', selector }); }),
      focus: vi.fn(async () => { calls.push({ action: 'focus', selector }); }),
      selectOption: vi.fn(async () => { calls.push({ action: 'selectOption', selector }); }),
      dispatchEvent: vi.fn(async () => { calls.push({ action: 'dispatchEvent', selector }); }),
    };
    return locator;
  };

  const page: any = {
    url: () => url,
    locator: vi.fn((selector: string) => makeLocator(selector)),
    getByRole: vi.fn((role: string, o: any) => makeLocator(`role=${role}[name=${o?.name}]`)),
    getByLabel: vi.fn((t: string) => makeLocator(`label=${t}`)),
    getByPlaceholder: vi.fn((t: string) => makeLocator(`placeholder=${t}`)),
    getByText: vi.fn((t: string) => makeLocator(`text=${t}`)),
    getByAltText: vi.fn((t: string) => makeLocator(`alt=${t}`)),
    getByTitle: vi.fn((t: string) => makeLocator(`title=${t}`)),
    waitForLoadState: vi.fn(async () => {}),
    evaluate: vi.fn(async (_fn: any, arg: any) => {
      evaluateArgs.push(arg);
      return opts.candidates ?? [];
    }),
  };

  return { page, calls, evaluateArgs, makeLocator };
}

/** A provider that always returns the given plan, recording what it was asked. */
export function createFakeProvider(plan: any, tokenUsage: any = null) {
  const seen: any[] = [];
  return {
    provider: {
      name: 'openai' as const,
      generateHealPlan: vi.fn(async (input: any) => {
        seen.push(input);
        return { plan, tokenUsage };
      }),
    },
    seen,
  };
}

export const planFor = (strategy: Record<string, unknown>, confidence = 0.95) => ({
  candidates: [{ strategy, confidence, why: 'because' }],
});
