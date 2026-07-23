import { sanitizeContent, wrapUntrustedContent } from '@tepegoz/tool-executor';
import type { WebFetchResult, WebSearchResult } from './index';

/**
 * AI-5 content guard for the WEB tools. `browser_*` perception has always run page text through
 * {@link sanitizeContent} + {@link wrapUntrustedContent} (`browser-tools/perception.ts`), but the web
 * tools returned their payload as a STRUCTURED OBJECT, which meant two things at once:
 *
 *  1. fetched/searched text reached the model **unfenced** — no NFKC folding, no injection redaction,
 *     no anti-injection footer — even though it is the least trusted input in the product (an arbitrary
 *     URL the agent chose, or a search snippet any site can rank for); and
 *  2. it never entered the TaintTracker: the runtime only records `result.content` when it is a
 *     `string` (`agent-runtime-loop.ts` `contentFromResult`), so an object `content` silently skipped
 *     taint, and a tainted-argument check downstream could not see it.
 *
 * Emitting a guarded STRING fixes both — the same shape `browser_get_page` already returns. The
 * structured data is NOT lost: it stays in the `artifacts`/`pageRefs` envelope slots, so navigation
 * (and AI-7 evidence gating) still reads verbatim URLs.
 *
 * Pure + host-free so it is unit-testable without network access.
 */

/** Cap for fetched page text before it reaches the model (mirrors browser-tools' MAX_PAGE_CHARS). */
export const MAX_WEB_FETCH_CHARS = 20_000;

/** Cap for a single rendered search snippet — a long snippet is a cheap way to flood the context. */
export const MAX_SNIPPET_CHARS = 400;

export interface GuardedWebContent {
  /** Sanitized, capped, XML-wrapped text — safe to hand to the model, and the taint source. */
  content: string;
  /** Sanitizer flags (zero_width/bidi/mixed_script/injection) — the taint + audit signal. */
  flags: string[];
}

/** Cap → sanitize + injection-guard → wrap fetched page text. Fenced against the FINAL url, so the
 *  `source=` attribute reflects where the bytes actually came from after any redirect. */
export function buildWebFetchContent(result: WebFetchResult): GuardedWebContent {
  const { text, flags } = sanitizeContent(result.text.slice(0, MAX_WEB_FETCH_CHARS));
  return { content: wrapUntrustedContent(text, result.finalUrl), flags };
}

/** Render search hits as a compact, readable listing. URLs are emitted verbatim (the model needs them
 *  to navigate); the attacker-controlled prose around them is what the guard then scrubs. */
export function renderSearchResultsText(
  query: string,
  results: readonly WebSearchResult[],
): string {
  if (results.length === 0) return `No web results for "${query}".`;
  const lines = results.map((result, index) => {
    const head = `${String(index + 1)}. ${result.title} — ${result.url}`;
    const snippet = result.snippet?.slice(0, MAX_SNIPPET_CHARS);
    return snippet !== undefined && snippet.length > 0 ? `${head}\n   ${snippet}` : head;
  });
  return `Web results for "${query}":\n${lines.join('\n')}`;
}

/**
 * Sanitize + wrap a search result listing. Titles and snippets are page-authored text that any site
 * can get in front of the agent by ranking for a query — exactly the injection surface AI-5 fences on
 * the browser path, so it is fenced identically here.
 */
export function buildWebSearchContent(
  query: string,
  results: readonly WebSearchResult[],
): GuardedWebContent {
  const { text, flags } = sanitizeContent(renderSearchResultsText(query, results));
  return { content: wrapUntrustedContent(text), flags };
}

/** Append the sanitizer verdict to a tool summary when the guard actually tripped, so a hostile page
 *  is visible in the run log/journal instead of being silently scrubbed. */
export function withGuardFlags(summary: string, flags: readonly string[]): string {
  return flags.length > 0 ? `${summary} [content guard: ${flags.join(', ')}]` : summary;
}
