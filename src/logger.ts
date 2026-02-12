/**
 * Console styling and logging for healwright
 */

import type { StrategyT } from './types';

// ANSI color codes
export const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  italic: "\x1b[3m",
  gray: "\x1b[90m",
  red: "\x1b[91m",
  green: "\x1b[92m",
  yellow: "\x1b[93m",
  blue: "\x1b[94m",
  purple: "\x1b[95m",
  cyan: "\x1b[96m",
  white: "\x1b[97m",
  bgPurple: "\x1b[48;5;99m",
  bgGreen: "\x1b[48;5;28m",
  bgRed: "\x1b[48;5;124m",
  bgBlue: "\x1b[48;5;24m",
};

export function formatStrategy(s: StrategyT): string {
  switch (s.type) {
    case "testid": return `getByTestId("${s.value}")`;
    case "role": return `getByRole("${s.role}"${s.name ? `, { name: "${s.name}" }` : ""})`;
    case "label": return `getByLabel("${s.text}")`;
    case "placeholder": return `getByPlaceholder("${s.text}")`;
    case "text": return `getByText("${s.text}")`;
    case "css": return `locator("${s.selector}")`;
    default: return JSON.stringify(s);
  }
}

export const healLog = {
  banner: () => {
    console.log();
    console.log(`${c.bgPurple}${c.bold}${c.white}  ✦ healwright  ${c.reset}`);
  },
  
  actionFailed: (action: string, contextName: string) => {
    console.log(`${c.gray}  ┌${'─'.repeat(50)}${c.reset}`);
    console.log(`${c.gray}  ├─${c.reset} ${c.yellow}⚡${c.reset} ${c.dim}${action.toUpperCase()}${c.reset} ${c.white}${contextName}${c.reset}`);
  },
  
  askingAI: (_contextName: string, candidateCount: number) => {
    console.log(`${c.gray}  │  ${c.purple}⬡${c.reset} ${c.dim}analyzing ${candidateCount} elements...${c.reset}`);
  },
  
  aiResponse: (length: number) => {
    console.log(`${c.gray}  │  ${c.dim}↳ received ${length} chars${c.reset}`);
  },
  
  candidateRejected: (type: string, reason: string) => {
    console.log(`${c.gray}  │  ${c.dim}↳ [${type}] skipped: ${reason}${c.reset}`);
  },
  
  candidateError: (type: string, error: string) => {
    console.log(`${c.gray}  │  ${c.red}↳ [${type}] error: ${error}${c.reset}`);
  },
  
  healed: (contextName: string, strategy: StrategyT) => {
    const strategyStr = formatStrategy(strategy);
    console.log(`${c.gray}  │${c.reset}`);
    console.log(`${c.gray}  └─${c.reset} ${c.green}✓${c.reset} ${c.bold}${c.white}${contextName}${c.reset}`);
    console.log(`${c.gray}     ${c.dim}→ ${strategyStr}${c.reset}`);
    console.log();
  },
  
  usedCache: (contextName: string) => {
    console.log(`${c.gray}  │  ${c.cyan}◆${c.reset} ${c.dim}cached: ${contextName}${c.reset}`);
  },
  
  cacheMiss: (contextName: string) => {
    console.log(`${c.gray}  │  ${c.yellow}○${c.reset} ${c.dim}cache stale for "${contextName}", re-healing...${c.reset}`);
  },
  
  healFailed: (contextName: string, error: string) => {
    console.log(`${c.gray}  │${c.reset}`);
    console.log(`${c.gray}  └─${c.reset} ${c.red}✕${c.reset} ${c.red}${contextName}${c.reset}`);
    console.log(`${c.gray}     ${c.dim}${error}${c.reset}`);
    console.log();
  },
  
  aiDetectMode: (_action: string, contextName: string) => {
    console.log(`${c.gray}  ┌${'─'.repeat(50)}${c.reset}`);
    console.log(`${c.gray}  ├─${c.reset} ${c.purple}◈${c.reset} ${c.dim}AI DETECT${c.reset} ${c.white}${contextName}${c.reset}`);
  },
  
  noValidCandidate: (contextName: string) => {
    console.log(`${c.gray}  │  ${c.red}↳ no valid candidate found for "${contextName}"${c.reset}`);
  },

  warn: (message: string) => {
    console.log(`${c.gray}  │${c.reset}`);
    console.log(`${c.gray}  └─${c.reset} ${c.yellow}⚠${c.reset} ${c.yellow}${message}${c.reset}`);
  },

  aiDisabled: () => {
    console.log(`${c.yellow}⚠ Set SELF_HEAL=1 or AI_SELF_HEAL=true with AI_API_KEY to enable AI detection${c.reset}`);
  },

  nativeFallback: (action: string, contextName: string) => {
    console.log(`${c.dim}  ↳ AI healing disabled — running native Playwright ${action} for "${contextName}"${c.reset}`);
  },
};
