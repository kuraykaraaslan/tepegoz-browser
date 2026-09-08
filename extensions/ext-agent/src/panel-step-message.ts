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

export function humanizeStepMessage(kind: AgentEvent['kind'], message: string, a: AgentStrings): string {
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
