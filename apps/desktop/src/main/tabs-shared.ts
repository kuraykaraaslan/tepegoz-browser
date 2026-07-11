import {
  type BrowserWindow,
  type BrowserWindowConstructorOptions,
  type WebContents,
  type WebContentsView,
} from 'electron';
import {
  INTERNAL_BOOKMARKS_URL,
  INTERNAL_DOWNLOADS_URL,
  INTERNAL_EXTENSIONS_URL,
  INTERNAL_HISTORY_URL,
  INTERNAL_NEWTAB_URL,
  INTERNAL_TASKS_URL,
  INTERNAL_UPLOADS_URL,
  type TabsState,
} from '@tepegoz/desktop-ipc';
import { type TabGroup, type TabRecord } from '@tepegoz/tab-engine';
import { allSearchEngines, buildSearchUrl } from '@tepegoz/shared-types/search-engines';
import PreferenceStore from '@tepegoz/preferences';
import { mainLocale, mainStrings } from './lib/i18n-main';
import { extensionIdFromPageUrl, extensionLabel, manifestById } from '../shared/extensions';
import { GESTURE_ACTIVATION_MS } from './tabs-popup-policy';

/**
 * Window-agnostic constants, types, helpers and session-wide shared state for the tab model. Split out
 * of `tabs.ts` (ADR-0010 250-line cap); none of this depends on a specific `WindowTabs` instance. The
 * per-window `WindowTabs` layers and the `TabManager` facade both import from here.
 */

/** Fallback home / new-tab URL when the `homepageUrl` preference is blank. */
const DEFAULT_HOME_URL = 'https://duckduckgo.com/';
/** The current home / new-tab page URL (from prefs, falling back to the built-in default when blank). */
export function homeUrl(): string {
  return PreferenceStore.getAll().homepageUrl || DEFAULT_HOME_URL;
}
/** Resolve a typed omnibox query to a search URL via the selected engine (built-in or user-custom). */
export function searchUrlForQuery(query: string): string {
  const prefs = PreferenceStore.getAll();
  return buildSearchUrl(prefs.searchEngineId, query, allSearchEngines(prefs.customSearchEngines));
}
/** Cap for page-controlled titles before they reach the history DB (hostile-page DoS guard). */
export const MAX_TITLE_LENGTH = 2048;
/** The isolated session partition every browsed page lives in (shared with the User-Agent switcher). */
export const BROWSING_PARTITION = 'persist:tepegoz-web';

/** Secure window options for page-opened popups (child windows): the same hardened, chrome-less profile
 *  and isolated browsing partition as a tab's view — no preload, so the page never reaches the bridge. */
export const POPUP_WINDOW_OPTIONS: BrowserWindowConstructorOptions = {
  webPreferences: {
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false,
    webSecurity: true,
    partition: BROWSING_PARTITION,
  },
};

/** Notified after each committed top-level navigation: `(url, browsedWebContents, ownerWindow)`. The
 *  owner window lets an observer (e.g. autofill) target the chrome window that hosts the browsed page. */
export type NavigationObserver = (url: string, webContents: WebContents, owner: BrowserWindow) => void;

/** A tab pulled out of one window, ready to be adopted by another (tear-off / merge). The
 *  `WebContentsView` (and its live webContents) is kept ALIVE across the move — never reloaded. */
export interface DetachedTab {
  record: TabRecord;
  /** The live view for a `web` tab; `null` for a view-less internal tab. */
  view: WebContentsView | null;
  /** The source group's metadata when the tab was grouped (recreated in the destination). */
  group: TabGroup | null;
}

// ── Session-wide shared state (window-agnostic; shared by every WindowTabs instance) ───────────────

/** Recently-closed web-tab URLs (LIFO) for reopen-closed-tab (Ctrl+Shift+T). In-memory, session-scoped
 *  and shared across all windows (matches Chrome's session-wide reopen stack). */
export const closedUrls: string[] = [];
/** Observers notified after every committed top-level navigation (did-stop-loading), across all windows. */
export const navigationObservers = new Set<NavigationObserver>();
/** Last discrete user-input time per browsed webContents — the popup blocker only blocks popups that
 *  open WITHOUT a recent gesture. Keyed weakly so entries vanish when the webContents is GC'd. */
export const lastGestureAt = new WeakMap<WebContents, number>();

/** Whether `wc` had a discrete user input within the activation window (i.e. the popup it just tried to
 *  open is user-initiated, not an unsolicited auto-popup). */
export function hadRecentGesture(wc: WebContents): boolean {
  const at = lastGestureAt.get(wc);
  return at !== undefined && Date.now() - at < GESTURE_ACTIVATION_MS;
}

export const EMPTY_TABS_STATE: TabsState = {
  tabs: [],
  groups: [],
  activeId: null,
  canGoBack: false,
  canGoForward: false,
};

export function internalBaseUrl(url: string): string {
  return url.split('#', 1)[0] ?? url;
}

export function internalTitleFor(url: string): string {
  const r = mainStrings();
  const baseUrl = internalBaseUrl(url);
  if (baseUrl === INTERNAL_NEWTAB_URL) return r.browser.untitled;
  if (baseUrl === INTERNAL_EXTENSIONS_URL) return r.extensions.title;
  if (baseUrl === INTERNAL_HISTORY_URL) return r.history.title;
  if (baseUrl === INTERNAL_DOWNLOADS_URL) return r.downloads.title;
  if (baseUrl === INTERNAL_UPLOADS_URL) return r.uploads.title;
  if (baseUrl === INTERNAL_TASKS_URL) return r.tasks.title;
  if (baseUrl === INTERNAL_BOOKMARKS_URL) return r.bookmarks.title;
  // An extension `page` surface (tepegoz://<extension-id>) is titled from the extension's manifest.
  const extId = extensionIdFromPageUrl(baseUrl);
  if (extId !== null) {
    const manifest = manifestById(extId);
    if (manifest !== undefined) return extensionLabel(manifest, mainLocale()).name;
  }
  return r.common.settings;
}
