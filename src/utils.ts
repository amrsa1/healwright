/**
 * Utility functions for healwright
 */

import type { Page, Locator } from "playwright-core";
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
    case "testid": {
      if (!s.value) throw new Error("testid strategy requires 'value'");
      // Support all common test ID attributes, not just data-testid
      const v = s.value.replace(/"/g, '\\"');
      return page.locator(
        `[data-testid="${v}"],[data-test="${v}"],[data-test-id="${v}"],[data-qa="${v}"],[data-cy="${v}"]`
      );
    }
    case "role":
      if (!s.role) throw new Error("role strategy requires 'role'");
      return page.getByRole(s.role as any, { name: s.name ?? undefined, exact: s.exact ?? true });
    case "label":
      if (!s.text) throw new Error("label strategy requires 'text'");
      return page.getByLabel(s.text, { exact: s.exact ?? undefined });
    case "placeholder":
      if (!s.text) throw new Error("placeholder strategy requires 'text'");
      return page.getByPlaceholder(s.text, { exact: s.exact ?? undefined });
    case "text":
      if (!s.text) throw new Error("text strategy requires 'text'");
      return page.getByText(s.text, { exact: s.exact ?? undefined });
    case "altText":
      if (!s.text) throw new Error("altText strategy requires 'text'");
      return page.getByAltText(s.text, { exact: s.exact ?? undefined });
    case "title":
      if (!s.text) throw new Error("title strategy requires 'text'");
      return page.getByTitle(s.text, { exact: s.exact ?? undefined });
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
    case "text":
    case "altText":
    case "title": if (!s.text) return "missing 'text'"; break;
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
export async function collectCandidates(page: Page, action: Action, limit = 80) {
  const selector =
    action === "click" || action === "dblclick" || action === "hover"
      ? [
          // Native interactive elements
          "button", "a", "label", "summary", "img",
          // Input types that are clickable
          "input[type='button']", "input[type='submit']", "input[type='reset']",
          "input[type='checkbox']", "input[type='radio']", "input[type='image']",
          "input[type='file']",
          // Dropdowns and list items
          "select", "option", "li",
          // ARIA widget roles
          "[role='button']", "[role='link']", "[role='menuitem']",
          "[role='menuitemcheckbox']", "[role='menuitemradio']",
          "[role='tab']", "[role='switch']", "[role='option']",
          "[role='checkbox']", "[role='radio']",
          "[role='combobox']", "[role='slider']", "[role='spinbutton']",
          // ARIA structural roles that are often clickable
          "[role='treeitem']", "[role='gridcell']", "[role='row']",
          // Event-based and focusable
          "[onclick]", "[ondblclick]",
          "[onmouseenter]", "[onmouseover]",
          "[tabindex]:not([tabindex='-1'])",
          // Test-targeted elements
          "[data-testid]", "[data-test]", "[data-test-id]", "[data-qa]", "[data-cy]",
        ].join(",")
      : action === "selectOption"
      ? "select,[role='combobox'],[role='listbox'],option,[role='option'],[data-testid]"
      : "input,textarea,[contenteditable='true'],[role='textbox'],select,[role='combobox'],[data-testid]";

  return page.evaluate(({ selector, limit }) => {
    const els = Array.from(document.querySelectorAll(selector)).slice(0, limit);
    
    const pickTest = (el: Element) => {
      for (const a of ["data-testid", "data-test", "data-test-id", "data-qa", "data-cy"]) {
        const v = el.getAttribute(a);
        if (v) return v;
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
    
    const norm = (t: string) => t.replace(/\s+/g, " ").trim().slice(0, 60);

    // Build compact objects — only include non-null, non-empty fields
    const result: Record<string, unknown>[] = [];
    for (const el of els) {
      const vis = isVisible(el);
      // Include hidden elements but mark them — they may be CSS-styled inputs
      const o: Record<string, unknown> = { tag: el.tagName.toLowerCase() };
      if (!vis) o.hid = true;
      const role = el.getAttribute("role");
      if (role) o.role = role;
      const aria = el.getAttribute("aria-label");
      if (aria) o.aria = aria;
      const name = el.getAttribute("name");
      if (name) o.name = name;
      const ph = el.getAttribute("placeholder");
      if (ph) o.ph = ph;
      const type = el.getAttribute("type");
      if (type) o.type = type;
      const href = el.getAttribute("href");
      if (href) o.href = href;
      const alt = el.getAttribute("alt");
      if (alt) o.alt = alt;
      const title = el.getAttribute("title");
      if (title) o.title = title;
      const forAttr = el.getAttribute("for");
      if (forAttr) o.for = forAttr;
      const id = (el as HTMLElement).id;
      if (id) o.id = id;
      const cls = (el as HTMLElement).className;
      if (cls && typeof cls === "string") o.cls = cls.slice(0, 60);
      const tid = pickTest(el);
      if (tid) o.tid = tid;
      const text = norm((el as HTMLElement).innerText || el.textContent || "");
      if (text) o.txt = text;
      result.push(o);
    }
    return result;
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

/**
 * Check if an error is transient and worth retrying (rate limits, timeouts, server errors)
 */
export function isRetryableError(err: unknown): boolean {
  const error = err as Record<string, unknown> | null;
  const status = (error?.status ?? error?.statusCode ?? (error?.response as Record<string, unknown>)?.status) as number | undefined;
  if (status === 429 || (status !== undefined && status >= 500)) return true;
  const code = error?.code as string | undefined;
  if (code === 'ECONNRESET' || code === 'ETIMEDOUT' || code === 'ENOTFOUND') return true;
  const msg = String(error?.message ?? '').toLowerCase();
  return msg.includes('rate limit') || msg.includes('timeout') || msg.includes('overloaded');
}

/**
 * Retry an async operation with exponential backoff.
 * Only retries on transient errors (rate limits, timeouts, server errors).
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 1,
  baseDelayMs: number = 1000
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries && isRetryableError(err)) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw err;
      }
    }
  }
  throw lastError;
}
