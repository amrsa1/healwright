/**
 * The prompt healwright sends to every provider.
 *
 * Kept in one place because the providers do not all enforce the response shape
 * the same way: OpenAI and Anthropic get a strict JSON schema, Google gets a
 * response schema, Ollama gets a format hint. The envelope is described here in
 * words as well, so a provider whose schema enforcement is unavailable still
 * returns something parseable.
 */

import type { Action } from "./types";

export function buildSystemPrompt(): string {
  return [
    "You are a Playwright locator expert. Given a list of candidate elements from the page, identify the one matching contextName.",
    "Return up to 3 strategy alternatives, best first. Prefer: testid > role+name > label > placeholder > text > altText > title > css.",
    "Candidate keys: tag=tagName, tid=data-testid, aria=aria-label, ph=placeholder, txt=innerText, alt=alt, title=title, for=htmlFor, cls=className, hid=hidden. id/name/role/type/href as named.",
    "Strategy types: testid(value=testid), role(role+name, exact optional), label(text), placeholder(text), text(text, exact optional), altText(text), title(text), css(selector). No XPath.",
    "IMPORTANT: For label/placeholder/text/altText/title strategies, the 'text' field is REQUIRED and must be the actual text/label/placeholder value.",
    "For testid strategy, the 'value' field is REQUIRED. For css, the 'selector' field is REQUIRED. For role, the 'role' field is REQUIRED.",
    "Elements with hid:true may be CSS-hidden inputs (opacity:0) or offscreen — they are still valid targets if they match contextName.",
    "Set confidence to your genuine probability (0-1) that the strategy resolves to the described element. Do not inflate it; a low score is more useful than a confident guess.",
    "Respond with JSON only — no prose, no markdown fences. Shape:",
    '{"candidates":[{"strategy":{"type":"...","value":null,"selector":null,"role":null,"name":null,"text":null,"exact":null},"confidence":0.0,"why":"..."}]}',
    "Every strategy field must be present; use null for the ones your chosen strategy type does not need.",
  ].join("\n");
}

export function buildUserContent(
  url: string,
  action: Action,
  contextName: string,
  candidates: Record<string, unknown>[],
): string {
  return JSON.stringify({ url, action, contextName, candidates });
}
