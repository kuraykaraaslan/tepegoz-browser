import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `WindowTabsRehost.rehostTab` — move one web tab's live view onto a new browsing session (Phase 5
 * VPN/Tor route re-bind), reloading it. Over a real `TabStore`. Pinned:
 *   - an internal (view-less) tab returns false — it has no page traffic for a tunnel to carry;
 *   - a web tab already on the target session returns false (no-op);
 *   - a real move tears the old view down (unwire + close), builds a fresh view on the target
 *     session, drops the stale favicon, marks it loading, and returns true;
 *   - `sessionOfTab` reports the live view's session, or undefined for a view-less tab.
 */

const closed: unknown[] = [];
const loadBehavior = vi.hoisted(() => ({ reject: false }));
vi.mock('electron', () => ({
  WebContentsView: class {
    setBounds = vi.fn();
    setVisible = vi.fn();
    webContents = {
      loadURL: () =>
        loadBehavior.reject ? Promise.reject(new Error('tunnel down')) : Promise.resolve(),
      isDestroyed: () => false,
      close: () => closed.push(this),
      session: { __new: true },
      getZoomFactor: () => 1,
      navigationHistory: { canGoBack: () => false, canGoForward: () => false },
    };
  },
  BrowserWindow: { fromWebContents: () => null },
  dialog: { showMessageBoxSync: () => 0 },
}));
const logger = vi.hoisted(() => ({
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
  error: vi.fn(),
}));
vi.mock('@tepegoz/libs', () => ({ Logger: logger }));
vi.mock('@tepegoz/security-policy', () => ({ mayOpenDevTools: () => ({ allowed: true }) }));
vi.mock('./lib/i18n-main', () => ({
  mainStrings: () => ({
    browser: { unloadTitle: 't', unloadDetail: 'd', unloadLeave: 'l', unloadStay: 's' },
  }),
}));
vi.mock('./lib/navigation-url', () => ({
  isWebUrl: () => true,
  internalPageUrl: () => null,
  toNavigationUrl: (u: string) => u,
}));
vi.mock('./site-zoom', () => ({ applyZoomCommand: vi.fn() }));
vi.mock('./page-commands', () => ({
  printPage: vi.fn(),
  savePage: vi.fn(),
  viewSourcePage: vi.fn(),
}));
vi.mock('./clipboard/clipboard-service.electron', () => ({ default: {} }));
vi.mock('./downloads/download-service.electron', () => ({ default: {} }));
vi.mock('./network/browsing-sessions.electron', () => ({
  default: { defaultForNewTab: () => ({}), private: () => ({}) },
}));
vi.mock('./network/certificate-recorder.electron', () => ({ getRecordedCert: () => undefined }));
vi.mock('./tabs-content-bounds', () => ({
  resolveViewBounds: () => ({ x: 0, y: 0, width: 1, height: 1 }),
}));
vi.mock('./extensions/action-interceptors.electron', () => ({
  default: { shouldBlock: () => false },
}));
const wiring = { wireView: vi.fn(), unwireView: vi.fn() };
vi.mock('./tabs-view-wiring', () => wiring);
vi.mock('./tabs-internal-page-view', () => ({
  createInternalPageView: vi.fn(),
  destroyInternalPageView: vi.fn(),
  hasRealPage: () => false,
  hideInternalPageView: vi.fn(),
  navigateInternalPageView: vi.fn(),
  showInternalPageView: vi.fn(),
  rewireInternalPageView: vi.fn(),
  unwireInternalPageView: vi.fn(),
}));
vi.mock('./navigation/unload-broker', () => ({ askBeforeClose: vi.fn() }));
vi.mock('./tabs-shared', () => ({
  rememberClosedTab: vi.fn(),
  internalBaseUrl: (u: string) => u,
  internalTitleFor: () => 'Internal',
  browsedViewWebPreferences: () => ({}),
  homeUrl: () => 'https://example.com/',
  searchUrlForQuery: (q: string) => q,
  persistSession: vi.fn(),
  involuntaryGroupExitObservers: new Set(),
}));

const { WindowTabsRehost } = await import('./tabs-window-rehost');

function fakeWindow() {
  return {
    isDestroyed: () => false,
    close: vi.fn(),
    setTitle: vi.fn(),
    getContentSize: () => [1200, 800],
    webContents: { send: vi.fn() },
    contentView: { children: [] as unknown[], addChildView: vi.fn(), removeChildView: vi.fn() },
  };
}

const OLD_SESSION = { __old: true } as never;
const TARGET_SESSION = { __target: true } as never;

class Harness extends WindowTabsRehost {
  addWeb(url = 'https://x.test/'): string {
    const id = this.store.add({
      kind: 'web',
      title: 't',
      url,
      isLoading: false,
      faviconUrl: 'f.ico',
    });
    this.views.set(id, {
      setBounds: vi.fn(),
      webContents: { session: OLD_SESSION, close: vi.fn() },
    } as never);
    return id;
  }
  addInternal(): string {
    return this.store.add({
      kind: 'internal',
      title: 's',
      url: 'tepegoz://settings',
      isLoading: false,
      faviconUrl: null,
    });
  }
  setViewSession(id: string, session: unknown): void {
    (this.views.get(id) as unknown as { webContents: { session: unknown } }).webContents.session =
      session;
  }
  rec(id: string) {
    return this.store.get(id);
  }
  hideRec(id: string): void {
    this.store.setHidden(id, true);
  }
  makeActive(id: string): void {
    this.store.setActive(id);
  }
  activeId(): string | null {
    return this.store.activeId;
  }
}

let tabs: Harness;
beforeEach(() => {
  closed.length = 0;
  loadBehavior.reject = false;
  wiring.wireView.mockClear();
  wiring.unwireView.mockClear();
  logger.warn.mockClear();
  logger.info.mockClear();
  tabs = new Harness(fakeWindow() as never, false);
});

describe('rehostTab', () => {
  it('returns false for an internal (view-less) tab', () => {
    expect(tabs.rehostTab(tabs.addInternal(), TARGET_SESSION)).toBe(false);
  });

  it('returns false for an unknown id', () => {
    expect(tabs.rehostTab('nope', TARGET_SESSION)).toBe(false);
  });

  it('returns false when the tab is already on the target session (no-op)', () => {
    const id = tabs.addWeb();
    tabs.setViewSession(id, TARGET_SESSION);
    expect(tabs.rehostTab(id, TARGET_SESSION)).toBe(false);
    expect(wiring.unwireView).not.toHaveBeenCalled();
  });

  it('moves a web tab: tears the old view down, rebuilds it, drops the stale favicon, marks loading', () => {
    const id = tabs.addWeb();
    const changed = tabs.rehostTab(id, TARGET_SESSION);
    expect(changed).toBe(true);
    expect(wiring.unwireView).toHaveBeenCalledTimes(1);
    expect(wiring.wireView).toHaveBeenCalledTimes(1);
    expect(tabs.rec(id)).toMatchObject({ isLoading: true, faviconUrl: null });
  });

  it('re-parks a hidden tab after the move (it stays hidden and attached)', () => {
    const id = tabs.addWeb();
    tabs.hideRec(id);
    expect(tabs.rehostTab(id, TARGET_SESSION)).toBe(true);
    expect(tabs.rec(id)?.hidden).toBe(true);
  });

  it('re-activates the active tab after the move', () => {
    const id = tabs.addWeb();
    tabs.makeActive(id);
    expect(tabs.rehostTab(id, TARGET_SESSION)).toBe(true);
    expect(tabs.activeId()).toBe(id);
  });

  it('logs when the re-hosted page fails to load on the new session', async () => {
    loadBehavior.reject = true;
    const id = tabs.addWeb();
    tabs.rehostTab(id, TARGET_SESSION);
    await vi.waitFor(() =>
      expect(logger.warn).toHaveBeenCalledWith(
        'Re-hosted tab failed to load',
        expect.objectContaining({ id, err: expect.stringContaining('tunnel down') as string }),
      ),
    );
  });
});

describe('sessionOfTab', () => {
  it('reports the live view session for a web tab and undefined for a view-less one', () => {
    const web = tabs.addWeb();
    expect(tabs.sessionOfTab(web)).toBe(OLD_SESSION);
    expect(tabs.sessionOfTab(tabs.addInternal())).toBeUndefined();
  });
});
