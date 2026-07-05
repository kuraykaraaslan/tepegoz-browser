import {
  BrowserWindow,
  WebContentsView,
  type BrowserWindowConstructorOptions,
  type HandlerDetails,
  type Rectangle,
  type WebContents,
} from 'electron';
import { Logger } from '@tepegoz/libs';
import {
  INTERNAL_BOOKMARKS_URL,
  INTERNAL_EXTENSIONS_URL,
  INTERNAL_HISTORY_URL,
  IpcChannels,
  type TabGroupSettingValue,
  type TabsState,
} from '@tepegoz/desktop-ipc';
import {
  HistoryStore,
  SessionStore,
  type PersistedGroup,
  type PersistedTab,
  type SessionSnapshot,
} from '@tepegoz/persistence';
import {
  TabStore,
  TAB_GROUP_COLORS,
  DEFAULT_GROUP_COLOR,
  type TabGroupColor,
} from '@tepegoz/tab-engine';
import { internalPageUrl, isWebUrl, toNavigationUrl } from './lib/navigation-url';
import { allSearchEngines, buildSearchUrl } from '@tepegoz/shared-types/search-engines';
import PreferenceStore from '@tepegoz/preferences';
import { mainLocale, mainStrings } from './lib/i18n-main';
import { extensionIdFromPageUrl, extensionLabel, manifestById } from '../shared/extensions';
import { getDb } from './db/database.electron';
import PopupBlockerManager from './popup-blocker';
import { openPageContextMenu } from './menus/page-context-menu';

/** Coerce a persisted (untyped) group color back to a valid `TabGroupColor`, defaulting if unknown. */
function asGroupColor(color: string): TabGroupColor {
  return (TAB_GROUP_COLORS as readonly string[]).includes(color)
    ? (color as TabGroupColor)
    : DEFAULT_GROUP_COLOR;
}

/** The origin of a URL (`https://example.com`), or '' when it can't be parsed (keys the popup policy). */
function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
}

/** A popup opened with no explicit URL targets `about:blank` (matches the DOM's window.open default). */
function popupTargetUrl(url: string): string {
  return url.trim().length === 0 ? 'about:blank' : url;
}

/** Schemes whose popup MUST be created natively by Electron so `window.open` returns a live, scriptable
 *  reference to the opener (about:blank / data: / javascript: — used by document.write / contentWindow
 *  style popups). A plain http(s) popup can instead open as one of our tabs. */
function needsNativeWindow(url: string): boolean {
  const u = url.trim().toLowerCase();
  return u === '' || u === 'about:blank' || u.startsWith('data:') || u.startsWith('javascript:');
}

/** Whether the page asked for a real popup WINDOW rather than a tab: geometry in `features`, an explicit
 *  new-window disposition, or a POST body (a form target=_blank whose POST we must not drop). */
function wantsNativeWindow(details: HandlerDetails): boolean {
  return (
    details.disposition === 'new-window' ||
    details.postBody != null ||
    /\b(?:width|height|innerwidth|innerheight)\b/i.test(details.features)
  );
}

/** Block navigations to dangerous schemes (anything but http(s)/about:) on a browsed webContents — on
 *  BOTH will-navigate and will-redirect (the latter alone misses redirect hops). */
function blockNonWeb(event: { preventDefault: () => void }, url: string): void {
  if (!/^(https?:|about:)/i.test(url)) event.preventDefault();
}

/** How long (ms) a discrete user input keeps the page "user-activated" for popup purposes. Chrome's
 *  transient activation is 5s; a click→window.open fires synchronously, so a short window is ample and
 *  keeps a stale gesture from later whitelisting an auto-popup. */
const GESTURE_ACTIVATION_MS = 1000;

/** Discrete inputs that count as a user gesture (grant transient activation). Scroll / mouse-move /
 *  pointer-move do NOT — matching the browser, which only activates on clicks, key presses and taps. */
function isActivatingInput(type: string): boolean {
  return (
    type === 'mouseDown' ||
    type === 'keyDown' ||
    type === 'rawKeyDown' ||
    type === 'pointerDown' ||
    type === 'touchStart' ||
    type === 'gestureTap'
  );
}

/**
 * L0 tab model. Each tab is an isolated `WebContentsView` in a SEPARATE browsing partition
 * (`persist:tepegoz-web`) from the app chrome (`persist:tepegoz-app`) — browsed pages are untrusted
 * and never share the chrome's session or get the contextBridge. The chrome (tab strip + omnibox)
 * lives in the window's own webContents; the active tab's view is laid into the content area below
 * the chrome using bounds reported by the renderer.
 *
 * The pure record state (which tabs exist, which is active, ordering, TabsState projection) lives in
 * `@tepegoz/tab-engine`'s `TabStore` (unit-tested); this class owns the WebContentsViews + all Electron
 * I/O and delegates every record mutation to the store.
 *
 * Per-site partition isolation, profiles, and checkpoint/resume are later phases; this is the minimal
 * real browser core for Phase 1a.
 */
/** Fallback home / new-tab URL when the `homepageUrl` preference is blank. */
const DEFAULT_HOME_URL = 'https://duckduckgo.com/';
/** The current home / new-tab page URL (from prefs, falling back to the built-in default when blank). */
function homeUrl(): string {
  return PreferenceStore.getAll().homepageUrl || DEFAULT_HOME_URL;
}
/** Resolve a typed omnibox query to a search URL via the selected engine (built-in or user-custom). */
function searchUrlForQuery(query: string): string {
  const prefs = PreferenceStore.getAll();
  return buildSearchUrl(prefs.searchEngineId, query, allSearchEngines(prefs.customSearchEngines));
}
/** Cap for page-controlled titles before they reach the history DB (hostile-page DoS guard). */
const MAX_TITLE_LENGTH = 2048;
/** The isolated session partition every browsed page lives in (shared with the User-Agent switcher). */
export const BROWSING_PARTITION = 'persist:tepegoz-web';

/** Secure window options for page-opened popups (child windows): the same hardened, chrome-less profile
 *  and isolated browsing partition as a tab's view — no preload, so the page never reaches the bridge. */
const POPUP_WINDOW_OPTIONS: BrowserWindowConstructorOptions = {
  webPreferences: {
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false,
    webSecurity: true,
    partition: BROWSING_PARTITION,
  },
};

export type NavigationObserver = (url: string, webContents: WebContents) => void;

export default class TabManager {
  private static win: BrowserWindow | null = null;
  private static readonly store = new TabStore();
  /** WebContentsViews for `web` tabs (internal tabs have none), keyed by tab id. */
  private static readonly views = new Map<string, WebContentsView>();
  private static bounds: Rectangle = { x: 0, y: 0, width: 0, height: 0 };
  private static contentVisible = true;
  /** Recently-closed web-tab URLs (LIFO) for reopen-closed-tab (Ctrl+Shift+T). In-memory, session-scoped. */
  private static readonly closedUrls: string[] = [];
  /** Debounce handle for persisting the session snapshot (coalesces bursts of state changes). */
  private static persistTimer: ReturnType<typeof setTimeout> | null = null;
  /** Observers notified after every committed top-level navigation (did-stop-loading). */
  private static readonly navigationObservers = new Set<NavigationObserver>();
  /** Last discrete user-input time per browsed webContents — the popup blocker only blocks popups that
   *  open WITHOUT a recent gesture (a link click / window.open in response to a click must pass). Keyed
   *  weakly so entries vanish when the webContents is GC'd; no manual cleanup needed. */
  private static readonly lastGestureAt = new WeakMap<WebContents, number>();

  /** Whether `wc` had a discrete user input within the activation window (i.e. the popup it just tried to
   *  open is user-initiated, not an unsolicited auto-popup). */
  private static hadRecentGesture(wc: WebContents): boolean {
    const at = TabManager.lastGestureAt.get(wc);
    return at !== undefined && Date.now() - at < GESTURE_ACTIVATION_MS;
  }

  /** Register a callback invoked after each committed top-level page load. Returns an unsubscribe fn. */
  static onNavigation(fn: NavigationObserver): () => void {
    TabManager.navigationObservers.add(fn);
    return () => { TabManager.navigationObservers.delete(fn); };
  }

  static attach(win: BrowserWindow): void {
    TabManager.win = win;
  }

  /** Tear down all tabs + state when the window closes (prevents stale tabs leaking into a
   *  re-created window, e.g. macOS app 'activate'). */
  static reset(): void {
    // Cancel any pending debounced persist so it can't fire AFTER the store is cleared and overwrite the
    // just-saved snapshot with an empty one. Callers persist synchronously before reset (see index.ts).
    if (TabManager.persistTimer !== null) {
      clearTimeout(TabManager.persistTimer);
      TabManager.persistTimer = null;
    }
    const win = TabManager.win;
    for (const view of TabManager.views.values()) {
      // Electron teardown order: detach from the window first, THEN close the contents — closing an
      // attached view can race its compositor/storage teardown against the window's own destruction.
      if (win !== null && !win.isDestroyed()) win.contentView.removeChildView(view);
      if (!view.webContents.isDestroyed()) {
        TabManager.unwireView(view);
        view.webContents.close();
      }
    }
    TabManager.views.clear();
    TabManager.store.clear();
    TabManager.win = null;
    TabManager.contentVisible = true;
    TabManager.bounds = { x: 0, y: 0, width: 0, height: 0 };
  }

  static createTab(
    rawUrl?: string,
    opts?: { background?: boolean; openerId?: string | undefined },
  ): string {
    TabManager.requireWin(); // fail fast if not attached to a window
    const view = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        webSecurity: true,
        partition: BROWSING_PARTITION,
      },
    });
    const id = TabManager.store.add({
      kind: 'web',
      title: '',
      url: '',
      isLoading: true,
      faviconUrl: null,
    });
    TabManager.views.set(id, view);
    TabManager.wireView(id, view);

    // A tab spawned FROM a grouped tab (window.open, "open link in new tab", duplicate, new-tab-right)
    // must join that group and sit right after its opener — never break out of the group run (ADR-0020).
    TabManager.inheritGroup(id, opts?.openerId);

    const home = homeUrl();
    const target = rawUrl !== undefined ? toNavigationUrl(rawUrl, home, searchUrlForQuery) : home;
    void view.webContents.loadURL(target).catch((err: unknown) => {
      Logger.warn('Tab failed to load', { url: target, err: String(err) });
    });

    // Background tabs (e.g. a non-foreground page's window.open) must NOT steal the foreground.
    if (opts?.background === true && TabManager.store.activeId !== null) {
      TabManager.emitState();
    } else {
      TabManager.activate(id);
    }
    return id;
  }

  /** If `openerId` is a grouped tab, put the new tab in the same group, right after the opener. No-op
   *  when there's no opener or the opener is ungrouped (the tab stays where `add` placed it). */
  private static inheritGroup(newId: string, openerId?: string): void {
    if (openerId === undefined) return;
    const opener = TabManager.store.get(openerId);
    if (opener?.groupId == null) return;
    TabManager.store.assignToGroup(newId, opener.groupId);
    TabManager.store.placeAfter(newId, openerId);
  }

  /** The active tab's id (null if none) — lets callers open a new tab as a child of the current tab. */
  static activeTabId(): string | null {
    return TabManager.store.activeId;
  }

  static activate(id: string): void {
    const win = TabManager.requireWin();
    if (!TabManager.store.has(id)) return;

    // Detach the previously-active view (kept alive in the background), attach the new one. Internal
    // tabs have no view — the chrome renders their page over the (empty) content area.
    const prevId = TabManager.store.activeId;
    if (prevId !== null && prevId !== id) {
      const prevView = TabManager.views.get(prevId);
      if (prevView != null) win.contentView.removeChildView(prevView);
    }
    TabManager.store.setActive(id);
    const view = TabManager.views.get(id);
    if (TabManager.contentVisible && view !== undefined) {
      win.contentView.addChildView(view);
      view.setBounds(TabManager.bounds);
    }
    TabManager.emitState();
  }

  static closeTab(id: string): void {
    const win = TabManager.requireWin();
    if (!TabManager.store.has(id)) return;
    const view = TabManager.views.get(id);
    if (view !== undefined) {
      // Remember the URL so Ctrl+Shift+T can reopen it (most-recent first, capped).
      const closedUrl = view.webContents.getURL() || TabManager.store.get(id)?.url || '';
      if (isWebUrl(closedUrl)) {
        TabManager.closedUrls.push(closedUrl);
        if (TabManager.closedUrls.length > 25) TabManager.closedUrls.shift();
      }
      win.contentView.removeChildView(view);
      TabManager.unwireView(view);
      view.webContents.close();
      TabManager.views.delete(id);
    }
    const wasActive = TabManager.store.activeId === id;
    TabManager.store.delete(id);

    if (wasActive) {
      TabManager.store.setActive(null);
      const next = TabManager.store.ids().at(-1);
      if (next !== undefined) {
        TabManager.activate(next);
      } else {
        TabManager.emitState();
      }
    } else {
      TabManager.emitState();
    }
  }

  /** Reload a specific tab (context menu) — distinct from reloadActive (omnibox/shortcut). */
  static reloadTab(id: string): void {
    TabManager.views.get(id)?.webContents.reload();
  }

  /** Open (or focus) an internal page tab (tepegoz://settings, tepegoz://extensions) — rendered by
   *  the chrome, no web view. A new-tab experience for internal pages, mirroring Chrome's chrome://. */
  static openInternalPage(url: string): void {
    TabManager.requireWin();
    const existing = TabManager.store.findInternal(url);
    if (existing !== undefined) {
      TabManager.activate(existing);
      return;
    }
    const id = TabManager.store.add({
      kind: 'internal',
      title: TabManager.internalTitle(url),
      url,
      isLoading: false,
      faviconUrl: null,
    });
    TabManager.activate(id);
  }

  private static internalTitle(url: string): string {
    const r = mainStrings();
    if (url === INTERNAL_EXTENSIONS_URL) return r.extensions.title;
    if (url === INTERNAL_HISTORY_URL) return r.history.title;
    if (url === INTERNAL_BOOKMARKS_URL) return r.bookmarks.title;
    // An extension `page` surface (tepegoz://<extension-id>) is titled from the extension's manifest.
    const extId = extensionIdFromPageUrl(url);
    if (extId !== null) {
      const manifest = manifestById(extId);
      if (manifest !== undefined) return extensionLabel(manifest, mainLocale()).name;
    }
    return r.common.settings;
  }

  /** Open a fresh tab immediately to the right of `refId` and focus it (Chrome's "New tab to the right"). */
  static createTabRight(refId: string): void {
    if (!TabManager.store.has(refId)) return;
    // openerId → inherits refId's group (if any); placeAfter fixes the position for the ungrouped case.
    const newId = TabManager.createTab(undefined, { openerId: refId });
    TabManager.store.placeAfter(newId, refId);
    TabManager.emitState();
  }

  /** Duplicate a tab's current URL into a new tab placed right after it, and focus it. */
  static duplicateTab(id: string): void {
    const rec = TabManager.store.get(id);
    if (rec === undefined) return;
    const view = TabManager.views.get(id);
    if (view === undefined) {
      TabManager.openInternalPage(rec.url); // internal page → just focus it (nothing to duplicate)
      return;
    }
    const url = view.webContents.getURL() || rec.url;
    const newId = TabManager.createTab(url.length > 0 ? url : undefined, { openerId: id });
    TabManager.store.placeAfter(newId, id);
    TabManager.emitState();
  }

  /** Close every tab except `id`, keeping `id` active. */
  static closeOtherTabs(id: string): void {
    if (!TabManager.store.has(id)) return;
    if (TabManager.store.activeId !== id) TabManager.activate(id);
    for (const other of TabManager.store.ids().filter((k) => k !== id)) {
      TabManager.closeTab(other);
    }
  }

  /** Close all tabs ordered after `id`. */
  static closeTabsToRight(id: string): void {
    const ids = TabManager.store.ids();
    const idx = ids.indexOf(id);
    if (idx === -1) return;
    const toClose = ids.slice(idx + 1);
    // If the active tab is being closed, fall back to the reference tab first.
    const activeId = TabManager.store.activeId;
    if (activeId !== null && toClose.includes(activeId)) {
      TabManager.activate(id);
    }
    for (const k of toClose) TabManager.closeTab(k);
  }

  // ── Groups, ordering & pinning ───────────────────────────────────────────────────────────────
  // Thin delegates to the pure TabStore (invariants + contiguity live there, ADR-0020). Each mutates
  // the store then re-emits state so the strip re-renders.

  /** Drag-reorder: move `id` to `toIndex`. `intoGroupId` resolves membership (see TabStore.moveTab). */
  static moveTab(id: string, toIndex: number, intoGroupId?: string | null): void {
    if (!TabManager.store.has(id)) return;
    TabManager.store.moveTab(id, toIndex, intoGroupId);
    TabManager.emitState();
  }

  /** Reorder a whole group's run to `toIndex` among the non-member tabs. */
  static moveGroup(groupId: string, toIndex: number): void {
    TabManager.store.moveGroup(groupId, toIndex);
    TabManager.emitState();
  }

  /** Create a group from `memberIds` (defaults to the active tab) and return the new group id. */
  static createGroup(memberIds?: string[]): string {
    const members =
      memberIds !== undefined && memberIds.length > 0
        ? memberIds.filter((id) => TabManager.store.has(id))
        : TabManager.activeGroupSeed();
    const id = TabManager.store.createGroup({ memberIds: members });
    TabManager.emitState();
    return id;
  }

  /** The default single-member seed for "new group" from a context menu (the clicked/active tab). */
  private static activeGroupSeed(): string[] {
    const active = TabManager.store.activeId;
    return active !== null ? [active] : [];
  }

  /** Whether a group with this id still exists (its members may all have been closed). Lets the agent's
   *  per-conversation grouping tell "reuse my group" from "the user closed it → open a fresh one". */
  static hasGroup(groupId: string): boolean {
    return TabManager.store.getGroup(groupId) !== undefined;
  }

  static assignToGroup(tabId: string, groupId: string): void {
    TabManager.store.assignToGroup(tabId, groupId);
    TabManager.emitState();
  }

  static removeFromGroup(tabId: string): void {
    TabManager.store.removeFromGroup(tabId);
    TabManager.emitState();
  }

  static renameGroup(groupId: string, name: string): void {
    TabManager.store.renameGroup(groupId, name);
    TabManager.emitState();
  }

  static recolorGroup(groupId: string, color: TabGroupColor): void {
    TabManager.store.recolorGroup(groupId, color);
    TabManager.emitState();
  }

  static setGroupCollapsed(groupId: string, collapsed: boolean): void {
    TabManager.store.setGroupCollapsed(groupId, collapsed);
    TabManager.emitState();
  }

  /** Merge-patch a group's extensible settings bag (the per-tab-group settings standard). */
  static updateGroupSettings(groupId: string, patch: Record<string, TabGroupSettingValue>): void {
    TabManager.store.updateGroupSettings(groupId, patch);
    TabManager.emitState();
  }

  static ungroup(groupId: string): void {
    TabManager.store.ungroup(groupId);
    TabManager.emitState();
  }

  /** Open a new tab already assigned to `groupId` (group menu → "New tab in group"). */
  static newTabInGroup(groupId: string): void {
    if (TabManager.store.getGroup(groupId) === undefined) return;
    const id = TabManager.createTab();
    TabManager.store.assignToGroup(id, groupId);
    TabManager.emitState();
  }

  /** Close every tab in a group (group menu → "Close group"). */
  static closeGroup(groupId: string): void {
    const memberIds = TabManager.store
      .records()
      .filter((r) => r.groupId === groupId)
      .map((r) => r.id);
    for (const id of memberIds) TabManager.closeTab(id);
  }

  /** The colors + current color of a group, for building the native group menu (undefined if unknown). */
  static groupMenuInfo(groupId: string): { color: TabGroupColor } | undefined {
    const g = TabManager.store.getGroup(groupId);
    return g !== undefined ? { color: g.color } : undefined;
  }

  /** Pin / unpin a tab (moves to the pinned run; pinning clears group membership). */
  static setPinned(id: string, pinned: boolean): void {
    if (!TabManager.store.has(id)) return;
    TabManager.store.setPinned(id, pinned);
    TabManager.emitState();
  }

  static navigateActive(rawUrl: string): void {
    // Internal pages (tepegoz://…) open as their own tab, rendered by the trusted chrome.
    const internal = internalPageUrl(rawUrl);
    if (internal !== null) {
      TabManager.openInternalPage(internal);
      return;
    }
    const rec = TabManager.store.active();
    if (rec === undefined) return;
    const url = toNavigationUrl(rawUrl, homeUrl(), searchUrlForQuery);
    const view = TabManager.views.get(rec.id);
    if (view === undefined) {
      TabManager.createTab(url); // typing a URL while on an internal page opens a new web tab
      return;
    }
    void view.webContents.loadURL(url).catch((err: unknown) => {
      Logger.warn('Navigation failed', { url, err: String(err) });
    });
  }

  static goBack(): void {
    const wc = TabManager.activeView()?.webContents;
    if (wc?.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
  }

  static goForward(): void {
    const wc = TabManager.activeView()?.webContents;
    if (wc?.navigationHistory.canGoForward()) wc.navigationHistory.goForward();
  }

  static reloadActive(): void {
    TabManager.activeView()?.webContents.reload();
  }

  /** Print the active web page (opens the system print dialog). Page context menu → Print. */
  static printActive(): void {
    TabManager.activeView()?.webContents.print();
  }

  /** Open the active page's HTML source in place (Chrome's `view-source:`). Web pages only. */
  static viewSourceActive(): void {
    const wc = TabManager.activeView()?.webContents;
    if (wc === undefined) return;
    const url = wc.getURL();
    if (isWebUrl(url)) void wc.loadURL(`view-source:${url}`).catch(() => undefined);
  }

  /** Save the active page — Electron's default download flow shows the OS save dialog. */
  static saveActive(): void {
    const wc = TabManager.activeView()?.webContents;
    if (wc !== undefined) wc.downloadURL(wc.getURL());
  }

  /** Download a specific URL through the active view (Save image/video/audio as → OS save dialog). */
  static downloadUrlActive(url: string): void {
    if (url.length > 0) TabManager.activeView()?.webContents.downloadURL(url);
  }

  /** Editing commands on the active page (page context menu → Cut/Copy/Paste/Select all). */
  static copyActive(): void {
    TabManager.activeView()?.webContents.copy();
  }
  static cutActive(): void {
    TabManager.activeView()?.webContents.cut();
  }
  static pasteActive(): void {
    TabManager.activeView()?.webContents.paste();
  }
  static selectAllActive(): void {
    TabManager.activeView()?.webContents.selectAll();
  }

  /** Copy the image at the given view-relative coordinates (px) to the clipboard. */
  static copyImageAtActive(x: number, y: number): void {
    TabManager.activeView()?.webContents.copyImageAt(Math.round(x), Math.round(y));
  }

  /** Open DevTools and inspect the element at the given view-relative coordinates (px). */
  static inspectActiveAt(x: number, y: number): void {
    const wc = TabManager.activeView()?.webContents;
    if (wc === undefined) return;
    const px = Math.round(x);
    const py = Math.round(y);
    if (wc.isDevToolsOpened()) {
      wc.inspectElement(px, py);
    } else {
      wc.once('devtools-opened', () => wc.inspectElement(px, py));
      wc.openDevTools();
    }
  }

  /** Navigate the active tab to the home / start page. */
  static goHome(): void {
    TabManager.navigateActive(homeUrl());
  }

  /** The current content-area bounds (DIP, shell-window-relative). Used to offset CDP coordinates
   *  (which are view-relative) to shell-window-relative coordinates for the cursor overlay. */
  static getContentBounds(): Rectangle {
    return { ...TabManager.bounds };
  }

  /** The content area (below the chrome), in DIP, as measured by the renderer. */
  static setContentBounds(bounds: Rectangle): void {
    TabManager.bounds = bounds;
    if (TabManager.contentVisible) {
      TabManager.activeView()?.setBounds(bounds);
    }
  }

  /** Hide the active web view so a chrome-rendered overlay (Agent Console) shows through. Internal
   *  tabs have no view, so this is a no-op for them. */
  static setContentVisible(visible: boolean): void {
    const win = TabManager.requireWin();
    TabManager.contentVisible = visible;
    const view = TabManager.activeView();
    if (view === undefined) return;
    if (visible) {
      win.contentView.addChildView(view);
      view.setBounds(TabManager.bounds);
    } else {
      win.contentView.removeChildView(view);
    }
  }

  static getState(): TabsState {
    const wc = TabManager.activeView()?.webContents;
    return TabManager.store.toState({
      canGoBack: wc?.navigationHistory.canGoBack() ?? false,
      canGoForward: wc?.navigationHistory.canGoForward() ?? false,
    });
  }

  /** The active tab's WebContentsView, or undefined for no-active / internal (view-less) tabs. */
  private static activeView(): WebContentsView | undefined {
    const id = TabManager.store.activeId;
    return id !== null ? TabManager.views.get(id) : undefined;
  }

  /** The active tab's webContents, for the agent perception layer (read DOM text). Null if none or
   *  destroyed. The agent reads through this; it never gets the chrome's webContents or contextBridge. */
  static activeWebContents(): WebContents | null {
    const wc = TabManager.activeView()?.webContents;
    return wc !== undefined && !wc.isDestroyed() ? wc : null;
  }

  /** Snapshot the active web view as a PNG data URL (null for internal/no-view tabs or on failure).
   *  The chrome shows this still while the live view is momentarily hidden (e.g. a sidebar resize),
   *  so the page never blanks to the chrome background. */
  static async captureActive(): Promise<string | null> {
    const wc = TabManager.activeWebContents();
    if (wc === null) return null;
    try {
      const image = await wc.capturePage();
      return image.isEmpty() ? null : image.toDataURL();
    } catch {
      return null;
    }
  }

  /** Apply a resolved User-Agent to every open web tab and reload it so the new identity takes effect
   *  immediately (the session default already covers tabs opened afterwards). Internal tabs have no
   *  web view and are skipped. */
  static applyUserAgent(ua: string): void {
    for (const view of TabManager.views.values()) {
      const wc = view.webContents;
      if (!wc.isDestroyed()) {
        wc.setUserAgent(ua);
        wc.reload();
      }
    }
  }

  private static requireWin(): BrowserWindow {
    if (TabManager.win === null) throw new Error('TabManager not attached to a window');
    return TabManager.win;
  }

  /** Every event `wireView` subscribes to — kept in sync so `unwireView` can drop exactly these. */
  private static readonly WIRED_EVENTS = [
    'input-event',
    'will-navigate',
    'will-redirect',
    'context-menu',
    'page-title-updated',
    'page-favicon-updated',
    'did-start-loading',
    'did-stop-loading',
    'did-navigate',
    'did-navigate-in-page',
  ] as const;

  /** Drop everything `wireView` attached BEFORE closing the contents: the handlers close over the tab
   *  id + TabManager and would otherwise keep firing (and pin their closures) through teardown. Only
   *  our own events are removed — Electron's internal listeners stay untouched. */
  private static unwireView(view: WebContentsView): void {
    const wc = view.webContents;
    for (const event of TabManager.WIRED_EVENTS) {
      wc.removeAllListeners(event);
    }
  }

  private static wireView(id: string, view: WebContentsView): void {
    const wc = view.webContents;

    // Track discrete user input so the popup blocker can tell a user-clicked new-tab link (which must
    // open) from an unsolicited auto-popup (which is blocked). See the window-open handler below.
    wc.on('input-event', (_e, input) => {
      if (isActivatingInput(input.type)) TabManager.lastGestureAt.set(wc, Date.now());
    });

    // Browsed pages are untrusted. Every path that creates a new browsing context (window.open,
    // target=_blank, form/base target, event-simulated clicks) funnels through this handler, so it is
    // the single popup enforcement point. Strict popup blocker first, BUT only for popups opened WITHOUT
    // a recent user gesture: a user-clicked `target=_blank` link (or a window.open in response to a
    // click) is legitimate and must open — only unsolicited auto-popups are blocked, matching how a real
    // browser's popup blocker keys on transient user activation. A blocked popup raises a notification
    // whose inline actions can still open it. When allowed we open HYBRID: plain http(s) popups become
    // tabs (our model); popups that need a live window reference (about:blank/data:/javascript:),
    // geometry, a POST body, or an explicit new-window disposition are created NATIVELY by Electron so
    // `window.open` returns a scriptable ref.
    wc.setWindowOpenHandler((details) => {
      const target = popupTargetUrl(details.url);
      const sourceOrigin = originOf(wc.getURL());
      if (!TabManager.hadRecentGesture(wc) && PopupBlockerManager.shouldBlock(sourceOrigin)) {
        PopupBlockerManager.onBlocked(sourceOrigin, target);
        return { action: 'deny' };
      }
      if (needsNativeWindow(details.url) || wantsNativeWindow(details)) {
        return { action: 'allow', overrideBrowserWindowOptions: POPUP_WINDOW_OPTIONS };
      }
      // Plain new tab. Non-web schemes (file:/custom) that didn't need a native window are dropped.
      if (!isWebUrl(target)) return { action: 'deny' };
      const background =
        details.disposition === 'background-tab'
          ? true
          : details.disposition === 'foreground-tab'
            ? false
            : id !== TabManager.store.activeId;
      // Spawned by the page → the opener is THIS tab, so the new tab inherits its group (ADR-0020).
      TabManager.createTab(target, { background, openerId: id });
      return { action: 'deny' };
    });
    // A natively-allowed popup opens its own top-level window; harden it the same way as a browsed view
    // (block dangerous schemes, and route ITS nested popups through the same policy).
    wc.on('did-create-window', (win) => {
      TabManager.wirePopupWindow(win.webContents);
    });
    // Block dangerous schemes on BOTH initial navigations and server-side redirects (will-navigate
    // alone misses redirect hops). The programmatic loadURL path is guarded by toNavigationUrl.
    wc.on('will-navigate', blockNonWeb);
    wc.on('will-redirect', blockNonWeb);

    // Right-click on the page → open the Chrome-style page context menu as a rendered popup window
    // (same primitive as the main menu), anchored at the click point (offset by the view's own bounds).
    // `params` (selection/link/media/editable) picks the menu variant in the renderer.
    wc.on('context-menu', (_e, params) => {
      const win = TabManager.win;
      if (win !== null) {
        openPageContextMenu(win, params, TabManager.bounds, {
          canGoBack: wc.navigationHistory.canGoBack(),
          canGoForward: wc.navigationHistory.canGoForward(),
        });
      }
    });

    const sync = (): void => {
      TabManager.store.update(id, {
        url: wc.getURL(),
        title: wc.getTitle(),
        isLoading: wc.isLoadingMainFrame(),
      });
      TabManager.emitState();
    };
    wc.on('page-title-updated', (_e, title) => {
      TabManager.store.update(id, { title });
      const db = getDb();
      const url = wc.getURL();
      // Page-controlled string — cap before persisting so a hostile title can't bloat the DB.
      if (db !== null && isWebUrl(url))
        HistoryStore.setTitle(db, url, title.slice(0, MAX_TITLE_LENGTH));
      TabManager.emitState();
    });
    // Electron sends every favicon a page declares; the last is typically the largest/most specific.
    wc.on('page-favicon-updated', (_e, favicons) => {
      TabManager.store.update(id, { faviconUrl: favicons.at(-1) ?? null });
      TabManager.emitState();
    });
    wc.on('did-start-loading', () => {
      TabManager.store.update(id, { isLoading: true });
      TabManager.emitState();
    });
    wc.on('did-stop-loading', () => {
      sync();
      const url = wc.getURL();
      if (isWebUrl(url)) {
        for (const obs of TabManager.navigationObservers) obs(url, wc);
      }
    });
    // A committed top-level navigation means a new document — drop the old favicon so a stale icon
    // from the previous page can't linger (the new one arrives via page-favicon-updated).
    wc.on('did-navigate', () => {
      TabManager.store.update(id, { faviconUrl: null });
    });
    // Record the visit in browsing history (once per committed top-level navigation). Only http(s);
    // no-op when the DB connector is unavailable. The title is refined later via page-title-updated.
    wc.on('did-navigate', (_e, url) => {
      const db = getDb();
      if (db !== null && isWebUrl(url)) {
        const title = (wc.getTitle() || url).slice(0, MAX_TITLE_LENGTH);
        HistoryStore.record(db, { url, title, ts: Date.now() });
      }
    });
    wc.on('did-navigate', sync);
    wc.on('did-navigate-in-page', sync);
  }

  /** Harden a natively-opened popup window's webContents: block dangerous-scheme navigations and route
   *  its OWN popups through the same blocker + hybrid policy. A popup window has no tab context, so its
   *  nested popups (when allowed) stay native windows rather than becoming tabs. */
  private static wirePopupWindow(wc: WebContents): void {
    wc.on('input-event', (_e, input) => {
      if (isActivatingInput(input.type)) TabManager.lastGestureAt.set(wc, Date.now());
    });
    wc.setWindowOpenHandler((details) => {
      const target = popupTargetUrl(details.url);
      const sourceOrigin = originOf(wc.getURL());
      if (!TabManager.hadRecentGesture(wc) && PopupBlockerManager.shouldBlock(sourceOrigin)) {
        PopupBlockerManager.onBlocked(sourceOrigin, target);
        return { action: 'deny' };
      }
      if (isWebUrl(target) || needsNativeWindow(details.url) || wantsNativeWindow(details)) {
        return { action: 'allow', overrideBrowserWindowOptions: POPUP_WINDOW_OPTIONS };
      }
      return { action: 'deny' };
    });
    wc.on('did-create-window', (win) => {
      TabManager.wirePopupWindow(win.webContents);
    });
    wc.on('will-navigate', blockNonWeb);
    wc.on('will-redirect', blockNonWeb);
  }

  private static emitState(): void {
    const win = TabManager.win;
    if (win && !win.isDestroyed()) {
      win.webContents.send(IpcChannels.tabsState, TabManager.getState());
      TabManager.syncWindowTitle(win);
    }
    TabManager.schedulePersist();
  }

  /** Reflect the active tab in the OS window title (taskbar / Alt-Tab): "<tab title> - Tepegöz",
   *  falling back to just "Tepegöz" when the active tab has no title yet. */
  private static syncWindowTitle(win: BrowserWindow): void {
    const title = TabManager.store.active()?.title.trim() ?? '';
    win.setTitle(title.length > 0 ? `${title} - Tepegöz` : 'Tepegöz');
  }

  // ── Session restore ────────────────────────────────────────────────────────────────────────────

  /** Reopen the most-recently-closed tab (Ctrl+Shift+T). No-op when the stack is empty. */
  static reopenClosedTab(): void {
    const url = TabManager.closedUrls.pop();
    if (url !== undefined) TabManager.createTab(url);
  }

  /** The ordered web tabs (URL + pin + group membership) + group metadata + active index, for the
   *  persisted session snapshot. Internal (view-less) tabs and blank/unloaded tabs are skipped — only
   *  real web pages are restored (ADR-0020). */
  private static snapshot(): SessionSnapshot {
    const tabs: PersistedTab[] = [];
    let activeIndex = -1;
    for (const rec of TabManager.store.records()) {
      // Prefer the live URL, but on window close the webContents may already be gone — fall back to the
      // last synced record URL so the closing snapshot still captures every tab.
      const wc = TabManager.views.get(rec.id)?.webContents;
      const url = (wc !== undefined && !wc.isDestroyed() ? wc.getURL() : '') || rec.url;
      if (rec.kind !== 'web' || !isWebUrl(url)) continue;
      if (rec.id === TabManager.store.activeId) activeIndex = tabs.length;
      tabs.push({ url, pinned: rec.pinned, groupId: rec.groupId });
    }
    // Only persist groups that still own at least one persisted (web) tab.
    const liveGroups = new Set(
      tabs.map((t) => t.groupId).filter((g): g is string => g !== null),
    );
    const groups: PersistedGroup[] = TabManager.store
      .groupsInOrder()
      .filter((g) => liveGroups.has(g.id))
      .map((g) => ({ id: g.id, name: g.name, color: g.color, collapsed: g.collapsed, settings: g.settings }));
    return { version: 2, tabs, groups, activeIndex };
  }

  /** Debounced session persist — coalesces the burst of state changes during a page load into one write. */
  private static schedulePersist(): void {
    if (TabManager.persistTimer !== null) clearTimeout(TabManager.persistTimer);
    TabManager.persistTimer = setTimeout(() => {
      TabManager.persistTimer = null;
      TabManager.persistNow();
    }, 400);
  }

  /** Persist the current session snapshot immediately (called on quit, before `reset`). */
  static persistNow(): void {
    const db = getDb();
    if (db === null) return;
    try {
      SessionStore.save(db, TabManager.snapshot());
    } catch (err) {
      Logger.warn('Failed to persist session', { err: String(err) });
    }
  }

  /** Restore the last session's web tabs on launch. Returns true if any tab was restored (so the caller
   *  can skip opening a default blank tab). */
  static restoreSession(): boolean {
    const db = getDb();
    if (db === null) return false;
    const snap = SessionStore.load(db);
    if (snap === null || snap.tabs.length === 0) return false;

    // 1. Recreate tabs in order, remembering the persisted-index → new-tab-id mapping.
    const createdIds = snap.tabs.map((t, i) =>
      // First tab takes focus; the rest open in the background so they don't each steal it.
      TabManager.createTab(t.url, { background: i !== 0 }),
    );

    // 2. Re-create groups with their metadata, then restore membership + pins (order changes as the
    //    store normalizes, so we track the ACTIVE tab by id, not by the persisted index).
    for (const pg of snap.groups) {
      const memberIds = snap.tabs
        .map((t, i) => (t.groupId === pg.id ? createdIds[i]! : null))
        .filter((id): id is string => id !== null);
      if (memberIds.length === 0) continue;
      // `id: pg.id` reuses the group's stable (pre-restart) UUID so `settings` stays keyed correctly.
      TabManager.store.createGroup({
        id: pg.id,
        name: pg.name,
        color: asGroupColor(pg.color),
        collapsed: pg.collapsed,
        settings: pg.settings,
        memberIds,
      });
    }
    snap.tabs.forEach((t, i) => {
      if (t.pinned) TabManager.store.setPinned(createdIds[i]!, true);
    });

    // 3. Activate the persisted active tab by its new id (robust to the normalized reordering).
    const activeId =
      snap.activeIndex >= 0 && snap.activeIndex < createdIds.length
        ? createdIds[snap.activeIndex]
        : undefined;
    if (activeId !== undefined) TabManager.activate(activeId);
    else TabManager.emitState();
    return true;
  }
}
