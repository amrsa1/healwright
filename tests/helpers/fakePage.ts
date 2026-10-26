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
  /** Selectors that resolve to exactly one element that is not visible. */
  hidden?: string[];
  /** Actions on these selectors throw the given message, as Playwright would. */
  actionErrors?: Record<string, string>;
  /** Selectors that resolve to an element the model was never shown. */
  notShown?: string[];
  /** The page lost the collected list (it navigated), so nothing can be verified. */
  unverifiable?: boolean;
  candidates?: Record<string, unknown>[];
} = {}) {
  const url = opts.url ?? 'https://example.test/checkout';
  const present = new Set(opts.present ?? []);
  const hidden = new Set(opts.hidden ?? []);
  const calls: { action: string; selector: string }[] = [];
  const evaluateArgs: any[] = [];

  const makeLocator = (selector: string) => {
    const exists = present.has(selector);
    const inDom = exists || hidden.has(selector);
    const act = (action: string) => {
      const message = opts.actionErrors?.[selector];
      if (message) throw new Error(message);
      calls.push({ action, selector });
    };
    const locator: any = {
      __selector: selector,
      count: vi.fn(async () => (inDom ? 1 : 0)),
      isVisible: vi.fn(async () => exists),
      first: vi.fn(() => locator),
      // Answers "is this one of the collected elements?" for the grounding check.
      evaluate: vi.fn(async () => (opts.unverifiable ? null : !(opts.notShown ?? []).includes(selector))),
      waitFor: vi.fn(async ({ timeout, state }: { timeout?: number; state?: string } = {}) => {
        calls.push({ action: `waitFor:${timeout}`, selector });
        const ok = state === 'attached' ? inDom : exists;
        if (!ok) throw new Error(`locator not found: ${selector}`);
      }),
      click: vi.fn(async () => act('click')),
      dblclick: vi.fn(async () => act('dblclick')),
      fill: vi.fn(async () => act('fill')),
      check: vi.fn(async () => act('check')),
      uncheck: vi.fn(async () => act('uncheck')),
      hover: vi.fn(async () => act('hover')),
      focus: vi.fn(async () => act('focus')),
      selectOption: vi.fn(async () => act('selectOption')),
      dispatchEvent: vi.fn(async () => act('dispatchEvent')),
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
