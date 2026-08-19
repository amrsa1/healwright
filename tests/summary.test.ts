import { describe, it, expect, beforeEach } from 'vitest';
import { recordHealEvent, getHealSummary, resetHealSummary } from '../src/summary';
import { normalizeConfidence, meetsConfidence } from '../src/utils';

beforeEach(() => resetHealSummary());

describe('normalizeConfidence', () => {
  it('passes through a 0-1 probability', () => {
    expect(normalizeConfidence(0.85)).toBeCloseTo(0.85);
  });

  it('rescales models that answer on a 0-100 scale', () => {
    expect(normalizeConfidence(85)).toBeCloseTo(0.85);
  });

  it('treats a missing or unparseable score as no confidence', () => {
    expect(normalizeConfidence(undefined as any)).toBe(0);
    expect(normalizeConfidence(NaN)).toBe(0);
  });

  it('clamps out-of-range values', () => {
    expect(normalizeConfidence(-3)).toBe(0);
    expect(normalizeConfidence(500)).toBe(1);
  });
});

describe('meetsConfidence', () => {
  it('accepts anything when no threshold is configured', () => {
    expect(meetsConfidence(0.01, 0)).toBe(true);
  });

  it('rejects a score below the threshold', () => {
    expect(meetsConfidence(0.4, 0.7)).toBe(false);
  });

  it('accepts a score exactly at the threshold', () => {
    expect(meetsConfidence(0.7, 0.7)).toBe(true);
  });

  it('understands a 0-100 score against a 0-1 threshold', () => {
    expect(meetsConfidence(90, 0.7)).toBe(true);
  });
});

describe('heal summary', () => {
  it('starts empty', () => {
    expect(getHealSummary()).toEqual({
      total: 0, healed: 0, fromCache: 0, failed: 0, belowConfidence: 0, wouldHeal: 0, entries: [],
    });
  });

  it('counts a healed element', () => {
    recordHealEvent({ outcome: 'healed', action: 'click', contextName: 'Submit', url: 'https://x/', confidence: 0.9 });
    const s = getHealSummary();
    expect(s.total).toBe(1);
    expect(s.healed).toBe(1);
    expect(s.entries[0].contextName).toBe('Submit');
  });

  it('counts cache hits separately from fresh heals', () => {
    recordHealEvent({ outcome: 'cache', action: 'click', contextName: 'A', url: 'https://x/' });
    recordHealEvent({ outcome: 'healed', action: 'click', contextName: 'B', url: 'https://x/' });
    const s = getHealSummary();
    expect(s.fromCache).toBe(1);
    expect(s.healed).toBe(1);
    expect(s.total).toBe(2);
  });

  it('counts confidence rejections and report-only heals', () => {
    recordHealEvent({ outcome: 'belowConfidence', action: 'click', contextName: 'A', url: 'https://x/', confidence: 0.2 });
    recordHealEvent({ outcome: 'wouldHeal', action: 'click', contextName: 'B', url: 'https://x/', confidence: 0.9 });
    const s = getHealSummary();
    expect(s.belowConfidence).toBe(1);
    expect(s.wouldHeal).toBe(1);
  });

  it('counts failures', () => {
    recordHealEvent({ outcome: 'failed', action: 'fill', contextName: 'Email', url: 'https://x/' });
    expect(getHealSummary().failed).toBe(1);
  });

  it('is cleared by reset', () => {
    recordHealEvent({ outcome: 'healed', action: 'click', contextName: 'A', url: 'https://x/' });
    resetHealSummary();
    expect(getHealSummary().total).toBe(0);
  });

  it('returns a copy so callers cannot mutate the running tally', () => {
    recordHealEvent({ outcome: 'healed', action: 'click', contextName: 'A', url: 'https://x/' });
    getHealSummary().entries.push({ outcome: 'healed', action: 'x', contextName: 'y', url: 'z' });
    expect(getHealSummary().entries).toHaveLength(1);
  });
});
