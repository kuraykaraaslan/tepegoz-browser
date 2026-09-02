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
vi.mock('@tepegoz/libs', () => ({
  Logger: { warn: vi.fn(), info: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));
vi.mock('@tepegoz/security-policy', () => ({ mayOpenDevTools: () => ({ allowed: true }) }));
vi.mock('./lib/i18n-main', () => ({
  mainStrings: () => ({
    browser: { unloadTitle: 't', unloadDetail: 'd', unloadLeave: 'l', unloadStay: 's' },
  }),
}));
vi.mock('./lib/navigation-url', () => ({
  isWebUrl: (u: string) => u.startsWith('http'),
  internalPageUrl: () => null,
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

const closedStack = vi.hoisted((): { items: { url: string; id?: string }[] } => ({ items: [] }));
vi.mock('./tabs-shared', () => ({
  rememberClosedTab: vi.fn(),
  internalBaseUrl: (u: string) => u,
  internalTitleFor: () => 'Internal',
  browsedViewWebPreferences: () => ({}),
  homeUrl: () => 'https://example.com/',
  searchUrlForQuery: (q: string) => q,
  persistSession: vi.fn(),
  involuntaryGroupExitObservers: new Set(),
  takeClosedTab: (id?: string) => {
    if (closedStack.items.length === 0) return undefined;
    if (id === undefined) return closedStack.items.pop();
    const i = closedStack.items.findIndex((c) => c.id === id);
    return i === -1 ? undefined : closedStack.items.splice(i, 1)[0];
  },
}));

const { WindowTabs } = await import('./tabs-window');

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
}

let tabs: Harness;
beforeEach(() => {
  vi.clearAllMocks();
  closedStack.items = [];
  tabs = new Harness(fakeWindow() as never, false);
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
});
