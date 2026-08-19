/**
 * Utility functions for healwright
 */

import type { Page, Locator } from "playwright-core";
import fs from "node:fs/promises";
import path from "node:path";
import type { StrategyT, Action, LocatorOrEmpty } from "./types";

/**
 * True when the caller supplied no selector at all and wants pure AI detection.
 * Only an empty (or whitespace-only) string means "AI-only" — a real selector
 * string is a selector, not a missing target.
 */
export function isAiOnlyTarget(target: LocatorOrEmpty): boolean {
  return typeof target === "string" && target.trim() === "";
}

/**
 * Resolve a user-supplied target into a real Playwright Locator.
 * Selector strings are passed through `page.locator()`; Locators are returned
 * as-is. AI-only targets have no selector to resolve, so they throw.
 */
export function toLocator(page: Page, target: LocatorOrEmpty): Locator {
  if (typeof target !== "string") return target;
  if (target.trim() === "") {
    throw new Error("Cannot build a locator: no selector was provided (AI-only target)");
  }
  return page.locator(target);
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
 * Upper bound on how many DOM elements are pulled out of the page in one pass.
 * This is deliberately far larger than the number sent to the model: everything
 * collected here is scored by `rankCandidates`, and only the top slice is sent.
 * Truncating before ranking would hide the right element behind DOM order.
 */
export const CANDIDATE_COLLECTION_CAP = 1000;

// Elements a user can click, tap or hover.
const CLICKABLE_PARTS = [
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
];

// Elements that accept typed input.
const TEXT_ENTRY_PARTS = [
  "input", "textarea", "[contenteditable='true']", "[role='textbox']",
  "select", "[role='combobox']", "[data-testid]",
];

// Elements that expose a set of options.
const CHOICE_PARTS = [
  "select", "[role='combobox']", "[role='listbox']", "option", "[role='option']",
  "[data-testid]",
];

const dedupe = (parts: string[]) => Array.from(new Set(parts)).join(",");

/**
 * The CSS selector used to gather candidates for a given action.
 *
 * `focus` unions the clickable and text-entry families because focus applies to
 * both — a bare `<input type="text">` is not in the clickable set, and scoping
 * focus to that set alone made the most obvious targets invisible to the model.
 * `locate` unions everything, since it resolves elements for arbitrary use.
 */
export function candidateSelector(action: Action): string {
  switch (action) {
    case "click":
    case "dblclick":
    case "hover":
      return dedupe(CLICKABLE_PARTS);
    case "selectOption":
      return dedupe(CHOICE_PARTS);
    case "focus":
      return dedupe([...CLICKABLE_PARTS, ...TEXT_ENTRY_PARTS]);
    case "locate":
      return dedupe([...CLICKABLE_PARTS, ...TEXT_ENTRY_PARTS, ...CHOICE_PARTS]);
    case "fill":
    case "check":
    case "uncheck":
    default:
      return dedupe(TEXT_ENTRY_PARTS);
  }
}

/**
 * Collect candidate elements from the page for AI analysis.
 * Returns everything matching (up to `limit`); ranking and truncation to the
 * model's budget happen afterwards in `rankCandidates`.
 */
export async function collectCandidates(page: Page, action: Action, limit = CANDIDATE_COLLECTION_CAP) {
  const selector = candidateSelector(action);

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
 * Pre-filter and rank candidates by relevance to the contextName.
 * Uses lightweight keyword matching to score each candidate,
 * then returns the top `limit` ranked by score (highest first),
 * preserving original order among equal scores.
 *
 * Scoring heuristics:
 *  - Exact substring match in text attributes: +10
 *  - Word overlap with contextName: +3 per matching word
 *  - Tag name matches inferred element type: +5
 *  - Has a test-id attribute: +2 (more targetable)
 */
export function rankCandidates(
  candidates: Record<string, unknown>[],
  contextName: string,
  limit: number,
): Record<string, unknown>[] {
  if (candidates.length <= limit) return candidates;

  const ctx = contextName.toLowerCase();
  // Extract meaningful words (3+ chars, skip common stop words)
  const stopWords = new Set(["the", "for", "and", "with", "that", "this", "from", "into", "field", "element"]);
  const ctxWords = ctx.split(/\W+/).filter(w => w.length >= 3 && !stopWords.has(w));

  // Infer element type from contextName
  const inferTag = (c: string): string[] => {
    if (/\b(button|btn|submit|reset|click)\b/i.test(c)) return ["button", "input"];
    if (/\b(link|anchor|nav)\b/i.test(c)) return ["a"];
    if (/\b(input|text|email|password|search|phone|tel|url|number|name)\b/i.test(c)) return ["input", "textarea"];
    if (/\b(checkbox|check|agree|subscribe|toggle)\b/i.test(c)) return ["input", "label"];
    if (/\b(radio)\b/i.test(c)) return ["input"];
    if (/\b(select|dropdown|combo)\b/i.test(c)) return ["select"];
    if (/\b(textarea|comment)\b/i.test(c)) return ["textarea"];
    if (/\b(image|img|icon|logo)\b/i.test(c)) return ["img"];
    if (/\b(label)\b/i.test(c)) return ["label"];
    if (/\b(list item|li)\b/i.test(c)) return ["li"];
    return [];
  };
  const expectedTags = inferTag(contextName);

  // Searchable text fields from a candidate
  const textFields = (cand: Record<string, unknown>): string[] => {
    const fields: string[] = [];
    for (const key of ["aria", "txt", "ph", "name", "tid", "alt", "title", "id", "for", "role"]) {
      const v = cand[key];
      if (typeof v === "string" && v) fields.push(v.toLowerCase());
    }
    return fields;
  };

  const scored = candidates.map((cand, idx) => {
    let score = 0;
    const texts = textFields(cand);
    const allText = texts.join(" ");

    // Exact substring match of contextName in any text field
    if (texts.some(t => t.includes(ctx))) score += 15;
    // Partial: any text field appears in contextName
    for (const t of texts) {
      if (ctx.includes(t) && t.length >= 3) { score += 8; break; }
    }

    // Word overlap
    for (const word of ctxWords) {
      if (allText.includes(word)) score += 3;
    }

    // Tag type bonus
    const tag = String(cand.tag ?? "").toLowerCase();
    if (expectedTags.length > 0 && expectedTags.includes(tag)) score += 5;

    // Role bonus (if contextName mentions the role)
    const role = String(cand.role ?? "").toLowerCase();
    if (role && ctx.includes(role)) score += 5;

    // Test-id bonus (more targetable = more useful)
    if (cand.tid) score += 2;

    // Visible element bonus
    if (!cand.hid) score += 1;

    return { cand, score, idx };
  });

  // Sort by score desc, then by DOM order (idx) for ties
  scored.sort((a, b) => b.score - a.score || a.idx - b.idx);

  return scored.slice(0, limit).map(s => s.cand);
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
 * Write JSON file atomically.
 *
 * The temp file name is unique per writer — Playwright runs one worker per
 * process, and a shared temp path meant two workers could rename the same
 * scratch file out from under each other.
 */
export async function writeAtomic(file: string, data: unknown) {
  const dir = path.dirname(file);
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch { /* ignore */ }
  const tmp = `${file}.${process.pid}.${Math.random().toString(36).slice(2, 10)}.tmp`;
  try {
    await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
    await fs.rename(tmp, file);
  } catch (err) {
    await fs.rm(tmp, { force: true }).catch(() => {});
    throw err;
  }
}

/** How long a lock file may sit untouched before it is treated as abandoned. */
const LOCK_STALE_MS = 10_000;
const LOCK_RETRY_MS = 20;
const LOCK_TIMEOUT_MS = 5_000;

// Serialises updates within this process; the lock file serialises across them.
const inProcessLocks = new Map<string, Promise<unknown>>();

async function acquireFileLock(lockPath: string): Promise<void> {
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  for (;;) {
    try {
      const handle = await fs.open(lockPath, "wx");
      await handle.close();
      return;
    } catch (err: any) {
      if (err?.code !== "EEXIST") return; // Can't lock (read-only fs etc.) — proceed unlocked.
      // Break a lock left behind by a crashed worker.
      try {
        const stat = await fs.stat(lockPath);
        if (Date.now() - stat.mtimeMs > LOCK_STALE_MS) {
          await fs.rm(lockPath, { force: true });
          continue;
        }
      } catch { /* lock vanished — retry immediately */ }
      if (Date.now() > deadline) return; // Give up waiting rather than hang the test run.
      await new Promise(resolve => setTimeout(resolve, LOCK_RETRY_MS));
    }
  }
}

/**
 * Read-modify-write a JSON file without clobbering concurrent writers.
 *
 * The file is re-read inside the lock, so entries another worker added after we
 * loaded our in-memory copy survive. Returns the value that was written.
 */
export async function updateJson<T extends object>(
  file: string,
  mutate: (current: T) => T,
): Promise<T> {
  const previous = inProcessLocks.get(file) ?? Promise.resolve();
  const run = previous.catch(() => {}).then(async () => {
    const dir = path.dirname(file);
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch { /* ignore */ }

    const lockPath = `${file}.lock`;
    await acquireFileLock(lockPath);
    try {
      const current = await readJson<T>(file, {} as T);
      const next = mutate(current);
      await writeAtomic(file, next);
      return next;
    } finally {
      await fs.rm(lockPath, { force: true }).catch(() => {});
    }
  });

  inProcessLocks.set(file, run);
  try {
    return await run;
  } finally {
    if (inProcessLocks.get(file) === run) inProcessLocks.delete(file);
  }
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
 * Coerce a model-reported confidence into a 0-1 probability.
 * Models are inconsistent about scale — some answer 0.85, some answer 85 — and
 * an unparseable score is treated as no confidence rather than full confidence.
 */
export function normalizeConfidence(value: number | null | undefined): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  const scaled = n > 1 ? n / 100 : n;
  return Math.min(1, Math.max(0, scaled));
}

/** True when a model-reported confidence clears the configured threshold. */
export function meetsConfidence(value: number | null | undefined, minConfidence: number): boolean {
  if (!minConfidence || minConfidence <= 0) return true;
  return normalizeConfidence(value) >= minConfidence;
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
