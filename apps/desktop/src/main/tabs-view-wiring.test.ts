import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `wireView` / `unwireView` / `wirePopupWindow` — the WebContents event wiring for a browsed tab.
 * Pinned: `unwireView` drops exactly the wired event set; `wireView` installs the unload prompt and
 * tracks a user gesture on activating input; `before-input-event` runs the zoom shortcut (prevent +
 * re-emit) then the window shortcut (prevent), and its close-tab target reaches `host.closeTab`; and
 * the single popup-enforcement `setWindowOpenHandler` — deny an unsolicited blocked popup, allow a
 * native-window one, spawn a plain http(s) popup as a background/foreground tab per disposition, and
 * deny a non-web target.
 */

const nav = vi.hoisted(() => ({ isWebUrl: vi.fn((u: string) => u.startsWith('http')) }));
vi.mock('./lib/navigation-url', () => nav);

const zoom = vi.hoisted(() => ({
  applyStoredZoom: vi.fn(),
  handleZoomShortcut: vi.fn(() => false),
}));
vi.mock('./site-zoom', () => zoom);

const handleWindowShortcut = vi.hoisted(() =>
  vi.fn<(win: unknown, input: unknown, targets: { closeActiveTab: () => void }) => boolean>(
    () => false,
  ),
);
vi.mock('./keyboard-shortcuts', () => ({ handleWindowShortcut }));

const openPrivateWindow = vi.hoisted(() => vi.fn());
vi.mock('./private-window-opener', () => ({ openPrivateWindow }));

const installUnloadPrompt = vi.hoisted(() => vi.fn());
vi.mock('./navigation/unload-broker', () => ({ installUnloadPrompt }));

const historyStore = vi.hoisted(() => ({ record: vi.fn(), setTitle: vi.fn() }));
vi.mock('@tepegoz/persistence', () => ({ HistoryStore: historyStore }));
const getDb = vi.hoisted(() => vi.fn<() => unknown>(() => null));
vi.mock('./db/database.electron', () => ({ getDb }));

const interceptor = vi.hoisted(() => ({ shouldBlock: vi.fn(() => false) }));
vi.mock('./extensions/action-interceptors.electron', () => ({ default: interceptor }));

const safeBrowsing = vi.hoisted(() => ({
  handleSafeBrowsingNavigation: vi.fn<() => string>(() => 'continue'),
}));
vi.mock('./security/safe-browsing-interstitial.electron', () => safeBrowsing);
const faviconDataUrl = vi.hoisted(() =>
  vi.fn<() => Promise<string | null>>(() => Promise.resolve(null)),
);
vi.mock('./tabs-favicon.electron', () => ({ faviconDataUrl }));

const popup = vi.hoisted(() => ({
  blockNonWeb: vi.fn(),
  isActivatingInput: vi.fn((t: string) => t === 'mouseDown'),
  needsNativeWindow: vi.fn(() => false),
  originOf: vi.fn((u: string) => `origin:${u}`),
  popupTargetUrl: vi.fn((u: string) => u),
  wantsNativeWindow: vi.fn(() => false),
}));
vi.mock('./tabs-popup-policy', () => popup);

const shared = vi.hoisted(() => ({
  contextMenuObservers: new Set(),
  hadRecentGesture: vi.fn(() => false),
  lastGestureAt: new Map<unknown, number>(),
  MAX_TITLE_LENGTH: 100,
  navigationObservers: new Set(),
  popupWindowOptions: vi.fn(() => ({ __opts: true })),
}));
vi.mock('./tabs-shared', () => shared);

const { wireView, unwireView, wirePopupWindow } = await import('./tabs-view-wiring');

function fakeWc(url = 'https://page.test/') {
  return {
    on: vi.fn<(event: string, listener: (...a: unknown[]) => unknown) => void>(),
    removeAllListeners: vi.fn<(event: string) => void>(),
    setWindowOpenHandler: vi.fn<(fn: (d: unknown) => unknown) => void>(),
    getURL: () => url,
    getTitle: () => 'Page Title',
    isLoadingMainFrame: () => false,
    isDestroyed: () => false,
    navigationHistory: { canGoBack: () => true, canGoForward: () => false },
    session: { __session: true },
  };
}
type FakeWc = ReturnType<typeof fakeWc>;
const host = () => ({
  win: { __win: true, isDestroyed: () => false },
  store: { activeId: 'other-tab', update: vi.fn() },
  getBounds: () => ({ x: 0, y: 0, width: 1, height: 1 }),
  createTab: vi.fn(),
  emitState: vi.fn(),
  closeTab: vi.fn(),
  isPrivate: false,
});
const handlerFor = (wc: FakeWc, ev: string) =>
  wc.on.mock.calls.find((c) => c[0] === ev)?.[1] as ((...a: unknown[]) => unknown) | undefined;
const handlersFor = (wc: FakeWc, ev: string) =>
  wc.on.mock.calls.filter((c) => c[0] === ev).map((c) => c[1]) as ((...a: unknown[]) => unknown)[];

beforeEach(() => {
  vi.clearAllMocks();
  shared.lastGestureAt.clear();
  shared.contextMenuObservers.clear();
  shared.navigationObservers.clear();
  shared.hadRecentGesture.mockReturnValue(false);
  zoom.handleZoomShortcut.mockReturnValue(false);
  handleWindowShortcut.mockReturnValue(false);
  interceptor.shouldBlock.mockReturnValue(false);
  popup.needsNativeWindow.mockReturnValue(false);
  popup.wantsNativeWindow.mockReturnValue(false);
  nav.isWebUrl.mockImplementation((u: string) => u.startsWith('http'));
  getDb.mockReturnValue(null);
  safeBrowsing.handleSafeBrowsingNavigation.mockReturnValue('continue');
  faviconDataUrl.mockResolvedValue(null);
});

describe('unwireView', () => {
  it('removes exactly the wired event set', () => {
    const wc = fakeWc();
    unwireView({ webContents: wc } as never);
    const removed = wc.removeAllListeners.mock.calls.map((c) => c[0]);
    expect(removed).toEqual([
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
    ]);
  });
});

describe('wireView', () => {
  it('installs the unload prompt', () => {
    const wc = fakeWc();
    wireView(host() as never, 't1', { webContents: wc } as never);
    expect(installUnloadPrompt).toHaveBeenCalledWith(wc);
  });

  it('records a gesture only on activating input', () => {
    const wc = fakeWc();
    wireView(host() as never, 't1', { webContents: wc } as never);
    const onInput = handlerFor(wc, 'input-event')!;
    onInput({}, { type: 'mouseMove' });
    expect(shared.lastGestureAt.has(wc)).toBe(false);
    onInput({}, { type: 'mouseDown' });
    expect(shared.lastGestureAt.has(wc)).toBe(true);
  });

  it('before-input-event: zoom shortcut prevents + re-emits; window shortcut prevents', () => {
    const h = host();
    const wc = fakeWc();
    wireView(h as never, 't1', { webContents: wc } as never);
    const onKey = handlerFor(wc, 'before-input-event')!;

    zoom.handleZoomShortcut.mockReturnValue(true);
    const ev1 = { preventDefault: vi.fn() };
    onKey(ev1, { type: 'keyDown' });
    expect(ev1.preventDefault).toHaveBeenCalled();
    expect(h.emitState).toHaveBeenCalled();

    zoom.handleZoomShortcut.mockReturnValue(false);
    handleWindowShortcut.mockImplementation(
      (_win: unknown, _input: unknown, targets: { closeActiveTab: () => void }) => {
        targets.closeActiveTab();
        return true;
      },
    );
    const ev2 = { preventDefault: vi.fn() };
    onKey(ev2, { type: 'keyDown' });
    expect(ev2.preventDefault).toHaveBeenCalled();
    expect(h.closeTab).toHaveBeenCalledWith('t1');
  });

  describe('the popup window-open handler', () => {
    function openHandler(over: Partial<ReturnType<typeof host>> = {}) {
      const h = { ...host(), ...over };
      const wc = fakeWc();
      wireView(h as never, 't1', { webContents: wc } as never);
      return {
        h,
        run: wc.setWindowOpenHandler.mock.calls[0]![0] as (d: {
          url: string;
          disposition?: string;
        }) => { action: string; overrideBrowserWindowOptions?: unknown },
      };
    }

    it('denies an unsolicited popup the interceptor blocks', () => {
      interceptor.shouldBlock.mockReturnValue(true);
      const { run } = openHandler();
      expect(run({ url: 'https://ad.test/' })).toEqual({ action: 'deny' });
    });

    it('allows a native-window popup with the popup window options', () => {
      popup.needsNativeWindow.mockReturnValue(true);
      const { run } = openHandler();
      expect(run({ url: 'about:blank' })).toEqual({
        action: 'allow',
        overrideBrowserWindowOptions: { __opts: true },
      });
    });

    it('spawns a plain http(s) popup as a tab and denies the window; disposition sets background', () => {
      const { h, run } = openHandler();
      expect(run({ url: 'https://x.test/', disposition: 'background-tab' })).toEqual({
        action: 'deny',
      });
      expect(h.createTab).toHaveBeenCalledWith('https://x.test/', {
        background: true,
        openerId: 't1',
        session: { __session: true },
      });

      run({ url: 'https://y.test/', disposition: 'foreground-tab' });
      expect(h.createTab).toHaveBeenLastCalledWith(
        'https://y.test/',
        expect.objectContaining({ background: false }),
      );
    });

    it('denies a non-web target that did not need a native window', () => {
      nav.isWebUrl.mockReturnValue(false);
      const { h, run } = openHandler();
      expect(run({ url: 'file:///etc/passwd' })).toEqual({ action: 'deny' });
      expect(h.createTab).not.toHaveBeenCalled();
    });
  });

  describe('navigation guards', () => {
    it('will-navigate: blocks the scheme, consumes a Safe-Browsing "proceed" sentinel', () => {
      const wc = fakeWc();
      wireView(host() as never, 't1', { webContents: wc } as never);
      const onNav = handlerFor(wc, 'will-navigate')!;

      safeBrowsing.handleSafeBrowsingNavigation.mockReturnValue('proceed');
      const ev = { preventDefault: vi.fn() };
      onNav(ev, 'https://x.test/');
      expect(popup.blockNonWeb).toHaveBeenCalledWith(ev, 'https://x.test/');
      expect(ev.preventDefault).toHaveBeenCalled();
      expect(interceptor.shouldBlock).not.toHaveBeenCalled(); // returned before the interceptor
    });

    it('will-navigate: the navigate interceptor can veto a non-redirect navigation', () => {
      const wc = fakeWc();
      wireView(host() as never, 't1', { webContents: wc } as never);
      const onNav = handlerFor(wc, 'will-navigate')!;

      interceptor.shouldBlock.mockReturnValue(true);
      const ev = { preventDefault: vi.fn() };
      onNav(ev, 'https://x.test/');
      expect(interceptor.shouldBlock).toHaveBeenCalledWith('navigation:navigate', {
        tabId: 't1',
        url: 'https://x.test/',
        isRedirect: false,
      });
      expect(ev.preventDefault).toHaveBeenCalled();
    });

    it('will-redirect: guards the scheme and vetoes via the interceptor with isRedirect:true', () => {
      const wc = fakeWc();
      wireView(host() as never, 't1', { webContents: wc } as never);
      const onRedirect = handlerFor(wc, 'will-redirect')!;

      interceptor.shouldBlock.mockReturnValue(true);
      const ev = { preventDefault: vi.fn() };
      onRedirect(ev, 'https://y.test/');
      expect(popup.blockNonWeb).toHaveBeenCalled();
      expect(safeBrowsing.handleSafeBrowsingNavigation).toHaveBeenCalled();
      expect(interceptor.shouldBlock).toHaveBeenCalledWith(
        'navigation:navigate',
        expect.objectContaining({ isRedirect: true }),
      );
      expect(ev.preventDefault).toHaveBeenCalled();
    });

    it('did-create-window hardens the new window like a native popup', () => {
      const wc = fakeWc();
      wireView(host() as never, 't1', { webContents: wc } as never);
      const onCreated = handlerFor(wc, 'did-create-window')!;
      const popupWc = fakeWc();
      onCreated({ webContents: popupWc });
      expect(popupWc.setWindowOpenHandler).toHaveBeenCalled();
    });
  });

  describe('context menu', () => {
    it('reports the right-click to every observer with the nav state and bounds', () => {
      const h = host();
      const wc = fakeWc();
      const observer = vi.fn();
      shared.contextMenuObservers.add(observer);
      wireView(h as never, 't1', { webContents: wc } as never);

      const params = { linkURL: 'https://l.test/' };
      handlerFor(wc, 'context-menu')!({}, params);
      expect(observer).toHaveBeenCalledWith(h.win, wc, params, h.getBounds(), {
        canGoBack: true,
        canGoForward: false,
      });
    });

    it('does nothing when the window is already destroyed', () => {
      const h = host();
      h.win.isDestroyed = () => true;
      const wc = fakeWc();
      const observer = vi.fn();
      shared.contextMenuObservers.add(observer);
      wireView(h as never, 't1', { webContents: wc } as never);

      handlerFor(wc, 'context-menu')!({}, {});
      expect(observer).not.toHaveBeenCalled();
    });
  });

  describe('title / favicon / loading', () => {
    it('page-title-updated updates the store and persists a capped title to history', () => {
      const h = host();
      const wc = fakeWc();
      getDb.mockReturnValue({ __db: true });
      wireView(h as never, 't1', { webContents: wc } as never);

      handlerFor(wc, 'page-title-updated')!({}, 'A New Title');
      expect(h.store.update).toHaveBeenCalledWith('t1', { title: 'A New Title' });
      expect(historyStore.setTitle).toHaveBeenCalledWith(
        { __db: true },
        'https://page.test/',
        'A New Title',
      );
      expect(h.emitState).toHaveBeenCalled();
    });

    it('page-title-updated writes no history in a private window', () => {
      const h = { ...host(), isPrivate: true };
      const wc = fakeWc();
      getDb.mockReturnValue({ __db: true });
      wireView(h as never, 't1', { webContents: wc } as never);

      handlerFor(wc, 'page-title-updated')!({}, 'Secret');
      expect(historyStore.setTitle).not.toHaveBeenCalled();
    });

    it('page-favicon-updated clears the icon when the page declares none', () => {
      const h = host();
      const wc = fakeWc();
      wireView(h as never, 't1', { webContents: wc } as never);

      handlerFor(wc, 'page-favicon-updated')!({}, []);
      expect(h.store.update).toHaveBeenCalledWith('t1', { faviconUrl: null });
    });

    it('page-favicon-updated fetches the last icon on the page session and stores the data URL', async () => {
      const h = host();
      const wc = fakeWc();
      faviconDataUrl.mockResolvedValue('data:image/png;base64,ZZ');
      wireView(h as never, 't1', { webContents: wc } as never);

      handlerFor(wc, 'page-favicon-updated')!({}, ['http://a/1.ico', 'http://a/2.ico']);
      await Promise.resolve();
      await Promise.resolve();
      expect(faviconDataUrl).toHaveBeenCalledWith(wc.session, 'http://a/2.ico');
      expect(h.store.update).toHaveBeenCalledWith('t1', { faviconUrl: 'data:image/png;base64,ZZ' });
    });

    it('did-start-loading and did-stop-loading flip isLoading and fan out to observers', () => {
      const h = host();
      const wc = fakeWc();
      const navObserver = vi.fn();
      shared.navigationObservers.add(navObserver);
      wireView(h as never, 't1', { webContents: wc } as never);

      handlerFor(wc, 'did-start-loading')!();
      expect(h.store.update).toHaveBeenCalledWith('t1', { isLoading: true });

      handlerFor(wc, 'did-stop-loading')!();
      expect(navObserver).toHaveBeenCalledWith('https://page.test/', wc, h.win);
    });
  });

  describe('did-navigate handlers', () => {
    it('clear the stale favicon, record history, re-apply zoom, and re-sync the store', () => {
      const h = host();
      const wc = fakeWc();
      getDb.mockReturnValue({ __db: true });
      wireView(h as never, 't1', { webContents: wc } as never);
      const [clearIcon, recordHistory, reZoom, resync] = handlersFor(wc, 'did-navigate');

      clearIcon!();
      expect(h.store.update).toHaveBeenCalledWith('t1', { faviconUrl: null });

      recordHistory!({}, 'https://page.test/deep');
      expect(historyStore.record).toHaveBeenCalledWith(
        { __db: true },
        expect.objectContaining({ url: 'https://page.test/deep', title: 'Page Title' }),
      );

      reZoom!();
      expect(zoom.applyStoredZoom).toHaveBeenCalledWith(wc);

      h.emitState.mockClear();
      resync!();
      expect(h.emitState).toHaveBeenCalled();
    });

    it('record no history in a private window', () => {
      const h = { ...host(), isPrivate: true };
      const wc = fakeWc();
      getDb.mockReturnValue({ __db: true });
      wireView(h as never, 't1', { webContents: wc } as never);
      const recordHistory = handlersFor(wc, 'did-navigate')[1]!;

      recordHistory({}, 'https://page.test/deep');
      expect(historyStore.record).not.toHaveBeenCalled();
    });

    it('did-navigate-in-page re-syncs the store', () => {
      const h = host();
      const wc = fakeWc();
      wireView(h as never, 't1', { webContents: wc } as never);

      handlerFor(wc, 'did-navigate-in-page')!();
      expect(h.store.update).toHaveBeenCalledWith(
        't1',
        expect.objectContaining({ url: 'https://page.test/' }),
      );
    });
  });
});

describe('wirePopupWindow', () => {
  it('wires the input-gesture + open handler + navigation guards', () => {
    const wc = fakeWc();
    wirePopupWindow(wc as never);
    expect(wc.setWindowOpenHandler).toHaveBeenCalledTimes(1);
    const events = wc.on.mock.calls.map((c) => c[0]);
    expect(events).toEqual(
      expect.arrayContaining([
        'input-event',
        'did-create-window',
        'will-navigate',
        'will-redirect',
      ]),
    );
  });

  it('its open handler denies a blocked popup but keeps a web / native one as a native window', () => {
    const wc = fakeWc();
    wirePopupWindow(wc as never);
    const run = wc.setWindowOpenHandler.mock.calls[0]![0] as (d: { url: string }) => {
      action: string;
      overrideBrowserWindowOptions?: unknown;
    };

    interceptor.shouldBlock.mockReturnValue(true);
    expect(run({ url: 'https://ad.test/' })).toEqual({ action: 'deny' });

    interceptor.shouldBlock.mockReturnValue(false);
    expect(run({ url: 'https://ok.test/' })).toEqual({
      action: 'allow',
      overrideBrowserWindowOptions: { __opts: true },
    });

    nav.isWebUrl.mockReturnValue(false);
    expect(run({ url: 'file:///x' })).toEqual({ action: 'deny' });
  });

  it('routes a nested popup window through the same hardening', () => {
    const wc = fakeWc();
    wirePopupWindow(wc as never);
    const onCreated = wc.on.mock.calls.find((c) => c[0] === 'did-create-window')![1] as (w: {
      webContents: unknown;
    }) => void;
    const nested = fakeWc();
    onCreated({ webContents: nested });
    expect(nested.setWindowOpenHandler).toHaveBeenCalled();
  });
});
