/**
 * TypeSafe Provider (Jev)
 *
 * Jev is a System One model: it answers typed questions with calibrated
 * probabilities instead of generating text. So rather than asking it to write
 * a locator, healwright asks it which of the collected elements is the one
 * described, and builds the locator in code from that element's own
 * attributes. The answer can only ever be an element that was on the page.
 */

import { TypeSafeClient, choice, noul } from "@typesafe-ai/sdk";
import type { ChoiceResponse, NoulResponse } from "@typesafe-ai/sdk";
import {
    AIProvider,
    AIProviderConfig,
    GenerateHealPlanInput,
    HealPlanResult,
    HealRequest,
    DEFAULT_MODELS,
    PROVIDER_TIMEOUT_MS,
} from "./types";
import type { HealPlanT, StrategyT } from "../types";
import { healLog } from "../logger";

type Candidate = Record<string, unknown>;

/** The "nothing matches" option. */
export const NONE = "none";
/** A Choice takes at most 255 options; one is kept for {@link NONE}. */
const MAX_OPTIONS = 254;
/** Below this probability that the element is present at all, nothing is healed. */
const PRESENCE_THRESHOLD = 0.5;
/** A runner-up element is offered only when the model was this torn. */
const RUNNER_UP_THRESHOLD = 0.25;
/** `collectCandidates` cuts text at this length, so longer text is partial. */
const COLLECTED_TEXT_LIMIT = 60;

const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v : undefined);

/**
 * A compact, field-named description of one element. Jev reads named facts
 * more reliably than a raw object, and every extra field is a distractor.
 */
export function describeCandidate(c: Candidate): string {
    const role = str(c.role);
    const tag = str(c.tag) ?? "element";
    const type = str(c.type);
    const parts = [role ? `${role} (${tag})` : type ? `${tag} type=${type}` : tag];
    const quoted: Array<[string, unknown]> = [
        ["text", c.txt], ["aria-label", c.aria], ["placeholder", c.ph], ["alt", c.alt],
        ["title", c.title], ["name", c.name], ["test id", c.tid], ["id", c.id],
        ["label for", c.for], ["link to", c.href], ["class", c.cls],
    ];
    for (const [label, value] of quoted) {
        const v = str(value);
        if (v) parts.push(`${label} "${v}"`);
    }
    if (c.hid) parts.push("hidden");
    return parts.join(", ");
}

/** The ARIA role Playwright's getByRole would match for this element. */
function roleOf(c: Candidate): string | undefined {
    const explicit = str(c.role);
    if (explicit) return explicit;
    const type = (str(c.type) ?? "").toLowerCase();
    switch (str(c.tag)) {
        case "button": return "button";
        case "a": return str(c.href) ? "link" : undefined;
        case "select": return "combobox";
        case "textarea": return "textbox";
        case "option": return "option";
        case "img": return str(c.alt) ? "img" : undefined;
        case "input":
            if (["button", "submit", "reset", "image"].includes(type)) return "button";
            if (type === "checkbox") return "checkbox";
            if (type === "radio") return "radio";
            if (type === "range") return "slider";
            if (type === "number") return "spinbutton";
            if (type === "search") return "searchbox";
            if (["", "text", "email", "tel", "url"].includes(type)) return "textbox";
            return undefined;
        default: return undefined;
    }
}

// Roles whose accessible name comes from their text content.
const NAME_FROM_CONTENT = new Set([
    "button", "link", "tab", "menuitem", "menuitemcheckbox", "menuitemradio", "option",
    "treeitem", "cell", "gridcell", "row", "heading", "switch", "checkbox", "radio",
]);

function quoteAttr(v: string): string {
    return v.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * Locator strategies for one element, best first: test id, role and name,
 * label, placeholder, text, alt text, title, then CSS. At most three.
 */
export function strategiesFor(c: Candidate): StrategyT[] {
    const out: StrategyT[] = [];
    const tag = str(c.tag) ?? "*";
    const txt = str(c.txt);
    const aria = str(c.aria);
    const exactText = !txt || txt.length < COLLECTED_TEXT_LIMIT;

    const tid = str(c.tid);
    if (tid) out.push({ type: "testid", value: tid });

    const role = roleOf(c);
    const name = aria ?? (role === "img" ? str(c.alt) : NAME_FROM_CONTENT.has(role ?? "") ? txt : undefined);
    if (role && name) out.push({ type: "role", role, name, exact: name === txt ? exactText : true });
    else if (aria) out.push({ type: "label", text: aria, exact: true });

    const ph = str(c.ph);
    if (ph) out.push({ type: "placeholder", text: ph, exact: true });
    if (txt && tag !== "input" && tag !== "textarea") out.push({ type: "text", text: txt, exact: exactText });
    const alt = str(c.alt);
    if (alt) out.push({ type: "altText", text: alt, exact: true });
    const title = str(c.title);
    if (title) out.push({ type: "title", text: title, exact: true });

    const id = str(c.id);
    const nameAttr = str(c.name);
    const href = str(c.href);
    if (id) out.push({ type: "css", selector: /^[A-Za-z][\w-]*$/.test(id) ? `#${id}` : `${tag}[id="${quoteAttr(id)}"]` });
    else if (nameAttr) out.push({ type: "css", selector: `${tag}[name="${quoteAttr(nameAttr)}"]` });
    else if (href && tag === "a") out.push({ type: "css", selector: `a[href="${quoteAttr(href)}"]` });

    return out.slice(0, 3);
}

/**
 * The System One request: a Choice over the candidates, plus a parallel Noul
 * asking whether the element is on the page at all. A "none" option alone is
 * not always reliable, and healing the wrong element is the costly mistake.
 */
export function buildTypeSafeRequest(heal: HealRequest) {
    const candidates = heal.candidates.slice(0, MAX_OPTIONS);
    const labels = candidates.map((_, i) => `e${i + 1}`);
    const descriptions = candidates.map(describeCandidate);

    const criteria: Record<string, string> = {};
    labels.forEach((label, i) => { criteria[label] = descriptions[i]; });
    criteria[NONE] = "None of the listed elements is the element described in `target`.";

    const request = {
        state: { target: heal.contextName, action: heal.action, page: heal.url },
        questions: {
            element: choice(
                "Which element on the page is the one described in `target`? The test is about to " +
                "perform `action` on it. Match on what a person would see or hear: its text, label, " +
                "role and purpose. Choose none when no element fits the description.",
                criteria,
            ),
            present: noul({
                question: "Is the element described in `target` one of these page elements?",
                elements: descriptions,
            }),
        },
    };
    return { request, labels };
}

interface TypeSafeAnswers {
    element: ChoiceResponse;
    present: NoulResponse;
}

/** Turn Jev's answers into a heal plan; policy lives here, in code. */
export function planFromAnswers(candidates: Candidate[], labels: string[], answers: TypeSafeAnswers): HealPlanT {
    const { element, present } = answers;
    if (element.choice === NONE || present.noul < PRESENCE_THRESHOLD) return { candidates: [] };

    const ranked = labels
        .map((label, i) => ({ candidate: candidates[i], p: element.probabilities[label] ?? 0 }))
        .sort((a, b) => b.p - a.p);

    const picks = [ranked[0]];
    if (ranked[1] && ranked[1].p >= RUNNER_UP_THRESHOLD) picks.push(ranked[1]);

    const plan: HealPlanT = { candidates: [] };
    for (const { candidate, p } of picks) {
        for (const strategy of strategiesFor(candidate)) {
            plan.candidates.push({
                strategy,
                confidence: p,
                why: `Jev chose this element with probability ${p.toFixed(2)}`,
            });
        }
    }
    return plan;
}

/** Client options: a bounded request, with retries left to healwright. */
export function typeSafeClientOptions(config: Pick<AIProviderConfig, "apiKey" | "baseURL">) {
    return {
        apiKey: config.apiKey,
        timeout: PROVIDER_TIMEOUT_MS,
        retry: { maxRetries: 0 },
        ...(config.baseURL ? { baseURL: config.baseURL } : {}),
    };
}

export class TypeSafeProvider implements AIProvider {
    readonly name = "typesafe" as const;
    private client: TypeSafeClient;
    private model: string;

    constructor(config: AIProviderConfig) {
        this.client = new TypeSafeClient(typeSafeClientOptions(config));
        this.model = config.model ?? DEFAULT_MODELS.typesafe;
    }

    async generateHealPlan(input: GenerateHealPlanInput): Promise<HealPlanResult> {
        // The structured request is passed alongside the prompt; the prompt
        // itself is JSON of the same shape, kept as a fallback.
        const heal: HealRequest = input.heal ?? JSON.parse(input.userContent);
        const { request, labels } = buildTypeSafeRequest(heal);
        try {
            const resp = await this.client.systemOne({ ...request, model: this.model });
            healLog.aiResponse(JSON.stringify(resp.answers).length);

            const inputTokens = resp.usage?.input_tokens ?? 0;
            const outputTokens = resp.usage?.output_tokens ?? 0;
            const tokenUsage = { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens };

            const plan = planFromAnswers(heal.candidates, labels, resp.answers as unknown as TypeSafeAnswers);
            return { plan, tokenUsage };
        } catch (aiErr: any) {
            healLog.candidateError("api", aiErr?.message ?? String(aiErr));
            throw aiErr;
        }
    }
}
