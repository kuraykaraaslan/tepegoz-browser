import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeWc, host, handlerFor } from './tabs-view-wiring.test-kit';

/**
 * `wirePopupWindow` and the WebRTC hardening choke points.
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
const handleWindowKeyUp = vi.hoisted(() => vi.fn());
vi.mock('./keyboard-shortcuts', () => ({ handleWindowShortcut, handleWindowKeyUp }));

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
  switchToLinkTabs: vi.fn(() => true),
}));
vi.mock('./tabs-shared', () => shared);

const tunnel = vi.hoisted(() => ({ hardenIfTunneled: vi.fn() }));
vi.mock('./network/tunnel-session.electron', () => tunnel);

const httpsOnlyNav = vi.hoisted(() => ({
  handleHttpsOnlyNavigation: vi.fn<() => string>(() => 'ignore'),
}));
vi.mock('./security/https-only-interstitial.electron', () => httpsOnlyNav);
const httpsOnlyWiring = vi.hoisted(() => ({ wireHttpsOnly: vi.fn() }));
vi.mock('./network/https-only-wiring', () => httpsOnlyWiring);

const { wireView, wirePopupWindow } = await import('./tabs-view-wiring');

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

  it('records a gesture on an activating input-event', () => {
    const wc = fakeWc();
    wirePopupWindow(wc as never);
    const onInput = handlerFor(wc, 'input-event')!;
    onInput({}, { type: 'mouseMove' });
    expect(shared.lastGestureAt.has(wc)).toBe(false);
    onInput({}, { type: 'mouseDown' });
    expect(shared.lastGestureAt.has(wc)).toBe(true);
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

/**
 * The WebRTC lock has to be INVOKED, not merely to exist. It previously did exist — implemented,
 * exported and unit-tested in `tunnel-session.electron.ts` — with no production caller anywhere, so
 * every tunneled tab could still emit host ICE candidates carrying the machine's real address while its
 * HTTP traffic went through the tunnel. These are the cases that fail if that caller disappears again;
 * the ones in `tunnel-session.electron.test.ts` decide WHICH sessions get hardened, these decide that
 * the two wiring choke points ask at all.
 */
describe('WebRTC hardening is actually wired', () => {
  it('wireView hardens the view it is given', () => {
    const wc = fakeWc();
    wireView(host() as never, 'tab-1', { webContents: wc } as never);
    expect(tunnel.hardenIfTunneled).toHaveBeenCalledWith(wc);
  });

  it('wireView hardens BEFORE installing the unload prompt or any listener', () => {
    // Ordering is the safety property: the caller loads a URL right after wiring, so the lock must be
    // on before anything can run in the page.
    const wc = fakeWc();
    wireView(host() as never, 'tab-1', { webContents: wc } as never);
    const hardenedAt = tunnel.hardenIfTunneled.mock.invocationCallOrder[0] ?? Infinity;
    const promptAt = installUnloadPrompt.mock.invocationCallOrder[0] ?? Infinity;
    const firstListenerAt = wc.on.mock.invocationCallOrder[0] ?? Infinity;
    expect(hardenedAt).toBeLessThan(promptAt);
    expect(hardenedAt).toBeLessThan(firstListenerAt);
  });

  it('wirePopupWindow hardens the popup too — it inherits the opener tunneled session', () => {
    const wc = fakeWc();
    wirePopupWindow(wc as never);
    expect(tunnel.hardenIfTunneled).toHaveBeenCalledWith(wc);
  });

  it('a nested popup spawned from a popup is hardened as well', () => {
    const outer = fakeWc();
    wirePopupWindow(outer as never);
    tunnel.hardenIfTunneled.mockClear();
    const inner = fakeWc();
    handlerFor(outer, 'did-create-window')?.({ webContents: inner });
    expect(tunnel.hardenIfTunneled).toHaveBeenCalledWith(inner);
  });
});
