/**
 * Run-level tally of everything healing did.
 *
 * A self-healing suite that silently rewrites its own locators is a suite that
 * can go green through a regression. This module keeps the record a team needs
 * to notice that — read it from a global teardown and fail the build when the
 * numbers say the source locators have drifted too far.
 */

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

/** Record one healing outcome. Called by the healing pipeline. */
export function recordHealEvent(entry: HealSummaryEntry): void {
  entries.push(entry);
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
  const count = (outcome: HealOutcome) => entries.filter(e => e.outcome === outcome).length;
  return {
    total: entries.length,
    healed: count("healed"),
    fromCache: count("cache"),
    failed: count("failed"),
    belowConfidence: count("belowConfidence"),
    wouldHeal: count("wouldHeal"),
    entries: entries.map(e => ({ ...e })),
  };
}

/** Clear the tally. Useful between test files or in your own reporting. */
export function resetHealSummary(): void {
  entries = [];
}
