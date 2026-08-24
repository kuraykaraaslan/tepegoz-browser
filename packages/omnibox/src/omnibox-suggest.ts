/**
 * Pure, deterministic omnibox suggestion builder. The address bar is a DETERMINISTIC surface — it must
 * NEVER start an AI thread (Comet lesson). It composes unified suggestions from injected data (open
 * tabs + browsing history) plus the primary navigate/search action for the typed text, and supports
 * `tab:` / `history:` / `bookmark:` / `settings:` scope prefixes.
 *
 * No Electron, no IPC, no React — the host fetches history/tabs and feeds them in, so this is fully
 * unit-testable and reusable. Ranking is intentionally simple and stable (no time-of-day, no `Math.random`).
 */

import { foldForSearch } from '@tepegoz/i18n';
import { parseOmniboxCommand } from './omnibox-commands';
import { commandSuggestions } from './omnibox-suggest-commands';

export type OmniboxSuggestionKind =
  | 'navigate'
  | 'search'
  | 'history'
  | 'bookmark'
  | 'tab'
  | 'calc'
  | 'quick-setting'
  | 'command'
  | 'agent'
  | 'download'
  | 'skill';

export type OmniboxQuickSettingTarget = 'appearance' | 'language' | 'privacy';

/** What the omnibox does when a suggestion is chosen — dispatched via the component's callbacks. */
export type OmniboxAction =
  | { type: 'navigate'; input: string }
  | { type: 'activateTab'; tabId: string }
  | { type: 'calc'; formatted: string }
  | { type: 'openQuickSetting'; target: OmniboxQuickSettingTarget }
  /** Fill the omnibox with a command prefix — the discovery step, not an execution. */
  | { type: 'fillCommand'; prefix: string }
  /**
   * Hand a task to the agent. The ONE place the omnibox crosses into AI, and only ever from an
   * explicitly typed `@agent` — never inferred from text that happens to look like a question.
   */
  | { type: 'agentTask'; task: string }
  | { type: 'openDownload'; id: string }
  | { type: 'runSkill'; id: string };

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

export interface OmniboxBookmarkCandidate {
  url: string;
  title: string;
}

export interface OmniboxSuggestSources {
  /** Currently open tabs (host filters out the active tab if desired). */
  tabs: readonly OmniboxTabCandidate[];
  /** History rows, pre-filtered by the host's `history:search` (re-filtered here defensively). */
  history: readonly OmniboxHistoryCandidate[];
  /** Bookmarks (host passes the full list; filtered + capped here). */
  bookmarks?: readonly OmniboxBookmarkCandidate[];
  /** Downloads, for `@download`. Absent until the host wires them — the command then finds nothing
   *  rather than pretending, which is the same contract `bookmarks` already has. */
  downloads?: readonly OmniboxDownloadCandidate[];
  /** Saved agent skills, for `@skill`. */
  skills?: readonly OmniboxSkillCandidate[];
}

export interface OmniboxDownloadCandidate {
  id: string;
  /** File name shown as the primary line. */
  name: string;
  /** Where it came from, shown as the subtitle. */
  source: string;
}

export interface OmniboxSkillCandidate {
  id: string;
  name: string;
  description?: string;
}

/** Localized hints the builder needs, so the package stays i18n-agnostic. */
export interface OmniboxSuggestLabels {
  /** Subtitle for the "search the web for <text>" suggestion, e.g. "Search the web". */
  search: string;
  /** Subtitle for a switch-to-open-tab suggestion, e.g. "Switch to tab". */
  switchToTab: string;
  /** Subtitle for a bookmark suggestion, e.g. "Bookmark". */
  bookmark: string;
  /** Subtitle for quick settings suggestions, e.g. "Settings". */
  quickSettings: string;
  quickAppearance: string;
  quickLanguage: string;
  quickPrivacy: string;
  /** Subtitle on a `@…` command in the discovery list, e.g. "Command". */
  command: string;
  /** Primary line for the `@agent` action, with `{task}` replaced by what was typed. */
  agentAsk: string;
  /** Subtitle under it — states plainly that this hands the text to the agent. */
  agentHint: string;
  /** Shown when `@agent` has no task typed yet. */
  agentEmpty: string;
  /** One-line descriptions of each command, for the discovery list. */
  commandAgent: string;
  commandDownload: string;
  commandSkill: string;
  /** Subtitles for `@download` / `@skill` results. */
  download: string;
  skill: string;
  /** Shown when a command matched nothing. */
  commandNoResults: string;
}

export type OmniboxScope = 'all' | 'tab' | 'history' | 'bookmark' | 'settings';

/** A parsed omnibox query: the scope prefix (if any) and the remaining search term. */
export interface OmniboxQuery {
  scope: OmniboxScope;
  term: string;
}

const SCOPE_PREFIXES: ReadonlyArray<readonly [string, OmniboxScope]> = [
  ['tab:', 'tab'],
  ['history:', 'history'],
  ['bookmark:', 'bookmark'],
  ['settings:', 'settings'],
];

const QUICK_SETTINGS: ReadonlyArray<{
  target: OmniboxQuickSettingTarget;
  label: keyof Pick<OmniboxSuggestLabels, 'quickAppearance' | 'quickLanguage' | 'quickPrivacy'>;
  terms: readonly string[];
}> = [
  {
    target: 'appearance',
    label: 'quickAppearance',
    terms: ['appearance', 'theme', 'color', 'glass', 'görünüm', 'gorunum', 'tema', 'renk', 'cam'],
  },
  {
    target: 'language',
    label: 'quickLanguage',
    terms: ['language', 'lang', 'locale', 'region', 'dil', 'bölge', 'bolge'],
  },
  {
    target: 'privacy',
    label: 'quickPrivacy',
    terms: [
      'privacy',
      'telemetry',
      'history',
      'gizlilik',
      'mahremiyet',
      'telemetri',
      'geçmiş',
      'gecmis',
    ],
  },
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
  return haystacks.some((h) => foldForSearch(h).includes(needle));
}

/** The typed text itself: navigate a URL, else search the web. Only shown in the unscoped view. */
function primarySuggestion(term: string, labels: OmniboxSuggestLabels): OmniboxSuggestion {
  if (looksNavigable(term)) {
    return {
      key: 'primary',
      kind: 'navigate',
      title: term,
      action: { type: 'navigate', input: term },
    };
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

/** Deterministic shortcuts into high-frequency settings panels. */
function quickSettingSuggestions(
  needle: string,
  labels: OmniboxSuggestLabels,
): OmniboxSuggestion[] {
  return QUICK_SETTINGS.filter((entry) => matches(needle, labels[entry.label], ...entry.terms)).map(
    (entry) => ({
      key: `quick-setting:${entry.target}`,
      kind: 'quick-setting',
      title: labels[entry.label],
      subtitle: labels.quickSettings,
      action: { type: 'openQuickSetting', target: entry.target },
    }),
  );
}

/** Bookmarks matching the needle → navigate suggestions (curated, so ranked above history). */
function bookmarkSuggestions(
  bookmarks: readonly OmniboxBookmarkCandidate[],
  needle: string,
  labels: OmniboxSuggestLabels,
): OmniboxSuggestion[] {
  return bookmarks
    .filter((b) => matches(needle, b.title, b.url))
    .map((b) => ({
      key: `bookmark:${b.url}`,
      kind: 'bookmark',
      title: b.title.length > 0 ? b.title : b.url,
      subtitle: labels.bookmark,
      action: { type: 'navigate', input: b.url },
    }));
}

/** History matching the needle → navigate suggestions, most-visited first. */
function historySuggestions(
  history: OmniboxSuggestSources['history'],
  needle: string,
): OmniboxSuggestion[] {
  return [...history]
    .sort((a, b) => b.visitCount - a.visitCount)
    .filter((entry) => matches(needle, entry.title, entry.url))
    .map((entry) => ({
      key: `history:${entry.url}`,
      kind: 'history',
      title: entry.title.length > 0 ? entry.title : entry.url,
      subtitle: entry.url,
      action: { type: 'navigate', input: entry.url },
    }));
}

/**
 * Drop later suggestions whose navigate target (URL / typed text) already appeared. Runs in priority
 * order, so the first (higher-ranked) copy wins — the typed URL beats a bookmark beats a history row.
 * `activateTab` suggestions live in a separate id space and are never collapsed.
 */
function dedupeByNavTarget(suggestions: readonly OmniboxSuggestion[]): OmniboxSuggestion[] {
  const seen = new Set<string>();
  const out: OmniboxSuggestion[] = [];
  for (const s of suggestions) {
    if (s.action.type === 'navigate') {
      if (seen.has(s.action.input)) continue;
      seen.add(s.action.input);
    }
    out.push(s);
  }
  return out;
}

/**
 * Build the unified, ordered suggestion list for a typed omnibox value.
 *
 * Order (unscoped): primary navigate/search action → quick settings → open tabs → bookmarks → history.
 * Scoped (`settings:` / `tab:` / `history:` / `bookmark:`) narrows to a single source and drops the
 * primary action.
 * Duplicate navigate targets are collapsed and the list is capped at {@link MAX_OMNIBOX_SUGGESTIONS}.
 */
export function buildOmniboxSuggestions(
  query: string,
  sources: OmniboxSuggestSources,
  labels: OmniboxSuggestLabels,
): OmniboxSuggestion[] {
  // Command mode is checked FIRST and returns on its own. `@` is not a scope prefix — it is a
  // different mode with a different rule (it never emits a navigate action), so letting it fall
  // through to the ordinary path is exactly the leak this mode exists to prevent.
  const command = parseOmniboxCommand(query);
  if (command.kind !== 'none') return commandSuggestions(command, sources, labels);

  const { scope, term } = parseOmniboxQuery(query);
  const needle = foldForSearch(term);

  // Nothing typed and no scope prefix → no suggestions. A bare `tab:` / `history:` / `bookmark:`
  // (empty term) still lists everything in that source, which is the point of the prefix.
  if (scope === 'all' && term.length === 0) return [];

  const out: OmniboxSuggestion[] = [];
  if (scope === 'all') out.push(primarySuggestion(term, labels));
  if (scope === 'all' || scope === 'settings') out.push(...quickSettingSuggestions(needle, labels));
  if (scope === 'all' || scope === 'tab') out.push(...tabSuggestions(sources.tabs, needle, labels));
  if (scope === 'all' || scope === 'bookmark') {
    out.push(...bookmarkSuggestions(sources.bookmarks ?? [], needle, labels));
  }
  if (scope === 'all' || scope === 'history')
    out.push(...historySuggestions(sources.history, needle));

  return dedupeByNavTarget(out).slice(0, MAX_OMNIBOX_SUGGESTIONS);
}
