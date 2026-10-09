import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeWindow, Harness } from './tabs-window.test-kit';

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

const persistSession = vi.hoisted(() => vi.fn());
const { closedTabs, rememberClosedTab, runAsClosedBatch } = await import('./closed-tabs');
vi.mock('./tabs-shared', () => ({
  rememberClosedTab: vi.fn(),
  internalBaseUrl: (u: string) => u,
  internalTitleFor: () => 'Internal',
  browsedViewWebPreferences: () => ({}),
  homeUrl: () => 'https://example.com/',
  searchUrlForQuery: (q: string) => q,
  persistSession,
  involuntaryGroupExitObservers: new Set(),
}));

let tabs: Harness;
let win: ReturnType<typeof fakeWindow>;
beforeEach(() => {
  vi.clearAllMocks();
  closedTabs.length = 0;
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
    rememberClosedTab('https://reopened.test/', 'R', 1);
    const before = tabs.count();
    tabs.reopenClosedTab();
    expect(tabs.count()).toBe(before + 1);
  });

  it('restores a group closed as a unit as one group with its name and colour', () => {
    runAsClosedBatch(() => {
      rememberClosedTab('https://a.test/', 'A', 1, { name: 'Research', color: 'green' });
      rememberClosedTab('https://b.test/', 'B', 2, { name: 'Research', color: 'green' });
    });
    tabs.reopenClosedTab();
    // The records' URLs fill in only after the pages load, so the pinned facts are name, colour, size.
    expect(tabs.groupsWithMembers().map((g) => [g.name, g.color, g.urls.length])).toEqual([
      ['Research', 'green', 2],
    ]);
    expect(closedTabs).toHaveLength(0);
  });

  it('reopens a single tab closed out of a group as a plain tab, not a group', () => {
    rememberClosedTab('https://a.test/', 'A', 1, { name: 'Research', color: 'green' });
    tabs.reopenClosedTab();
    expect(tabs.count()).toBe(1);
    expect(tabs.groupsWithMembers()).toEqual([]);
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

describe('visibleTabCount', () => {
  it('counts the tabs the strip shows, not the hidden kept-alive ones', () => {
    tabs.addWeb('https://a.test/');
    const hidden = tabs.addWeb('https://b.test/');
    tabs.addWeb('https://c.test/');
    tabs.hideTab(hidden);
    expect(tabs.tabCount()).toBe(3);
    expect(tabs.visibleTabCount()).toBe(2);
  });
});
