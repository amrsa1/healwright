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

  it('reports a cached heal instead of applying it', async () => {
    const { cacheFile, reportFile } = paths();
    await fs.writeFile(cacheFile, JSON.stringify({
      'fill::https://example.test/checkout::Email field': { type: 'label', text: 'Email', context: 'Email field' },
    }));
    const { page, calls } = createFakePage({ present: ['label=Email'] });
    const { provider } = createFakeProvider(planFor({ type: 'label', text: 'Email' }));
    const healPage = withHealing(page, {
      enabled: true, mode: 'warn', aiProvider: provider as any, cacheFile, reportFile,
    });

    await expect(healPage.heal.fill('#gone', 'Email field', 'a@b.c')).rejects.toThrow();

    expect(calls.some(c => c.action === 'fill')).toBe(false);
    expect(getHealSummary()).toMatchObject({ wouldHeal: 1, fromCache: 0 });
  });

  it('does not hand back a cached Locator from getLocator', async () => {
    const { cacheFile, reportFile } = paths();
    await fs.writeFile(cacheFile, JSON.stringify({
      'locate::https://example.test/checkout::Cart badge': { type: 'role', role: 'status', name: 'Cart', context: 'Cart badge' },
    }));
    const { page } = createFakePage({ present: ['role=status[name=Cart]'] });
    const { provider } = createFakeProvider(planFor({ type: 'role', role: 'status', name: 'Cart' }));
    const healPage = withHealing(page, {
      enabled: true, mode: 'warn', aiProvider: provider as any, cacheFile, reportFile,
    });

    await expect(healPage.heal.getLocator('.gone', 'Cart badge')).rejects.toThrow(HealError);

    expect(getHealSummary()).toMatchObject({ wouldHeal: 1, fromCache: 0 });
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

describe('force clicks', () => {
  it('reuses a cached heal for a control that only appears on hover', async () => {
    const { cacheFile, reportFile } = paths();
    await fs.writeFile(cacheFile, JSON.stringify({
      'click::https://example.test/checkout::Delete button': { type: 'css', selector: 'button.destroy', context: 'Delete button' },
    }));
    const { page, calls } = createFakePage({ hidden: ['button.destroy'] });
    const { provider } = createFakeProvider(planFor({ type: 'css', selector: 'button.destroy' }));
    const healPage = withHealing(page, { enabled: true, aiProvider: provider as any, cacheFile, reportFile });

    await healPage.heal.click('', 'Delete button', { force: true });

    expect(calls.some(c => c.action === 'dispatchEvent' && c.selector === 'button.destroy')).toBe(true);
    expect(provider.generateHealPlan).not.toHaveBeenCalled();
    expect(getHealSummary().fromCache).toBe(1);
  });
});

describe('heal summary accuracy', () => {
  it('counts a heal the model had no answer for as failed', async () => {
    const { page } = createFakePage();
    const { provider } = createFakeProvider(null);
    const healPage = withHealing(page, { enabled: true, aiProvider: provider as any, ...paths() });

    await expect(healPage.heal.click('#gone', 'Submit button')).rejects.toThrow(HealError);

    expect(getHealSummary().failed).toBe(1);
  });
});

describe('page URLs', () => {
  it('never sends or logs the query string, which can carry tokens', async () => {
    const { page } = createFakePage({ url: 'https://example.test/checkout?session=s3cret#pay', present: ['label=Email'] });
    const { provider, seen } = createFakeProvider(planFor({ type: 'label', text: 'Email' }));
    const { cacheFile, reportFile } = paths();
    const healPage = withHealing(page, { enabled: true, aiProvider: provider as any, cacheFile, reportFile });

    await healPage.heal.fill('#gone', 'Email field', 'a@b.c');

    expect(JSON.parse(seen[0].userContent).url).toBe('https://example.test/checkout');
    expect(await fs.readFile(reportFile, 'utf8')).not.toContain('s3cret');
    expect(getHealSummary().entries[0].url).toBe('https://example.test/checkout');
  });
});

describe('check and uncheck', () => {
  it('search custom checkboxes and switches, not just native inputs', async () => {
    const { page, evaluateArgs } = createFakePage({ present: ['label=Terms'] });
    const { provider } = createFakeProvider(planFor({ type: 'label', text: 'Terms' }));
    const healPage = withHealing(page, { enabled: true, aiProvider: provider as any, ...paths() });

    await healPage.heal.check('#gone', 'Accept the terms');

    expect(evaluateArgs[0].selector).toContain("[role='checkbox']");
    expect(evaluateArgs[0].selector).toContain("[role='switch']");
  });
});

describe('when healing starts', () => {
  it('does not heal when the element was found but the action failed', async () => {
    const { page, calls } = createFakePage({
      present: ['button.buy', 'role=button[name=Buy]'],
      actionErrors: { 'button.buy': 'locator.click: Timeout 5000ms exceeded.\n  - element is not enabled' },
    });
    const { provider } = createFakeProvider(planFor({ type: 'role', role: 'button', name: 'Buy' }));
    const healPage = withHealing(page, { enabled: true, aiProvider: provider as any, ...paths() });

    await expect(healPage.heal.click('button.buy', 'Buy button')).rejects.toThrow(/not enabled/);

    expect(provider.generateHealPlan).not.toHaveBeenCalled();
    expect(calls.some(c => c.action === 'click')).toBe(false);
    expect(getHealSummary().total).toBe(0);
  });

  it('heals when the selector now matches the wrong kind of element', async () => {
    const { page, calls } = createFakePage({
      present: ['#email', 'label=Email'],
      actionErrors: { '#email': 'Error: Element is not an <input>, <textarea> or [contenteditable] element' },
    });
    const { provider } = createFakeProvider(planFor({ type: 'label', text: 'Email' }));
    const healPage = withHealing(page, { enabled: true, aiProvider: provider as any, ...paths() });

    await healPage.heal.fill('#email', 'Email field', 'a@b.c');

    expect(calls.some(c => c.action === 'fill' && c.selector === 'label=Email')).toBe(true);
  });

  it('clicks a hover-only control through a working selector without healing', async () => {
    const { page, calls } = createFakePage({ hidden: ['button.destroy'] });
    const { provider } = createFakeProvider(planFor({ type: 'css', selector: 'button.destroy' }));
    const healPage = withHealing(page, { enabled: true, aiProvider: provider as any, ...paths() });

    await healPage.heal.click('button.destroy', 'Delete button', { force: true });

    expect(calls.some(c => c.action === 'dispatchEvent' && c.selector === 'button.destroy')).toBe(true);
    expect(provider.generateHealPlan).not.toHaveBeenCalled();
  });
});

describe('grounding', () => {
  const twoStrategies = {
    candidates: [
      { strategy: { type: 'css', selector: 'button.made-up' }, confidence: 0.9, why: 'guess' },
      { strategy: { type: 'label', text: 'Email' }, confidence: 0.8, why: 'label matches' },
    ],
  };

  it('rejects a strategy that resolves to an element the model was never shown', async () => {
    const { page, calls } = createFakePage({ present: ['button.made-up', 'label=Email'], notShown: ['button.made-up'] });
    const { provider } = createFakeProvider(twoStrategies);
    const healPage = withHealing(page, { enabled: true, aiProvider: provider as any, ...paths() });

    await healPage.heal.fill('#gone', 'Email field', 'a@b.c');

    expect(calls.some(c => c.action === 'fill' && c.selector === 'button.made-up')).toBe(false);
    expect(calls.some(c => c.action === 'fill' && c.selector === 'label=Email')).toBe(true);
  });

  it('accepts a strategy when the page can no longer be checked', async () => {
    const { page, calls } = createFakePage({ present: ['button.made-up'], notShown: ['button.made-up'], unverifiable: true });
    const { provider } = createFakeProvider(planFor({ type: 'css', selector: 'button.made-up' }));
    const healPage = withHealing(page, { enabled: true, aiProvider: provider as any, ...paths() });

    await healPage.heal.click('#gone', 'Save button');

    expect(calls.some(c => c.action === 'click' && c.selector === 'button.made-up')).toBe(true);
  });
});

describe('one pipeline for actions and getLocator', () => {
  const readLog = async (file: string) =>
    (await fs.readFile(file, 'utf8')).trim().split('\n').map(line => JSON.parse(line));

  it('getLocator logs a failed heal to heal_events.jsonl', async () => {
    const { page } = createFakePage();
    const { provider } = createFakeProvider(planFor({ type: 'css', selector: '.nowhere' }));
    const { cacheFile, reportFile } = paths();
    const healPage = withHealing(page, { enabled: true, aiProvider: provider as any, cacheFile, reportFile });

    await expect(healPage.heal.getLocator('.gone', 'Cart badge')).rejects.toThrow(HealError);

    expect(await readLog(reportFile)).toEqual([expect.objectContaining({ success: false, contextName: 'Cart badge' })]);
  });

  it('getLocator logs a cache hit to heal_events.jsonl', async () => {
    const { cacheFile, reportFile } = paths();
    await fs.writeFile(cacheFile, JSON.stringify({
      'locate::https://example.test/checkout::Cart badge': { type: 'role', role: 'status', name: 'Cart', context: 'Cart badge' },
    }));
    const { page } = createFakePage({ present: ['role=status[name=Cart]'] });
    const healPage = withHealing(page, { enabled: true, cacheFile, reportFile });

    await healPage.heal.getLocator('.gone', 'Cart badge');

    expect(await readLog(reportFile)).toEqual([expect.objectContaining({ used: 'cache', success: true })]);
  });

  it('getLocator reports a provider failure as a HealError and counts it', async () => {
    const { page } = createFakePage();
    const provider = { name: 'openai' as const, generateHealPlan: vi.fn(async () => { throw new Error('network down'); }) };
    const healPage = withHealing(page, { enabled: true, aiProvider: provider as any, ...paths() });

    await expect(healPage.heal.getLocator('.gone', 'Cart badge')).rejects.toThrow(HealError);

    expect(getHealSummary().failed).toBe(1);
  });

  it('does not re-heal when a cached element is found but the action fails', async () => {
    const { cacheFile, reportFile } = paths();
    await fs.writeFile(cacheFile, JSON.stringify({
      'click::https://example.test/checkout::Buy button': { type: 'css', selector: 'button.buy', context: 'Buy button' },
    }));
    const { page } = createFakePage({
      present: ['button.buy'],
      actionErrors: { 'button.buy': 'locator.click: Timeout 5000ms exceeded.\n  - element is not enabled' },
    });
    const { provider } = createFakeProvider(planFor({ type: 'css', selector: 'button.buy' }));
    const healPage = withHealing(page, { enabled: true, aiProvider: provider as any, cacheFile, reportFile });

    await expect(healPage.heal.click('#gone', 'Buy button')).rejects.toThrow(/not enabled/);

    expect(provider.generateHealPlan).not.toHaveBeenCalled();
  });
});
