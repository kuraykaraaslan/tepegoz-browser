import type { AIProvider } from '@tepegoz/shared-types';

/**
 * Quick-mode: a compact decision wire encoding (S7 PR4).
 *
 * The JSON decision costs output tokens on every single turn — field names, braces, quotes, and the
 * brain fields, repeated for the length of the run. The compact form carries the same information as a
 * tab-separated line, which is the cheapest thing a model can emit that we can still parse
 * unambiguously:
 *
 * ```
 * A<TAB>browser_update_page<TAB>{"ref":3,"action":"click"}<TAB>rationale<TAB>memory
 * F<TAB>the invoice total is 412.90<TAB>rationale<TAB>memory
 * ```
 *
 * **It is a wire encoding and nothing more.** It decodes into a plain object that goes through the exact
 * same `coerceDecisionShape` + zod `safeParse` as JSON does, so the internal `Decision` type and
 * `@tepegoz/shared-types` remain the single source of shape. A compact line cannot express anything the
 * JSON form cannot, and nothing skips validation because it arrived compactly.
 *
 * **Off for every provider by default, enabled one at a time.** A compact grammar that a strong model
 * emits perfectly is exactly the sort of thing a weaker or local model gets subtly wrong — dropping a
 * field, using spaces instead of tabs, wrapping the line in prose. The cost of that failure is a repair
 * turn, which is more expensive than the tokens the encoding saves. So a provider is enabled only after
 * its own paired sweep shows equivalence, and the enable list is data (an env var), not a code edit.
 */

/** Providers with quick mode on, as a comma-separated list. Empty ⇒ nobody, which is the shipped state. */
const QUICK_MODE_ENV = 'TEPEGOZ_QUICK_MODE';

export function quickModeProviders(env: NodeJS.ProcessEnv = process.env): Set<string> {
  const raw = env[QUICK_MODE_ENV];
  if (raw === undefined || raw.trim().length === 0) return new Set();
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 0),
  );
}

export function isQuickModeEnabled(provider: AIProvider, env: NodeJS.ProcessEnv = process.env): boolean {
  const on = quickModeProviders(env);
  return on.has(provider) || on.has('all');
}

/** The instruction appended to the system prompt when the encoding is on. Absent otherwise — a provider
 *  with quick mode off sees a byte-identical prompt to the one it sees today. */
export const QUICK_MODE_INSTRUCTION = [
  'OUTPUT FORMAT (compact): reply with ONE tab-separated line and nothing else.',
  'To act:    A<TAB>tool_id<TAB>{"arg":"value"}<TAB>why<TAB>progress-so-far',
  'To finish: F<TAB>your answer<TAB>why<TAB>progress-so-far',
  'The third field of an A line is JSON. Fields after the first two may be empty, never omitted mid-line.',
].join('\n');

/** A line the compact decoder should be handed. Cheap and total — never throws on ordinary prose. */
export function looksCompact(text: string): boolean {
  const line = firstMeaningfulLine(text);
  return line !== null && /^[AF]\t/.test(line);
}

function firstMeaningfulLine(text: string): string | null {
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (t.length > 0) return t;
  }
  return null;
}

/**
 * Decode a compact line into the raw shape the ordinary decision validator expects.
 *
 * Returns null rather than throwing when the line is not compact after all: the caller falls back to the
 * JSON path, so a model that ignores the format instruction costs nothing but the fallback. A decoder
 * that threw would turn "the model answered in JSON anyway" into a failed turn.
 */
export function decodeQuickDecision(text: string): Record<string, unknown> | null {
  const line = firstMeaningfulLine(text);
  if (line === null) return null;
  const [kind, ...rest] = line.split('\t');
  if (kind !== 'A' && kind !== 'F') return null;

  /** An optional trailing field: present and non-empty, or absent. Never an empty string. */
  const field = (i: number, key: string): Record<string, string> => {
    const v = rest[i]?.trim();
    return v === undefined || v.length === 0 ? {} : { [key]: v };
  };

  if (kind === 'F') {
    // F <TAB> summary <TAB> rationale <TAB> memory
    return { action: 'finish', summary: rest[0]?.trim() ?? '', ...field(1, 'rationale'), ...field(2, 'memory') };
  }
  // A <TAB> tool <TAB> args-json <TAB> rationale <TAB> memory
  const tool = rest[0]?.trim();
  if (tool === undefined || tool.length === 0) return null;
  return {
    action: 'act',
    tool,
    args: parseArgs(rest[1]),
    ...field(2, 'rationale'),
    ...field(3, 'memory'),
  };
}

/** Args are JSON in one field. Unparseable becomes `{}` — the tool's own zod schema then refuses it with
 *  a real message, which is a better failure than a decode exception with no tool context. */
function parseArgs(raw: string | undefined): unknown {
  const t = raw?.trim();
  if (t === undefined || t.length === 0) return {};
  try {
    return JSON.parse(t);
  } catch {
    return {};
  }
}
