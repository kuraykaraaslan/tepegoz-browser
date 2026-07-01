/**
 * Pure, deterministic omnibox suggestion builder. The address bar is a DETERMINISTIC surface — it must
 * NEVER start an AI thread (Comet lesson). It composes unified suggestions from injected data (open
 * tabs + browsing history) plus the primary navigate/search action for the typed text, and supports
 * `tab:` / `history:` scope prefixes.
 *
 * No Electron, no IPC, no React — the host fetches history/tabs and feeds them in, so this is fully
 * unit-testable and reusable. Ranking is intentionally simple and stable (no time-of-day, no `Math.random`).
 */

export type OmniboxSuggestionKind = 'navigate' | 'search' | 'history' | 'tab' | 'calc';

/** What the omnibox does when a suggestion is chosen — dispatched via the component's callbacks. */
export type OmniboxAction =
  | { type: 'navigate'; input: string }
  | { type: 'activateTab'; tabId: string }
  | { type: 'calc'; formatted: string };

export interface OmniboxSuggestion {
  /** Stable key for React lists + keyboard selection. */
  key: string;
  kind: OmniboxSuggestionKind;
  /** Primary line (title / typed text). */
  title: string;
  /** Secondary line (URL or a localized hint), optional. */
  subtitle?: string;
  action: OmniboxAction;
}

export interface OmniboxTabCandidate {
  id: string;
  title: string;
  url: string;
}

export interface OmniboxHistoryCandidate {
  url: string;
  title: string;
  visitCount: number;
}

export interface OmniboxSuggestSources {
  /** Currently open tabs (host filters out the active tab if desired). */
  tabs: readonly OmniboxTabCandidate[];
  /** History rows, pre-filtered by the host's `history:search` (re-filtered here defensively). */
  history: readonly OmniboxHistoryCandidate[];
}

/** Localized hints the builder needs, so the package stays i18n-agnostic. */
export interface OmniboxSuggestLabels {
  /** Subtitle for the "search the web for <text>" suggestion, e.g. "Search the web". */
  search: string;
  /** Subtitle for a switch-to-open-tab suggestion, e.g. "Switch to tab". */
  switchToTab: string;
}

export type OmniboxScope = 'all' | 'tab' | 'history';

/** A parsed omnibox query: the scope prefix (if any) and the remaining search term. */
export interface OmniboxQuery {
  scope: OmniboxScope;
  term: string;
}

const SCOPE_PREFIXES: ReadonlyArray<readonly [string, OmniboxScope]> = [
  ['tab:', 'tab'],
  ['history:', 'history'],
];

/** Split a leading `tab:` / `history:` scope prefix off the raw query. Prefix match is case-insensitive. */
export function parseOmniboxQuery(query: string): OmniboxQuery {
  const raw = query.trimStart();
  const lower = raw.toLowerCase();
  for (const [prefix, scope] of SCOPE_PREFIXES) {
    if (lower.startsWith(prefix)) {
      return { scope, term: raw.slice(prefix.length).trim() };
    }
  }
  return { scope: 'all', term: query.trim() };
}

/** Max suggestions surfaced at once (keeps the dropdown scannable, Chrome-like). */
export const MAX_OMNIBOX_SUGGESTIONS = 8;

/**
 * A display-only heuristic for "would this navigate as a URL vs. become a web search?". The authoritative
 * scheme allow-list lives in `@tepegoz/navigation` (main process); this only decides which icon/label to
 * show, so a small local copy avoids coupling the leaf UI to the navigation library.
 */
export function looksNavigable(input: string): boolean {
  const s = input.trim();
  if (s.length === 0 || s.includes(' ')) return s.length > 0 && /^https?:\/\//i.test(s);
  if (/^https?:\/\//i.test(s)) return true;
  const host = s.split('/')[0] ?? s;
  if (/^localhost(:\d+)?$/i.test(host)) return true;
  if (/^[^\s:]+:\d+$/.test(host)) return true; // host:port (incl. IP:port)
  return /^[^\s.]+(\.[^\s.]+)+$/.test(host); // dotted domain or IP
}

function matches(needle: string, ...haystacks: string[]): boolean {
  if (needle.length === 0) return true;
  return haystacks.some((h) => h.toLowerCase().includes(needle));
}

/** The typed text itself: navigate a URL, else search the web. Only shown in the unscoped view. */
function primarySuggestion(term: string, labels: OmniboxSuggestLabels): OmniboxSuggestion {
  if (looksNavigable(term)) {
    return { key: 'primary', kind: 'navigate', title: term, action: { type: 'navigate', input: term } };
  }
  return {
    key: 'primary',
    kind: 'search',
    title: term,
    subtitle: labels.search,
    action: { type: 'navigate', input: term },
  };
}

/** Open tabs matching the needle → switch-to-tab suggestions. */
function tabSuggestions(
  tabs: OmniboxSuggestSources['tabs'],
  needle: string,
  labels: OmniboxSuggestLabels,
): OmniboxSuggestion[] {
  return tabs
    .filter((tab) => matches(needle, tab.title, tab.url))
    .map((tab) => ({
      key: `tab:${tab.id}`,
      kind: 'tab',
      title: tab.title.length > 0 ? tab.title : tab.url,
      subtitle: labels.switchToTab,
      action: { type: 'activateTab', tabId: tab.id },
    }));
}

/** History matching the needle → navigate suggestions, most-visited first, duplicate URLs collapsed. */
function historySuggestions(
  history: OmniboxSuggestSources['history'],
  needle: string,
): OmniboxSuggestion[] {
  const seenUrls = new Set<string>();
  const out: OmniboxSuggestion[] = [];
  for (const entry of [...history].sort((a, b) => b.visitCount - a.visitCount)) {
    if (seenUrls.has(entry.url) || !matches(needle, entry.title, entry.url)) continue;
    seenUrls.add(entry.url);
    out.push({
      key: `history:${entry.url}`,
      kind: 'history',
      title: entry.title.length > 0 ? entry.title : entry.url,
      subtitle: entry.url,
      action: { type: 'navigate', input: entry.url },
    });
  }
  return out;
}

/**
 * Build the unified, ordered suggestion list for a typed omnibox value.
 *
 * Order (unscoped): primary navigate/search action → matching open tabs → matching history.
 * Scoped (`tab:` / `history:`) narrows to a single source and drops the primary action. Duplicate URLs
 * are collapsed and the list is capped at {@link MAX_OMNIBOX_SUGGESTIONS}.
 */
export function buildOmniboxSuggestions(
  query: string,
  sources: OmniboxSuggestSources,
  labels: OmniboxSuggestLabels,
): OmniboxSuggestion[] {
  const { scope, term } = parseOmniboxQuery(query);
  const needle = term.toLowerCase();

  // Nothing typed and no scope prefix → no suggestions. A bare `tab:` / `history:` (empty term) still
  // lists everything in that source, which is the point of the prefix.
  if (scope === 'all' && term.length === 0) return [];

  const out: OmniboxSuggestion[] = [];
  if (scope === 'all') out.push(primarySuggestion(term, labels));
  if (scope !== 'history') out.push(...tabSuggestions(sources.tabs, needle, labels));
  if (scope !== 'tab') out.push(...historySuggestions(sources.history, needle));

  // Collapse a history row that duplicates the primary navigate target (typed a full URL that's visited).
  const primaryNav = out.find((s) => s.key === 'primary' && s.kind === 'navigate');
  const deduped =
    primaryNav === undefined
      ? out
      : out.filter(
          (s) =>
            s.key === 'primary' ||
            s.kind !== 'history' ||
            (s.action.type === 'navigate' && s.action.input !== primaryNav.title),
        );

  return deduped.slice(0, MAX_OMNIBOX_SUGGESTIONS);
}
