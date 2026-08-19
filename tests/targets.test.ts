import { describe, it, expect, vi } from 'vitest';
import { isAiOnlyTarget, toLocator, candidateSelector, CANDIDATE_COLLECTION_CAP } from '../src/utils';

describe('isAiOnlyTarget', () => {
  it('treats an empty string as AI-only mode', () => {
    expect(isAiOnlyTarget('')).toBe(true);
  });

  it('treats a whitespace-only string as AI-only mode', () => {
    expect(isAiOnlyTarget('   ')).toBe(true);
  });

  it('does not treat a real selector string as AI-only mode', () => {
    expect(isAiOnlyTarget('button.submit')).toBe(false);
  });

  it('does not treat a Locator as AI-only mode', () => {
    expect(isAiOnlyTarget({ click: vi.fn() } as any)).toBe(false);
  });
});

describe('toLocator', () => {
  it('resolves a selector string through page.locator', () => {
    const page = { locator: vi.fn().mockReturnValue('resolved') } as any;
    expect(toLocator(page, 'button.submit')).toBe('resolved');
    expect(page.locator).toHaveBeenCalledWith('button.submit');
  });

  it('returns an existing Locator untouched', () => {
    const page = { locator: vi.fn() } as any;
    const loc = { click: vi.fn() } as any;
    expect(toLocator(page, loc)).toBe(loc);
    expect(page.locator).not.toHaveBeenCalled();
  });

  it('throws for an AI-only target rather than building an empty selector', () => {
    const page = { locator: vi.fn() } as any;
    expect(() => toLocator(page, '')).toThrow(/no selector/i);
    expect(page.locator).not.toHaveBeenCalled();
  });
});

describe('candidateSelector', () => {
  it('includes interactive elements for click', () => {
    const sel = candidateSelector('click');
    expect(sel).toContain('button');
    expect(sel).toContain("[role='button']");
  });

  it('includes text entry elements for fill', () => {
    const sel = candidateSelector('fill');
    expect(sel).toContain('textarea');
  });

  it('unions clickable and text-entry elements for focus', () => {
    const sel = candidateSelector('focus');
    expect(sel).toContain('button');
    expect(sel).toContain('textarea');
    expect(sel).toContain('input');
  });

  it('unions every element family for locate', () => {
    const sel = candidateSelector('locate');
    expect(sel).toContain('button');
    expect(sel).toContain('textarea');
    expect(sel).toContain('select');
  });

  it('never emits duplicate selector parts', () => {
    const parts = candidateSelector('focus').split(',');
    expect(new Set(parts).size).toBe(parts.length);
  });
});

describe('CANDIDATE_COLLECTION_CAP', () => {
  it('collects far more elements than are ever sent to the model', () => {
    expect(CANDIDATE_COLLECTION_CAP).toBeGreaterThanOrEqual(500);
  });
});
