import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `WindowTabs` — the session restore / snapshot layer on top of the tab-model chain, over a real
 * `TabStore`. Pinned: `snapshot` keeps only real web tabs (internal + non-web-URL skipped), prefers
 * the live view URL but falls back to the record URL when the view is gone, carries pin + group
 * membership + hidden, prunes groups with no surviving member, and records the active index + window
 * bounds; `reopenClosedTab` recreates the most-recent (or id-named) closed tab and no-ops when the
 * list is empty; and `restoreWindow` recreates the persisted tabs in order (first foreground, rest
 * background) and returns the ids it created.
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

const { WindowTabs } = await import('./tabs-window');
const { WindowTabsBase } = await import('./tabs-window-base');
const ipv = await import('./tabs-internal-page-view');

function fakeWindow() {
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

class Harness extends WindowTabs {
  addWeb(url = 'https://x.test/', over: Record<string, unknown> = {}): string {
    return this.store.add({
      kind: 'web',
      title: 't',
      url,
      isLoading: false,
      faviconUrl: null,
      ...over,
    });
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
  setActive(id: string): void {
    this.store.setActive(id);
  }
  activeId(): string | null {
    return this.store.activeId;
  }
  group(id: string): { name: string; collapsed: boolean } | undefined {
    return this.store.groupsInOrder().find((g) => g.id === id);
  }
  makeGroup(name: string, memberIds: string[]): string {
    return this.store.createGroup({ name, color: 'blue', collapsed: false, memberIds });
  }
  fakeView(id: string, url: string | null): void {
    this.views.set(id, {
      webContents: { isDestroyed: () => url === null, getURL: () => url ?? '' },
    } as never);
  }
  count(): number {
    return this.store.records().length;
  }
  record(id: string): { kind: string } | undefined {
    return this.store.get(id);
  }
  viewSetBounds(id: string): ReturnType<typeof vi.fn> {
    return (this.views.get(id) as unknown as { setBounds: ReturnType<typeof vi.fn> }).setBounds;
  }
  park(id: string): void {
    this.parkHiddenView(id);
  }
  /** Directly seed a backing internal-page view for `id` (the real path needs `hasRealPage`). */
  seedIpv(id: string, view: unknown): void {
    this.internalPageViews.set(id, view as never);
  }
  /** The view-wiring host the base builds for `wireView` — its `createTab`/`emitState` arrows. */
  wiringHost(): {
    createTab: (u?: string, o?: unknown) => void;
    emitState: () => void;
    getBounds: () => unknown;
    closeTab: () => void;
  } {
    return this.viewWiringHost() as never;
  }
  /** The size-a-view rectangle decision (exercises the destroyed-window branch). */
  effBounds(): unknown {
    return this.effectiveBounds();
  }
}

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

describe('snapshot', () => {
  it('keeps only real web tabs, skipping internal and non-web-URL ones', () => {
    tabs.addWeb('https://a.test/');
    tabs.addInternal();
    tabs.addWeb('about:blank');
    const snap = tabs.snapshot();
    expect(snap.tabs.map((t) => t.url)).toEqual(['https://a.test/']);
  });

  it('prefers the live view URL, else falls back to the record URL', () => {
    const live = tabs.addWeb('https://old.test/');
    tabs.fakeView(live, 'https://new.test/');
    const gone = tabs.addWeb('https://record.test/');
    tabs.fakeView(gone, null); // destroyed view → record URL
    expect(tabs.snapshot().tabs.map((t) => t.url)).toEqual([
      'https://new.test/',
      'https://record.test/',
    ]);
  });

  it('carries hidden / group membership and the active index + window bounds', () => {
    const a = tabs.addWeb('https://a.test/');
    const b = tabs.addWeb('https://b.test/', { hidden: true });
    const g = tabs.makeGroup('Work', [a, b]);
    tabs.setActive(b);
    const snap = tabs.snapshot();
    expect(snap.tabs[0]).toMatchObject({ url: 'https://a.test/', groupId: g });
    expect(snap.tabs[1]).toMatchObject({ hidden: true });
    expect(snap.activeIndex).toBe(1);
    expect(snap.groups.map((x) => x.id)).toEqual([g]);
    expect(snap.bounds).toEqual({ x: 10, y: 20, width: 800, height: 600 });
  });

  it('prunes a group whose only member is not a persisted web tab', () => {
    const internal = tabs.addInternal();
    tabs.makeGroup('Ghost', [internal]);
    tabs.addWeb('https://keep.test/');
    expect(tabs.snapshot().groups).toEqual([]);
  });
});

describe('reopenClosedTab', () => {
  it('recreates the most recent closed tab', () => {
    closedStack.items = [{ url: 'https://reopened.test/' }];
    const before = tabs.count();
    tabs.reopenClosedTab();
    expect(tabs.count()).toBe(before + 1);
  });

  it('is a no-op when there is nothing to reopen', () => {
    const before = tabs.count();
    tabs.reopenClosedTab();
    tabs.reopenClosedTab('missing-id');
    expect(tabs.count()).toBe(before);
  });
});

describe('restoreWindow', () => {
  it('returns [] and creates nothing for an empty snapshot', () => {
    expect(tabs.restoreWindow({ tabs: [], groups: [], activeIndex: -1 })).toEqual([]);
    expect(tabs.count()).toBe(0);
  });

  it('recreates the persisted web tabs in order and returns their ids', () => {
    const created = tabs.restoreWindow({
      tabs: [
        { url: 'https://one.test/', pinned: false, groupId: null },
        { url: 'https://two.test/', pinned: false, groupId: null },
      ],
      groups: [],
      activeIndex: -1,
    });
    expect(created).toHaveLength(2);
    expect(tabs.count()).toBe(2);
  });

  it('re-creates groups with their stable id + metadata + membership and restores pins', () => {
    const created = tabs.restoreWindow({
      tabs: [
        { url: 'https://one.test/', pinned: false, groupId: 'g1' },
        { url: 'https://two.test/', pinned: false, groupId: 'g1' },
        { url: 'https://three.test/', pinned: true, groupId: null },
      ],
      groups: [{ id: 'g1', name: 'Work', color: 'blue', collapsed: true, settings: {} }],
      activeIndex: 0,
    });
    expect(tabs.group('g1')).toMatchObject({ name: 'Work', collapsed: true });
    expect(tabs.record(created[0]!)).toMatchObject({ groupId: 'g1' });
    expect(tabs.record(created[1]!)).toMatchObject({ groupId: 'g1' });
    expect(tabs.record(created[2]!)).toMatchObject({ pinned: true, groupId: null });
  });

  it('skips a persisted group none of whose tabs came back', () => {
    tabs.restoreWindow({
      tabs: [{ url: 'https://a.test/', pinned: false, groupId: 'other' }],
      groups: [{ id: 'ghost', name: 'Ghost', color: 'red', collapsed: false, settings: {} }],
      activeIndex: -1,
    });
    expect(tabs.group('ghost')).toBeUndefined();
  });

  it('activates the persisted active tab by index', () => {
    const created = tabs.restoreWindow({
      tabs: [
        { url: 'https://a.test/', pinned: false, groupId: null },
        { url: 'https://b.test/', pinned: false, groupId: null },
      ],
      groups: [],
      activeIndex: 1,
    });
    expect(tabs.activeId()).toBe(created[1]);
  });

  it('never surfaces a hidden tab — the persisted active index points at one, so it falls back to the last visible', () => {
    const created = tabs.restoreWindow({
      tabs: [
        { url: 'https://a.test/', pinned: false, groupId: null },
        { url: 'https://b.test/', pinned: false, groupId: null, hidden: true },
      ],
      groups: [],
      activeIndex: 1,
    });
    expect(tabs.record(created[1]!)).toMatchObject({ hidden: true });
    expect(tabs.activeId()).toBe(created[0]);
  });

  it('with no persisted active index, still moves off a hidden foreground tab', () => {
    const created = tabs.restoreWindow({
      tabs: [
        { url: 'https://a.test/', pinned: false, groupId: null, hidden: true },
        { url: 'https://b.test/', pinned: false, groupId: null },
      ],
      groups: [],
      activeIndex: -1,
    });
    expect(tabs.activeId()).toBe(created[1]);
  });

  it('parks restored hidden tabs so they keep rendering off-screen', () => {
    const created = tabs.restoreWindow({
      tabs: [
        { url: 'https://a.test/', pinned: false, groupId: null },
        { url: 'https://b.test/', pinned: false, groupId: null, hidden: true },
      ],
      groups: [],
      activeIndex: 0,
    });
    const hiddenId = created[1]!;
    expect(tabs.record(hiddenId)).toMatchObject({ hidden: true });
    // its view was parked (attached, off the left edge) rather than detached.
    expect(tabs.viewSetBounds(hiddenId)).toHaveBeenCalledWith({
      x: -108,
      y: 5,
      width: 100,
      height: 80,
    });
  });
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
