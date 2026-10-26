/**
 * Offline healing — a real browser with a scripted provider.
 *
 * These tests need no API key. The provider is a stand-in that answers from
 * a script, so what's under test is healwright's own pipeline: collecting
 * candidates, checking answers against the page, and acting on the result.
 *
 *   npx playwright test examples/offline-healing.test.ts
 */

import { test, expect } from '@playwright/test';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { withHealing, type AIProvider, type HealPage } from '../src';
import type { StrategyT } from '../src/types';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'healwright-offline-'));
process.env.HEALWRIGHT_SUMMARY_FILE = path.join(tmp, 'summary.jsonl');

/** A provider that returns the given strategies and records what it was shown. */
function scripted(...strategies: StrategyT[]) {
  const shown: Record<string, unknown>[][] = [];
  const provider: AIProvider = {
    name: 'openai',
    async generateHealPlan(input) {
      shown.push(input.heal?.candidates ?? []);
      return {
        plan: { candidates: strategies.map((strategy, i) => ({ strategy, confidence: 0.9 - i * 0.1, why: 'scripted' })) },
        tokenUsage: null,
      };
    },
  };
  return { provider, shown };
}

function heal(page: import('@playwright/test').Page, provider: AIProvider): HealPage {
  const run = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return withHealing(page, {
    enabled: true,
    aiProvider: provider,
    logLevel: 'silent',
    cacheFile: path.join(tmp, `cache-${run}.json`),
    reportFile: path.join(tmp, `events-${run}.jsonl`),
  });
}

test.describe('shadow DOM', () => {
  test('heals a button inside a web component', async ({ page }) => {
    await page.setContent(`
      <checkout-panel></checkout-panel>
      <script>
        customElements.define('checkout-panel', class extends HTMLElement {
          connectedCallback() {
            const root = this.attachShadow({ mode: 'open' });
            root.innerHTML = '<button>Place order</button>';
            root.querySelector('button').addEventListener('click', () => { document.title = 'ordered'; });
          }
        });
      </script>`);
    const { provider, shown } = scripted({ type: 'role', role: 'button', name: 'Place order', exact: true });

    await heal(page, provider).heal.click('#gone', 'Place order button');

    expect(shown[0].some(c => c.txt === 'Place order')).toBe(true);
    await expect(page).toHaveTitle('ordered');
  });
});

test.describe('grounding', () => {
  test('skips a made-up selector that matches an element the model never saw', async ({ page }) => {
    await page.setContent(`
      <div class="ghost">Save</div>
      <button>Save</button>
      <script>
        document.querySelector('.ghost').addEventListener('click', () => { document.title = 'ghost'; });
        document.querySelector('button').addEventListener('click', () => { document.title = 'saved'; });
      </script>`);
    const { provider } = scripted(
      { type: 'css', selector: '.ghost' },
      { type: 'role', role: 'button', name: 'Save', exact: true },
    );

    await heal(page, provider).heal.click('#gone', 'Save button');

    await expect(page).toHaveTitle('saved');
  });

  test('accepts an element inside one the model was shown', async ({ page }) => {
    await page.setContent(`
      <button><span class="label">Checkout</span></button>
      <script>
        document.querySelector('button').addEventListener('click', () => { document.title = 'checked out'; });
      </script>`);
    const { provider } = scripted({ type: 'css', selector: 'button .label' });

    await heal(page, provider).heal.click('#gone', 'Checkout button');

    await expect(page).toHaveTitle('checked out');
  });
});
