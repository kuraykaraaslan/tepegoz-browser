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

vi.mock('@tepegoz/persistence', () => ({ HistoryStore: { record: vi.fn() } }));
vi.mock('./db/database.electron', () => ({ getDb: () => null }));

const interceptor = vi.hoisted(() => ({ shouldBlock: vi.fn(() => false) }));
vi.mock('./extensions/action-interceptors.electron', () => ({ default: interceptor }));

vi.mock('./security/safe-browsing-interstitial.electron', () => ({
  handleSafeBrowsingNavigation: vi.fn(() => 'continue'),
}));
vi.mock('./tabs-favicon.electron', () => ({ faviconDataUrl: vi.fn(() => Promise.resolve(null)) }));

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
    session: { __session: true },
  };
}
type FakeWc = ReturnType<typeof fakeWc>;
const host = () => ({
  win: { __win: true },
  store: { activeId: 'other-tab' },
  getBounds: () => ({ x: 0, y: 0, width: 1, height: 1 }),
  createTab: vi.fn(),
  emitState: vi.fn(),
  closeTab: vi.fn(),
  isPrivate: false,
});
const handlerFor = (wc: FakeWc, ev: string) =>
  wc.on.mock.calls.find((c) => c[0] === ev)?.[1] as ((...a: unknown[]) => unknown) | undefined;

beforeEach(() => {
  vi.clearAllMocks();
  shared.lastGestureAt.clear();
  shared.hadRecentGesture.mockReturnValue(false);
  zoom.handleZoomShortcut.mockReturnValue(false);
  handleWindowShortcut.mockReturnValue(false);
  interceptor.shouldBlock.mockReturnValue(false);
  popup.needsNativeWindow.mockReturnValue(false);
  popup.wantsNativeWindow.mockReturnValue(false);
  nav.isWebUrl.mockImplementation((u: string) => u.startsWith('http'));
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
});
