import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeWc, host, handlerFor } from './tabs-view-wiring.test-kit';

/**
 * `wireView` / `unwireView` — the WebContents event wiring for a browsed tab. Pinned: `unwireView` drops
 * exactly the wired event set; `wireView` installs the unload prompt and tracks a user gesture on
 * activating input; `before-input-event` runs the zoom shortcut (prevent + re-emit) then the window
 * shortcut (prevent), and its close-tab target reaches `host.closeTab`; and the single
 * popup-enforcement `setWindowOpenHandler` — deny an unsolicited blocked popup, allow a native-window
 * one, spawn a plain http(s) popup as a background/foreground tab per disposition, and deny a
 * non-web target.
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

const historyStore = vi.hoisted(() => ({
  record: vi.fn(),
  setTitle: vi.fn(),
  setFavicon: vi.fn(),
}));
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

const tunnel = vi.hoisted(() => ({ hardenIfTunneled: vi.fn() }));
vi.mock('./network/tunnel-session.electron', () => tunnel);

const { wireView, unwireView } = await import('./tabs-view-wiring');

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

    it('for a disposition that is neither fore- nor background, backgrounds unless the opener is active', () => {
      const { h, run } = openHandler(); // host.store.activeId is 'other-tab', opener id is 't1'
      run({ url: 'https://z.test/', disposition: 'new-window' });
      expect(h.createTab).toHaveBeenLastCalledWith(
        'https://z.test/',
        expect.objectContaining({ background: true }), // 't1' !== 'other-tab'
      );
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
});
