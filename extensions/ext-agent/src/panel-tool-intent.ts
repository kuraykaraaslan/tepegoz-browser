import type { AgentStrings } from './i18n';

/**
 * A raw tool id (`browser_get_page`) is not a sentence. The reasoning transcript reads far better
 * with the tool's *intent* ("Reading the page") — S8 PR8 A3's live intent label, derived
 * deterministically from the id with no model call.
 *
 * An id the dictionary doesn't cover (a newly added tool, an MCP tool with an arbitrary name) falls
 * back to a plain de-snaked phrase: the transcript never shows a bare `snake_case` identifier, but it
 * also never invents a friendly label for a tool it doesn't actually recognise. Callers keep the raw
 * id available on hover so nothing is lost.
 */
export function toolIntent(id: string, a: AgentStrings): string {
  const known = a.toolIntent as Record<string, string | undefined>;
  return known[id] ?? deSnake(id);
}

/** `browser_get_page` → `browser get page`. Readability only — not a translation. */
function deSnake(id: string): string {
  return id.replace(/_+/g, ' ').trim();
}
