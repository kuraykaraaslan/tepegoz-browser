import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeWc, host, handlerFor, handlersFor } from './tabs-view-wiring.test-kit';

/**
 * `wireView` page-event handlers: the context-menu relay, title / favicon / loading state, and the
 * did-navigate handlers (history + Safe Browsing + site-state).
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

const { wireView } = await import('./tabs-view-wiring');

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

describe('wireView', () => {
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

    it('page-favicon-updated fetches the last icon on the page session, stores the data URL, and persists it to history', async () => {
      const h = host();
      const wc = fakeWc();
      getDb.mockReturnValue({ __db: true });
      faviconDataUrl.mockResolvedValue('data:image/png;base64,ZZ');
      wireView(h as never, 't1', { webContents: wc } as never);

      handlerFor(wc, 'page-favicon-updated')!({}, ['http://a/1.ico', 'http://a/2.ico']);
      await Promise.resolve();
      await Promise.resolve();
      expect(faviconDataUrl).toHaveBeenCalledWith(wc.session, 'http://a/2.ico');
      expect(h.store.update).toHaveBeenCalledWith('t1', { faviconUrl: 'data:image/png;base64,ZZ' });
      expect(historyStore.setFavicon).toHaveBeenCalledWith(
        { __db: true },
        'https://page.test/',
        'data:image/png;base64,ZZ',
      );
    });

    it('page-favicon-updated writes no favicon to history in a private window', async () => {
      const h = { ...host(), isPrivate: true };
      const wc = fakeWc();
      getDb.mockReturnValue({ __db: true });
      faviconDataUrl.mockResolvedValue('data:image/png;base64,ZZ');
      wireView(h as never, 't1', { webContents: wc } as never);

      handlerFor(wc, 'page-favicon-updated')!({}, ['http://a/1.ico']);
      await Promise.resolve();
      await Promise.resolve();
      expect(h.store.update).toHaveBeenCalledWith('t1', { faviconUrl: 'data:image/png;base64,ZZ' });
      expect(historyStore.setFavicon).not.toHaveBeenCalled();
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
