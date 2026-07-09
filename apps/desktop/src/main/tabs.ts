import { randomUUID } from 'node:crypto';
import {
  BrowserWindow,
  WebContentsView,
  type BrowserWindowConstructorOptions,
  type Rectangle,
  type WebContents,
} from 'electron';
import { Logger } from '@tepegoz/libs';
import {
  INTERNAL_BOOKMARKS_URL,
  INTERNAL_DOWNLOADS_URL,
  INTERNAL_EXTENSIONS_URL,
  INTERNAL_HISTORY_URL,
  INTERNAL_NEWTAB_URL,
  INTERNAL_TASKS_URL,
  INTERNAL_UPLOADS_URL,
  IpcChannels,
  type TabGroupSettingValue,
  type TabsState,
} from '@tepegoz/desktop-ipc';
import {
  EventJournal,
  HistoryStore,
  SessionStore,
  type PersistedGroup,
  type PersistedTab,
  type WindowSnapshot,
} from '@tepegoz/persistence';
import {
  TabStore,
  type TabGroup,
  type TabGroupColor,
  type TabRecord,
} from '@tepegoz/tab-engine';
import { internalPageUrl, isWebUrl, toNavigationUrl } from './lib/navigation-url';
import { allSearchEngines, buildSearchUrl } from '@tepegoz/shared-types/search-engines';
import PreferenceStore from '@tepegoz/preferences';
import { mainLocale, mainStrings } from './lib/i18n-main';
import { extensionIdFromPageUrl, extensionLabel, manifestById } from '../shared/extensions';
import { getDb } from './db/database.electron';
import ActionInterceptorService from './extensions/action-interceptors.electron';
import ClipboardService from './clipboard/clipboard-service.electron';
import DownloadService from './downloads/download-service.electron';
import { openPageContextMenu } from './menus/page-context-menu';
import {
  asGroupColor,
  blockNonWeb,
  GESTURE_ACTIVATION_MS,
  isActivatingInput,
  needsNativeWindow,
  originOf,
  popupTargetUrl,
  wantsNativeWindow,
} from './tabs-popup-policy';

/**
 * L0 tab model. Each tab is an isolated `WebContentsView` in a SEPARATE browsing partition
 * (`persist:tepegoz-web`) from the app chrome (`persist:tepegoz-app`) — browsed pages are untrusted
 * and never share the chrome's session or get the contextBridge. The chrome (tab strip + omnibox)
 * lives in the window's own webContents; the active tab's view is laid into the content area below
 * the chrome using bounds reported by the renderer.
 *
 * The per-window tab state (which tabs exist, which is active, ordering, TabsState projection) lives in
 * a `WindowTabs` instance — one per browser window — and the pure record model in `@tepegoz/tab-engine`'s
 * `TabStore` (unit-tested). `TabManager` is the static registry + facade over those instances: it maps
 * windows↔instances, resolves the sender/focused window for IPC and agent code, and coordinates the
 * cross-window tear-off move primitives (`detachTab`/`adoptTab`).
 *
 * Per-site partition isolation, profiles, and checkpoint/resume are later phases; this is the minimal
 * real browser core.
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
const closedUrls: string[] = [];
/** Observers notified after every committed top-level navigation (did-stop-loading), across all windows. */
const navigationObservers = new Set<NavigationObserver>();
/** Last discrete user-input time per browsed webContents — the popup blocker only blocks popups that
 *  open WITHOUT a recent gesture. Keyed weakly so entries vanish when the webContents is GC'd. */
const lastGestureAt = new WeakMap<WebContents, number>();

/** Whether `wc` had a discrete user input within the activation window (i.e. the popup it just tried to
 *  open is user-initiated, not an unsolicited auto-popup). */
function hadRecentGesture(wc: WebContents): boolean {
  const at = lastGestureAt.get(wc);
  return at !== undefined && Date.now() - at < GESTURE_ACTIVATION_MS;
}

const EMPTY_TABS_STATE: TabsState = {
  tabs: [],
  groups: [],
  activeId: null,
  canGoBack: false,
  canGoForward: false,
};

function internalBaseUrl(url: string): string {
  return url.split('#', 1)[0] ?? url;
}

/**
 * One browser window's worth of tabs: it owns the `WebContentsView`s + all Electron I/O and delegates
 * every record mutation to its own `TabStore`. Multiple instances coexist (one per window); the static
 * `TabManager` registry/facade routes to the right one.
 */
export class WindowTabs {
  private readonly store = new TabStore();
  /** WebContentsViews for `web` tabs (internal tabs have none), keyed by tab id. */
  private readonly views = new Map<string, WebContentsView>();
  private bounds: Rectangle = { x: 0, y: 0, width: 0, height: 0 };
  private contentVisible = true;
  /** Debounce handle for persisting the session snapshot (coalesces bursts of state changes). */
  private persistTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly win: BrowserWindow) {}

  /** The owning chrome window (for the registry / focused-window resolution). */
  get window(): BrowserWindow {
    return this.win;
  }

  /** Tear down all views + state when the window closes (prevents stale tabs leaking). Called by the
   *  registry on `unregister`. */
  dispose(): void {
    // Cancel any pending debounced persist so it can't fire AFTER the store is cleared and overwrite the
    // just-saved snapshot with an empty one. Callers persist synchronously before dispose (see index.ts).
    if (this.persistTimer !== null) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    for (const view of this.views.values()) {
      // Electron teardown order: detach from the window first, THEN close the contents — closing an
      // attached view can race its compositor/storage teardown against the window's own destruction.
      if (!this.win.isDestroyed()) this.win.contentView.removeChildView(view);
      if (!view.webContents.isDestroyed()) {
        this.unwireView(view);
        view.webContents.close();
      }
    }
    this.views.clear();
    this.store.clear();
  }

  /** Create a new tab, or `null` if an enabled extension's `tab:create` interceptor blocked it. */
  createTab(
    rawUrl?: string,
    opts?: { background?: boolean; openerId?: string | undefined },
  ): string | null {
    // A blank new tab (Ctrl+T, the "+" button, new-tab-to-the-right, startup) lands on the internal
    // new-tab page — the AI / Favorites / Blank chooser — rather than a web page. It's a view-less
    // internal tab, created fresh each time (never deduped) so every new tab is its own.
    if (rawUrl === undefined) {
      return this.createInternalTab(INTERNAL_NEWTAB_URL, opts);
    }
    // Internal pages (tepegoz://…, incl. extension `page` surfaces) are rendered by the trusted chrome
    // in a view-less internal tab — never handed to `toNavigationUrl`, which would treat the scheme as
    // a search query and open a web search for it.
    const internal = internalPageUrl(rawUrl);
    if (internal !== null) {
      return this.createInternalTab(internal, opts);
    }
    const home = homeUrl();
    const target = toNavigationUrl(rawUrl, home, searchUrlForQuery);
    if (
      ActionInterceptorService.shouldBlock('tab:create', {
        url: target,
        openerId: opts?.openerId ?? null,
        background: opts?.background === true,
      })
    ) {
      return null;
    }
    const view = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        webSecurity: true,
        partition: BROWSING_PARTITION,
      },
    });
    const id = this.store.add({
      kind: 'web',
      title: '',
      url: '',
      isLoading: true,
      faviconUrl: null,
    });
    this.views.set(id, view);
    this.wireView(id, view);

    // A tab spawned FROM a grouped tab (window.open, "open link in new tab", duplicate, new-tab-right)
    // must join that group and sit right after its opener — never break out of the group run (ADR-0020).
    this.inheritGroup(id, opts?.openerId);

    void view.webContents.loadURL(target).catch((err: unknown) => {
      Logger.warn('Tab failed to load', { url: target, err: String(err) });
    });

    // Background tabs (e.g. a non-foreground page's window.open) must NOT steal the foreground.
    if (opts?.background === true && this.store.activeId !== null) {
      this.emitState();
    } else {
      this.activate(id);
    }
    return id;
  }

  /** If `openerId` is a grouped tab, put the new tab in the same group, right after the opener. No-op
   *  when there's no opener or the opener is ungrouped (the tab stays where `add` placed it). */
  private inheritGroup(newId: string, openerId?: string): void {
    if (openerId === undefined) return;
    const opener = this.store.get(openerId);
    if (opener?.groupId == null) return;
    this.store.assignToGroup(newId, opener.groupId);
    this.store.placeAfter(newId, openerId);
  }

  /** The active tab's id (null if none) — lets callers open a new tab as a child of the current tab. */
  activeTabId(): string | null {
    return this.store.activeId;
  }

  /** The active tab's id ONLY when it is a view-less (internal) tab — one that `navigateActive` would
   *  fork into a brand-new web tab rather than navigate in place. Else null. A web tab always owns a
   *  `WebContentsView` from creation (before its first load), so "no view entry" ⟺ internal. The agent
   *  host uses this to replace the newtab in place inside its group instead of orphaning it. */
  viewlessActiveTabId(): string | null {
    const id = this.store.activeId;
    return id !== null && this.views.get(id) === undefined ? id : null;
  }

  activate(id: string): void {
    if (!this.store.has(id)) return;

    // Detach the previously-active view (kept alive in the background), attach the new one. Internal
    // tabs have no view — the chrome renders their page over the (empty) content area.
    const prevId = this.store.activeId;
    if (prevId !== null && prevId !== id) {
      const prevView = this.views.get(prevId);
      if (prevView != null) this.win.contentView.removeChildView(prevView);
    }
    this.store.setActive(id);
    const view = this.views.get(id);
    if (this.contentVisible && view !== undefined) {
      this.win.contentView.addChildView(view);
      view.setBounds(this.bounds);
    }
    this.emitState();
  }

  closeTab(id: string): void {
    if (!this.store.has(id)) return;
    const url = this.store.get(id)?.url ?? '';
    if (ActionInterceptorService.shouldBlock('tab:close', { tabId: id, url })) return;
    const view = this.views.get(id);
    if (view !== undefined) {
      // Remember the URL so Ctrl+Shift+T can reopen it (most-recent first, capped).
      const closedUrl = view.webContents.getURL() || this.store.get(id)?.url || '';
      if (isWebUrl(closedUrl)) {
        closedUrls.push(closedUrl);
        if (closedUrls.length > 25) closedUrls.shift();
      }
      this.win.contentView.removeChildView(view);
      this.unwireView(view);
      view.webContents.close();
      this.views.delete(id);
    }
    const wasActive = this.store.activeId === id;
    this.store.delete(id);
    this.afterRemove(wasActive);
  }

  /** Post-removal bookkeeping shared by `closeTab` and `detachTab`: reselect the active tab, or close
   *  the window when the last tab is gone (→ the app quits on non-macOS via `window-all-closed`). */
  private afterRemove(wasActive: boolean): void {
    // Closing the final tab closes the window instead of leaving an empty chrome over a blank content
    // area — the app then quits (non-macOS) via the `window-all-closed` handler, or on macOS follows
    // the platform convention of an open-but-window-less app.
    if (this.store.ids().length === 0) {
      if (!this.win.isDestroyed()) this.win.close();
      return;
    }
    if (wasActive) {
      this.store.setActive(null);
      const next = this.store.ids().at(-1);
      if (next !== undefined) {
        this.activate(next);
      } else {
        this.emitState();
      }
    } else {
      this.emitState();
    }
  }

  /** Reload a specific tab (context menu) — distinct from reloadActive (omnibox/shortcut). */
  reloadTab(id: string): void {
    this.views.get(id)?.webContents.reload();
  }

  /** Open (or focus) an internal page tab (tepegoz://settings, tepegoz://extensions) — rendered by
   *  the chrome, no web view. A new-tab experience for internal pages, mirroring Chrome's chrome://. */
  openInternalPage(url: string): void {
    const baseUrl = internalBaseUrl(url);
    const existing = this.store.records().find((rec) => rec.kind === 'internal' && internalBaseUrl(rec.url) === baseUrl)?.id;
    if (existing !== undefined) {
      this.store.update(existing, { url, title: this.internalTitle(url) });
      this.activate(existing);
      return;
    }
    const id = this.store.add({
      kind: 'internal',
      title: this.internalTitle(url),
      url,
      isLoading: false,
      faviconUrl: null,
    });
    this.activate(id);
  }

  /** Create a fresh internal (view-less) tab for `url`, honouring opener-group inheritance and the
   *  background flag — the internal-page counterpart of `createTab`'s web path. Unlike
   *  `openInternalPage` it never focuses an existing tab of the same URL, so multiple blank new-tab
   *  pages can coexist. Returns `null` if an extension interceptor blocked the create. */
  private createInternalTab(
    url: string,
    opts?: { background?: boolean; openerId?: string | undefined },
  ): string | null {
    if (
      ActionInterceptorService.shouldBlock('tab:create', {
        url,
        openerId: opts?.openerId ?? null,
        background: opts?.background === true,
      })
    ) {
      return null;
    }
    const id = this.store.add({
      kind: 'internal',
      title: this.internalTitle(url),
      url,
      isLoading: false,
      faviconUrl: null,
    });
    this.inheritGroup(id, opts?.openerId);
    if (opts?.background === true && this.store.activeId !== null) {
      this.emitState();
    } else {
      this.activate(id);
    }
    return id;
  }

  private internalTitle(url: string): string {
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

  /** Open a fresh tab immediately to the right of `refId` and focus it (Chrome's "New tab to the right"). */
  createTabRight(refId: string): void {
    if (!this.store.has(refId)) return;
    // openerId → inherits refId's group (if any); placeAfter fixes the position for the ungrouped case.
    const newId = this.createTab(undefined, { openerId: refId });
    if (newId === null) return;
    this.store.placeAfter(newId, refId);
    this.emitState();
  }

  /** Duplicate a tab's current URL into a new tab placed right after it, and focus it. */
  duplicateTab(id: string): void {
    const rec = this.store.get(id);
    if (rec === undefined) return;
    const view = this.views.get(id);
    if (view === undefined) {
      this.openInternalPage(rec.url); // internal page → just focus it (nothing to duplicate)
      return;
    }
    const url = view.webContents.getURL() || rec.url;
    const newId = this.createTab(url.length > 0 ? url : undefined, { openerId: id });
    if (newId === null) return;
    this.store.placeAfter(newId, id);
    this.emitState();
  }

  /** Close every tab except `id`, keeping `id` active. */
  closeOtherTabs(id: string): void {
    if (!this.store.has(id)) return;
    if (this.store.activeId !== id) this.activate(id);
    for (const other of this.store.ids().filter((k) => k !== id)) {
      this.closeTab(other);
    }
  }

  /** Close all tabs ordered after `id`. */
  closeTabsToRight(id: string): void {
    const ids = this.store.ids();
    const idx = ids.indexOf(id);
    if (idx === -1) return;
    const toClose = ids.slice(idx + 1);
    // If the active tab is being closed, fall back to the reference tab first.
    const activeId = this.store.activeId;
    if (activeId !== null && toClose.includes(activeId)) {
      this.activate(id);
    }
    for (const k of toClose) this.closeTab(k);
  }

  // ── Groups, ordering & pinning ───────────────────────────────────────────────────────────────
  // Thin delegates to the pure TabStore (invariants + contiguity live there, ADR-0020). Each mutates
  // the store then re-emits state so the strip re-renders.

  /** Drag-reorder: move `id` to `toIndex`. `intoGroupId` resolves membership (see TabStore.moveTab). */
  moveTab(id: string, toIndex: number, intoGroupId?: string | null): void {
    if (!this.store.has(id)) return;
    this.store.moveTab(id, toIndex, intoGroupId);
    this.emitState();
  }

  /** Reorder a whole group's run to `toIndex` among the non-member tabs. */
  moveGroup(groupId: string, toIndex: number): void {
    this.store.moveGroup(groupId, toIndex);
    this.emitState();
  }

  /** Create a group from `memberIds` (defaults to the active tab) and return the new group id. */
  createGroup(memberIds?: string[]): string {
    const members =
      memberIds !== undefined && memberIds.length > 0
        ? memberIds.filter((id) => this.store.has(id))
        : this.activeGroupSeed();
    const id = this.store.createGroup({ memberIds: members });
    this.emitState();
    return id;
  }

  /** The default single-member seed for "new group" from a context menu (the clicked/active tab). */
  private activeGroupSeed(): string[] {
    const active = this.store.activeId;
    return active !== null ? [active] : [];
  }

  /** Whether a group with this id still exists (its members may all have been closed). Lets the agent's
   *  per-conversation grouping tell "reuse my group" from "the user closed it → open a fresh one". */
  hasGroup(groupId: string): boolean {
    return this.store.getGroup(groupId) !== undefined;
  }

  assignToGroup(tabId: string, groupId: string): void {
    this.store.assignToGroup(tabId, groupId);
    this.emitState();
  }

  removeFromGroup(tabId: string): void {
    this.store.removeFromGroup(tabId);
    this.emitState();
  }

  renameGroup(groupId: string, name: string): void {
    this.store.renameGroup(groupId, name);
    this.emitState();
  }

  recolorGroup(groupId: string, color: TabGroupColor): void {
    this.store.recolorGroup(groupId, color);
    this.emitState();
  }

  setGroupCollapsed(groupId: string, collapsed: boolean): void {
    this.store.setGroupCollapsed(groupId, collapsed);
    this.emitState();
  }

  /** Merge-patch a group's extensible settings bag (the per-tab-group settings standard). */
  updateGroupSettings(groupId: string, patch: Record<string, TabGroupSettingValue>): void {
    this.store.updateGroupSettings(groupId, patch);
    this.emitState();
  }

  ungroup(groupId: string): void {
    this.store.ungroup(groupId);
    this.emitState();
  }

  /** Open a new tab already assigned to `groupId` (group menu → "New tab in group"). */
  newTabInGroup(groupId: string): void {
    if (this.store.getGroup(groupId) === undefined) return;
    const id = this.createTab();
    if (id === null) return;
    this.store.assignToGroup(id, groupId);
    this.emitState();
  }

  /** Close every tab in a group (group menu → "Close group"). */
  closeGroup(groupId: string): void {
    const memberIds = this.store
      .records()
      .filter((r) => r.groupId === groupId)
      .map((r) => r.id);
    for (const id of memberIds) this.closeTab(id);
  }

  /** The colors + current color of a group, for building the native group menu (undefined if unknown). */
  groupMenuInfo(groupId: string): { color: TabGroupColor } | undefined {
    const g = this.store.getGroup(groupId);
    return g !== undefined ? { color: g.color } : undefined;
  }

  /** Pin / unpin a tab (moves to the pinned run; pinning clears group membership). */
  setPinned(id: string, pinned: boolean): void {
    if (!this.store.has(id)) return;
    this.store.setPinned(id, pinned);
    this.emitState();
  }

  // ── Cross-window move primitives (tear-off / merge) ────────────────────────────────────────────

  /** Whether a tab / group id currently lives in this window's store. */
  hasTab(id: string): boolean {
    return this.store.has(id);
  }

  /** The tab ids of a group's contiguous run in this window (strip order), or [] when unknown. */
  groupMemberIds(groupId: string): string[] {
    return this.store
      .records()
      .filter((r) => r.groupId === groupId)
      .map((r) => r.id);
  }

  /**
   * Remove a tab from THIS window WITHOUT destroying its view, returning everything needed to re-home it
   * in another window (`adoptTab`). The `WebContentsView` + its live webContents survive — the caller
   * must adopt it or the view leaks. Reselects the active tab / closes an emptied window, exactly like
   * `closeTab`. Returns `null` for an unknown id.
   */
  detachTab(id: string): DetachedTab | null {
    const rec = this.store.get(id);
    if (rec === undefined) return null;
    const group =
      rec.groupId !== null ? this.store.getGroup(rec.groupId) ?? null : null;
    const view = this.views.get(id) ?? null;
    if (view !== null) {
      this.win.contentView.removeChildView(view);
      this.unwireView(view); // drop OUR handlers; the destination re-wires bound to itself
      this.views.delete(id);
    }
    const detached: DetachedTab = {
      record: { ...rec },
      view,
      group: group !== null ? { ...group } : null,
    };
    const wasActive = this.store.activeId === id;
    this.store.delete(id);
    this.afterRemove(wasActive);
    return detached;
  }

  /**
   * Adopt a tab detached from another window into THIS window. Mints a FRESH id (ids are per-store),
   * re-creates the source group (reusing its stable UUID) when the tab was grouped, re-wires the live
   * view bound to this instance (no reload), and focuses it at `atIndex` (appended when omitted).
   */
  adoptTab(detached: DetachedTab, atIndex?: number): string {
    const { record, view, group } = detached;
    const newId = this.store.add({
      kind: record.kind,
      title: record.title,
      url: record.url,
      isLoading: record.isLoading,
      faviconUrl: record.faviconUrl,
      pinned: record.pinned,
    });
    if (view !== null) {
      this.views.set(newId, view);
      this.wireView(newId, view);
    }
    if (group !== null) {
      if (this.store.getGroup(group.id) === undefined) {
        this.store.createGroup({
          id: group.id,
          name: group.name,
          color: group.color,
          collapsed: group.collapsed,
          settings: group.settings,
        });
      }
      this.store.assignToGroup(newId, group.id);
    }
    if (atIndex !== undefined) {
      this.store.moveTab(newId, atIndex, group !== null ? group.id : null);
    }
    this.activate(newId); // a merged/torn tab takes focus in its new window (Chrome parity)
    return newId;
  }

  navigateActive(rawUrl: string): void {
    // Internal pages (tepegoz://…) open as their own tab, rendered by the trusted chrome.
    const internal = internalPageUrl(rawUrl);
    if (internal !== null) {
      this.openInternalPage(internal);
      return;
    }
    const rec = this.store.active();
    if (rec === undefined) return;
    const url = toNavigationUrl(rawUrl, homeUrl(), searchUrlForQuery);
    const view = this.views.get(rec.id);
    if (view === undefined) {
      this.createTab(url); // typing a URL while on an internal page opens a new web tab
      return;
    }
    void view.webContents.loadURL(url).catch((err: unknown) => {
      Logger.warn('Navigation failed', { url, err: String(err) });
    });
  }

  /** Navigate a specific existing web tab. Returns false for missing/internal tabs. */
  navigateTab(id: string, rawUrl: string): boolean {
    if (!this.store.has(id)) return false;
    const view = this.views.get(id);
    if (view === undefined) return false;
    const url = toNavigationUrl(rawUrl, homeUrl(), searchUrlForQuery);
    void view.webContents.loadURL(url).catch((err: unknown) => {
      Logger.warn('Navigation failed', { url, err: String(err) });
    });
    return true;
  }

  goBack(): void {
    const wc = this.activeView()?.webContents;
    if (wc?.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
  }

  goForward(): void {
    const wc = this.activeView()?.webContents;
    if (wc?.navigationHistory.canGoForward()) wc.navigationHistory.goForward();
  }

  reloadActive(): void {
    this.activeView()?.webContents.reload();
  }

  /** Print the active web page (opens the system print dialog). Page context menu → Print. */
  printActive(): void {
    this.activeView()?.webContents.print();
  }

  /** Open the active page's HTML source in place (Chrome's `view-source:`). Web pages only. */
  viewSourceActive(): void {
    const wc = this.activeView()?.webContents;
    if (wc === undefined) return;
    const url = wc.getURL();
    if (isWebUrl(url)) void wc.loadURL(`view-source:${url}`).catch(() => undefined);
  }

  /** Save the active page through the central DownloadService (quarantine + audit). */
  saveActive(): void {
    const wc = this.activeView()?.webContents;
    if (wc !== undefined) DownloadService.downloadURL(wc, wc.getURL(), { actor: 'user' });
  }

  /** Download a specific URL through the active view (Save image/video/audio as → OS save dialog). */
  downloadUrlActive(url: string): void {
    const wc = this.activeView()?.webContents;
    if (wc !== undefined) DownloadService.downloadURL(wc, url, { actor: 'user' });
  }

  /** Editing commands on the active page (page context menu → Cut/Copy/Paste/Select all). */
  copyActive(): void {
    ClipboardService.copy(this.activeView()?.webContents);
  }
  cutActive(): void {
    ClipboardService.cut(this.activeView()?.webContents);
  }
  pasteActive(): void {
    ClipboardService.paste(this.activeView()?.webContents);
  }
  selectAllActive(): void {
    ClipboardService.selectAll(this.activeView()?.webContents);
  }

  /** Copy the image at the given view-relative coordinates (px) to the clipboard. */
  copyImageAtActive(x: number, y: number): void {
    ClipboardService.copyImageAt(this.activeView()?.webContents, x, y);
  }

  /** Open DevTools and inspect the element at the given view-relative coordinates (px). */
  inspectActiveAt(x: number, y: number): void {
    const wc = this.activeView()?.webContents;
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
  goHome(): void {
    this.navigateActive(homeUrl());
  }

  /** The current content-area bounds (DIP, shell-window-relative). Used to offset CDP coordinates
   *  (which are view-relative) to shell-window-relative coordinates for the cursor overlay. */
  getContentBounds(): Rectangle {
    return { ...this.bounds };
  }

  /** The content area (below the chrome), in DIP, as measured by the renderer. */
  setContentBounds(bounds: Rectangle): void {
    this.bounds = bounds;
    if (this.contentVisible) {
      this.activeView()?.setBounds(bounds);
    }
  }

  /** Hide the active web view so a chrome-rendered overlay (Agent Console) shows through. Internal
   *  tabs have no view, so this is a no-op for them. */
  setContentVisible(visible: boolean): void {
    this.contentVisible = visible;
    const view = this.activeView();
    if (view === undefined) return;
    if (visible) {
      this.win.contentView.addChildView(view);
      view.setBounds(this.bounds);
    } else {
      this.win.contentView.removeChildView(view);
    }
  }

  getState(): TabsState {
    const wc = this.activeView()?.webContents;
    return this.store.toState({
      canGoBack: wc?.navigationHistory.canGoBack() ?? false,
      canGoForward: wc?.navigationHistory.canGoForward() ?? false,
    });
  }

  /** The active tab's WebContentsView, or undefined for no-active / internal (view-less) tabs. */
  private activeView(): WebContentsView | undefined {
    const id = this.store.activeId;
    return id !== null ? this.views.get(id) : undefined;
  }

  /** The active tab's webContents, for the agent perception layer (read DOM text). Null if none or
   *  destroyed. The agent reads through this; it never gets the chrome's webContents or contextBridge. */
  activeWebContents(): WebContents | null {
    const wc = this.activeView()?.webContents;
    return wc !== undefined && !wc.isDestroyed() ? wc : null;
  }

  /** A specific tab's WebContents, or null for missing/internal/destroyed tabs. */
  webContentsForTab(id: string): WebContents | null {
    const wc = this.views.get(id)?.webContents;
    return wc !== undefined && !wc.isDestroyed() ? wc : null;
  }

  /** Snapshot the active web view as a PNG data URL (null for internal/no-view tabs or on failure). */
  async captureActive(): Promise<string | null> {
    const wc = this.activeWebContents();
    if (wc === null) return null;
    try {
      const image = await wc.capturePage();
      return image.isEmpty() ? null : image.toDataURL();
    } catch {
      return null;
    }
  }

  /** Apply a resolved User-Agent to every open web tab in this window and reload it. */
  applyUserAgent(ua: string): void {
    for (const view of this.views.values()) {
      const wc = view.webContents;
      if (!wc.isDestroyed()) {
        wc.setUserAgent(ua);
        wc.reload();
      }
    }
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

  /** Drop everything `wireView` attached BEFORE closing the contents (or before re-homing the view in
   *  another window): the handlers close over the tab id + this instance and would otherwise keep firing
   *  (and pin their closures) through teardown. Only our own events are removed — Electron's internal
   *  listeners stay untouched. */
  private unwireView(view: WebContentsView): void {
    const wc = view.webContents;
    for (const event of WindowTabs.WIRED_EVENTS) {
      wc.removeAllListeners(event);
    }
  }

  private wireView(id: string, view: WebContentsView): void {
    const wc = view.webContents;

    // Track discrete user input so the popup blocker can tell a user-clicked new-tab link (which must
    // open) from an unsolicited auto-popup (which is blocked). See the window-open handler below.
    wc.on('input-event', (_e, input) => {
      if (isActivatingInput(input.type)) lastGestureAt.set(wc, Date.now());
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
      if (
        !hadRecentGesture(wc) &&
        ActionInterceptorService.shouldBlock('popup:open', { sourceOrigin, url: target })
      ) {
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
            : id !== this.store.activeId;
      // Spawned by the page → the opener is THIS tab, so the new tab inherits its group (ADR-0020).
      this.createTab(target, { background, openerId: id });
      return { action: 'deny' };
    });
    // A natively-allowed popup opens its own top-level window; harden it the same way as a browsed view
    // (block dangerous schemes, and route ITS nested popups through the same policy).
    wc.on('did-create-window', (win) => {
      this.wirePopupWindow(win.webContents);
    });
    // Block dangerous schemes on BOTH initial navigations and server-side redirects (will-navigate
    // alone misses redirect hops); ALSO consult the `navigation:navigate` interceptor (ADR-0022) —
    // native popup windows (`wirePopupWindow`) skip this second check, they have no tracked tab id.
    wc.on('will-navigate', (event, url) => {
      blockNonWeb(event, url);
      if (ActionInterceptorService.shouldBlock('navigation:navigate', { tabId: id, url, isRedirect: false })) {
        event.preventDefault();
      }
    });
    wc.on('will-redirect', (event, url) => {
      blockNonWeb(event, url);
      if (ActionInterceptorService.shouldBlock('navigation:navigate', { tabId: id, url, isRedirect: true })) {
        event.preventDefault();
      }
    });

    // Right-click on the page → open the Chrome-style page context menu as a rendered popup window
    // (same primitive as the main menu), anchored at the click point (offset by the view's own bounds).
    // `params` (selection/link/media/editable) picks the menu variant in the renderer.
    wc.on('context-menu', (_e, params) => {
      if (!this.win.isDestroyed()) {
        void openPageContextMenu(this.win, wc, params, this.bounds, {
          canGoBack: wc.navigationHistory.canGoBack(),
          canGoForward: wc.navigationHistory.canGoForward(),
        });
      }
    });

    const sync = (): void => {
      this.store.update(id, {
        url: wc.getURL(),
        title: wc.getTitle(),
        isLoading: wc.isLoadingMainFrame(),
      });
      this.emitState();
    };
    wc.on('page-title-updated', (_e, title) => {
      this.store.update(id, { title });
      const db = getDb();
      const url = wc.getURL();
      // Page-controlled string — cap before persisting so a hostile title can't bloat the DB.
      if (db !== null && isWebUrl(url))
        HistoryStore.setTitle(db, url, title.slice(0, MAX_TITLE_LENGTH));
      this.emitState();
    });
    // Electron sends every favicon a page declares; the last is typically the largest/most specific.
    wc.on('page-favicon-updated', (_e, favicons) => {
      this.store.update(id, { faviconUrl: favicons.at(-1) ?? null });
      this.emitState();
    });
    wc.on('did-start-loading', () => {
      this.store.update(id, { isLoading: true });
      this.emitState();
    });
    wc.on('did-stop-loading', () => {
      sync();
      const url = wc.getURL();
      if (isWebUrl(url)) {
        for (const obs of navigationObservers) obs(url, wc, this.win);
      }
    });
    // A committed top-level navigation means a new document — drop the old favicon so a stale icon
    // from the previous page can't linger (the new one arrives via page-favicon-updated).
    wc.on('did-navigate', () => {
      this.store.update(id, { faviconUrl: null });
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
  private wirePopupWindow(wc: WebContents): void {
    wc.on('input-event', (_e, input) => {
      if (isActivatingInput(input.type)) lastGestureAt.set(wc, Date.now());
    });
    wc.setWindowOpenHandler((details) => {
      const target = popupTargetUrl(details.url);
      const sourceOrigin = originOf(wc.getURL());
      if (
        !hadRecentGesture(wc) &&
        ActionInterceptorService.shouldBlock('popup:open', { sourceOrigin, url: target })
      ) {
        return { action: 'deny' };
      }
      if (isWebUrl(target) || needsNativeWindow(details.url) || wantsNativeWindow(details)) {
        return { action: 'allow', overrideBrowserWindowOptions: POPUP_WINDOW_OPTIONS };
      }
      return { action: 'deny' };
    });
    wc.on('did-create-window', (win) => {
      this.wirePopupWindow(win.webContents);
    });
    wc.on('will-navigate', blockNonWeb);
    wc.on('will-redirect', blockNonWeb);
  }

  private emitState(): void {
    if (!this.win.isDestroyed()) {
      this.win.webContents.send(IpcChannels.tabsState, this.getState());
      this.syncWindowTitle();
    }
    this.schedulePersist();
  }

  /** Reflect the active tab in the OS window title (taskbar / Alt-Tab): "<tab title> - Tepegöz",
   *  falling back to just "Tepegöz" when the active tab has no title yet. */
  private syncWindowTitle(): void {
    const title = this.store.active()?.title.trim() ?? '';
    this.win.setTitle(title.length > 0 ? `${title} - Tepegöz` : 'Tepegöz');
  }

  // ── Session restore ────────────────────────────────────────────────────────────────────────────

  /** Reopen the most-recently-closed tab (Ctrl+Shift+T). No-op when the stack is empty. */
  reopenClosedTab(): void {
    const url = closedUrls.pop();
    if (url !== undefined) this.createTab(url);
  }

  /** This window's restorable snapshot: ordered web tabs (URL + pin + group membership), group metadata,
   *  active index, and window bounds. Internal (view-less) tabs and blank/unloaded tabs are skipped —
   *  only real web pages are restored (ADR-0020). Contributes one entry to the multi-window session. */
  snapshot(): WindowSnapshot {
    const tabs: PersistedTab[] = [];
    let activeIndex = -1;
    for (const rec of this.store.records()) {
      // Prefer the live URL, but on window close the webContents may already be gone — fall back to the
      // last synced record URL so the closing snapshot still captures every tab.
      const wc = this.views.get(rec.id)?.webContents;
      const url = (wc !== undefined && !wc.isDestroyed() ? wc.getURL() : '') || rec.url;
      if (rec.kind !== 'web' || !isWebUrl(url)) continue;
      if (rec.id === this.store.activeId) activeIndex = tabs.length;
      tabs.push({ url, pinned: rec.pinned, groupId: rec.groupId });
    }
    // Only persist groups that still own at least one persisted (web) tab.
    const liveGroups = new Set(
      tabs.map((t) => t.groupId).filter((g): g is string => g !== null),
    );
    const groups: PersistedGroup[] = this.store
      .groupsInOrder()
      .filter((g) => liveGroups.has(g.id))
      .map((g) => ({ id: g.id, name: g.name, color: g.color, collapsed: g.collapsed, settings: g.settings }));
    const snap: WindowSnapshot = { tabs, groups, activeIndex };
    if (!this.win.isDestroyed()) {
      const b = this.win.getBounds();
      snap.bounds = { x: b.x, y: b.y, width: b.width, height: b.height };
    }
    return snap;
  }

  /** Debounced session persist — coalesces the burst of state changes during a page load into one write. */
  private schedulePersist(): void {
    if (this.persistTimer !== null) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      TabManager.persistNow();
    }, 400);
  }

  /** Restore one window's persisted tabs into THIS window. Returns true if any tab was restored (so the
   *  caller can skip opening a default blank tab). */
  restoreWindow(snap: WindowSnapshot): boolean {
    if (snap.tabs.length === 0) return false;

    // 1. Recreate tabs in order, remembering the persisted-index → new-tab-id mapping.
    const createdIds = snap.tabs.map((t, i) =>
      // First tab takes focus; the rest open in the background so they don't each steal it.
      this.createTab(t.url, { background: i !== 0 }),
    );

    // 2. Re-create groups with their metadata, then restore membership + pins (order changes as the
    //    store normalizes, so we track the ACTIVE tab by id, not by the persisted index). A `null`
    //    entry means that tab's `tab:create` was blocked by an extension interceptor — skip it.
    for (const pg of snap.groups) {
      const memberIds = snap.tabs
        .map((t, i) => (t.groupId === pg.id ? createdIds[i] ?? null : null))
        .filter((id): id is string => id !== null);
      if (memberIds.length === 0) continue;
      // `id: pg.id` reuses the group's stable (pre-restart) UUID so `settings` stays keyed correctly.
      this.store.createGroup({
        id: pg.id,
        name: pg.name,
        color: asGroupColor(pg.color),
        collapsed: pg.collapsed,
        settings: pg.settings,
        memberIds,
      });
    }
    snap.tabs.forEach((t, i) => {
      const id = createdIds[i];
      if (t.pinned && id !== null && id !== undefined) this.store.setPinned(id, true);
    });

    // 3. Activate the persisted active tab by its new id (robust to the normalized reordering).
    const activeId =
      snap.activeIndex >= 0 && snap.activeIndex < createdIds.length
        ? createdIds[snap.activeIndex]
        : undefined;
    if (activeId !== undefined && activeId !== null) this.activate(activeId);
    else this.emitState();
    return true;
  }
}

/**
 * Static registry + facade over the per-window `WindowTabs` instances. Window-scoped IPC resolves the
 * sender window via {@link forWindow}; agent / menu / host code that means "the current browser" resolves
 * the {@link focused} window. Session-wide concerns (navigation observers, reopen stack) are shared.
 */
export default class TabManager {
  private static readonly registry = new Map<BrowserWindow, WindowTabs>();
  private static lastFocusedWin: BrowserWindow | null = null;
  private static lastPersistedSessionJson: string | null = null;

  // ── Registry ─────────────────────────────────────────────────────────────────────────────────

  /** Create + register a `WindowTabs` for a freshly-created chrome window. Idempotent per window. */
  static register(win: BrowserWindow): WindowTabs {
    const existing = TabManager.registry.get(win);
    if (existing !== undefined) return existing;
    const wt = new WindowTabs(win);
    TabManager.registry.set(win, wt);
    TabManager.lastFocusedWin = win;
    win.on('focus', () => {
      TabManager.lastFocusedWin = win;
    });
    return wt;
  }

  /** Persist + tear down a window's tabs when it closes. */
  static unregister(win: BrowserWindow): void {
    const wt = TabManager.registry.get(win);
    if (wt === undefined) return;
    wt.dispose();
    TabManager.registry.delete(win);
    if (TabManager.lastFocusedWin === win) TabManager.lastFocusedWin = null;
  }

  /** The `WindowTabs` for a specific window (undefined if it isn't a registered chrome window). */
  static forWindow(win: BrowserWindow | null): WindowTabs | undefined {
    return win !== null ? TabManager.registry.get(win) : undefined;
  }

  /** The `WindowTabs` owning the chrome webContents that sent an IPC message. */
  static forSender(wc: WebContents): WindowTabs | undefined {
    return TabManager.forWindow(BrowserWindow.fromWebContents(wc));
  }

  /**
   * Resolve the tab manager for a window that sent a tab IPC message. Popup surfaces (main menu, page
   * context menu) are child windows, so walk the `parent` chain to reach the owning browser window;
   * fall back to the focused window for anything unattached. This is the routing seam every tab IPC
   * handler uses so actions land in the RIGHT window (multi-window), while menu popups still work.
   */
  static forSenderWindow(win: BrowserWindow | null): WindowTabs | undefined {
    let w: BrowserWindow | null = win;
    while (w !== null && !w.isDestroyed()) {
      const wt = TabManager.registry.get(w);
      if (wt !== undefined) return wt;
      w = w.getParentWindow();
    }
    return TabManager.focused();
  }

  /** The focused (or last-focused, or any) window's tabs — the target for agent / menu / host code that
   *  means "the current browser". Undefined only when no chrome window exists. */
  static focused(): WindowTabs | undefined {
    const last = TabManager.lastFocusedWin;
    if (last !== null && !last.isDestroyed()) {
      const wt = TabManager.registry.get(last);
      if (wt !== undefined) return wt;
    }
    for (const wt of TabManager.registry.values()) {
      if (!wt.window.isDestroyed()) return wt;
    }
    return undefined;
  }

  /** The focused chrome window itself (toast / cursor / permission target), or null when none. */
  static focusedWindow(): BrowserWindow | null {
    return TabManager.focused()?.window ?? null;
  }

  /** Every registered window's tabs (broadcast operations, session persist). */
  static all(): WindowTabs[] {
    return [...TabManager.registry.values()];
  }

  // ── Session-wide (shared) ──────────────────────────────────────────────────────────────────────

  /** Register a callback invoked after each committed top-level page load, in ANY window. Returns an
   *  unsubscribe fn. */
  static onNavigation(fn: NavigationObserver): () => void {
    navigationObservers.add(fn);
    return () => { navigationObservers.delete(fn); };
  }

  /** Apply a resolved User-Agent to every open web tab across all windows and reload. */
  static applyUserAgent(ua: string): void {
    for (const wt of TabManager.all()) wt.applyUserAgent(ua);
  }

  /** Persist every window's session snapshot immediately (called on quit + window close, before
   *  dispose). Each registered window contributes one entry; windows with no restorable web tabs are
   *  dropped so an empty/internal-only window doesn't clutter the restore. */
  static persistNow(): void {
    const db = getDb();
    if (db === null) return;
    const windows = TabManager.all()
      .map((wt) => wt.snapshot())
      .filter((w) => w.tabs.length > 0);
    const snapshot = { version: 3 as const, windows };
    const serialized = JSON.stringify(snapshot);
    if (serialized === TabManager.lastPersistedSessionJson) return;
    try {
      SessionStore.save(db, snapshot);
      TabManager.lastPersistedSessionJson = serialized;
    } catch (err) {
      Logger.warn('Failed to persist session', { err: String(err) });
      return;
    }
    try {
      EventJournal.append(db, {
        id: randomUUID(),
        type: 'SessionSnapshotWritten',
        ts: Date.now(),
        actor: 'system',
        correlationId: 'session-restore',
        redacted: true,
        payload: {
          version: 3,
          windowCount: windows.length,
          tabCount: windows.reduce((sum, w) => sum + w.tabs.length, 0),
          groupCount: windows.reduce((sum, w) => sum + w.groups.length, 0),
          activeWindowCount: windows.filter((w) => w.activeIndex >= 0).length,
        },
      });
    } catch (err) {
      Logger.warn('Failed to append session snapshot journal event', { err: String(err) });
    }
  }

  // ── Facade (delegates to the focused window) ───────────────────────────────────────────────────
  // The many agent / macro / task / menu / host callers that predate multi-window keep calling
  // `TabManager.x(...)`; each resolves the focused window. IPC handlers that know their sender window
  // call `TabManager.forWindow(win).x(...)` directly for window-accurate routing.

  static createTab(rawUrl?: string, opts?: { background?: boolean; openerId?: string | undefined }): string | null {
    return TabManager.focused()?.createTab(rawUrl, opts) ?? null;
  }
  static activeTabId(): string | null {
    return TabManager.focused()?.activeTabId() ?? null;
  }
  static viewlessActiveTabId(): string | null {
    return TabManager.focused()?.viewlessActiveTabId() ?? null;
  }
  static activate(id: string): void {
    TabManager.focused()?.activate(id);
  }
  static closeTab(id: string): void {
    TabManager.focused()?.closeTab(id);
  }
  static reloadTab(id: string): void {
    TabManager.focused()?.reloadTab(id);
  }
  static openInternalPage(url: string): void {
    TabManager.focused()?.openInternalPage(url);
  }
  static createTabRight(refId: string): void {
    TabManager.focused()?.createTabRight(refId);
  }
  static duplicateTab(id: string): void {
    TabManager.focused()?.duplicateTab(id);
  }
  static closeOtherTabs(id: string): void {
    TabManager.focused()?.closeOtherTabs(id);
  }
  static closeTabsToRight(id: string): void {
    TabManager.focused()?.closeTabsToRight(id);
  }
  static moveTab(id: string, toIndex: number, intoGroupId?: string | null): void {
    TabManager.focused()?.moveTab(id, toIndex, intoGroupId);
  }
  static moveGroup(groupId: string, toIndex: number): void {
    TabManager.focused()?.moveGroup(groupId, toIndex);
  }
  static createGroup(memberIds?: string[]): string {
    return TabManager.focused()?.createGroup(memberIds) ?? '';
  }
  static hasGroup(groupId: string): boolean {
    return TabManager.focused()?.hasGroup(groupId) ?? false;
  }
  static assignToGroup(tabId: string, groupId: string): void {
    TabManager.focused()?.assignToGroup(tabId, groupId);
  }
  static removeFromGroup(tabId: string): void {
    TabManager.focused()?.removeFromGroup(tabId);
  }
  static renameGroup(groupId: string, name: string): void {
    TabManager.focused()?.renameGroup(groupId, name);
  }
  static recolorGroup(groupId: string, color: TabGroupColor): void {
    TabManager.focused()?.recolorGroup(groupId, color);
  }
  static setGroupCollapsed(groupId: string, collapsed: boolean): void {
    TabManager.focused()?.setGroupCollapsed(groupId, collapsed);
  }
  static updateGroupSettings(groupId: string, patch: Record<string, TabGroupSettingValue>): void {
    TabManager.focused()?.updateGroupSettings(groupId, patch);
  }
  static ungroup(groupId: string): void {
    TabManager.focused()?.ungroup(groupId);
  }
  static newTabInGroup(groupId: string): void {
    TabManager.focused()?.newTabInGroup(groupId);
  }
  static closeGroup(groupId: string): void {
    TabManager.focused()?.closeGroup(groupId);
  }
  static groupMenuInfo(groupId: string): { color: TabGroupColor } | undefined {
    return TabManager.focused()?.groupMenuInfo(groupId);
  }
  static setPinned(id: string, pinned: boolean): void {
    TabManager.focused()?.setPinned(id, pinned);
  }
  static navigateActive(rawUrl: string): void {
    TabManager.focused()?.navigateActive(rawUrl);
  }
  static navigateTab(id: string, rawUrl: string): boolean {
    return TabManager.focused()?.navigateTab(id, rawUrl) ?? false;
  }
  static goBack(): void {
    TabManager.focused()?.goBack();
  }
  static goForward(): void {
    TabManager.focused()?.goForward();
  }
  static reloadActive(): void {
    TabManager.focused()?.reloadActive();
  }
  static printActive(): void {
    TabManager.focused()?.printActive();
  }
  static viewSourceActive(): void {
    TabManager.focused()?.viewSourceActive();
  }
  static saveActive(): void {
    TabManager.focused()?.saveActive();
  }
  static downloadUrlActive(url: string): void {
    TabManager.focused()?.downloadUrlActive(url);
  }
  static copyActive(): void {
    TabManager.focused()?.copyActive();
  }
  static cutActive(): void {
    TabManager.focused()?.cutActive();
  }
  static pasteActive(): void {
    TabManager.focused()?.pasteActive();
  }
  static selectAllActive(): void {
    TabManager.focused()?.selectAllActive();
  }
  static copyImageAtActive(x: number, y: number): void {
    TabManager.focused()?.copyImageAtActive(x, y);
  }
  static inspectActiveAt(x: number, y: number): void {
    TabManager.focused()?.inspectActiveAt(x, y);
  }
  static goHome(): void {
    TabManager.focused()?.goHome();
  }
  static getContentBounds(): Rectangle {
    return TabManager.focused()?.getContentBounds() ?? { x: 0, y: 0, width: 0, height: 0 };
  }
  static setContentBounds(bounds: Rectangle): void {
    TabManager.focused()?.setContentBounds(bounds);
  }
  static setContentVisible(visible: boolean): void {
    TabManager.focused()?.setContentVisible(visible);
  }
  static getState(): TabsState {
    return TabManager.focused()?.getState() ?? EMPTY_TABS_STATE;
  }
  static activeWebContents(): WebContents | null {
    return TabManager.focused()?.activeWebContents() ?? null;
  }
  static webContentsForTab(id: string): WebContents | null {
    return TabManager.focused()?.webContentsForTab(id) ?? null;
  }
  static captureActive(): Promise<string | null> {
    return TabManager.focused()?.captureActive() ?? Promise.resolve(null);
  }
  static reopenClosedTab(): void {
    TabManager.focused()?.reopenClosedTab();
  }
}
