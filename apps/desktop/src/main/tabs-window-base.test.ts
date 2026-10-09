import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeWindow, Harness } from './tabs-window.test-kit';

/**
 * `WindowTabsBase` (the tab-model chain under `WindowTabs`), over a real `TabStore`. Pinned: `createTab`
 * adds the record, wires + sizes a view and activates it; `activate` / `getState`; `parkHiddenView` /
 * `dispose`; and the base's small surface (view-wiring host, effective bounds).
 */

const loadBehavior = vi.hoisted(() => ({ reject: false }));
vi.mock('electron', () => ({
  WebContentsView: class {
    setBounds = vi.fn();
    setVisible = vi.fn();
    webContents = {
      loadURL: () =>
        loadBehavior.reject ? Promise.reject(new Error('load failed')) : Promise.resolve(),
      isDestroyed: () => false,
      close: vi.fn(),
      getURL: () => '',
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
  isWebUrl: (u: string) => u.startsWith('http'),
  internalPageUrl: (u: string) => (u.startsWith('tepegoz://') ? u : null),
  toNavigationUrl: (u: string) => u,
}));
vi.mock('./tabs-popup-policy', () => ({ asGroupColor: (c: string) => c }));
vi.mock('./site-zoom', () => ({ applyZoomCommand: vi.fn() }));
vi.mock('./page-commands', () => ({
  printPage: vi.fn(),
  savePage: vi.fn(),
  viewSourcePage: vi.fn(),
}));
vi.mock('./clipboard/clipboard-service.electron', () => ({ default: {} }));
vi.mock('./downloads/download-service.electron', () => ({ default: {} }));
const sessions = vi.hoisted(() => ({
  defaultForNewTab: vi.fn(() => ({ __direct: true })),
  private: vi.fn(() => ({ __private: true })),
}));
vi.mock('./network/browsing-sessions.electron', () => ({ default: sessions }));
const certRec = vi.hoisted(() => ({
  get: vi.fn<(host: string) => unknown>(() => undefined),
}));
vi.mock('./network/certificate-recorder.electron', () => ({ getRecordedCert: certRec.get }));
vi.mock('./tabs-content-bounds', () => ({
  resolveViewBounds: () => ({ x: 0, y: 5, width: 100, height: 80 }),
}));
const interceptor = vi.hoisted(() => ({ shouldBlock: vi.fn(() => false) }));
vi.mock('./extensions/action-interceptors.electron', () => ({ default: interceptor }));
vi.mock('./tabs-view-wiring', () => ({ wireView: vi.fn(), unwireView: vi.fn() }));
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

const closedStack = vi.hoisted((): { items: { url: string; id?: string }[] } => ({ items: [] }));
const persistSession = vi.hoisted(() => vi.fn());
vi.mock('./tabs-shared', () => ({
  rememberClosedTab: vi.fn(),
  internalBaseUrl: (u: string) => u,
  internalTitleFor: () => 'Internal',
  browsedViewWebPreferences: () => ({}),
  homeUrl: () => 'https://example.com/',
  searchUrlForQuery: (q: string) => q,
  persistSession,
  involuntaryGroupExitObservers: new Set(),
  takeClosedTab: (id?: string) => {
    if (closedStack.items.length === 0) return undefined;
    if (id === undefined) return closedStack.items.pop();
    const i = closedStack.items.findIndex((c) => c.id === id);
    return i === -1 ? undefined : closedStack.items.splice(i, 1)[0];
  },
}));

const { WindowTabsBase } = await import('./tabs-window-base');
const ipv = await import('./tabs-internal-page-view');

let tabs: Harness;
let win: ReturnType<typeof fakeWindow>;
beforeEach(() => {
  vi.clearAllMocks();
  closedStack.items = [];
  loadBehavior.reject = false;
  interceptor.shouldBlock.mockReturnValue(false);
  certRec.get.mockReturnValue(undefined);
  sessions.defaultForNewTab.mockReturnValue({ __direct: true });
  sessions.private.mockReturnValue({ __private: true });
  win = fakeWindow();
  tabs = new Harness(win as never, false);
});

describe('createTab (base)', () => {
  it('creates a web tab: adds the record, wires + sizes a view, and activates it', () => {
    const id = tabs.createTab('https://web.test/');
    expect(id).not.toBeNull();
    expect(tabs.count()).toBe(1);
    expect(win.contentView.children).toHaveLength(1); // activate() attached the view
  });

  it('returns null when the tab:create interceptor blocks it', () => {
    interceptor.shouldBlock.mockReturnValue(true);
    expect(tabs.createTab('https://blocked.test/')).toBeNull();
    expect(tabs.count()).toBe(0);
  });

  it('a background create does not steal the foreground', () => {
    const first = tabs.createTab('https://a.test/');
    tabs.setActive(first!);
    const bg = tabs.createTab('https://b.test/', { background: true });
    expect(bg).not.toBeNull();
    expect(tabs.count()).toBe(2);
  });

  it('a bare createTab() lands on a view-less internal new-tab', () => {
    const id = tabs.createTab();
    expect(id).not.toBeNull();
    expect(tabs.count()).toBe(1);
    // internal tab → no WebContentsView entry
    expect(tabs.record(id!)?.kind).toBe('internal');
  });

  it('a private window mints tabs on the private session', () => {
    const priv = new Harness(fakeWindow() as never, true);
    priv.createTab('https://p.test/');
    expect(sessions.private).toHaveBeenCalled();
    expect(sessions.defaultForNewTab).not.toHaveBeenCalled();
  });

  it('routes a tepegoz:// url to a view-less internal tab', () => {
    const id = tabs.createTab('tepegoz://settings');
    expect(id).not.toBeNull();
    expect(tabs.record(id!)?.kind).toBe('internal');
  });

  it('logs, without throwing, when the initial page load rejects', async () => {
    loadBehavior.reject = true;
    tabs.createTab('https://bad.test/');
    await vi.waitFor(() =>
      expect(logger.warn).toHaveBeenCalledWith(
        'Tab failed to load',
        expect.objectContaining({ url: 'https://bad.test/' }),
      ),
    );
  });

  it('a tab spawned from a grouped opener joins the opener group, right after it', () => {
    const opener = tabs.createTab('https://a.test/')!;
    const g = tabs.makeGroup('Work', [opener]);
    const child = tabs.createTab('https://b.test/', { openerId: opener })!;
    expect(tabs.record(child)).toMatchObject({ groupId: g });
  });

  it('a tab spawned from an ungrouped opener stays ungrouped', () => {
    const opener = tabs.createTab('https://a.test/')!;
    const child = tabs.createTab('https://b.test/', { openerId: opener })!;
    expect(tabs.record(child)).toMatchObject({ groupId: null });
  });

  it('a background internal create does not steal the foreground', () => {
    const first = tabs.createTab('https://a.test/')!;
    tabs.setActive(first);
    const bg = tabs.createTab(undefined, { background: true });
    expect(bg).not.toBeNull();
    expect(tabs.activeId()).toBe(first);
  });

  it('createInternalTab returns null when the tab:create interceptor blocks it', () => {
    interceptor.shouldBlock.mockReturnValue(true);
    expect(tabs.createTab()).toBeNull(); // bare createTab → createInternalTab(NEWTAB)
    expect(tabs.count()).toBe(0);
  });
});

describe('activate / getState (base)', () => {
  it('detaches the previously-active view and attaches + sizes the new one', () => {
    const a = tabs.createTab('https://a.test/')!;
    tabs.createTab('https://b.test/'); // b is active now
    // switching back to a should re-attach a and detach b.
    win.contentView.removeChildView.mockClear();
    tabs.activate(a);
    expect(win.contentView.removeChildView).toHaveBeenCalled();
  });

  it('activate is a no-op for an unknown id', () => {
    expect(() => {
      tabs.activate('nope');
    }).not.toThrow();
  });

  it('getState reports the nav flags off the active view', () => {
    const id = tabs.createTab('https://a.test/')!;
    tabs.activate(id);
    const s = tabs.getState();
    expect(s).toMatchObject({ canGoBack: false, canGoForward: false, activeZoomFactor: 1 });
  });

  it('activate hides the previously-active tab internal-page view', () => {
    const a = tabs.createTab()!; // internal, now active
    tabs.seedIpv(a, { __ip: true });
    tabs.activate(tabs.createTab('https://b.test/')!);
    expect(vi.mocked(ipv.hideInternalPageView)).toHaveBeenCalledWith(win, { __ip: true });
  });

  it('getState classifies an unparseable active URL without throwing', () => {
    const id = tabs.addWeb('http://[bad');
    tabs.setActive(id);
    expect(() => tabs.getState()).not.toThrow();
  });

  it('getState feeds a recorded cert failure into the security classification', () => {
    certRec.get.mockReturnValueOnce({ errorCode: -200, verificationResult: -200 });
    const id = tabs.addWeb('https://broken.test/');
    tabs.setActive(id);
    const level = tabs.getState().activeSecurityLevel;
    expect(typeof level).toBe('string');
    expect(certRec.get).toHaveBeenCalledWith('broken.test');
  });
});

describe('parkHiddenView / dispose (base)', () => {
  it('parks a hidden tab off the left edge, at the content size', () => {
    const id = tabs.createTab('https://a.test/')!;
    const setBounds = tabs.viewSetBounds(id);
    setBounds.mockClear();
    tabs.park(id);
    expect(setBounds).toHaveBeenCalledWith({ x: -108, y: 5, width: 100, height: 80 });
  });

  it('parkHiddenView is a no-op for a view-less internal tab', () => {
    const id = tabs.createTab()!; // internal
    expect(() => {
      tabs.park(id);
    }).not.toThrow();
  });

  it('dispose tears down every view and clears the store', () => {
    tabs.createTab('https://a.test/');
    tabs.createTab('https://b.test/');
    expect(tabs.count()).toBe(2);
    tabs.dispose();
    expect(tabs.count()).toBe(0);
  });

  it('dispose logs and keeps going when one view teardown throws', () => {
    tabs.createTab('https://a.test/');
    win.contentView.removeChildView.mockImplementationOnce(() => {
      throw new Error('teardown boom');
    });
    expect(() => {
      tabs.dispose();
    }).not.toThrow();
    expect(logger.warn).toHaveBeenCalledWith(
      'tab view teardown failed',
      expect.objectContaining({ err: expect.stringContaining('teardown boom') as string }),
    );
    expect(tabs.count()).toBe(0);
  });

  it('dispose destroys internal-page views and clears their map', () => {
    tabs.seedIpv(tabs.addInternal(), { __ip: true });
    tabs.dispose();
    expect(vi.mocked(ipv.destroyInternalPageView)).toHaveBeenCalledWith(win, { __ip: true });
  });

  it('effectiveBounds passes a null content size when the window is destroyed', () => {
    const dead = { ...fakeWindow(), isDestroyed: () => true };
    const t = new Harness(dead as never, false);
    expect(t.effBounds()).toEqual({ x: 0, y: 5, width: 100, height: 80 });
  });
});

describe('base small surface', () => {
  it('exposes the owning window and a total tab count', () => {
    tabs.addWeb('https://a.test/');
    tabs.addWeb('https://b.test/', { hidden: true });
    expect(tabs.window).toBe(win);
    expect(tabs.tabCount()).toBe(2);
  });

  it('the view-wiring host forwards createTab and emitState to the base', () => {
    const host = tabs.wiringHost();
    host.createTab('https://wired.test/', undefined);
    expect(tabs.count()).toBe(1);
    win.webContents.send.mockClear();
    host.emitState();
    expect(win.webContents.send).toHaveBeenCalled();

    // `getBounds` reads the live content-area rect (`closeTab` is overridden by `WindowTabsClosing`
    // further up the chain — see the direct-base test below for ITS own no-op stub).
    expect(host.getBounds()).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });

  it('WindowTabsBase.viewWiringHost().closeTab is a documented no-op below WindowTabsClosing', () => {
    class BaseHarness extends WindowTabsBase {
      rawWiringHost(): { closeTab: () => void } {
        return this.viewWiringHost() as never;
      }
    }
    const base = new BaseHarness(fakeWindow() as never, false);
    expect(base.rawWiringHost().closeTab()).toBeUndefined();
  });

  it('WindowTabsBase.viewWiringHost() tab-switch hooks are inert no-ops below WindowTabsNav', () => {
    class BaseHarness extends WindowTabsBase {
      rawWiringHost(): {
        activateAdjacentTab: (d: 1 | -1, via: 'tab' | 'page') => void;
        activateTabAtPosition: (p: number | 'last') => void;
        endTabCycle: () => void;
      } {
        return this.viewWiringHost();
      }
    }
    const host = new BaseHarness(fakeWindow() as never, false).rawWiringHost();
    expect(host.activateAdjacentTab(1, 'tab')).toBeUndefined();
    expect(host.activateTabAtPosition('last')).toBeUndefined();
    expect(host.endTabCycle()).toBeUndefined();
  });

  it('schedulePersist flushes persistSession once the debounce elapses', () => {
    vi.useFakeTimers();
    try {
      tabs.createTab('https://a.test/'); // emitState → schedulePersist
      vi.advanceTimersByTime(400);
      expect(persistSession).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
