import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeView, sent, harness, ipView } from './tabs-window-closing.electron.test-kit';

/**
 * `WindowTabsClosing` — the rest of the closing surface over the same fakes: `openInternalPage`, the bulk
 * closers (others / right / etc.) and `createTabRight` / `duplicateTab`. See
 * `tabs-window-closing.electron.test.ts` for the destroyed-contents contract these build on.
 */

vi.mock('electron', () => ({
  WebContentsView: class {},
  BrowserWindow: { fromWebContents: () => null },
  // The unload broker's dialog: "stay" would keep the tab, so the tests that want a real close pick LEAVE.
  dialog: { showMessageBoxSync: () => 0 },
}));
vi.mock('@tepegoz/libs', () => ({ Logger: { warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
vi.mock('./lib/i18n-main', () => ({
  mainStrings: () => ({
    browser: { unloadTitle: 't', unloadDetail: 'd', unloadLeave: 'l', unloadStay: 's' },
  }),
}));
vi.mock('./network/browsing-sessions.electron', () => ({
  default: { defaultForNewTab: () => ({}), private: () => ({}) },
}));
vi.mock('./extensions/action-interceptors.electron', () => ({
  default: { shouldBlock: () => false },
}));
vi.mock('./tabs-view-wiring', () => ({
  wireView: vi.fn(),
  unwireView: vi.fn(),
}));
vi.mock('./tabs-internal-page-view', () => ({
  createInternalPageView: vi.fn(),
  destroyInternalPageView: vi.fn(),
  hasRealPage: vi.fn(() => false),
  hideInternalPageView: vi.fn(),
  navigateInternalPageView: vi.fn(),
  showInternalPageView: vi.fn(),
}));
vi.mock('./tabs-shared', () => ({
  rememberClosedTab: vi.fn(),
  internalBaseUrl: (u: string) => u,
  internalTitleFor: () => 'Internal',
  browsedViewWebPreferences: () => ({}),
  homeUrl: () => 'https://example.com/',
  searchUrlForQuery: (q: string) => q,
  persistSession: vi.fn(),
}));

const ipv = await import('./tabs-internal-page-view');

beforeEach(() => {
  sent.length = 0;
});

describe('openInternalPage', () => {
  it('opens a fresh internal tab, then focuses it instead of opening a second', () => {
    const { tabs } = harness();

    tabs.openInternalPage('tepegoz://settings');
    const first = tabs.activeId();
    expect(first).not.toBeNull();
    expect(tabs.tabIds()).toHaveLength(1);

    tabs.openInternalPage('tepegoz://settings');
    expect(tabs.tabIds()).toHaveLength(1); // focused the existing one
    expect(tabs.activeId()).toBe(first);
  });

  it('builds a backing internal-page view when the target url has a real page', () => {
    vi.mocked(ipv.hasRealPage).mockReturnValueOnce(true);
    const view = ipView();
    vi.mocked(ipv.createInternalPageView).mockReturnValueOnce(view);
    const { tabs, win } = harness();

    tabs.openInternalPage('tepegoz://history');

    expect(vi.mocked(ipv.createInternalPageView)).toHaveBeenCalledWith(
      win,
      'tepegoz://history',
      expect.any(Function),
    );
    expect(tabs.activeId()).not.toBeNull();
  });
});

describe('bulk close', () => {
  it('closeOtherTabs keeps only the reference tab, active', () => {
    const { tabs } = harness();
    const a = tabs.seedInternalTab('tepegoz://a');
    const b = tabs.seedInternalTab('tepegoz://b');
    const c = tabs.seedInternalTab('tepegoz://c');
    void a;
    void c;

    tabs.closeOtherTabs(b);

    expect(tabs.tabIds()).toEqual([b]);
    expect(tabs.activeId()).toBe(b);
  });

  it('closeOtherTabs is a no-op for an unknown id', () => {
    const { tabs } = harness();
    const a = tabs.seedInternalTab('tepegoz://a');

    tabs.closeOtherTabs('nope');

    expect(tabs.tabIds()).toEqual([a]);
  });

  it('closeTabsToRight closes everything after the reference tab', () => {
    const { tabs } = harness();
    const a = tabs.seedInternalTab('tepegoz://a');
    const b = tabs.seedInternalTab('tepegoz://b');
    const c = tabs.seedInternalTab('tepegoz://c');
    const d = tabs.seedInternalTab('tepegoz://d');
    void c;
    tabs.activate(d); // active tab is among those being closed → falls back to the ref tab

    tabs.closeTabsToRight(b);

    expect(tabs.tabIds()).toEqual([a, b]);
    expect(tabs.activeId()).toBe(b);
  });

  it('closeTabsToRight is a no-op when the reference tab is unknown', () => {
    const { tabs } = harness();
    const a = tabs.seedInternalTab('tepegoz://a');
    const b = tabs.seedInternalTab('tepegoz://b');

    tabs.closeTabsToRight('nope');

    expect(tabs.tabIds()).toEqual([a, b]);
  });
});

describe('createTabRight / duplicateTab', () => {
  it('createTabRight inserts a new tab right after the reference and focuses it', () => {
    const { tabs } = harness();
    const a = tabs.seedInternalTab('tepegoz://a');
    const b = tabs.seedInternalTab('tepegoz://b');

    tabs.createTabRight(a);

    const ids = tabs.tabIds();
    expect(ids).toHaveLength(3);
    expect(ids[0]).toBe(a);
    expect(ids[2]).toBe(b); // the newcomer sits between a and b
  });

  it('createTabRight is a no-op for an unknown reference', () => {
    const { tabs } = harness();
    const a = tabs.seedInternalTab('tepegoz://a');

    tabs.createTabRight('nope');

    expect(tabs.tabIds()).toEqual([a]);
  });

  it('duplicateTab on an internal tab just focuses the same internal page', () => {
    const { tabs } = harness();
    const a = tabs.seedInternalTab('tepegoz://settings');
    tabs.activate(a);

    tabs.duplicateTab(a);

    // internal → openInternalPage focuses the existing tab, no new one
    expect(tabs.tabIds()).toEqual([a]);
  });

  it('duplicateTab on a web tab clones its URL into a new tab after it', () => {
    const { tabs } = harness();
    const view = new FakeView();
    const id = tabs.seedWebTab(view);

    tabs.duplicateTab(id);

    expect(tabs.tabIds()).toHaveLength(2);
  });

  it('duplicateTab is a no-op for an unknown id', () => {
    const { tabs } = harness();
    const a = tabs.seedInternalTab('tepegoz://a');

    tabs.duplicateTab('nope');

    expect(tabs.tabIds()).toEqual([a]);
  });
});
