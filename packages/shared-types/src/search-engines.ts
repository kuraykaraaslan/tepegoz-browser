/**
 * The built-in search engines a user can pick as their default (Settings → Preferences). A self-
 * contained, zod-free / preload-safe module (like `providers.ts`) so both the renderer and main can
 * import it. `name` is a brand name (shown untranslated); `searchUrlTemplate` has a single `{q}`
 * placeholder replaced with the URL-encoded query. Adding a custom engine is a later feature — the UI
 * shows it as a placeholder for now.
 */
export interface SearchEngine {
  /** Stable id persisted in `Preferences.searchEngineId`. */
  id: string;
  /** Brand name (shown untranslated in the picker). */
  name: string;
  /** Query URL with a single `{q}` placeholder. */
  searchUrlTemplate: string;
}

/** The top ~10 engines, in menu order. `google` is the default. */
export const SEARCH_ENGINES: readonly SearchEngine[] = [
  { id: 'google', name: 'Google', searchUrlTemplate: 'https://www.google.com/search?q={q}' },
  { id: 'bing', name: 'Bing', searchUrlTemplate: 'https://www.bing.com/search?q={q}' },
  { id: 'duckduckgo', name: 'DuckDuckGo', searchUrlTemplate: 'https://duckduckgo.com/?q={q}' },
  { id: 'brave', name: 'Brave Search', searchUrlTemplate: 'https://search.brave.com/search?q={q}' },
  { id: 'yahoo', name: 'Yahoo', searchUrlTemplate: 'https://search.yahoo.com/search?p={q}' },
  { id: 'yandex', name: 'Yandex', searchUrlTemplate: 'https://yandex.com/search/?text={q}' },
  { id: 'ecosia', name: 'Ecosia', searchUrlTemplate: 'https://www.ecosia.org/search?q={q}' },
  { id: 'startpage', name: 'Startpage', searchUrlTemplate: 'https://www.startpage.com/sp/search?query={q}' },
  { id: 'baidu', name: 'Baidu', searchUrlTemplate: 'https://www.baidu.com/s?wd={q}' },
  { id: 'qwant', name: 'Qwant', searchUrlTemplate: 'https://www.qwant.com/?q={q}' },
];

/** The default engine id when none is configured. */
export const DEFAULT_SEARCH_ENGINE_ID = 'google';

/** Google, guaranteed present (the list's first entry) — the ultimate fallback. */
const FALLBACK_ENGINE: SearchEngine = {
  id: 'google',
  name: 'Google',
  searchUrlTemplate: 'https://www.google.com/search?q={q}',
};

/** The engine for `id`, falling back to the default engine (never undefined). */
export function searchEngineById(id: string): SearchEngine {
  return (
    SEARCH_ENGINES.find((e) => e.id === id) ??
    SEARCH_ENGINES.find((e) => e.id === DEFAULT_SEARCH_ENGINE_ID) ??
    FALLBACK_ENGINE
  );
}

/** Build a search URL for `query` using engine `id` (query is URL-encoded). */
export function buildSearchUrl(id: string, query: string): string {
  return searchEngineById(id).searchUrlTemplate.replace('{q}', encodeURIComponent(query));
}
