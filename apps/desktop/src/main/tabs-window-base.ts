import {
  WebContentsView,
  type BrowserWindow,
  type Rectangle,
  type Session,
  type WebContents,
} from 'electron';
import { Logger } from '@tepegoz/libs';
import { INTERNAL_NEWTAB_URL, IpcChannels, type TabsState } from '@tepegoz/desktop-ipc';
import { TabStore } from '@tepegoz/tab-engine';
import { internalPageUrl, toNavigationUrl } from './lib/navigation-url';
import { resolveViewBounds } from './tabs-content-bounds';
import ActionInterceptorService from './extensions/action-interceptors.electron';
import { homeUrl, internalTitleFor, searchUrlForQuery, persistSession } from './tabs-shared';
import BrowsingSessions from './network/browsing-sessions.electron';
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

  /**
   * The rectangle to size a `WebContentsView` with — `this.bounds` once the renderer has reported a real
   * content region, otherwise a non-zero fallback from the native window's own content size. A
   * `WebContentsView` laid out at 0×0 gives its page `innerWidth/innerHeight === 0`, which makes the
   * agent's render-DOM perception reject EVERY element (the "no interactable elements" blindness the AI-1
   * harness exposed). `this.bounds` starts 0×0 and is only written by the renderer's ResizeObserver IPC
   * (`setContentBounds`), which does not exist until the `App` chrome mounts; a tab whose page loads
   * before that (fresh window, background tab, first-load race) would otherwise be blind. The fallback is
   * a pure transient — the moment the renderer reports a non-zero region it wins. Decision lives in the
   * pure {@link resolveViewBounds} so it is unit-testable without a window.
   */
  protected effectiveBounds(): Rectangle {
    return resolveViewBounds(
      this.bounds,
      this.win.isDestroyed() ? null : this.win.getContentSize(),
    );
  }

  /** Whether `view` is currently a child of the window's content view (attached → composited). */
  protected isAttached(view: WebContentsView): boolean {
    return !this.win.isDestroyed() && this.win.contentView.children.includes(view);
  }

  /**
   * Bounds for a HIDDEN tab's view: the SAME size as the content area (so the page never reflows — a
   * stable viewport the agent can rely on) translated fully off the left of the window so it is clipped
   * and invisible while staying attached + drawn, which keeps its renderer compositing. Position-only
   * (never a size change), which is what makes hide/unhide uninterrupted.
   */
  protected parkedBounds(): Rectangle {
    const b = this.effectiveBounds();
    return { x: -(b.width + 8), y: b.y, width: b.width, height: b.height };
  }

  /** Attach (if a background tab was detached) + park a hidden tab's view off-screen so it keeps
   *  rendering without being visible. No-op for view-less (internal) tabs. */
  protected parkHiddenView(id: string): void {
    const view = this.views.get(id);
    if (view === undefined) return;
    if (!this.isAttached(view)) this.win.contentView.addChildView(view);
    view.setBounds(this.parkedBounds());
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
      // This runs inside the window's `closed` handler, so ANY throw here becomes an uncaught
      // main-process exception rather than a handled error — per view, teardown is best-effort.
      // Observed in the AI-1 harness: a tab still loading when the window closed took down the whole
      // main process (`TypeError: Cannot read properties of undefined (reading 'isDestroyed')`), losing
      // 2 of 3 eval trials. The cause is `view.webContents` being UNDEFINED — once Electron has torn the
      // contents down, the view exposes no `webContents` at all, so an `isDestroyed()` check on it is
      // itself the thing that throws. Hence an existence check, plus a catch for the rest of the race.
      try {
        // Electron teardown order: detach from the window first, THEN close the contents — closing an
        // attached view can race its compositor/storage teardown against the window's own destruction.
        if (!this.win.isDestroyed()) this.win.contentView.removeChildView(view);
        const contents = view.webContents as WebContents | undefined;
        if (contents !== undefined && !contents.isDestroyed()) {
          unwireView(view);
          contents.close();
        }
      } catch (err) {
        Logger.warn('tab view teardown failed', { err: String(err) });
      }
    }
    this.views.clear();
    this.store.clear();
  }

  /** Create a new tab, or `null` if an enabled extension's `tab:create` interceptor blocked it. */
  createTab(
    rawUrl?: string,
    opts?: {
      background?: boolean;
      openerId?: string | undefined;
      /**
       * The browsing session to host this tab's `WebContents` on — a Phase 5 tunnel partition, or the
       * Direct one when omitted. A `WebContents` is bound to its session at CREATION and can never be
       * moved, so this is the only moment a tab's network path can be chosen; anything later has to
       * destroy the view and build a new one.
       */
      session?: Session;
    },
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
        // A concrete Session, never a partition NAME: going through `BrowsingSessions` is what
        // guarantees the filtering/quarantine/User-Agent plane is attached before the view can load
        // anything. A partition string here would let a tab exist on a session nothing ever wired.
        // With no explicit session, the tab is born on the PROFILE-WIDE DEFAULT route rather than
        // always on Direct: a user who set "everything through Tor" and then pressed Ctrl+T would
        // otherwise get a clear-path tab, which is the failure the whole feature exists to prevent.
        session: opts?.session ?? BrowsingSessions.defaultForNewTab(),
        // Never throttle timers/rAF on a non-foreground tab. Complements the startup keep-rendering
        // switches (see index.ts): a hidden tab (attached-occluded) the AI drives, and every background
        // tab, must keep running at full rate — not just keep painting. Trade-off accepted (agentic browser).
        backgroundThrottling: false,
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

    // Size the view BEFORE the load, so the page never lays out at 0×0 (which blinds perception). A
    // background tab is never `activate`d, so this is the ONLY place it is sized until first activation;
    // a foreground tab gets re-sized in `activate` below. Uses the renderer's real bounds once known,
    // else the native-window fallback.
    view.setBounds(this.effectiveBounds());

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
      // Never detach a HIDDEN previous tab: hidden views stay attached (parked off-screen) so they keep
      // rendering uninterrupted for the agent. Only a visible inactive tab is detached here.
      if (prevView != null && this.store.get(prevId)?.hidden !== true) {
        this.win.contentView.removeChildView(prevView);
      }
    }
    this.store.setActive(id);
    const view = this.views.get(id);
    if (this.contentVisible && view !== undefined) {
      this.win.contentView.addChildView(view);
      view.setBounds(this.effectiveBounds());
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

  /** How many tabs this window holds (visible + hidden). Lets close-to-tray keep a window with tabs alive
   *  while letting an empty window (e.g. after the last tab closed) actually close. */
  tabCount(): number {
    return this.store.ids().length;
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
   *  context menu anchors against the live content-area bounds.
   *
   *  `closeTab` is a no-op HERE and overridden in `WindowTabsClosing`, which owns closing: this base
   *  sits below that class in the chain and cannot reference a subclass method. Overriding the factory
   *  is the type-safe way to say so — a cast of `this` would compile and lie. */
  protected viewWiringHost(): ViewWiringHost {
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
      closeTab: () => undefined,
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
      persistSession();
    }, 400);
  }
}
