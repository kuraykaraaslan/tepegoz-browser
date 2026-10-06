import { sanitizeContent, wrapUntrustedContent } from '@tepegoz/tool-executor';

/**
 * S2/PR7 P3-a — a bounded DOM query tool, behind `browser_search_nodes`.
 *
 * `browser_get_elements`/`browser_search_elements` answer "what can I ACT on" — the actionable-element
 * set the render-DOM perception scan already filtered down to buttons/links/inputs. This answers a
 * broader question: "does the page contain a node matching THIS CSS selector or XPath expression" —
 * which can match things the actionable set never tracks at all (a plain `<div>` with no interactable
 * role, a landmark, a table cell). The query text is DATA passed to a FIXED, contributor-authored script
 * (`dom-query-script.ts`'s `buildDomQueryExpression`) that runs `querySelectorAll`/`document.evaluate` —
 * never a model-authored expression evaluated as code — so this does not reopen ADR-0026, exactly like
 * `browser_search_elements`'s own framing.
 *
 * Output is deliberately narrow: `{ tag, ref, attributes }` per match — no `innerHTML`, no `innerText`,
 * no arbitrary code capability. `ref` resolves through the SAME `ref` space `browser_update_page` and
 * `browser_get_styles` already act on: an element the query finds that already has a tracked ref (from
 * the tab's latest snapshot) gets that ref back; an untracked element gets a FRESH ref minted into the
 * same per-tab registry (light-DOM only — see `dom-query-script.ts`'s `computeNodePath`); an element the
 * host could not mint a ref for reports `ref: null` rather than a fabricated one that would not resolve.
 *
 * `read`-class, `CapabilityRegistry`-registered, fenced as untrusted (AI-5) exactly like its siblings:
 * tags and attribute values are page-controlled, so every one is sanitized and capped, not just an
 * aggregate `content` block.
 */

/** "At most ~200" (phase-s2-perception-v2.md P3-a) — the same bound `MAX_INTERACTABLE_ELEMENTS` uses
 *  for the actionable-element set, so a query never returns a larger listing than a full page read would. */
export const MAX_QUERY_MATCHES = 200;
/** Longest single page-controlled attribute value rendered (mirrors `MAX_STYLE_VALUE_CHARS`). */
const MAX_QUERY_ATTR_VALUE_CHARS = 200;
/** Defensive cap on how many attributes of one element are rendered — a pathological/hostile element
 *  with hundreds of attributes must not blow up the listing. */
const MAX_QUERY_ATTRS_PER_ELEMENT = 40;

/** One matched node, already ref-resolved by the host. */
export interface QueryElementMatch {
  tag: string;
  /** `null` means the element was found but no ref could be minted for it (see `dom-query.electron.ts`)
   *  — an honest "seen but not addressable", never a fabricated ref that would fail to resolve later. */
  ref: number | null;
  attributes: Record<string, string>;
}

/** What the host resolves for one query — refs already minted/reused, matches already capped to
 *  {@link MAX_QUERY_MATCHES}. `ok: false` means the query itself was malformed (bad CSS selector, invalid
 *  XPath) or could not be run at all (destroyed tab, no isolated-world result) — never a thrown exception. */
export interface QueryProbe {
  ok: boolean;
  error?: string;
  /** Uncapped match count, so `truncated` can be reported honestly even though `matches` is capped. */
  total: number;
  matches: QueryElementMatch[];
}

/** The report `browser_search_nodes` returns for one query. */
export interface QueryReport {
  url: string;
  query: string;
  queryType: 'css' | 'xpath';
  ok: boolean;
  error?: string;
  /** How many matches are actually listed (≤ {@link MAX_QUERY_MATCHES}). */
  count: number;
  /** The TRUE match count on the page, uncapped. */
  totalMatches: number;
  truncated: boolean;
  matches: QueryElementMatch[];
  /** Sanitized, XML-fenced human-readable listing of `matches` — safe to hand to the model. */
  content: string;
  /** Sanitizer flags aggregated over every rendered attribute value (zero_width/bidi/mixed_script/injection). */
  flags: string[];
}

/** Sanitize (zero-width/bidi strip + injection redaction, AI-5) and length-cap ONE page-influenced
 *  attribute value. Applied per-attribute, not just to the rendered `content` block. */
function cleanAttrValue(raw: string): { text: string; flags: string[] } {
  return sanitizeContent(raw.slice(0, MAX_QUERY_ATTR_VALUE_CHARS));
}

/** Tag names are constrained by the HTML/custom-element grammar, but every page-sourced string is still
 *  sanitized and capped, same discipline as the console/network/style siblings. */
function cleanTag(raw: string): string {
  return sanitizeContent(raw.slice(0, 64)).text;
}

function renderMatch(m: QueryElementMatch): string {
  const attrPairs = Object.entries(m.attributes)
    .slice(0, MAX_QUERY_ATTRS_PER_ELEMENT)
    .map(([k, v]) => `${k}="${v}"`)
    .join(' ');
  const refLabel = m.ref === null ? 'none' : String(m.ref);
  return attrPairs.length > 0
    ? `<${m.tag} ref=${refLabel} ${attrPairs}>`
    : `<${m.tag} ref=${refLabel}>`;
}

/**
 * Shape one query's raw {@link QueryProbe} into the model-facing {@link QueryReport}: sanitize every
 * tag/attribute value, cap the listing at {@link MAX_QUERY_MATCHES}, and render + wrap the content block.
 * Pure and Electron-free, mirroring `summarizeStyle`/`summarizeConsole`/`summarizeNetwork`.
 */
export function summarizeQuery(
  probe: QueryProbe,
  query: string,
  queryType: 'css' | 'xpath',
  pageUrl: string,
): QueryReport {
  if (!probe.ok) {
    const { text } = sanitizeContent((probe.error ?? 'the query could not be run').slice(0, 200));
    return {
      url: pageUrl,
      query,
      queryType,
      ok: false,
      error: text,
      count: 0,
      totalMatches: 0,
      truncated: false,
      matches: [],
      content: wrapUntrustedContent(`(query failed: ${text})`, pageUrl),
      flags: [],
    };
  }

  const flags: string[] = [];
  const cleanedMatches: QueryElementMatch[] = probe.matches.slice(0, MAX_QUERY_MATCHES).map((m) => {
    const tag = cleanTag(m.tag);
    const attributes: Record<string, string> = {};
    for (const [k, v] of Object.entries(m.attributes).slice(0, MAX_QUERY_ATTRS_PER_ELEMENT)) {
      const cleaned = cleanAttrValue(v);
      attributes[k] = cleaned.text;
      flags.push(...cleaned.flags);
    }
    return { tag, ref: m.ref, attributes };
  });

  const listing =
    cleanedMatches.length === 0 ? '(no matches)' : cleanedMatches.map(renderMatch).join('\n');
  const guarded = sanitizeContent(listing);
  const allFlags = [...new Set([...flags, ...guarded.flags])];

  return {
    url: pageUrl,
    query,
    queryType,
    ok: true,
    count: cleanedMatches.length,
    totalMatches: probe.total,
    truncated: probe.total > cleanedMatches.length,
    matches: cleanedMatches,
    content: wrapUntrustedContent(guarded.text, pageUrl),
    flags: allFlags,
  };
}
