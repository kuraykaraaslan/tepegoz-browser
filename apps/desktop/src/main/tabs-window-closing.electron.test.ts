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
  constructor() {
    this.webContents = new FakeContents(this);
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
  hasRealPage: () => false,
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
  tabIds(): string[] {
    return this.store.ids();
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
});
