import type { EventRecord } from '@tepegoz/shared-types';

/**
 * The unsigned, human-readable Run Report (Phase 7 NotaryService, "shippable before the wiring").
 *
 * Nothing in `apps/desktop` calls the Notary yet, so a run today produces no artifact at all — no
 * receipt, nothing to read afterward. This is a *view over the Journal*, not a second source of truth:
 * it turns the events already written for one `correlationId` into a single self-contained document a
 * user can read, keep, diff and share now. It is explicitly **not a proof** — no hash chain, no
 * signature — so it must never be presented as one; that is the Replay Receipt's job once the Notary is
 * wired into a live run. The day it is, the same events sign without this report changing shape.
 */

export interface RunReportTokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface RunReportStep {
  lsn: number;
  ts: number;
  type: string;
  message: string;
  detail?: string;
  /** Milliseconds since the previous step in this run; null for the first step. */
  latencyMs: number | null;
}

export type RunReportTerminal =
  { known: false } | { known: true; outcome: 'succeeded' | 'failed'; message: string; ts: number };

export interface RunReport {
  runId: string;
  goal: string;
  generatedAt: number;
  startedAt: number | null;
  endedAt: number | null;
  steps: RunReportStep[];
  terminal: RunReportTerminal;
  tokenUsage?: RunReportTokenUsage;
}

export interface BuildRunReportInput {
  runId: string;
  /** The prompt/goal that started the run, already redacted by the caller (this module does not
   *  redact — it only formats what it is handed). */
  goal: string;
  generatedAt: number;
  /** Every Journal event for this run, in any order. Events for a different `correlationId` are
   *  dropped rather than trusted, so a caller may pass a wider slice without filtering first. */
  events: readonly EventRecord[];
  tokenUsage?: RunReportTokenUsage;
}

const TERMINAL_TYPES = new Set(['TaskSucceeded', 'TaskFailed']);
const MAX_PAYLOAD_PREVIEW = 400;

/** Best-effort, truncated string for a payload shape this module does not otherwise recognize. */
function summarizeUnknownPayload(payload: unknown): string {
  let s: string;
  try {
    s = JSON.stringify(payload) ?? 'null';
  } catch {
    s = String(payload);
  }
  return s.length > MAX_PAYLOAD_PREVIEW ? `${s.slice(0, MAX_PAYLOAD_PREVIEW)}…` : s;
}

/**
 * Every agent-run event journaled by `apps/desktop` (see `ipc-agent-shared.ts`'s `JOURNAL_TYPE_BY_KIND`)
 * carries `{ kind, message, detail? }`. Anything else (today: `CheckpointWritten`, whose payload is the
 * raw checkpoint) falls back to a compact JSON preview so the report never silently drops a step.
 */
function describePayload(payload: unknown): { message: string; detail?: string } {
  if (payload !== null && typeof payload === 'object' && !Array.isArray(payload)) {
    const obj = payload as Record<string, unknown>;
    if (typeof obj.message === 'string') {
      return typeof obj.detail === 'string'
        ? { message: obj.message, detail: obj.detail }
        : { message: obj.message };
    }
  }
  return { message: summarizeUnknownPayload(payload) };
}

/**
 * Structure one run's Journal events into a report. Pure transform — no I/O, no redaction (the events
 * were already redacted at journal-append time; that contract is the caller's, same as `buildReceipt`).
 */
export function buildRunReport(input: BuildRunReportInput): RunReport {
  const ordered = input.events
    .filter((e) => e.correlationId === input.runId)
    .slice()
    .sort((a, b) => a.lsn - b.lsn);

  const steps: RunReportStep[] = ordered.map((e, i) => {
    const { message, detail } = describePayload(e.payload);
    const prevTs = i > 0 ? ordered[i - 1]!.ts : null;
    return {
      lsn: e.lsn,
      ts: e.ts,
      type: e.type,
      message,
      ...(detail !== undefined ? { detail } : {}),
      latencyMs: prevTs === null ? null : e.ts - prevTs,
    };
  });

  const terminalEvent = [...ordered].reverse().find((e) => TERMINAL_TYPES.has(e.type));
  const terminal: RunReportTerminal =
    terminalEvent === undefined
      ? { known: false }
      : {
          known: true,
          outcome: terminalEvent.type === 'TaskSucceeded' ? 'succeeded' : 'failed',
          message: describePayload(terminalEvent.payload).message,
          ts: terminalEvent.ts,
        };

  return {
    runId: input.runId,
    goal: input.goal,
    generatedAt: input.generatedAt,
    startedAt: ordered[0]?.ts ?? null,
    endedAt: terminal.known ? terminal.ts : (ordered.at(-1)?.ts ?? null),
    steps,
    terminal,
    ...(input.tokenUsage !== undefined ? { tokenUsage: input.tokenUsage } : {}),
  };
}

function isoOrUnknown(ts: number | null): string {
  return ts === null ? 'unknown' : new Date(ts).toISOString();
}

/** Indent every continuation line of a (possibly multi-line) detail string under its bullet. */
function indentDetail(detail: string): string {
  return detail.split('\n').join('\n     ');
}

/**
 * Render a {@link RunReport} as a single self-contained Markdown document — the "read, keep, diff,
 * share" artifact. Deliberately plain text over a table: step messages/details are freeform (model
 * output, tool args previews) and may contain characters that would corrupt a Markdown table cell.
 */
export function renderRunReportMarkdown(report: RunReport): string {
  const lines: string[] = [];
  lines.push(`# Run Report — ${report.goal}`);
  lines.push('');
  lines.push(
    '> **Not a proof.** This is a plain-language view over the local Event Journal, generated on this ' +
      'device. It is not signed and not verifiable by a third party — that is the Replay Receipt’s ' +
      'job once the Notary is wired into a live run.',
  );
  lines.push('');
  lines.push(`- Run: \`${report.runId}\``);
  lines.push(`- Generated: ${isoOrUnknown(report.generatedAt)}`);
  lines.push(`- Started: ${isoOrUnknown(report.startedAt)}`);
  lines.push(`- Ended: ${isoOrUnknown(report.endedAt)}`);
  lines.push(
    `- Outcome: ${report.terminal.known ? report.terminal.outcome : 'unknown (no terminal event recorded)'}`,
  );
  if (report.tokenUsage !== undefined) {
    const t = report.tokenUsage;
    lines.push(`- Tokens: ${t.totalTokens} total (${t.inputTokens} in / ${t.outputTokens} out)`);
  }
  lines.push('');
  lines.push('## Steps');
  lines.push('');
  if (report.steps.length === 0) {
    lines.push('_No events were journaled for this run._');
  } else {
    for (const [i, step] of report.steps.entries()) {
      const latency = step.latencyMs === null ? 'start' : `+${String(step.latencyMs)}ms`;
      lines.push(
        `${String(i + 1)}. [${isoOrUnknown(step.ts)} · ${latency}] **${step.type}** — ${step.message}`,
      );
      if (step.detail !== undefined) {
        lines.push(`     ${indentDetail(step.detail)}`);
      }
    }
  }
  if (report.terminal.known) {
    lines.push('');
    lines.push(`## Terminal — ${report.terminal.outcome === 'succeeded' ? 'Succeeded' : 'Failed'}`);
    lines.push('');
    lines.push(report.terminal.message);
  }
  lines.push('');
  return lines.join('\n');
}
