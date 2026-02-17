/**
 * Code diff generator for healwright
 *
 * After AI healing succeeds, generates unified diffs showing how to update
 * Playwright test source files with the healed locators. This lets developers
 * permanently fix broken selectors instead of relying on runtime healing.
 *
 * Output: .self-heal/code_updates.diff (git-apply-compatible)
 */

import fs from "node:fs/promises";
import path from "node:path";
import type { StrategyT } from "./types";

/* ------------------------------------------------------------------ */
/*  Public types                                                       */
/* ------------------------------------------------------------------ */

export interface CodeUpdate {
  testFile: string;
  line: number;
  originalLine: string;
  suggestedLine: string;
  suggestedLocator: string;
  contextName: string;
  strategy: StrategyT;
  action: string;
}

/* ------------------------------------------------------------------ */
/*  Strategy → Playwright code                                         */
/* ------------------------------------------------------------------ */

/**
 * Convert a healing strategy to a Playwright locator expression.
 * Returns code like `page.getByRole("button", { name: "Submit" })`.
 */
export function strategyToPlaywrightCode(strategy: StrategyT): string {
  const q = (s: string) => JSON.stringify(s);

  switch (strategy.type) {
    case "testid":
      return `page.getByTestId(${q(strategy.value!)})`;
    case "role": {
      const opts: string[] = [];
      if (strategy.name) opts.push(`name: ${q(strategy.name)}`);
      if (strategy.exact !== undefined && strategy.exact !== null)
        opts.push(`exact: ${strategy.exact}`);
      return opts.length
        ? `page.getByRole(${q(strategy.role!)}, { ${opts.join(", ")} })`
        : `page.getByRole(${q(strategy.role!)})`;
    }
    case "label":
      return `page.getByLabel(${q(strategy.text!)})`;
    case "placeholder":
      return `page.getByPlaceholder(${q(strategy.text!)})`;
    case "text":
      return `page.getByText(${q(strategy.text!)})`;
    case "altText":
      return `page.getByAltText(${q(strategy.text!)})`;
    case "title":
      return `page.getByTitle(${q(strategy.text!)})`;
    case "css":
      return `page.locator(${q(strategy.selector!)})`;
    default:
      return `/* unknown strategy: ${JSON.stringify(strategy)} */`;
  }
}

/* ------------------------------------------------------------------ */
/*  Call-site capture                                                   */
/* ------------------------------------------------------------------ */

/**
 * Walk the Error stack to find the first frame that lives outside
 * healwright's own source / dist / node_modules directories.
 */
export function captureCallSite(): { file: string; line: number } | null {
  const err = new Error();
  const stack = err.stack;
  if (!stack) return null;

  const frames = stack.split("\n").slice(1);

  const skip = [
    /[/\\]src[/\\]codediff\./,
    /[/\\]src[/\\]healwright\./,
    /[/\\]src[/\\]utils\./,
    /[/\\]src[/\\]logger\./,
    /[/\\]src[/\\]types\./,
    /[/\\]src[/\\]providers[/\\]/,
    /[/\\]dist[/\\]/,
    /[/\\]node_modules[/\\]/,
  ];

  for (const frame of frames) {
    const m = frame.match(/at\s+(?:.*?\s+\()?(.+?):(\d+):\d+\)?/);
    if (!m) continue;
    const [, file, lineStr] = m;
    if (file.startsWith("node:")) continue;
    if (skip.some((p) => p.test(file))) continue;
    return { file, line: parseInt(lineStr, 10) };
  }
  return null;
}

/* ------------------------------------------------------------------ */
/*  First-argument replacement in source lines                         */
/* ------------------------------------------------------------------ */

/**
 * In a line like
 *   `await page.heal.click(page.locator('#old'), 'Submit');`
 * find the extent of the *first argument* to the `heal.xxx(` call,
 * handling nested parentheses and string literals.
 *
 * Returns `[start, end)` indices into `line`, or null.
 */
export function findFirstArgExtent(
  line: string,
): [number, number] | null {
  const healIdx = line.match(/\.heal\.\w+\s*\(/);
  if (!healIdx || healIdx.index === undefined) return null;

  const openParen = healIdx.index + healIdx[0].length;
  let i = openParen;

  // skip leading whitespace
  while (i < line.length && /\s/.test(line[i])) i++;
  const argStart = i;

  let depth = 0;
  let inStr: string | null = null;

  while (i < line.length) {
    const ch = line[i];

    // inside a string literal — skip until close
    if (inStr) {
      if (ch === "\\" && i + 1 < line.length) {
        i += 2;
        continue;
      }
      if (ch === inStr) inStr = null;
      i++;
      continue;
    }

    if (ch === "'" || ch === '"' || ch === "`") {
      inStr = ch;
      i++;
      continue;
    }

    if (ch === "(") {
      depth++;
      i++;
      continue;
    }
    if (ch === ")") {
      if (depth === 0) return [argStart, i]; // end of arg list
      depth--;
      i++;
      continue;
    }
    if (ch === "," && depth === 0) return [argStart, i]; // comma after first arg

    i++;
  }
  return null;
}

/**
 * Replace the first argument in a `heal.xxx(...)` call with `newCode`.
 * Falls back to returning the original line unchanged if the call
 * pattern can't be parsed.
 */
function replaceFirstArg(line: string, newCode: string): string {
  const extent = findFirstArgExtent(line);
  if (!extent) return line;
  const [start, end] = extent;
  return line.slice(0, start) + newCode + line.slice(end);
}

/* ------------------------------------------------------------------ */
/*  Unified diff formatting                                            */
/* ------------------------------------------------------------------ */

function unifiedDiffEntry(update: CodeUpdate): string {
  const rel = path.relative(process.cwd(), update.testFile);
  return [
    `diff --git a/${rel} b/${rel}`,
    `--- a/${rel}`,
    `+++ b/${rel}`,
    `@@ -${update.line},1 +${update.line},1 @@`,
    `-${update.originalLine}`,
    `+${update.suggestedLine}`,
  ].join("\n");
}

/* ------------------------------------------------------------------ */
/*  DiffCollector                                                      */
/* ------------------------------------------------------------------ */

/**
 * Accumulates code-update entries during a test run and writes them
 * to a unified diff file that can be applied with `git apply`.
 */
export class DiffCollector {
  private updates: CodeUpdate[] = [];
  private seen = new Set<string>(); // dedupe by file:line
  private diffFile: string;

  constructor(diffFile?: string) {
    this.diffFile =
      diffFile ??
      path.join(process.cwd(), ".self-heal", "code_updates.diff");
  }

  /**
   * Record a successful healing event and write the updated diff file.
   * Returns the CodeUpdate if one was generated, or null if the call
   * site could not be resolved.
   */
  async record(
    action: string,
    contextName: string,
    strategy: StrategyT,
    callSite: { file: string; line: number } | null,
  ): Promise<CodeUpdate | null> {
    if (!callSite) return null;

    const dedupeKey = `${callSite.file}:${callSite.line}`;
    if (this.seen.has(dedupeKey)) return null;

    // Read the original source line
    let originalLine: string;
    try {
      const src = await fs.readFile(callSite.file, "utf8");
      const lines = src.split("\n");
      originalLine = lines[callSite.line - 1] ?? "";
    } catch {
      return null;
    }
    if (!originalLine.trim()) return null;

    const suggestedLocator = strategyToPlaywrightCode(strategy);
    const suggestedLine = replaceFirstArg(originalLine, suggestedLocator);

    // If nothing changed (couldn't parse the line), skip
    if (suggestedLine === originalLine) return null;

    const update: CodeUpdate = {
      testFile: callSite.file,
      line: callSite.line,
      originalLine,
      suggestedLine,
      suggestedLocator,
      contextName,
      strategy,
      action,
    };

    this.updates.push(update);
    this.seen.add(dedupeKey);
    await this.flush();
    return update;
  }

  /** Write the accumulated diff file to disk. */
  private async flush(): Promise<void> {
    if (this.updates.length === 0) return;

    const dir = path.dirname(this.diffFile);
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch {
      /* ignore */
    }

    const header = [
      `# Healwright - Suggested Code Updates`,
      `# Generated: ${new Date().toISOString()}`,
      `#`,
      `# ${this.updates.length} selector(s) healed during this test run.`,
      `# Review each change, then apply with:`,
      `#   git apply .self-heal/code_updates.diff`,
      ``,
    ].join("\n");

    const diffs = this.updates.map((u) => unifiedDiffEntry(u)).join("\n\n");
    await fs.writeFile(this.diffFile, header + diffs + "\n", "utf8");
  }

  /** All recorded updates so far. */
  getUpdates(): readonly CodeUpdate[] {
    return this.updates;
  }

  /** The path to the diff file. */
  getDiffFile(): string {
    return this.diffFile;
  }

  /** Reset state between test runs. */
  clear(): void {
    this.updates = [];
    this.seen.clear();
  }
}
