import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Closing a tab, against the one fact that makes it hard: **Electron nulls `WebContentsView.webContents`
 * when the contents are destroyed**, while the TypeScript type keeps promising a `WebContents`. Measured
 * on Electron 43.4.1 — reading the property back from inside the `destroyed` event yields `undefined`.
 *
 * That matters because `askBeforeClose` deliberately closes the tab in TWO passes: the first hands the
 * close to the page's `beforeunload`, the second runs from the `destroyed` event and does the real
 * teardown. The second pass therefore always meets the nulled property, and an unguarded read threw a
 * `TypeError` straight out of the emit — over `store.delete` — after Electron had already detached the
 * dead view itself. The user saw the page vanish and the tab sit in the strip forever.
 */

class FakeContents extends EventEmitter {
  destroyed = false;
  closeCalls: unknown[] = [];
  navigationHistory = { canGoBack: () => false, canGoForward: () => false };
  getZoomFactor(): number {
    return 1;
  }
  constructor(private readonly view: FakeView) {
    super();
  }
  isDestroyed(): boolean {
    return this.destroyed;
  }
  getURL(): string {
    return 'https://github.com/anthropics/claude-code/releases';
  }
  close(opts?: unknown): void {
    this.closeCalls.push(opts);
  }
  reloadCalls = 0;
  reload(): void {
    this.reloadCalls++;
  }
  /** What Chromium does a tick later when the page had no `beforeunload` to run — including the part
   *  the old code did not survive: the view's `webContents` property is gone before we are told. */
  electronDestroys(): void {
    this.destroyed = true;
    this.view.webContents = undefined;
    this.emit('destroyed');
  }
}

class FakeView {
  webContents: FakeContents | undefined;
  boundsCalls: unknown[] = [];
  constructor() {
    this.webContents = new FakeContents(this);
  }
  setBounds(b: unknown): void {
    this.boundsCalls.push(b);
  }
}

const sent: unknown[] = [];
function fakeWindow() {
  const children: unknown[] = [];
  return {
    isDestroyed: () => false,
    close: vi.fn(),
    setTitle: vi.fn(),
    getContentSize: () => [1200, 800],
    webContents: {
      send: (_channel: string, state: unknown) => {
        sent.push(state);
      },
    },
    contentView: {
      children,
      addChildView: (v: unknown) => children.push(v),
      removeChildView: (v: unknown) => {
        const i = children.indexOf(v);
        if (i !== -1) children.splice(i, 1);
      },
    },
  };
}

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

const { WindowTabsClosing } = await import('./tabs-window-closing');
const ipv = await import('./tabs-internal-page-view');
const ipView = (): Electron.WebContentsView => ({}) as unknown as Electron.WebContentsView;

/** Reaches the protected store/views the real code owns, so a test can stage a wired web tab. */
class Harness extends WindowTabsClosing {
  seedWebTab(view: FakeView): string {
    const id = this.store.add({
      kind: 'web',
      title: 'Releases',
      url: 'https://github.com/anthropics/claude-code/releases',
      isLoading: false,
      faviconUrl: null,
    });
    this.views.set(id, view as unknown as Electron.WebContentsView);
    return id;
  }
  seedInternalTab(url: string): string {
    return this.store.add({
      kind: 'internal',
      title: 'Internal',
      url,
      isLoading: false,
      faviconUrl: null,
    });
  }
  /** The real `createTab` builds a live `WebContentsView`; override it with a store-only stub so
   *  `createTabRight` / `duplicateTab` are exercisable without Electron. */
  override createTab(
    url?: string,
    opts?: { background?: boolean; openerId?: string | undefined },
  ): string | null {
    void opts;
    return this.store.add({
      kind: 'web',
      title: 'New',
      url: url ?? 'about:blank',
      isLoading: false,
      faviconUrl: null,
    });
  }
  /** The view-wiring host the base hands to `wireView` — its `closeTab` is the override under test. */
  wiringHost(): { closeTab: (id: string) => void } {
    return this.viewWiringHost();
  }
  tabIds(): string[] {
    return this.store.ids();
  }
  activeId(): string | null {
    return this.store.activeId;
  }
  isHidden(id: string): boolean {
    return this.store.get(id)?.hidden === true;
  }
  hasView(id: string): boolean {
    return this.views.has(id);
  }
}

function harness(): { tabs: Harness; win: ReturnType<typeof fakeWindow> } {
  const win = fakeWindow();
  const tabs = new Harness(win as unknown as Electron.BrowserWindow, false);
  return { tabs, win };
}

beforeEach(() => {
  sent.length = 0;
});

describe('closeTab', () => {
  it('REMOVES THE TAB once the contents are destroyed, even though Electron nulled `view.webContents`', () => {
    const { tabs, win } = harness();
    const keep = tabs.seedWebTab(new FakeView()); // a second tab, so the window is not closed instead
    const view = new FakeView();
    const doomed = tabs.seedWebTab(view);
    const wc = view.webContents!;
    win.contentView.addChildView(view);

    tabs.closeTab(doomed);
    // Pass 1 hands the close to `beforeunload` and MUST leave the tab alone until the page answers.
    expect(wc.closeCalls).toEqual([{ waitForBeforeUnload: true }]);
    expect(tabs.tabIds()).toContain(doomed);

    wc.electronDestroys(); // pass 2, from inside the `destroyed` event, with `view.webContents` gone

    expect(tabs.tabIds()).toEqual([keep]);
    expect(tabs.hasView(doomed)).toBe(false);
    expect(win.contentView.children).not.toContain(view);
  });

  it('closes a tab whose contents died on their own (crash, window.close) without a second ask', () => {
    const { tabs } = harness();
    const keep = tabs.seedWebTab(new FakeView());
    const view = new FakeView();
    const dead = tabs.seedWebTab(view);
    view.webContents!.destroyed = true;
    view.webContents = undefined; // the state Electron leaves behind

    expect(() => {
      tabs.closeTab(dead);
    }).not.toThrow();
    expect(tabs.tabIds()).toEqual([keep]);
  });

  it('keeps the tab when the page is still asking — the store is untouched until the answer', () => {
    const { tabs } = harness();
    tabs.seedWebTab(new FakeView());
    const view = new FakeView();
    const id = tabs.seedWebTab(view);

    tabs.closeTab(id);

    expect(tabs.tabIds()).toContain(id);
    expect(tabs.hasView(id)).toBe(true);
  });

  it('tears a still-live view down on the retry pass — unwires, closes the contents, removes the child', () => {
    const { tabs, win } = harness();
    const keep = tabs.seedWebTab(new FakeView());
    const view = new FakeView();
    const doomed = tabs.seedWebTab(view);
    const wc = view.webContents!;
    win.contentView.addChildView(view);

    tabs.closeTab(doomed); // pass 1: askBeforeClose owns the close, the tab stays put
    expect(tabs.tabIds()).toContain(doomed);

    // `destroyed` fires while the contents are still readable (not the usual nulled case): the retry
    // pass meets a LIVE wc that askBeforeClose now waves through, so tearDownView runs its live branch.
    wc.emit('destroyed');

    expect(tabs.tabIds()).toEqual([keep]);
    expect(tabs.hasView(doomed)).toBe(false);
    expect(wc.closeCalls).toEqual([{ waitForBeforeUnload: true }, undefined]); // pass-1 ask + pass-2 close()
    expect(win.contentView.children).not.toContain(view);
  });

  it('destroys the internal-page view of a closed internal tab that owns one', () => {
    vi.mocked(ipv.hasRealPage).mockReturnValueOnce(true);
    const view = ipView();
    vi.mocked(ipv.createInternalPageView).mockReturnValueOnce(view);
    const { tabs, win } = harness();
    const keep = tabs.seedInternalTab('tepegoz://keep');
    tabs.openInternalPage('tepegoz://has-a-real-page');
    const owned = tabs.activeId()!;

    tabs.closeTab(owned);

    expect(vi.mocked(ipv.destroyInternalPageView)).toHaveBeenCalledWith(win, view);
    expect(tabs.tabIds()).toEqual([keep]);
  });

  it('the view-wiring host routes closeTab back to the real closeTab (Ctrl+W with page focus)', () => {
    const { tabs } = harness();
    const keep = tabs.seedInternalTab('tepegoz://keep');
    const view = new FakeView();
    const doomed = tabs.seedWebTab(view);

    tabs.wiringHost().closeTab(doomed); // pass 1
    view.webContents!.electronDestroys(); // pass 2 completes it

    expect(tabs.tabIds()).toEqual([keep]);
  });
});

describe('afterRemove', () => {
  it('closes the window when the last tab goes', () => {
    const { tabs, win } = harness();
    const only = tabs.seedInternalTab('tepegoz://newtab');
    tabs.activate(only);

    tabs.closeTab(only);

    expect(tabs.tabIds()).toEqual([]);
    expect(win.close).toHaveBeenCalled();
  });

  it('reselects the last visible tab, skipping hidden ones, when the active tab is closed', () => {
    const { tabs } = harness();
    const a = tabs.seedInternalTab('tepegoz://a');
    const b = tabs.seedInternalTab('tepegoz://b');
    const c = tabs.seedInternalTab('tepegoz://c');
    tabs.activate(c);
    tabs.hideTab(b);
    tabs.activate(c);

    tabs.closeTab(c);

    expect(tabs.activeId()).toBe(a); // b is hidden → skipped
  });

  it('unhides the last hidden tab when closing the active one leaves nothing visible', () => {
    const { tabs } = harness();
    const a = tabs.seedInternalTab('tepegoz://a');
    const b = tabs.seedInternalTab('tepegoz://b');
    tabs.activate(a);
    tabs.hideTab(b); // a visible + active, b hidden

    tabs.closeTab(a); // lastVisibleId() now finds only hidden tabs → returns undefined

    expect(tabs.tabIds()).toEqual([b]);
    expect(tabs.isHidden(b)).toBe(false); // force-unhidden so the strip is never empty
    expect(tabs.activeId()).toBe(b);
  });

  it('just re-emits when a non-active tab is closed', () => {
    const { tabs } = harness();
    const a = tabs.seedInternalTab('tepegoz://a');
    const b = tabs.seedInternalTab('tepegoz://b');
    tabs.activate(a);
    sent.length = 0;

    tabs.closeTab(b);

    expect(tabs.tabIds()).toEqual([a]);
    expect(tabs.activeId()).toBe(a);
    expect(sent.length).toBeGreaterThan(0);
  });
});

describe('hide / unhide', () => {
  it('hides an active tab and brings the last visible one forward', () => {
    const { tabs } = harness();
    const a = tabs.seedInternalTab('tepegoz://a');
    const b = tabs.seedInternalTab('tepegoz://b');
    tabs.activate(b);

    tabs.hideTab(b);

    expect(tabs.isHidden(b)).toBe(true);
    expect(tabs.activeId()).toBe(a);
  });

  it('will not hide the last visible tab', () => {
    const { tabs } = harness();
    const only = tabs.seedInternalTab('tepegoz://a');
    tabs.activate(only);

    tabs.hideTab(only);

    expect(tabs.isHidden(only)).toBe(false);
  });

  it('no-ops on an unknown or already-hidden id', () => {
    const { tabs } = harness();
    const a = tabs.seedInternalTab('tepegoz://a');
    const b = tabs.seedInternalTab('tepegoz://b');
    tabs.activate(a);
    tabs.hideTab(b);

    expect(() => {
      tabs.hideTab(b); // already hidden
      tabs.hideTab('nope'); // unknown
      tabs.unhideTab('nope'); // unknown
    }).not.toThrow();

    tabs.unhideTab(b);
    expect(tabs.isHidden(b)).toBe(false);
    tabs.unhideTab(b); // not hidden → early return
    expect(tabs.isHidden(b)).toBe(false);
  });
});

describe('small queries and reload', () => {
  it('activeTabId / viewlessActiveTabId reflect whether the active tab owns a view', () => {
    const { tabs } = harness();
    const web = tabs.seedWebTab(new FakeView());
    const internal = tabs.seedInternalTab('tepegoz://x');

    tabs.activate(internal);
    expect(tabs.activeTabId()).toBe(internal);
    expect(tabs.viewlessActiveTabId()).toBe(internal);

    tabs.activate(web);
    expect(tabs.viewlessActiveTabId()).toBeNull();
  });

  it('reloadTab reloads the tab view and is a no-op for an unknown id', () => {
    const { tabs } = harness();
    const view = new FakeView();
    const id = tabs.seedWebTab(view);

    tabs.reloadTab(id);
    expect(view.webContents!.reloadCalls).toBe(1);

    expect(() => {
      tabs.reloadTab('nope');
    }).not.toThrow();
  });
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
