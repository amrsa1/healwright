import { describe, it, expect, vi } from 'vitest';
import {
  isValidLocator,
  validateStrategy,
  cacheKey,
  buildLocator,
  isRetryableError,
  withRetry,
} from '../src/utils';
import { formatStrategy } from '../src/logger';
import type { StrategyT } from '../src/types';

// ---------- isValidLocator ----------

describe('isValidLocator', () => {
  it('returns false for empty string', () => {
    expect(isValidLocator('')).toBe(false);
  });

  it('returns true for non-empty string', () => {
    expect(isValidLocator('button')).toBe(true);
  });

  it('returns true for a Locator-like object', () => {
    const fakeLoc = { click: vi.fn(), fill: vi.fn() };
    expect(isValidLocator(fakeLoc as any)).toBe(true);
  });
});

// ---------- validateStrategy ----------

describe('validateStrategy', () => {
  it('returns null for valid testid strategy', () => {
    expect(validateStrategy({ type: 'testid', value: 'submit-btn' })).toBeNull();
  });

  it('returns error for testid missing value', () => {
    expect(validateStrategy({ type: 'testid' })).toBe("missing 'value'");
  });

  it('returns null for valid role strategy', () => {
    expect(validateStrategy({ type: 'role', role: 'button', name: 'Submit' })).toBeNull();
  });

  it('returns error for role missing role field', () => {
    expect(validateStrategy({ type: 'role', name: 'Submit' })).toBe("missing 'role'");
  });

  it('returns null for valid label strategy', () => {
    expect(validateStrategy({ type: 'label', text: 'Email' })).toBeNull();
  });

  it('returns error for label missing text', () => {
    expect(validateStrategy({ type: 'label' })).toBe("missing 'text'");
  });

  it('returns null for valid placeholder strategy', () => {
    expect(validateStrategy({ type: 'placeholder', text: 'Enter email' })).toBeNull();
  });

  it('returns error for placeholder missing text', () => {
    expect(validateStrategy({ type: 'placeholder' })).toBe("missing 'text'");
  });

  it('returns null for valid text strategy', () => {
    expect(validateStrategy({ type: 'text', text: 'Click me' })).toBeNull();
  });

  it('returns error for text missing text', () => {
    expect(validateStrategy({ type: 'text' })).toBe("missing 'text'");
  });

  it('returns null for valid css strategy', () => {
    expect(validateStrategy({ type: 'css', selector: '.btn' })).toBeNull();
  });

  it('returns error for css missing selector', () => {
    expect(validateStrategy({ type: 'css' })).toBe("missing 'selector'");
  });
});

// ---------- buildLocator ----------

describe('buildLocator', () => {
  function mockPage() {
    return {
      getByTestId: vi.fn().mockReturnValue('testid-loc'),
      getByRole: vi.fn().mockReturnValue('role-loc'),
      getByLabel: vi.fn().mockReturnValue('label-loc'),
      getByPlaceholder: vi.fn().mockReturnValue('placeholder-loc'),
      getByText: vi.fn().mockReturnValue('text-loc'),
      getByAltText: vi.fn().mockReturnValue('alt-loc'),
      getByTitle: vi.fn().mockReturnValue('title-loc'),
      locator: vi.fn().mockReturnValue('css-loc'),
    } as any;
  }

  it('builds testid locator', () => {
    const page = mockPage();
    const result = buildLocator(page, { type: 'testid', value: 'my-id' });
    expect(page.locator).toHaveBeenCalledWith(
      '[data-testid="my-id"],[data-test="my-id"],[data-test-id="my-id"],[data-qa="my-id"],[data-cy="my-id"]'
    );
    expect(result).toBe('css-loc');
  });

  it('throws for testid without value', () => {
    expect(() => buildLocator(mockPage(), { type: 'testid' })).toThrow("testid strategy requires 'value'");
  });

  it('builds role locator with name and exact', () => {
    const page = mockPage();
    buildLocator(page, { type: 'role', role: 'button', name: 'Submit', exact: true });
    expect(page.getByRole).toHaveBeenCalledWith('button', { name: 'Submit', exact: true });
  });

  it('throws for role without role field', () => {
    expect(() => buildLocator(mockPage(), { type: 'role' })).toThrow("role strategy requires 'role'");
  });

  it('builds label locator', () => {
    const page = mockPage();
    buildLocator(page, { type: 'label', text: 'Email' });
    expect(page.getByLabel).toHaveBeenCalledWith('Email', { exact: undefined });
  });

  it('throws for label without text', () => {
    expect(() => buildLocator(mockPage(), { type: 'label' })).toThrow("label strategy requires 'text'");
  });

  it('builds placeholder locator', () => {
    const page = mockPage();
    buildLocator(page, { type: 'placeholder', text: 'Enter...' });
    expect(page.getByPlaceholder).toHaveBeenCalledWith('Enter...', { exact: undefined });
  });

  it('builds text locator', () => {
    const page = mockPage();
    buildLocator(page, { type: 'text', text: 'Hello' });
    expect(page.getByText).toHaveBeenCalledWith('Hello', { exact: undefined });
  });

  it('builds css locator', () => {
    const page = mockPage();
    buildLocator(page, { type: 'css', selector: '.btn-primary' });
    expect(page.locator).toHaveBeenCalledWith('.btn-primary');
  });

  it('throws for css without selector', () => {
    expect(() => buildLocator(mockPage(), { type: 'css' })).toThrow("css strategy requires 'selector'");
  });

  it('builds altText locator', () => {
    const page = mockPage();
    const result = buildLocator(page, { type: 'altText', text: 'Product image' });
    expect(page.getByAltText).toHaveBeenCalledWith('Product image', { exact: undefined });
    expect(result).toBe('alt-loc');
  });

  it('throws for altText without text', () => {
    expect(() => buildLocator(mockPage(), { type: 'altText' })).toThrow("altText strategy requires 'text'");
  });

  it('builds title locator', () => {
    const page = mockPage();
    const result = buildLocator(page, { type: 'title', text: 'Close dialog' });
    expect(page.getByTitle).toHaveBeenCalledWith('Close dialog', { exact: undefined });
    expect(result).toBe('title-loc');
  });

  it('throws for title without text', () => {
    expect(() => buildLocator(mockPage(), { type: 'title' })).toThrow("title strategy requires 'text'");
  });

  it('throws for unknown strategy type', () => {
    expect(() => buildLocator(mockPage(), { type: 'xpath' as any })).toThrow('Unknown strategy type: xpath');
  });
});

// ---------- cacheKey ----------

describe('cacheKey', () => {
  it('generates consistent keys from page url + action + context', () => {
    const mockPage = { url: () => 'https://example.com/login?q=1#hash' } as any;
    const key = cacheKey(mockPage, 'click', 'Submit button');
    expect(key).toBe('click::https://example.com/login::Submit button');
  });

  it('produces different keys for different actions', () => {
    const mockPage = { url: () => 'https://example.com/' } as any;
    const k1 = cacheKey(mockPage, 'click', 'Btn');
    const k2 = cacheKey(mockPage, 'fill', 'Btn');
    expect(k1).not.toBe(k2);
  });
});

// ---------- formatStrategy ----------

describe('formatStrategy', () => {
  it('formats testid strategy', () => {
    expect(formatStrategy({ type: 'testid', value: 'x' })).toBe('getByTestId("x")');
  });

  it('formats role strategy with name', () => {
    expect(formatStrategy({ type: 'role', role: 'button', name: 'Save' } as StrategyT))
      .toBe('getByRole("button", { name: "Save" })');
  });

  it('formats role strategy without name', () => {
    expect(formatStrategy({ type: 'role', role: 'link' } as StrategyT)).toBe('getByRole("link")');
  });

  it('formats label strategy', () => {
    expect(formatStrategy({ type: 'label', text: 'Email' } as StrategyT)).toBe('getByLabel("Email")');
  });

  it('formats placeholder strategy', () => {
    expect(formatStrategy({ type: 'placeholder', text: 'Search...' } as StrategyT))
      .toBe('getByPlaceholder("Search...")');
  });

  it('formats text strategy', () => {
    expect(formatStrategy({ type: 'text', text: 'Hello' } as StrategyT)).toBe('getByText("Hello")');
  });

  it('formats css strategy', () => {
    expect(formatStrategy({ type: 'css', selector: '#main' } as StrategyT)).toBe('locator("#main")');
  });
});

// ---------- isRetryableError ----------

describe('isRetryableError', () => {
  it('detects 429 rate limit status', () => {
    expect(isRetryableError({ status: 429, message: 'Rate limited' })).toBe(true);
  });

  it('detects 500+ server errors', () => {
    expect(isRetryableError({ status: 500 })).toBe(true);
    expect(isRetryableError({ status: 503 })).toBe(true);
  });

  it('detects network errors by code', () => {
    expect(isRetryableError({ code: 'ECONNRESET' })).toBe(true);
    expect(isRetryableError({ code: 'ETIMEDOUT' })).toBe(true);
  });

  it('detects rate limit by message', () => {
    expect(isRetryableError({ message: 'Rate limit exceeded' })).toBe(true);
  });

  it('detects overloaded by message', () => {
    expect(isRetryableError({ message: 'Server overloaded' })).toBe(true);
  });

  it('returns false for auth errors', () => {
    expect(isRetryableError({ status: 401, message: 'Unauthorized' })).toBe(false);
  });

  it('returns false for bad request', () => {
    expect(isRetryableError({ status: 400, message: 'Bad request' })).toBe(false);
  });

  it('returns false for null/undefined', () => {
    expect(isRetryableError(null)).toBe(false);
    expect(isRetryableError(undefined)).toBe(false);
  });
});

// ---------- withRetry ----------

describe('withRetry', () => {
  it('returns the result on first success', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withRetry(fn, 2, 10);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on retryable error and succeeds', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce({ status: 429, message: 'rate limit' })
      .mockResolvedValue('recovered');
    const result = await withRetry(fn, 1, 10);
    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws immediately on non-retryable error', async () => {
    const fn = vi.fn().mockRejectedValue({ status: 401, message: 'Unauthorized' });
    await expect(withRetry(fn, 2, 10)).rejects.toEqual({ status: 401, message: 'Unauthorized' });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('throws after exhausting retries on retryable errors', async () => {
    const fn = vi.fn().mockRejectedValue({ status: 429, message: 'rate limit' });
    await expect(withRetry(fn, 1, 10)).rejects.toEqual({ status: 429, message: 'rate limit' });
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
