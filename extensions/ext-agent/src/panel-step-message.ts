import type { Resources } from '@tepegoz/i18n';
import type { AgentStrings } from './i18n';
import type { AgentEvent } from './types';
import { toolIntent } from './panel-tool-intent';

/**
 * The StepFeed rows carry the runtime's raw prose — `browser_get_page: allow`, `browser_get_page ✓`,
 * `browser_update_page ✗` — which shows a bare `snake_case` id and an English decision word to every
 * user (S8 PR8 A3: "the StepFeed messages embed the id in prose, so applying [the intent label] there
 * is a parse, not a lookup").
 *
 * This is that parse: the three exact shapes the runtime emits (`agent-runtime-loop.ts`) → the
 * localized {@link toolIntent} plus a status glyph or a localized decision. Anything that does not
 * match one of the shapes (an MCP tool's own message, a future event kind) is returned untouched, so
 * this can only improve a row, never mangle one.
 */
const OK_RE = /^(\S+) ✓$/;
const ERROR_RE = /^(\S+) ✗$/;
const START_RE = /^(\S+): (allow|ask|deny)$/;

export function humanizeStepMessage(
  kind: AgentEvent['kind'],
  message: string,
  a: AgentStrings,
): string {
  if (kind === 'step_ok') {
    const m = OK_RE.exec(message);
    return m ? `${toolIntent(m[1]!, a)} ✓` : message;
  }
  if (kind === 'step_error') {
    const m = ERROR_RE.exec(message);
    return m ? `${toolIntent(m[1]!, a)} ✗` : message;
  }
  if (kind === 'step_start') {
    const m = START_RE.exec(message);
    if (m === null) return message;
    const intent = toolIntent(m[1]!, a);
    // `allow` is the ordinary case and adds nothing; `ask` / `deny` are the ones a reader needs.
    return m[2] === 'allow' ? intent : `${intent} · ${a.stepDecision[m[2] as 'ask' | 'deny']}`;
  }
  return message;
}

/** Same lookup `panel-modals.tsx`'s approval dialog already uses for a reason code's Permission Debug
 *  text — duplicated here (six lines) rather than imported, since the two files have no other reason to
 *  depend on each other and this is a stable, tiny table shape. */
function explainTitle(c: Resources, reason: string): string | null {
  const table = c.permissions as Record<string, { title: string } | undefined>;
  return table[reason]?.title ?? null;
}

/** `agent-runtime-loop.ts`'s audit handler stamps a `step_start` event's `detail` with the policy
 *  reason code (S6: "say why a call was allowed, asked about, or denied") and, when the advisory critic
 *  saw a divergence, an ` — intent divergence: …` suffix. The StepFeed showed the bare code — e.g.
 *  `read_allowed` — because nothing had ever looked it up; `panel-modals.tsx`'s approval dialog already
 *  has the exact same code → human title mapping for the SAME reason codes (`c.permissions`), just never
 *  applied here. `\S+` captures the whole code (reason codes are snake_case, no internal whitespace) and
 *  the rest of the string — the divergence suffix, or nothing — is preserved untouched. A code this
 *  build has no text for (an older journal entry, a future policy) is returned as-is, same "only
 *  improve, never mangle" rule as {@link humanizeStepMessage}. */
const DETAIL_RE = /^(\S+)(.*)$/;

export function humanizeStepDetail(detail: string | undefined, c: Resources): string | undefined {
  if (detail === undefined) return detail;
  const m = DETAIL_RE.exec(detail);
  if (m === null) return detail;
  const title = explainTitle(c, m[1]!);
  return title === null ? detail : `${title} (${m[1]!})${m[2]!}`;
}
