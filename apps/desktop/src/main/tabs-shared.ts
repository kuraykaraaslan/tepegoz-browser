import {
  type BrowserWindow,
  type BrowserWindowConstructorOptions,
  type Rectangle,
  type Session,
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
import { DIRECT_PARTITION, type TabGroup, type TabRecord } from '@tepegoz/tab-engine';
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
/**
 * The isolated session partition every UNTUNNELED browsed page lives in. Re-exported from
 * `@tepegoz/tab-engine` so the name has exactly one definition: `partitionKeyFor` derives every Phase 5
 * `--conn-{id}` tunnel partition from this same base, and a second literal here would let the two drift
 * into two different cookie jars.
 */
export const BROWSING_PARTITION = DIRECT_PARTITION;

/**
 * Secure window options for page-opened popups (child windows): the same hardened, chrome-less profile
 * as a tab's view — no preload, so the page never reaches the bridge.
 *
 * Takes the OPENER'S session rather than naming a partition. This used to be a constant pinned to
 * {@link BROWSING_PARTITION}, which meant a `window.open()` from a tunnel-bound page opened a window on
 * the **clear path** while the user had every reason to believe they were still inside the tunnel —
 * a silent leak, and the worst kind, because the popup looks like a continuation of the same session.
 * `webPreferences.session` is Electron's direct form of "this exact session", so the popup is on the
 * opener's network path by construction and cannot drift from it.
 */
export function popupWindowOptions(openerSession: Session): BrowserWindowConstructorOptions {
  return {
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      session: openerSession,
    },
  };
}

/** Notified after each committed top-level navigation: `(url, browsedWebContents, ownerWindow)`. The
 *  owner window lets an observer (e.g. autofill) target the chrome window that hosts the browsed page. */
export type NavigationObserver = (
  url: string,
  webContents: WebContents,
  owner: BrowserWindow,
) => void;

/** Notified when a browsed page is right-clicked. The tab layer REPORTS the event and knows nothing
 *  about menus; the composition root decides what opens. See `contextMenuObservers`. */
export type ContextMenuObserver = (
  owner: BrowserWindow,
  webContents: WebContents,
  params: Electron.ContextMenuParams,
  viewBounds: Rectangle,
  nav: { canGoBack: boolean; canGoForward: boolean },
) => void;

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
/**
 * Observers notified on a page right-click, across all windows.
 *
 * This indirection exists to keep the dependency pointing ONE way. `tabs-view-wiring` used to import
 * `menus/page-context-menu` directly, and that menu drives `TabManager` — closing the loop
 * `tabs -> ... -> tabs-view-wiring -> page-context-menu -> tabs`. Beyond the `no-circular` error that is
 * an ESM initialization-order hazard: whichever module evaluates first sees the other half-built. The
 * tab layer now emits, and `index.ts` subscribes the menu at startup.
 */
export const contextMenuObservers = new Set<ContextMenuObserver>();

/**
 * Session-persist command, installed by `TabManagerBase` at startup.
 *
 * `tabs-window-base` needed exactly ONE thing from the manager — a debounced "write the session now" —
 * and importing the manager for it made the window class chain depend on the registry that owns the
 * window class chain. Registering the command here keeps the arrow pointing one way; before any window
 * exists there is nothing to persist, so the no-op default is correct rather than merely safe.
 */
let persistSessionNow: () => void = () => {};
export function setSessionPersister(fn: () => void): void {
  persistSessionNow = fn;
}
export function persistSession(): void {
  persistSessionNow();
}
/**
 * Notified with `(tabId, groupId)` immediately BEFORE a tab loses its group for a reason the user did
 * not aim at its membership — today only pinning, which clears the group to keep the pinned run and the
 * group run from competing (ADR-0020). Fired before the mutation so an observer can still read the
 * group scope that is about to disappear.
 *
 * A callback registry rather than a direct call so the tab layer stays unaware of who cares: the network
 * binding service already depends on `TabManager`, and calling back the other way would make that pair
 * circular. Nothing here may throw — see the fire site.
 */
export type InvoluntaryGroupExitObserver = (tabId: string, groupId: string) => void;
export const involuntaryGroupExitObservers = new Set<InvoluntaryGroupExitObserver>();
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
  isPrivate: false,
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
