import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `WindowTabsNav` — navigation + page-command + content-bounds + webContents-accessor layer of the
 * per-window tab model, over a real `TabStore`. Pinned: omnibox navigation loads through the active
 * view (or opens a fresh tab when there is none); `navigateTab` refuses a missing/viewless tab;
 * back/forward respect the navigation-history guards; the page-context commands (print/view-source/
 * save/clipboard/download) delegate to their services with the active webContents; DevTools + Inspect
 * go through the `mayOpenDevTools` gate and report the verdict; `getContentBounds` hands back a copy
 * and `setContentBounds` ignores a zero-area report; `captureActive` returns a PNG data URL or null;
 * and `applyUserAgent` sets the UA on every live view and reloads it.
 */

vi.mock('electron', () => ({
  WebContentsView: class {
    setBounds = vi.fn();
    setVisible = vi.fn();
    webContents = {
      loadURL: () => Promise.resolve(),
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

const devVerdict = vi.hoisted((): { v: { allowed: boolean; reason?: string } } => ({
  v: { allowed: true },
}));
vi.mock('@tepegoz/security-policy', () => ({ mayOpenDevTools: () => devVerdict.v }));
vi.mock('./lib/i18n-main', () => ({
  mainStrings: () => ({
    browser: { unloadTitle: 't', unloadDetail: 'd', unloadLeave: 'l', unloadStay: 's' },
  }),
}));
const navUrl = vi.hoisted(() => ({
  isWebUrl: (u: string) => u.startsWith('http'),
  internalPageUrl: vi.fn<(u: string) => string | null>(() => null),
  toNavigationUrl: (u: string) => u,
}));
vi.mock('./lib/navigation-url', () => navUrl);
vi.mock('./tabs-popup-policy', () => ({ asGroupColor: (c: string) => c }));

const zoom = vi.hoisted(() => ({ applyZoomCommand: vi.fn() }));
vi.mock('./site-zoom', () => zoom);
const pageCmds = vi.hoisted(() => ({
  printPage: vi.fn(),
  savePage: vi.fn(),
  viewSourcePage: vi.fn(),
}));
vi.mock('./page-commands', () => pageCmds);
const clip = vi.hoisted(() => ({
  copy: vi.fn(),
  cut: vi.fn(),
  paste: vi.fn(),
  selectAll: vi.fn(),
  copyImageAt: vi.fn(),
}));
vi.mock('./clipboard/clipboard-service.electron', () => ({ default: clip }));
const dl = vi.hoisted(() => ({ downloadURL: vi.fn() }));
vi.mock('./downloads/download-service.electron', () => ({ default: dl }));
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
vi.mock('./tabs-shared', () => ({
  rememberClosedTab: vi.fn(),
  internalBaseUrl: (u: string) => u,
  internalTitleFor: () => 'Internal',
  browsedViewWebPreferences: () => ({}),
  homeUrl: () => 'https://example.com/',
  searchUrlForQuery: (q: string) => q,
  persistSession: vi.fn(),
  involuntaryGroupExitObservers: new Set(),
  takeClosedTab: () => undefined,
}));

const { WindowTabs } = await import('./tabs-window');

function fakeWindow(): unknown {
  const children: unknown[] = [];
  return {
    isDestroyed: () => false,
    close: vi.fn(),
    setTitle: vi.fn(),
    getContentSize: () => [1200, 800],
    getBounds: () => ({ x: 10, y: 20, width: 800, height: 600 }),
    webContents: { send: vi.fn() },
    contentView: {
      children,
      addChildView: (v: unknown) => children.push(v),
      removeChildView: vi.fn(),
    },
  };
}

type Wc = Record<string, unknown>;
const mkWc = (over: Wc = {}): Wc => ({
  loadURL: vi.fn(() => Promise.resolve()),
  isDestroyed: () => false,
  getURL: () => 'https://page.test/',
  reload: vi.fn(),
  navigationHistory: {
    canGoBack: () => true,
    goBack: vi.fn(),
    canGoForward: () => true,
    goForward: vi.fn(),
  },
  getZoomFactor: () => 1,
  isDevToolsOpened: () => false,
  openDevTools: vi.fn(),
  closeDevTools: vi.fn(),
  inspectElement: vi.fn(),
  once: vi.fn(),
  setUserAgent: vi.fn(),
  capturePage: vi.fn(() =>
    Promise.resolve({ isEmpty: () => false, toDataURL: () => 'data:image/png;base64,AA' }),
  ),
  ...over,
});

class Harness extends WindowTabs {
  addWeb(url = 'https://x.test/'): string {
    return this.store.add({
      kind: 'web',
      title: 't',
      url,
      isLoading: false,
      faviconUrl: null,
    });
  }
  setActive(id: string): void {
    this.store.setActive(id);
  }
  putView(id: string, wc: Wc): void {
    this.views.set(id, { webContents: wc, setBounds: vi.fn(), setVisible: vi.fn() } as never);
  }
  putInternalView(id: string, wc: Wc): void {
    this.internalPageViews.set(id, { webContents: wc, setBounds: vi.fn() } as never);
  }
  fakeWin(): {
    contentView: { removeChildView: ReturnType<typeof vi.fn>; children: unknown[] };
    webContents: { send: ReturnType<typeof vi.fn> };
  } {
    return this.win as never;
  }
  count(): number {
    return this.store.records().length;
  }
}

let tabs: Harness;
let wc: Wc;
beforeEach(() => {
  vi.clearAllMocks();
  devVerdict.v = { allowed: true };
  navUrl.internalPageUrl.mockReturnValue(null);
  tabs = new Harness(fakeWindow() as never, false);
  wc = mkWc();
});

describe('navigation', () => {
  it('navigateActive loads through the active view', () => {
    const id = tabs.addWeb();
    tabs.setActive(id);
    tabs.putView(id, wc);
    tabs.navigateActive('https://dest.test/');
    expect(wc.loadURL).toHaveBeenCalledWith('https://dest.test/');
  });

  it('navigateActive opens a fresh web tab when the active record has no view', () => {
    const id = tabs.addWeb();
    tabs.setActive(id);
    const before = tabs.count();
    tabs.navigateActive('https://new.test/');
    expect(tabs.count()).toBe(before + 1);
  });

  it('navigateTab targets an existing web tab and refuses a missing one', () => {
    const id = tabs.addWeb();
    tabs.putView(id, wc);
    expect(tabs.navigateTab(id, 'https://t.test/')).toBe(true);
    expect(wc.loadURL).toHaveBeenCalledWith('https://t.test/');
    expect(tabs.navigateTab('ghost', 'https://t.test/')).toBe(false);
  });

  it('goBack / goForward honour the navigation-history guards', () => {
    const id = tabs.addWeb();
    tabs.setActive(id);
    tabs.putView(id, wc);
    tabs.goBack();
    tabs.goForward();
    const nh = wc.navigationHistory as Record<string, ReturnType<typeof vi.fn>>;
    expect(nh.goBack).toHaveBeenCalled();
    expect(nh.goForward).toHaveBeenCalled();
  });

  it('reloadActive reloads the active webContents', () => {
    const id = tabs.addWeb();
    tabs.setActive(id);
    tabs.putView(id, wc);
    tabs.reloadActive();
    expect(wc.reload).toHaveBeenCalled();
  });

  it('goHome navigates to the configured home URL', () => {
    const id = tabs.addWeb();
    tabs.setActive(id);
    tabs.putView(id, wc);
    tabs.goHome();
    expect(wc.loadURL).toHaveBeenCalledWith('https://example.com/');
  });
});

describe('navigateActive — internal + failure paths', () => {
  it('routes a tepegoz:// URL to openInternalPage instead of loading it', () => {
    navUrl.internalPageUrl.mockImplementation((u: string) =>
      u.startsWith('tepegoz://') ? u : null,
    );
    const spy = vi.spyOn(tabs, 'openInternalPage').mockImplementation(() => undefined);
    tabs.navigateActive('tepegoz://settings');
    expect(spy).toHaveBeenCalledWith('tepegoz://settings');
  });

  it('logs a warning when the active view rejects the navigation', async () => {
    const id = tabs.addWeb();
    tabs.setActive(id);
    tabs.putView(id, mkWc({ loadURL: vi.fn(() => Promise.reject(new Error('neterr'))) }));
    tabs.navigateActive('https://dest.test/');
    await new Promise((r) => setTimeout(r, 0));
    expect(logger.warn).toHaveBeenCalledWith('Navigation failed', {
      url: 'https://dest.test/',
      err: expect.stringContaining('neterr') as string,
    });
  });

  it('navigateTab logs a warning when the target view rejects the navigation', async () => {
    const id = tabs.addWeb();
    tabs.putView(id, mkWc({ loadURL: vi.fn(() => Promise.reject(new Error('taberr'))) }));
    expect(tabs.navigateTab(id, 'https://t.test/')).toBe(true);
    await new Promise((r) => setTimeout(r, 0));
    expect(logger.warn).toHaveBeenCalledWith('Navigation failed', {
      url: 'https://t.test/',
      err: expect.stringContaining('taberr') as string,
    });
  });
});

describe('page-context commands', () => {
  beforeEach(() => {
    const id = tabs.addWeb();
    tabs.setActive(id);
    tabs.putView(id, wc);
  });

  it('print / view-source / save / download delegate with the active webContents', () => {
    tabs.printActive();
    tabs.viewSourceActive();
    tabs.saveActive();
    tabs.downloadUrlActive('https://file.test/x.pdf');
    expect(pageCmds.printPage).toHaveBeenCalledWith(wc);
    expect(pageCmds.viewSourcePage).toHaveBeenCalledWith(wc);
    expect(pageCmds.savePage).toHaveBeenCalledWith(wc);
    expect(dl.downloadURL).toHaveBeenCalledWith(wc, 'https://file.test/x.pdf', { actor: 'user' });
  });

  it('clipboard commands route to ClipboardService', () => {
    tabs.copyActive();
    tabs.cutActive();
    tabs.pasteActive();
    tabs.selectAllActive();
    tabs.copyImageAtActive(3, 4);
    expect(clip.copy).toHaveBeenCalledWith(wc);
    expect(clip.cut).toHaveBeenCalledWith(wc);
    expect(clip.paste).toHaveBeenCalledWith(wc);
    expect(clip.selectAll).toHaveBeenCalledWith(wc);
    expect(clip.copyImageAt).toHaveBeenCalledWith(wc, 3, 4);
  });

  it('zoomActive applies the zoom command to the active webContents', () => {
    tabs.zoomActive('in');
    expect(zoom.applyZoomCommand).toHaveBeenCalledWith(wc, 'in');
  });
});

describe('DevTools gate', () => {
  it('reports no_page when there is no active view', () => {
    expect(tabs.openDevToolsActive()).toEqual({ allowed: false, reason: 'no_page' });
    expect(tabs.inspectActiveAt(1, 2)).toEqual({ allowed: false, reason: 'no_page' });
  });

  it('refuses and reports the verdict on a sensitive site', () => {
    const id = tabs.addWeb();
    tabs.setActive(id);
    tabs.putView(id, wc);
    devVerdict.v = { allowed: false, reason: 'sensitive_site' };
    expect(tabs.openDevToolsActive()).toEqual({ allowed: false, reason: 'sensitive_site' });
    expect(wc.openDevTools).not.toHaveBeenCalled();
  });

  it('opens DevTools when allowed, and inspect defers to devtools-opened', () => {
    const id = tabs.addWeb();
    tabs.setActive(id);
    tabs.putView(id, wc);
    tabs.openDevToolsActive();
    expect(wc.openDevTools).toHaveBeenCalled();

    tabs.inspectActiveAt(12.4, 8.6);
    expect(wc.once).toHaveBeenCalledWith('devtools-opened', expect.any(Function));
  });

  it('inspectActiveAt refuses and logs on a sensitive site', () => {
    const id = tabs.addWeb();
    tabs.setActive(id);
    tabs.putView(id, wc);
    devVerdict.v = { allowed: false, reason: 'sensitive_site' };
    expect(tabs.inspectActiveAt(1, 2)).toEqual({ allowed: false, reason: 'sensitive_site' });
    expect(logger.info).toHaveBeenCalledWith('Refused to inspect element', {
      reason: 'sensitive_site',
    });
    expect(wc.inspectElement).not.toHaveBeenCalled();
  });

  it('inspectActiveAt inspects immediately (rounded coords) when DevTools is already open', () => {
    const id = tabs.addWeb();
    tabs.setActive(id);
    const openWc = mkWc({ isDevToolsOpened: () => true });
    tabs.putView(id, openWc);
    tabs.inspectActiveAt(12.6, 7.2);
    expect(openWc.inspectElement).toHaveBeenCalledWith(13, 7);
    expect(openWc.once).not.toHaveBeenCalled();
  });
});

describe('refreshState + setContentVisible', () => {
  it('refreshState re-pushes TabsState with no store mutation', () => {
    const send = tabs.fakeWin().webContents.send;
    send.mockClear();
    tabs.refreshState();
    expect(send).toHaveBeenCalled();
  });

  it('setContentVisible attaches + repositions the active web view, then detaches it', () => {
    const id = tabs.addWeb();
    tabs.setActive(id);
    tabs.putView(id, wc);

    tabs.setContentVisible(true);
    expect(tabs.fakeWin().contentView.children).toHaveLength(1);

    tabs.setContentVisible(false);
    expect(tabs.fakeWin().contentView.removeChildView).toHaveBeenCalledTimes(1);
  });

  it('setContentVisible also shows / hides the active internal-page view', async () => {
    const internal = await import('./tabs-internal-page-view');
    const id = tabs.addWeb();
    tabs.setActive(id);
    tabs.putInternalView(id, wc);

    tabs.setContentVisible(true);
    expect(vi.mocked(internal.showInternalPageView)).toHaveBeenCalled();

    tabs.setContentVisible(false);
    expect(vi.mocked(internal.hideInternalPageView)).toHaveBeenCalled();
  });

  it('setContentVisible is a no-op when the active tab has no view of either kind', () => {
    const id = tabs.addWeb();
    tabs.setActive(id);
    expect(() => {
      tabs.setContentVisible(true);
    }).not.toThrow();
    expect(tabs.fakeWin().contentView.removeChildView).not.toHaveBeenCalled();
  });
});

describe('content bounds + accessors', () => {
  it('getContentBounds returns a copy and setContentBounds ignores a zero-area report', () => {
    const before = tabs.getContentBounds();
    tabs.setContentBounds({ x: 0, y: 0, width: 0, height: 500 });
    expect(tabs.getContentBounds()).toEqual(before);
    tabs.setContentBounds({ x: 1, y: 2, width: 300, height: 400 });
    expect(tabs.getContentBounds()).toEqual({ x: 1, y: 2, width: 300, height: 400 });
  });

  it('activeWebContents / webContentsForTab return the live handle or null', () => {
    const id = tabs.addWeb();
    tabs.setActive(id);
    tabs.putView(id, wc);
    expect(tabs.activeWebContents()).toBe(wc);
    expect(tabs.webContentsForTab(id)).toBe(wc);
    expect(tabs.webContentsForTab('nope')).toBeNull();

    tabs.putView(id, mkWc({ isDestroyed: () => true }));
    expect(tabs.activeWebContents()).toBeNull();
  });
});

describe('captureActive', () => {
  it('returns a PNG data URL for a live view', async () => {
    const id = tabs.addWeb();
    tabs.setActive(id);
    tabs.putView(id, wc);
    expect(await tabs.captureActive()).toBe('data:image/png;base64,AA');
  });

  it('returns null on an empty capture, a throw, or no view', async () => {
    expect(await tabs.captureActive()).toBeNull();

    const id = tabs.addWeb();
    tabs.setActive(id);
    tabs.putView(id, mkWc({ capturePage: () => Promise.reject(new Error('gpu')) }));
    expect(await tabs.captureActive()).toBeNull();

    tabs.putView(id, mkWc({ capturePage: () => Promise.resolve({ isEmpty: () => true }) }));
    expect(await tabs.captureActive()).toBeNull();
  });
});

describe('applyUserAgent', () => {
  it('sets the UA on every live view and reloads it', () => {
    const a = tabs.addWeb();
    const b = tabs.addWeb();
    const wcA = mkWc();
    const wcB = mkWc();
    tabs.putView(a, wcA);
    tabs.putView(b, wcB);
    tabs.applyUserAgent('TepegozUA/1');
    expect(wcA.setUserAgent).toHaveBeenCalledWith('TepegozUA/1');
    expect(wcB.setUserAgent).toHaveBeenCalledWith('TepegozUA/1');
    expect(wcA.reload).toHaveBeenCalled();
  });
});
