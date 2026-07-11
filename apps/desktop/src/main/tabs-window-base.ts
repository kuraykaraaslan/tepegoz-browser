import {
  WebContentsView,
  type BrowserWindow,
  type Rectangle,
} from 'electron';
import { Logger } from '@tepegoz/libs';
import { INTERNAL_NEWTAB_URL, IpcChannels, type TabsState } from '@tepegoz/desktop-ipc';
import { TabStore } from '@tepegoz/tab-engine';
import { internalPageUrl, toNavigationUrl } from './lib/navigation-url';
import ActionInterceptorService from './extensions/action-interceptors.electron';
import TabManager from './tabs-manager';
import {
  BROWSING_PARTITION,
  homeUrl,
  internalTitleFor,
  searchUrlForQuery,
} from './tabs-shared';
import {
  unwireView,
  wireView as installViewHandlers,
  type ViewWiringHost,
} from './tabs-view-wiring';

/**
 * The state-owning base layer of the per-window tab model, split out of `tabs.ts` (ADR-0010 250-line
 * cap). It holds the `WebContentsView`s, the pure `TabStore`, the content bounds/visibility and the
 * debounced persist timer, and implements the tightly-coupled core: tab creation (web + internal),
 * activation, the shared `emitState`/persist plumbing and the view event-wiring bridge. The cohesive
 * method groups (closing, groups, moves, navigation, session restore) extend this class in sibling
 * modules; the concrete `WindowTabs` at the top of the chain lives in `./tabs`.
 */
export class WindowTabsBase {
  protected readonly store = new TabStore();
  /** WebContentsViews for `web` tabs (internal tabs have none), keyed by tab id. */
  protected readonly views = new Map<string, WebContentsView>();
  protected bounds: Rectangle = { x: 0, y: 0, width: 0, height: 0 };
  protected contentVisible = true;
  /** Debounce handle for persisting the session snapshot (coalesces bursts of state changes). */
  protected persistTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(protected readonly win: BrowserWindow) {}

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
        unwireView(view);
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
  protected inheritGroup(newId: string, openerId?: string): void {
    if (openerId === undefined) return;
    const opener = this.store.get(openerId);
    if (opener?.groupId == null) return;
    this.store.assignToGroup(newId, opener.groupId);
    this.store.placeAfter(newId, openerId);
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

  /** Create a fresh internal (view-less) tab for `url`, honouring opener-group inheritance and the
   *  background flag — the internal-page counterpart of `createTab`'s web path. Unlike
   *  `openInternalPage` it never focuses an existing tab of the same URL, so multiple blank new-tab
   *  pages can coexist. Returns `null` if an extension interceptor blocked the create. */
  protected createInternalTab(
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
      title: internalTitleFor(url),
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

  getState(): TabsState {
    const wc = this.activeView()?.webContents;
    return this.store.toState({
      canGoBack: wc?.navigationHistory.canGoBack() ?? false,
      canGoForward: wc?.navigationHistory.canGoForward() ?? false,
    });
  }

  /** The active tab's WebContentsView, or undefined for no-active / internal (view-less) tabs. */
  protected activeView(): WebContentsView | undefined {
    const id = this.store.activeId;
    return id !== null ? this.views.get(id) : undefined;
  }

  /** Attach our WebContents event handlers to a browsed view (creation / cross-window adopt). */
  protected wireView(id: string, view: WebContentsView): void {
    installViewHandlers(this.viewWiringHost(), id, view);
  }

  /** The collaborators a wired view's handlers reach back into — `bounds` is read lazily so the page
   *  context menu anchors against the live content-area bounds. */
  private viewWiringHost(): ViewWiringHost {
    return {
      win: this.win,
      store: this.store,
      getBounds: () => this.bounds,
      createTab: (rawUrl, opts) => {
        this.createTab(rawUrl, opts);
      },
      emitState: () => {
        this.emitState();
      },
    };
  }

  protected emitState(): void {
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

  /** Debounced session persist — coalesces the burst of state changes during a page load into one write. */
  private schedulePersist(): void {
    if (this.persistTimer !== null) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      TabManager.persistNow();
    }, 400);
  }
}
