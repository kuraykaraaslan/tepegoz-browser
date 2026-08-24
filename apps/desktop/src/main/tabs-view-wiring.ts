import {
  type BrowserWindow,
  type Rectangle,
  type Session,
  type WebContents,
  type WebContentsView,
} from 'electron';
import { HistoryStore } from '@tepegoz/persistence';
import { type TabStore } from '@tepegoz/tab-engine';
import { isWebUrl } from './lib/navigation-url';
import { handleWindowShortcut } from './keyboard-shortcuts';
import { applyStoredZoom, handleZoomShortcut } from './site-zoom';
import { getDb } from './db/database.electron';
import ActionInterceptorService from './extensions/action-interceptors.electron';
import { faviconDataUrl } from './tabs-favicon.electron';
import {
  blockNonWeb,
  isActivatingInput,
  needsNativeWindow,
  originOf,
  popupTargetUrl,
  wantsNativeWindow,
} from './tabs-popup-policy';
import {
  contextMenuObservers,
  hadRecentGesture,
  lastGestureAt,
  MAX_TITLE_LENGTH,
  navigationObservers,
  popupWindowOptions,
} from './tabs-shared';

/**
 * WebContents event wiring for a browsed tab view, split out of `tabs.ts` (ADR-0010 250-line cap). The
 * handlers are the single popup enforcement + navigation-history/persistence point; they close over a
 * small {@link ViewWiringHost} exposing exactly the owning `WindowTabs` collaborators they need (its
 * store, window, live bounds, and the `createTab`/`emitState` primitives) rather than the whole instance.
 */

/** The favicon URL each view most recently ASKED for, so an out-of-order fetch cannot paint a stale
 *  icon onto a page that has since navigated. Weak, so it dies with the webContents. */
const requestedFavicon = new WeakMap<WebContents, string | null>();

/** The owning `WindowTabs` collaborators a wired view's handlers reach back into. */
export interface ViewWiringHost {
  readonly win: BrowserWindow;
  readonly store: TabStore;
  /** The current content-area bounds (read lazily — the context menu anchors at click time). */
  getBounds(): Rectangle;
  /** Open a tab spawned by the page (window.open / target=_blank) as a child of the wired tab. */
  createTab(
    rawUrl: string,
    opts: { background: boolean; openerId: string; session: Session },
  ): void;
  /** Re-emit the window's TabsState after a handler mutates the store. */
  emitState(): void;
  /** Close the wired tab (Ctrl+W arrives while the PAGE has focus, so the view answers it). */
  closeTab(id: string): void;
}

/** Every event `wireView` subscribes to — kept in sync so `unwireView` can drop exactly these. */
const WIRED_EVENTS = [
  'input-event',
  'before-input-event',
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
 *  another window): the handlers close over the tab id + host and would otherwise keep firing (and pin
 *  their closures) through teardown. Only our own events are removed — Electron's internal listeners
 *  stay untouched. */
export function unwireView(view: WebContentsView): void {
  const wc = view.webContents;
  for (const event of WIRED_EVENTS) {
    wc.removeAllListeners(event);
  }
}

export function wireView(host: ViewWiringHost, id: string, view: WebContentsView): void {
  const wc = view.webContents;

  // Track discrete user input so the popup blocker can tell a user-clicked new-tab link (which must
  // open) from an unsolicited auto-popup (which is blocked). See the window-open handler below.
  wc.on('input-event', (_e, input) => {
    if (isActivatingInput(input.type)) lastGestureAt.set(wc, Date.now());
  });

  // App-level shortcuts (F11 fullscreen, Ctrl/Cmd+Shift+Q to leave kiosk) also fire while a PAGE has
  // focus — essential in kiosk, where the chromeless page owns all input.
  wc.on('before-input-event', (event, input) => {
    // Zoom first: it is the only one of these that acts on THIS page rather than the window.
    if (handleZoomShortcut(input, wc)) {
      event.preventDefault();
      return;
    }
    // `wc` is the page the key was actually pressed on — a more exact answer than "the window's
    // active tab", and the one the user means. Ctrl+W closes THAT tab for the same reason.
    const targets = {
      page: wc,
      closeActiveTab: () => {
        host.closeTab(id);
      },
    };
    if (handleWindowShortcut(host.win, input, targets)) event.preventDefault();
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
      return { action: 'allow', overrideBrowserWindowOptions: popupWindowOptions(wc.session) };
    }
    // Plain new tab. Non-web schemes (file:/custom) that didn't need a native window are dropped.
    if (!isWebUrl(target)) return { action: 'deny' };
    const background =
      details.disposition === 'background-tab'
        ? true
        : details.disposition === 'foreground-tab'
          ? false
          : id !== host.store.activeId;
    // Spawned by the page → the opener is THIS tab, so the new tab inherits its group (ADR-0020).
    // The new tab inherits the OPENER'S session, not the Direct one. A page-opened tab is a
    // continuation of the page that opened it, so a link opened from a tunnel-bound tab must stay on
    // that tunnel — landing it on the clear path would be the same silent leak as the popup path above.
    host.createTab(target, { background, openerId: id, session: wc.session });
    return { action: 'deny' };
  });
  // A natively-allowed popup opens its own top-level window; harden it the same way as a browsed view
  // (block dangerous schemes, and route ITS nested popups through the same policy).
  wc.on('did-create-window', (win) => {
    wirePopupWindow(win.webContents);
  });
  // Block dangerous schemes on BOTH initial navigations and server-side redirects (will-navigate
  // alone misses redirect hops); ALSO consult the `navigation:navigate` interceptor (ADR-0022) —
  // native popup windows (`wirePopupWindow`) skip this second check, they have no tracked tab id.
  wc.on('will-navigate', (event, url) => {
    blockNonWeb(event, url);
    if (
      ActionInterceptorService.shouldBlock('navigation:navigate', {
        tabId: id,
        url,
        isRedirect: false,
      })
    ) {
      event.preventDefault();
    }
  });
  wc.on('will-redirect', (event, url) => {
    blockNonWeb(event, url);
    if (
      ActionInterceptorService.shouldBlock('navigation:navigate', {
        tabId: id,
        url,
        isRedirect: true,
      })
    ) {
      event.preventDefault();
    }
  });

  // Right-click on the page → open the Chrome-style page context menu as a rendered popup window
  // (same primitive as the main menu), anchored at the click point (offset by the view's own bounds).
  // `params` (selection/link/media/editable) picks the menu variant in the renderer.
  wc.on('context-menu', (_e, params) => {
    if (!host.win.isDestroyed()) {
      // Report the right-click; do not decide what opens. The menu drives `TabManager`, so importing
      // it here made the tab layer depend on its own consumer (see `contextMenuObservers`).
      const nav = {
        canGoBack: wc.navigationHistory.canGoBack(),
        canGoForward: wc.navigationHistory.canGoForward(),
      };
      for (const observe of contextMenuObservers)
        observe(host.win, wc, params, host.getBounds(), nav);
    }
  });

  const sync = (): void => {
    host.store.update(id, {
      url: wc.getURL(),
      title: wc.getTitle(),
      isLoading: wc.isLoadingMainFrame(),
    });
    host.emitState();
  };
  wc.on('page-title-updated', (_e, title) => {
    host.store.update(id, { title });
    const db = getDb();
    const url = wc.getURL();
    // Page-controlled string — cap before persisting so a hostile title can't bloat the DB.
    if (db !== null && isWebUrl(url))
      HistoryStore.setTitle(db, url, title.slice(0, MAX_TITLE_LENGTH));
    host.emitState();
  });
  // Electron sends every favicon a page declares; the last is typically the largest/most specific.
  wc.on('page-favicon-updated', (_e, favicons) => {
    const source = favicons.at(-1) ?? null;
    requestedFavicon.set(wc, source);
    if (source === null) {
      host.store.update(id, { faviconUrl: null });
      host.emitState();
      return;
    }
    // Fetched on the PAGE'S session, never handed to the chrome as a remote URL: the tab strip renders
    // on the app partition, which has no proxy, so an `<img src="https://site/...">` there would be the
    // browser chrome making a clear-path request to the site you are viewing — through a tunnel or not.
    void faviconDataUrl(wc.session, source).then(
      (dataUrl) => {
        // Drop a late answer: the page may have navigated (or declared a newer icon) while we fetched.
        if (wc.isDestroyed() || requestedFavicon.get(wc) !== source) return;
        if (dataUrl === null) return;
        host.store.update(id, { faviconUrl: dataUrl });
        host.emitState();
      },
      () => undefined,
    );
  });
  wc.on('did-start-loading', () => {
    host.store.update(id, { isLoading: true });
    host.emitState();
  });
  wc.on('did-stop-loading', () => {
    sync();
    const url = wc.getURL();
    if (isWebUrl(url)) {
      for (const obs of navigationObservers) obs(url, wc, host.win);
    }
  });
  // A committed top-level navigation means a new document — drop the old favicon so a stale icon
  // from the previous page can't linger (the new one arrives via page-favicon-updated).
  wc.on('did-navigate', () => {
    requestedFavicon.delete(wc);
    host.store.update(id, { faviconUrl: null });
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
  // Re-apply the origin's remembered zoom on every committed navigation: Chromium's own zoom is
  // per-session and per-webContents, so crossing to another origin would otherwise keep the previous
  // site's level.
  wc.on('did-navigate', () => {
    applyStoredZoom(wc);
  });
  wc.on('did-navigate', sync);
  wc.on('did-navigate-in-page', sync);
}

/** Harden a natively-opened popup window's webContents: block dangerous-scheme navigations and route
 *  its OWN popups through the same blocker + hybrid policy. A popup window has no tab context, so its
 *  nested popups (when allowed) stay native windows rather than becoming tabs. */
export function wirePopupWindow(wc: WebContents): void {
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
      return { action: 'allow', overrideBrowserWindowOptions: popupWindowOptions(wc.session) };
    }
    return { action: 'deny' };
  });
  wc.on('did-create-window', (win) => {
    wirePopupWindow(win.webContents);
  });
  wc.on('will-navigate', blockNonWeb);
  wc.on('will-redirect', blockNonWeb);
}
