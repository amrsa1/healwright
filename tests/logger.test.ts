import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { healLog, formatStrategy, shouldUseColor } from '../src/logger';

// oxlint-disable-next-line no-control-regex -- matching ANSI escapes is the point
const ANSI = /\u001b\[/;
let out: string[];

beforeEach(() => {
  out = [];
  vi.spyOn(console, 'log').mockImplementation((...args: any[]) => { out.push(args.join(' ')); });
  healLog.configure({ level: 'info', color: true });
});

afterEach(() => {
  vi.restoreAllMocks();
  healLog.configure({ level: 'info', color: undefined });
});

describe('shouldUseColor', () => {
  it('honours NO_COLOR even on a TTY', () => {
    expect(shouldUseColor({ NO_COLOR: '1' }, true)).toBe(false);
  });

  it('honours FORCE_COLOR when not a TTY', () => {
    expect(shouldUseColor({ FORCE_COLOR: '1' }, false)).toBe(true);
  });

  it('stays plain when output is piped', () => {
    expect(shouldUseColor({}, false)).toBe(false);
  });

  it('colours an interactive terminal', () => {
    expect(shouldUseColor({}, true)).toBe(true);
  });
});

describe('log levels', () => {
  it('prints nothing at silent', () => {
    healLog.configure({ level: 'silent' });
    healLog.banner();
    healLog.healed('Submit', { type: 'testid', value: 'x' });
    healLog.healFailed('Submit', 'nope');
    expect(out).toEqual([]);
  });

  it('prints only failures at error level', () => {
    healLog.configure({ level: 'error' });
    healLog.healed('Submit', { type: 'testid', value: 'x' });
    expect(out).toEqual([]);
    healLog.healFailed('Submit', 'nope');
    expect(out.join('\n')).toContain('Submit');
  });

  it('prints progress at info level', () => {
    healLog.configure({ level: 'info' });
    healLog.healed('Submit', { type: 'testid', value: 'x' });
    expect(out.join('\n')).toContain('Submit');
  });
});

describe('colour control', () => {
  it('emits no ANSI escapes when colour is off', () => {
    healLog.configure({ level: 'info', color: false });
    healLog.healed('Submit', { type: 'testid', value: 'x' });
    healLog.banner();
    expect(out.join('\n')).not.toMatch(ANSI);
    expect(out.join('\n')).toContain('Submit');
  });

  it('emits ANSI escapes when colour is on', () => {
    healLog.configure({ level: 'info', color: true });
    healLog.healed('Submit', { type: 'testid', value: 'x' });
    expect(out.join('\n')).toMatch(ANSI);
  });
});

describe('formatStrategy', () => {
  it('formats altText', () => {
    expect(formatStrategy({ type: 'altText', text: 'Product photo' })).toBe('getByAltText("Product photo")');
  });

  it('formats title', () => {
    expect(formatStrategy({ type: 'title', text: 'Close' })).toBe('getByTitle("Close")');
  });

  it('formats role without a name', () => {
    expect(formatStrategy({ type: 'role', role: 'button' })).toBe('getByRole("button")');
  });
});

describe('wouldHeal', () => {
  it('reports the strategy it declined to apply', () => {
    healLog.configure({ level: 'info', color: false });
    healLog.wouldHeal('Submit button', { type: 'testid', value: 'submit' });
    const text = out.join('\n');
    expect(text).toContain('Submit button');
    expect(text).toContain('getByTestId("submit")');
  });
});
