/**
 * Console styling and logging for healwright
 */

import type { StrategyT, HealLogLevel } from './types';

// ANSI color codes
export const c = {
  reset: "[0m",
  bold: "[1m",
  dim: "[2m",
  italic: "[3m",
  gray: "[90m",
  red: "[91m",
  green: "[92m",
  yellow: "[93m",
  blue: "[94m",
  purple: "[95m",
  cyan: "[96m",
  white: "[97m",
  bgPurple: "[48;5;99m",
  bgGreen: "[48;5;28m",
  bgRed: "[48;5;124m",
  bgBlue: "[48;5;24m",
};

/**
 * Whether to emit ANSI colour, following the conventions consumers expect:
 * `NO_COLOR` always wins, `FORCE_COLOR` enables it off-TTY, and piped output
 * stays plain so CI logs and report parsers do not fill with escape codes.
 */
export function shouldUseColor(
  env: Record<string, string | undefined>,
  isTTY: boolean,
): boolean {
  if (env.NO_COLOR) return false;
  if (env.FORCE_COLOR) return true;
  return isTTY;
}

const LEVEL_RANK: Record<HealLogLevel, number> = { silent: 0, error: 1, info: 2 };

interface LoggerState {
  level: HealLogLevel;
  color: boolean;
}

const state: LoggerState = {
  level: "info",
  color: shouldUseColor(process.env, Boolean(process.stdout?.isTTY)),
};

export interface LoggerConfig {
  level?: HealLogLevel;
  /** Force colour on/off. Omit to auto-detect from the environment. */
  color?: boolean;
}

function configure(config: LoggerConfig): void {
  if (config.level && config.level in LEVEL_RANK) state.level = config.level;
  state.color = config.color ?? shouldUseColor(process.env, Boolean(process.stdout?.isTTY));
}

/** Strip styling when colour is off, so the same call sites work either way. */
function paint(text: string): string {
  // eslint-disable-next-line no-control-regex
  return state.color ? text : text.replace(/\[[0-9;]*m/g, "");
}

function emit(level: Exclude<HealLogLevel, "silent">, ...lines: string[]): void {
  if (LEVEL_RANK[state.level] < LEVEL_RANK[level]) return;
  for (const line of lines) console.log(paint(line));
}

export function formatStrategy(s: StrategyT): string {
  switch (s.type) {
    case "testid": return `getByTestId("${s.value}")`;
    case "role": return `getByRole("${s.role}"${s.name ? `, { name: "${s.name}" }` : ""})`;
    case "label": return `getByLabel("${s.text}")`;
    case "placeholder": return `getByPlaceholder("${s.text}")`;
    case "text": return `getByText("${s.text}")`;
    case "altText": return `getByAltText("${s.text}")`;
    case "title": return `getByTitle("${s.text}")`;
    case "css": return `locator("${s.selector}")`;
    default: return JSON.stringify(s);
  }
}

const rule = `${c.gray}  └${'─'.repeat(49)}${c.reset}`;

export const healLog = {
  configure,

  banner: () => {
    emit("info", "", `${c.bgPurple}${c.bold}${c.white}  ✦ healwright  ${c.reset}`);
  },

  actionFailed: (action: string, contextName: string) => {
    emit(
      "info",
      `${c.gray}  │${c.reset}`,
      `${c.gray}  ├─${c.reset} ${c.yellow}⚡${c.reset} ${c.dim}${action.toUpperCase()}${c.reset} ${c.white}${contextName}${c.reset}`,
    );
  },

  askingAI: (_contextName: string, candidateCount: number, totalCollected?: number) => {
    const filtered = totalCollected && totalCollected > candidateCount
      ? ` ${c.dim}(filtered from ${totalCollected})${c.reset}`
      : '';
    emit("info", `${c.gray}  │  ${c.purple}⬡${c.reset} ${c.dim}analyzing ${candidateCount} elements...${c.reset}${filtered}`);
  },

  aiResponse: (length: number) => {
    emit("info", `${c.gray}  │  ${c.dim}↳ received ${length} chars${c.reset}`);
  },

  candidateRejected: (type: string, reason: string) => {
    emit("info", `${c.gray}  │  ${c.dim}↳ [${type}] skipped: ${reason}${c.reset}`);
  },

  candidateError: (type: string, error: string) => {
    emit("error", `${c.gray}  │  ${c.red}↳ [${type}] error: ${error}${c.reset}`);
  },

  healed: (contextName: string, strategy: StrategyT) => {
    emit(
      "info",
      `${c.gray}  │${c.reset}`,
      `${c.gray}  ├─${c.reset} ${c.green}✓${c.reset} ${c.bold}${c.white}${contextName}${c.reset}`,
      `${c.gray}  │  ${c.dim}→ ${formatStrategy(strategy)}${c.reset}`,
    );
  },

  /** Report-only mode: a heal was found but deliberately not applied. */
  wouldHeal: (contextName: string, strategy: StrategyT) => {
    emit(
      "error",
      `${c.gray}  │${c.reset}`,
      `${c.gray}  ├─${c.reset} ${c.yellow}◐${c.reset} ${c.bold}${c.white}${contextName}${c.reset} ${c.dim}(report-only)${c.reset}`,
      `${c.gray}  │  ${c.dim}would heal to ${formatStrategy(strategy)} — original failure kept${c.reset}`,
      rule,
      "",
    );
  },

  tokenUsage: (input: number, output: number, total: number) => {
    emit(
      "info",
      `${c.gray}  │  ${c.dim}↑ ${c.cyan}${input}${c.dim} input · ${c.cyan}${output}${c.dim} output · ${c.bold}${c.cyan}${total}${c.dim} total tokens${c.reset}`,
      rule,
      "",
    );
  },

  usedCache: (contextName: string) => {
    emit(
      "info",
      `${c.gray}  │  ${c.cyan}◆${c.reset} ${c.dim}cached: ${contextName}${c.reset}`,
      rule,
      "",
    );
  },

  cacheMiss: (contextName: string) => {
    emit("info", `${c.gray}  │  ${c.yellow}○${c.reset} ${c.dim}cache stale for "${contextName}", re-healing...${c.reset}`);
  },

  healFailed: (contextName: string, error: string) => {
    emit(
      "error",
      `${c.gray}  │${c.reset}`,
      `${c.gray}  ├─${c.reset} ${c.red}✕${c.reset} ${c.red}${contextName}${c.reset}`,
      `${c.gray}  │  ${c.dim}${error}${c.reset}`,
      rule,
      "",
    );
  },

  aiDetectMode: (_action: string, contextName: string) => {
    emit(
      "info",
      `${c.gray}  │${c.reset}`,
      `${c.gray}  ├─${c.reset} ${c.purple}◈${c.reset} ${c.dim}AI DETECT${c.reset} ${c.white}${contextName}${c.reset}`,
    );
  },

  noValidCandidate: (contextName: string) => {
    emit("error", `${c.gray}  │  ${c.red}↳ no valid candidate found for "${contextName}"${c.reset}`);
  },

  warn: (message: string) => {
    emit(
      "error",
      `${c.gray}  │${c.reset}`,
      `${c.gray}  ├─${c.reset} ${c.yellow}⚠${c.reset} ${c.yellow}${message}${c.reset}`,
      rule,
    );
  },

  aiDisabled: () => {
    emit("error", `${c.yellow}⚠ Set SELF_HEAL=1 (or AI_SELF_HEAL=true) with AI_API_KEY to enable AI detection${c.reset}`);
  },
};
