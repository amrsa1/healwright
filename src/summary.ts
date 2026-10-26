/**
 * Run-level tally of everything healing did.
 *
 * A self-healing suite that silently rewrites its own locators is a suite that
 * can go green through a regression. This module keeps the record a team needs
 * to notice that — read it from a global teardown and fail the build when the
 * numbers say the source locators have drifted too far.
 */

import fs from "node:fs";
import path from "node:path";
import type { StrategyT } from "./types";

export type HealOutcome =
  /** A cached strategy resolved the element. */
  | "cache"
  /** The model found the element and it was used. */
  | "healed"
  /** A candidate was found but scored below `minConfidence`. */
  | "belowConfidence"
  /** `mode: 'warn'` — a heal was available but deliberately not applied. */
  | "wouldHeal"
  /** Nothing usable was found. */
  | "failed";

export interface HealSummaryEntry {
  outcome: HealOutcome;
  action: string;
  contextName: string;
  url: string;
  confidence?: number;
  strategy?: StrategyT;
  testName?: string;
}

export interface HealSummary {
  total: number;
  healed: number;
  fromCache: number;
  failed: number;
  belowConfidence: number;
  wouldHeal: number;
  entries: HealSummaryEntry[];
}

let entries: HealSummaryEntry[] = [];
/** False once a write to the summary file has failed (read-only disk etc.). */
let persisted = true;

/**
 * Playwright runs tests in worker processes but global setup and teardown in
 * the runner process, so an in-memory tally is invisible where the README tells
 * you to read it. Every outcome is therefore also appended to this file.
 */
function summaryFile(): string {
  return process.env.HEALWRIGHT_SUMMARY_FILE ?? path.join(process.cwd(), ".self-heal", "heal_summary.jsonl");
}

/** Playwright sets TEST_WORKER_INDEX in worker processes only. */
function isPlaywrightWorker(): boolean {
  return process.env.TEST_WORKER_INDEX !== undefined;
}

/** Record one healing outcome. Called by the healing pipeline. */
export function recordHealEvent(entry: HealSummaryEntry): void {
  entries.push(entry);
  try {
    const file = summaryFile();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, JSON.stringify({ ts: Date.now(), ...entry }) + "\n", "utf8");
  } catch {
    persisted = false;
  }
}

/** Entries other processes recorded, or null when the file can't be read. */
function readPersisted(): HealSummaryEntry[] | null {
  let text: string;
  try {
    text = fs.readFileSync(summaryFile(), "utf8");
  } catch (err: any) {
    return err?.code === "ENOENT" ? [] : null;
  }
  // The runner process starts before any of its workers, so rows older than
  // this process belong to an earlier run.
  const runStart = Date.now() - process.uptime() * 1000;
  const out: HealSummaryEntry[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const { ts, ...entry } = JSON.parse(line);
      if (typeof ts === "number" && ts >= runStart) out.push(entry as HealSummaryEntry);
    } catch { /* skip a torn line */ }
  }
  return out;
}

/**
 * A snapshot of what healing did so far in this process.
 *
 * @example
 * ```typescript
 * // global-teardown.ts
 * import { getHealSummary } from 'healwright';
 *
 * export default function () {
 *   const { healed, entries } = getHealSummary();
 *   if (healed > 0) {
 *     console.error(`${healed} locator(s) were healed — update the source selectors:`);
 *     for (const e of entries) console.error(`  ${e.action} "${e.contextName}" on ${e.url}`);
 *     process.exitCode = 1;
 *   }
 * }
 * ```
 */
export function getHealSummary(): HealSummary {
  // A worker reports its own heals; anywhere else (the runner's global
  // teardown, a plain script) reads what every process wrote.
  const source = isPlaywrightWorker() || !persisted ? entries : (readPersisted() ?? entries);
  const count = (outcome: HealOutcome) => source.filter(e => e.outcome === outcome).length;
  return {
    total: source.length,
    healed: count("healed"),
    fromCache: count("cache"),
    failed: count("failed"),
    belowConfidence: count("belowConfidence"),
    wouldHeal: count("wouldHeal"),
    entries: source.map(e => ({ ...e })),
  };
}

/**
 * Clear the tally. Outside a worker this also empties the summary file, so
 * calling it from `globalSetup` starts every run from zero.
 */
export function resetHealSummary(): void {
  entries = [];
  persisted = true;
  if (isPlaywrightWorker()) return;
  try {
    fs.writeFileSync(summaryFile(), "", "utf8");
  } catch { /* no file yet, or read-only: nothing to clear */ }
}
