/**
 * Utility functions for healwright
 */

import { Page, Locator } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import type { StrategyT, Action, LocatorOrEmpty } from "./types";

/**
 * Check if target is a valid Playwright locator (not an empty string)
 */
export function isValidLocator(target: LocatorOrEmpty): target is Locator {
  return typeof target !== 'string' || target !== '';
}

/**
 * Build a Playwright locator from a strategy object
 */
export function buildLocator(page: Page, s: StrategyT): Locator {
  switch (s.type) {
    case "testid":
      if (!s.value) throw new Error("testid strategy requires 'value'");
      return page.getByTestId(s.value);
    case "role":
      if (!s.role) throw new Error("role strategy requires 'role'");
      return page.getByRole(s.role as any, { name: s.name ?? undefined, exact: s.exact ?? undefined });
    case "label":
      if (!s.text) throw new Error("label strategy requires 'text'");
      return page.getByLabel(s.text, { exact: s.exact ?? undefined });
    case "placeholder":
      if (!s.text) throw new Error("placeholder strategy requires 'text'");
      return page.getByPlaceholder(s.text, { exact: s.exact ?? undefined });
    case "text":
      if (!s.text) throw new Error("text strategy requires 'text'");
      return page.getByText(s.text, { exact: s.exact ?? undefined });
    case "css":
      if (!s.selector) throw new Error("css strategy requires 'selector'");
      return page.locator(s.selector);
  }
  throw new Error(`Unknown strategy type: ${s.type}`);
}

/**
 * Validate a strategy has required fields
 */
export function validateStrategy(s: StrategyT): string | null {
  switch (s.type) {
    case "testid": if (!s.value) return "missing 'value'"; break;
    case "role": if (!s.role) return "missing 'role'"; break;
    case "label":
    case "placeholder":
    case "text": if (!s.text) return "missing 'text'"; break;
    case "css": if (!s.selector) return "missing 'selector'"; break;
  }
  return null;
}

/**
 * Wait for locator to be visible
 */
export async function waitForReady(loc: Locator, _action: string, timeout: number): Promise<void> {
  await loc.waitFor({ state: "visible", timeout });
}

/**
 * Wait for page to stabilize after navigation
 */
export async function waitForStable(page: Page): Promise<void> {
  await page.waitForLoadState("domcontentloaded");
}

/**
 * Collect candidate elements from the page for AI analysis
 */
export async function collectCandidates(page: Page, action: Action, limit = 120) {
  const selector =
    action === "click"
      ? "button,[role='button'],a,input[type='button'],input[type='submit'],[onclick],[role='menuitem'],[role='tab'],[role='combobox'],select"
      : "input,textarea,[contenteditable='true'],[role='textbox'],select,[role='combobox']";

  return page.evaluate(({ selector, limit }) => {
    const els = Array.from(document.querySelectorAll(selector)).slice(0, limit);
    
    const pickTest = (el: Element) => {
      for (const a of ["data-testid", "data-test", "data-test-id", "data-qa", "data-cy"]) {
        const v = el.getAttribute(a);
        if (v) return { attr: a, value: v };
      }
      return null;
    };
    
    const isVisible = (el: Element) => {
      const e = el as HTMLElement;
      const s = window.getComputedStyle(e);
      if (s.display === "none" || s.visibility === "hidden") return false;
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    
    const norm = (t: string) => t.replace(/\s+/g, " ").trim().slice(0, 80);
    
    return els.map(el => ({
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute("role"),
      ariaLabel: el.getAttribute("aria-label"),
      nameAttr: el.getAttribute("name"),
      placeholder: el.getAttribute("placeholder"),
      type: el.getAttribute("type"),
      href: el.getAttribute("href"),
      id: (el as HTMLElement).id || null,
      test: pickTest(el),
      text: norm((el as HTMLElement).innerText || el.textContent || ""),
      visible: isVisible(el),
    }));
  }, { selector, limit });
}

/**
 * Read JSON file with fallback
 */
export async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

/**
 * Write JSON file atomically
 */
export async function writeAtomic(file: string, data: unknown) {
  const dir = path.dirname(file);
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch { /* ignore */ }
  const tmp = file + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tmp, file);
}

/**
 * Append to log file
 */
export async function appendLog(reportFile: string, entry: unknown) {
  const dir = path.dirname(reportFile);
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch { /* ignore */ }
  await fs.appendFile(reportFile, JSON.stringify(entry) + "\n", "utf8").catch(() => {});
}

/**
 * Generate cache key for action + page + context
 */
export function cacheKey(page: Page, action: Action, contextName: string): string {
  const u = new URL(page.url());
  return `${action}::${u.origin}${u.pathname}::${contextName}`;
}
