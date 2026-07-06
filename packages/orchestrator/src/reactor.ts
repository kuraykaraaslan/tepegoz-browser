import { AppError, Logger } from '@tepegoz/libs';
import { ModelGateway, type CanonMessage } from '@tepegoz/model-gateway';
import { ToolGateway, type InvokeContext } from '@tepegoz/capability-plane';
import { z } from 'zod';
import type { AIProvider, ToolDescriptor, ToolError } from '@tepegoz/shared-types';
import type { StepOutcome, StopReason } from './executor';
import { ReactorMessages } from './messages';

/**
 * L3 reactive executor — the perceive → decide → act loop. Unlike the static {@link Executor} (which
 * runs a plan fixed *before* the page is seen), the reactor asks the model for the NEXT single tool
 * call given the goal + everything observed so far, runs it through the single ToolGateway PEP (Policy
 * Kernel + HITL), feeds the observation back, and repeats — so the agent can target live element
 * `ref`s from `browser_get_elements`, react to what a page actually shows, and recover from a failed
 * step. Same Phase-1a safeguards as the static executor: hard `maxSteps` cap, Loop Detector, abort,
 * and a post-step guard (Human Handoff Controller). The model's output is UNTRUSTED — every decision
 * is JSON-extracted + zod-validated and the chosen tool must be registered before it can run.
 */

/** The model's next move: run one tool, or declare the goal met. Validated at the (untrusted) boundary. */
const DecisionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('act'),
    tool: z.string().min(1).max(100),
    args: z.unknown().default({}),
    rationale: z.string().max(500).default(''),
  }),
  z.object({ action: z.literal('finish'), summary: z.string().max(1000).default('') }),
]);
export type Decision = z.infer<typeof DecisionSchema>;

function extractJson(text: string): string {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const body = fenced?.[1] ?? text;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  return start >= 0 && end > start ? body.slice(start, end + 1) : body;
}

/** Unwrap a single-object envelope like {"decision": {…}} / {"response": {…}} when the top level has
 *  no `action` of its own. */
function unwrapEnvelope(obj: Record<string, unknown>): Record<string, unknown> {
  if ('action' in obj) return obj;
  for (const key of ['decision', 'response', 'result', 'output']) {
    const inner = obj[key];
    if (inner !== null && typeof inner === 'object' && !Array.isArray(inner)) {
      return inner as Record<string, unknown>;
    }
  }
  return obj;
}

/** True for a `{domain}_{verb}_{noun}`-shaped tool id (≥3 lowercase segments) — used to tell a real
 *  tool id apart from a discriminator ('act'/'finish') or misplaced junk like a numeric ref. */
function looksLikeToolId(v: unknown): v is string {
  return typeof v === 'string' && /^[a-z][a-z0-9]*(?:_[a-z0-9]+){2,}$/.test(v);
}

/** The best tool id in the object: a tool-id-shaped `tool`/`action`/`name`, else any string `tool`.
 *  Handles models that put the tool id in `action` (with `tool` holding junk like a ref number). */
function resolveToolId(obj: Record<string, unknown>): string | undefined {
  for (const key of ['tool', 'action', 'name']) {
    const v = obj[key];
    if (looksLikeToolId(v)) return v;
  }
  return typeof obj['tool'] === 'string' ? obj['tool'] : undefined;
}

/** Normalize toward the DecisionSchema discriminator, salvaging the common weak-model shapes. */
function normalizeAction(obj: Record<string, unknown>): Record<string, unknown> {
  const action = obj['action'];
  if (action === 'finish') return obj;
  // Already a clean act.
  if (action === 'act' && typeof obj['tool'] === 'string') return obj;
  // Otherwise salvage: any resolvable tool id ⇒ an act (overriding a bogus `tool`, e.g. a ref number
  // the model put there while placing the real tool id in `action`); else a summary ⇒ finish.
  const toolId = resolveToolId(obj);
  if (toolId !== undefined) return { ...obj, action: 'act', tool: toolId };
  if (typeof obj['summary'] === 'string') return { ...obj, action: 'finish' };
  return obj;
}

/**
 * Weak models still don't constrain SHAPE (json_object mode only guarantees *valid* JSON), so they
 * commonly wrap the decision in an envelope or use near-miss keys. Normalize the well-known variants
 * toward {@link DecisionSchema} — this only nudges an already-intended decision into the canonical
 * shape; zod still rejects anything invalid afterward and the reactor still requires the tool to be
 * registered before it can run, so nothing unsafe slips through.
 */
export function coerceDecisionShape(raw: unknown): unknown {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  let obj = unwrapEnvelope(raw as Record<string, unknown>);
  // Alias the OpenAI-function-style "arguments" → "args".
  if (!('args' in obj) && 'arguments' in obj) {
    obj = { ...obj, args: obj['arguments'] };
  }
  return normalizeAction(obj);
}

/** Parse the model's raw turn into a validated {@link Decision}. Throws AppError on malformed output. */
export function parseDecision(text: string): Decision {
  let raw: unknown;
  try {
    raw = JSON.parse(extractJson(text));
  } catch {
    Logger.warn(ReactorMessages.InvalidJson, { raw: text.slice(0, 400) });
    throw new AppError(ReactorMessages.InvalidJson, 502);
  }
  const parsed = DecisionSchema.safeParse(coerceDecisionShape(raw));
  if (!parsed.success) {
    Logger.warn(ReactorMessages.MalformedDecision, { raw: text.slice(0, 400), issues: parsed.error.issues });
    throw new AppError(ReactorMessages.MalformedDecision, 502);
  }
  return parsed.data;
}

export interface ReactRequest {
  goal: string;
  /** Approved-plan outline shown to the model as guidance (not a rigid script). */
  outline?: string[];
  /** Steps the user pruned from the plan preview — the agent must NOT do these. */
  avoid?: string[];
  tools: Pick<ToolDescriptor, 'id' | 'description' | 'dangerClass'>[];
  provider: AIProvider;
  model: string;
  maxTokens?: number;
  timeoutMs?: number;
  /** Prior conversation turns (earlier user prompts + the agent's closing summaries) so follow-up
   *  messages have context — injected between the system prompt and the current goal. */
  history?: readonly CanonMessage[];
}

export interface ReactOptions {
  maxSteps?: number;
  loopThreshold?: number;
  /** Per-call Policy Kernel context (targetUrl for the sensitive-site lockout, taintedArgs). */
  ctxFor?: (tool: string, args: unknown) => InvokeContext;
  signal?: { readonly aborted: boolean };
  /** Fired when the model chooses to act, before the tool runs (Agent Console). */
  onDecision?: (tool: string, rationale: string) => void;
  /** Fired after each tool call resolves (drives taint recording + console step events). */
  onOutcome?: (outcome: StepOutcome) => void;
  /** Post-step guard (Human Handoff Controller): return a StopReason to halt (e.g. CAPTCHA/2FA). */
  guard?: (outcome: StepOutcome) => StopReason | null;
}

export interface ReactResult {
  outcomes: StepOutcome[];
  stoppedReason: StopReason;
  /** The model's closing summary when it finished on its own. */
  summary?: string;
}

/** Longest single observation fed back to the model (truncate untrusted page dumps; compaction → 1b). */
const MAX_OBSERVATION_CHARS = 6000;

function isToolError(v: unknown): v is ToolError {
  return typeof v === 'object' && v !== null && (v as { isError?: unknown }).isError === true;
}

function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  const obj = v as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(',')}}`;
}

/** The observation text fed back to the model after a tool call — a read tool's already-wrapped
 *  `content` when present, else a compact JSON of the result; truncated to keep the prompt bounded. */
function observationOf(outcome: StepOutcome): string {
  if (!outcome.ok) {
    const err = outcome.error;
    return `Tool "${outcome.tool}" failed: ${err?.code ?? 'ERROR'} — ${err?.message ?? 'unknown error'}`;
  }
  const result = outcome.result;
  const text =
    result !== null && typeof result === 'object' && typeof (result as { content?: unknown }).content === 'string'
      ? (result as { content: string }).content
      : stableStringify(result);
  return text.length > MAX_OBSERVATION_CHARS ? `${text.slice(0, MAX_OBSERVATION_CHARS)}\n…[truncated]` : text;
}

/** Coreference guidance — emitted only when there ARE earlier turns, so a follow-up like "research this"
 *  resolves its pronoun to the real subject instead of being taken literally. */
const COREFERENCE_INSTRUCTION =
  '\nThe messages before the goal are earlier turns of the SAME conversation. Resolve any pronoun or ' +
  'deictic in the goal (English: this/that/it/them; Turkish: bunu/şunu/onu/o/bunları) to the concrete ' +
  'subject from those earlier turns BEFORE choosing a tool, and never use a bare pronoun as a search ' +
  'query or fill text.';

/** Browsing strategy — reuse the current tab by default; a new tab is the exception, not the habit. */
const BROWSING_STRATEGY =
  '\nPrefer to stay in the CURRENT tab: navigate it with browser_update_location. Open a new tab with ' +
  'tab_create_item ONLY when the current page must stay open or you need a side-by-side comparison — ' +
  'and when you do, pass a short groupName naming the task so the new tab is grouped. New tabs open ' +
  'in the background by default; pass the returned id as `tabId` to browser_* tools when working on ' +
  'that tab. Use tab_update_item only when the tab must become visible/focused. Close tabs you opened ' +
  'with tab_delete_item when they are no longer needed. After browser_update_page or navigation, verify ' +
  'the result with browser_validate_page, browser_get_page, or browser_get_elements before continuing.';

function systemPrompt(req: ReactRequest): string {
  const toolList = req.tools.map((t) => `- ${t.id} (${t.dangerClass}): ${t.description}`).join('\n');
  const outline = req.outline && req.outline.length > 0 ? `\nSuggested approach:\n${req.outline.join('\n')}` : '';
  const avoid = req.avoid && req.avoid.length > 0 ? `\nDo NOT do (the user removed these): ${req.avoid.join('; ')}` : '';
  const coref = req.history && req.history.length > 0 ? COREFERENCE_INSTRUCTION : '';
  return (
    'You are an agent driving a web browser one action at a time. Given the goal and everything ' +
    'observed so far, decide the SINGLE next step. To interact with a page, first call ' +
    'browser_get_elements to see the actionable elements and their refs, then use browser_update_page ' +
    'with a ref. Output ONLY JSON, no prose or markdown fences, of exactly one of:\n' +
    '{"action":"act","tool":"<id>","args":{…},"rationale":"<why>"}\n' +
    '{"action":"finish","summary":"<what you accomplished>"}\n' +
    'Finish as soon as the goal is met or is impossible. Use ONLY these tools (by exact id):\n' +
    toolList +
    BROWSING_STRATEGY +
    coref +
    outline +
    avoid
  );
}

export default class Reactor {
  static async run(req: ReactRequest, options: ReactOptions = {}): Promise<ReactResult> {
    const maxSteps = options.maxSteps ?? 25;
    const loopThreshold = options.loopThreshold ?? 3;
    const known = new Set(req.tools.map((t) => t.id));
    const outcomes: StepOutcome[] = [];
    const signatureCounts = new Map<string, number>();

    const messages: CanonMessage[] = [
      { role: 'system', content: systemPrompt(req) },
      ...(req.history ?? []),
      { role: 'user', content: `Goal: ${req.goal}` },
    ];

    for (let step = 0; ; step++) {
      if (options.signal?.aborted === true) return { outcomes, stoppedReason: 'aborted' };
      if (outcomes.length >= maxSteps) return { outcomes, stoppedReason: 'max_steps' };

      const response = await ModelGateway.complete({
        provider: req.provider,
        model: req.model,
        capability: 'exec',
        messages,
        maxTokens: req.maxTokens ?? 1500,
        timeoutMs: req.timeoutMs ?? 60_000,
        responseFormat: 'json',
      });
      const decision = parseDecision(response.text);
      messages.push({ role: 'assistant', content: response.text });

      if (decision.action === 'finish') {
        return { outcomes, stoppedReason: 'completed', summary: decision.summary };
      }

      // The model's tool choice is untrusted — an unregistered id is fed back as an error, never run.
      if (!known.has(decision.tool)) {
        messages.push({ role: 'user', content: `Observation: unknown tool "${decision.tool}". Choose a listed tool.` });
        continue;
      }

      const signature = `${decision.tool}:${stableStringify(decision.args)}`;
      const count = (signatureCounts.get(signature) ?? 0) + 1;
      signatureCounts.set(signature, count);
      if (count >= loopThreshold) return { outcomes, stoppedReason: 'loop_detected' };

      options.onDecision?.(decision.tool, decision.rationale);
      const ctx = options.ctxFor ? options.ctxFor(decision.tool, decision.args) : {};
      const result = await ToolGateway.invoke(decision.tool, decision.args, ctx);
      const outcome: StepOutcome = isToolError(result)
        ? { stepId: `r${String(step)}`, tool: decision.tool, ok: false, error: result }
        : { stepId: `r${String(step)}`, tool: decision.tool, ok: true, result };
      outcomes.push(outcome);
      options.onOutcome?.(outcome);

      // A policy/HITL denial (FORBIDDEN) is the user's hard "no" → stop. Other failures (stale ref,
      // element not visible, timeout) are recoverable: feed them back so the agent can adapt.
      if (!outcome.ok && outcome.error?.code === 'FORBIDDEN') {
        return { outcomes, stoppedReason: 'tool_error' };
      }

      const halt = outcome.ok ? options.guard?.(outcome) : null;
      if (halt != null) return { outcomes, stoppedReason: halt };

      messages.push({ role: 'user', content: `Observation:\n${observationOf(outcome)}` });
    }
  }
}
