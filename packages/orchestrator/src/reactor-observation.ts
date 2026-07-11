import type { ToolError } from '@tepegoz/shared-types';
import type { StepOutcome } from './executor';
import { recoveryAdviceFor, type AgentFailure } from './recovery';

/** Longest single observation fed back to the model (truncate untrusted page dumps; compaction → 1b). */
const MAX_OBSERVATION_CHARS = 6000;

export function isToolError(v: unknown): v is ToolError {
  return typeof v === 'object' && v !== null && (v as { isError?: unknown }).isError === true;
}

export function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  const obj = v as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(',')}}`;
}

/** Compact rendering of a ToolError's `details` when they are zod issues (the shape the ToolGateway
 *  attaches on a VALIDATION_ERROR): `path: message` per issue, so the model sees exactly which field/
 *  type was wrong and can self-correct. Bounded; returns '' for any other/absent detail shape. */
function renderIssues(details: unknown): string {
  if (!Array.isArray(details)) return '';
  const lines = details
    .filter((i): i is { path?: unknown; message?: unknown } => typeof i === 'object' && i !== null)
    .map((i) => {
      const path = Array.isArray(i.path) && i.path.length > 0 ? i.path.join('.') : '(root)';
      const message = typeof i.message === 'string' ? i.message : 'invalid';
      return `${path}: ${message}`;
    });
  if (lines.length === 0) return '';
  const joined = lines.join('; ');
  return joined.length > MAX_OBSERVATION_CHARS ? `${joined.slice(0, MAX_OBSERVATION_CHARS)}…` : joined;
}

/** The observation text fed back to the model after a tool call — a read tool's already-wrapped
 *  `content` when present, else a compact JSON of the result; truncated to keep the prompt bounded. */
export function observationOf(outcome: StepOutcome): string {
  if (!outcome.ok) {
    const err = outcome.error;
    const issues = renderIssues(err?.details);
    const detail = issues.length > 0 ? ` [${issues}]` : '';
    return `Tool "${outcome.tool}" failed: ${err?.code ?? 'ERROR'} — ${err?.message ?? 'unknown error'}${detail}`;
  }
  const result = outcome.result;
  const text =
    result !== null && typeof result === 'object' && typeof (result as { content?: unknown }).content === 'string'
      ? (result as { content: string }).content
      : stableStringify(result);
  return text.length > MAX_OBSERVATION_CHARS ? `${text.slice(0, MAX_OBSERVATION_CHARS)}\n…[truncated]` : text;
}

export function observationWithRecovery(outcome: StepOutcome, failure: AgentFailure): string {
  const advice = recoveryAdviceFor(failure);
  const next = advice.nextTool === undefined ? '' : ` Suggested next tool: ${advice.nextTool}.`;
  return `${observationOf(outcome)}\nRecovery: ${advice.instruction}${next}`;
}
