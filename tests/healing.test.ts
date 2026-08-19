import { describe, it, expect, beforeEach, vi } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { withHealing } from '../src/healwright';
import { getHealSummary, resetHealSummary } from '../src/summary';
import { HealError } from '../src/types';
import { createFakePage, createFakeProvider, planFor } from './helpers/fakePage';

let tmp: string;

beforeEach(async () => {
  resetHealSummary();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'healwright-run-'));
});

const paths = () => ({
  cacheFile: path.join(tmp, 'healed.json'),
  reportFile: path.join(tmp, 'events.jsonl'),
});

describe('selector strings (healing disabled)', () => {
  it('uses a selector string as a selector instead of crashing', async () => {
    const { page, calls } = createFakePage({ present: ['button.submit'] });
    const healPage = withHealing(page, { enabled: false, ...paths() });

    await healPage.heal.click('button.submit', 'Submit button');

    expect(calls.map(c => c.action)).toContain('click');
    expect(page.locator).toHaveBeenCalledWith('button.submit');
  });

  it('explains how to enable healing when no selector was given', async () => {
    const { page } = createFakePage();
    const healPage = withHealing(page, { enabled: false, ...paths() });

    await expect(healPage.heal.click('', 'Login button')).rejects.toThrow(/SELF_HEAL/);
  });
});

describe('healing a broken locator', () => {
  it('falls back to the AI strategy and performs the action', async () => {
    const { page, calls } = createFakePage({ present: ['label=Email'] });
    const { provider } = createFakeProvider(planFor({ type: 'label', text: 'Email' }));
    const healPage = withHealing(page, {
      enabled: true, aiProvider: provider as any, ...paths(),
    });

    await healPage.heal.fill('#gone', 'Email field', 'a@b.c');

    expect(calls.some(c => c.action === 'fill' && c.selector === 'label=Email')).toBe(true);
    expect(getHealSummary().healed).toBe(1);
  });

  it('gives the original locator the configured quick timeout', async () => {
    const { page, calls } = createFakePage({ present: ['label=Email'] });
    const { provider } = createFakeProvider(planFor({ type: 'label', text: 'Email' }));
    const healPage = withHealing(page, {
      enabled: true, aiProvider: provider as any, quickTimeout: 2500, ...paths(),
    });

    await healPage.heal.fill('#gone', 'Email field', 'a@b.c');

    expect(calls.some(c => c.action === 'waitFor:2500' && c.selector === '#gone')).toBe(true);
  });
});

describe('confidence policy', () => {
  it('refuses a heal that scores below minConfidence', async () => {
    const { page } = createFakePage({ present: ['label=Email'] });
    const { provider } = createFakeProvider(planFor({ type: 'label', text: 'Email' }, 0.3));
    const healPage = withHealing(page, {
      enabled: true, aiProvider: provider as any, minConfidence: 0.8, ...paths(),
    });

    await expect(healPage.heal.fill('#gone', 'Email field', 'a@b.c')).rejects.toThrow(HealError);
    expect(getHealSummary().belowConfidence).toBe(1);
    expect(getHealSummary().healed).toBe(0);
  });

  it('accepts a heal that clears minConfidence', async () => {
    const { page, calls } = createFakePage({ present: ['label=Email'] });
    const { provider } = createFakeProvider(planFor({ type: 'label', text: 'Email' }, 0.92));
    const healPage = withHealing(page, {
      enabled: true, aiProvider: provider as any, minConfidence: 0.8, ...paths(),
    });

    await healPage.heal.fill('#gone', 'Email field', 'a@b.c');
    expect(calls.some(c => c.action === 'fill')).toBe(true);
  });
});

describe("mode: 'warn'", () => {
  it('reports the heal it found but lets the original failure stand', async () => {
    const { page, calls } = createFakePage({ present: ['label=Email'] });
    const { provider } = createFakeProvider(planFor({ type: 'label', text: 'Email' }));
    const healPage = withHealing(page, {
      enabled: true, mode: 'warn', aiProvider: provider as any, ...paths(),
    });

    await expect(healPage.heal.fill('#gone', 'Email field', 'a@b.c')).rejects.toThrow();

    expect(calls.some(c => c.action === 'fill')).toBe(false);
    const summary = getHealSummary();
    expect(summary.wouldHeal).toBe(1);
    expect(summary.healed).toBe(0);
    expect(summary.entries[0].strategy).toMatchObject({ type: 'label', text: 'Email' });
  });
});

describe('candidate collection', () => {
  it('asks for focusable text inputs when focusing', async () => {
    const { page, evaluateArgs } = createFakePage({ present: ['label=Email'] });
    const { provider } = createFakeProvider(planFor({ type: 'label', text: 'Email' }));
    const healPage = withHealing(page, {
      enabled: true, aiProvider: provider as any, ...paths(),
    });

    await healPage.heal.focus('#gone', 'Email input');

    expect(evaluateArgs[0].selector).toContain('textarea');
    expect(evaluateArgs[0].selector).toContain('button');
  });

  it('collects far more elements than it sends to the model', async () => {
    const many = Array.from({ length: 300 }, (_, i) => ({ tag: 'button', txt: `b${i}` }));
    const { page, evaluateArgs } = createFakePage({ present: ['label=Email'], candidates: many });
    const { provider, seen } = createFakeProvider(planFor({ type: 'label', text: 'Email' }));
    const healPage = withHealing(page, {
      enabled: true, aiProvider: provider as any, maxCandidates: 25, ...paths(),
    });

    await healPage.heal.fill('#gone', 'Email field', 'a@b.c');

    expect(evaluateArgs[0].limit).toBeGreaterThanOrEqual(500);
    expect(JSON.parse(seen[0].userContent).candidates).toHaveLength(25);
  });
});

describe('heal.getLocator', () => {
  it('returns the original locator when the selector still matches', async () => {
    const { page } = createFakePage({ present: ['.cart-count'] });
    const healPage = withHealing(page, { enabled: true, ...paths() });

    const loc: any = await healPage.heal.getLocator('.cart-count', 'Cart badge');
    expect(loc.__selector).toBe('.cart-count');
  });

  it('returns a real healed Locator usable with any Playwright API', async () => {
    const { page } = createFakePage({ present: ['role=status[name=Cart]'] });
    const { provider } = createFakeProvider(planFor({ type: 'role', role: 'status', name: 'Cart' }));
    const healPage = withHealing(page, {
      enabled: true, aiProvider: provider as any, ...paths(),
    });

    const loc: any = await healPage.heal.getLocator('.gone', 'Cart badge');
    expect(loc.__selector).toBe('role=status[name=Cart]');
    expect(typeof loc.count).toBe('function');
  });
});
