import { AppError, Logger } from '@tepegoz/libs';
import { AgentWorkingStateSchema } from '@tepegoz/shared-types';
import { z } from 'zod';
import { ReactorMessages } from './messages';

/**
 * The actor's progress "brain" (AI-3): a self-assessment carried on every decision. `memory` forces
 * explicit progress counting ("2 of 10 done") — a strong anti-loop / don't-give-up signal. All optional
 * so weak models that omit them still parse (json_object mode only guarantees valid JSON, not shape).
 *
 * C1: `state` is the TYPED companion to `memory` — the model's proposed update to its structured working
 * ledger (see {@link AgentWorkingStateSchema}). `.catch(undefined)` makes a malformed patch NON-fatal: it
 * is dropped (the reactor then carries the prior ledger forward via merge) rather than failing the whole
 * decision and forcing a repair turn. `memory` stays for the completion validator and weak models.
 */
const BRAIN_FIELDS = {
  evaluation_previous_goal: z.string().max(500).optional(),
  memory: z.string().max(1500).optional(),
  next_goal: z.string().max(500).optional(),
  state: AgentWorkingStateSchema.optional().catch(undefined),
};

/** The model's next move: run one tool, or declare the goal met. Validated at the (untrusted) boundary. */
const DecisionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('act'),
    tool: z.string().min(1).max(100),
    args: z.unknown().default({}),
    rationale: z.string().max(500).default(''),
    ...BRAIN_FIELDS,
  }),
  z.object({ action: z.literal('finish'), summary: z.string().max(1000).default(''), ...BRAIN_FIELDS }),
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
