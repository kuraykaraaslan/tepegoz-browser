import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeView, sent, harness, ipView } from './tabs-window-closing.electron.test-kit';

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
const shared = await import('./tabs-shared');

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

  it('remembers the group a closed tab belonged to, and nothing for an ungrouped one', () => {
    vi.mocked(shared.rememberClosedTab).mockClear();
    const { tabs, win } = harness();
    tabs.seedWebTab(new FakeView()); // survivor so the window stays open
    const grouped = new FakeView();
    const groupedId = tabs.seedWebTab(grouped);
    tabs.seedGroup(groupedId, 'Research', 'green');
    const plain = new FakeView();
    const plainId = tabs.seedWebTab(plain);
    win.contentView.addChildView(grouped);
    win.contentView.addChildView(plain);

    tabs.closeTab(groupedId);
    grouped.webContents!.emit('destroyed');
    tabs.closeTab(plainId);
    plain.webContents!.emit('destroyed');

    const calls = vi.mocked(shared.rememberClosedTab).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0]?.[3]).toEqual({ name: 'Research', color: 'green' });
    expect(calls[1]?.[3]).toBeUndefined();
  });

  it('records nothing for a tab closed in a PRIVATE window — not its URL, title or group', () => {
    vi.mocked(shared.rememberClosedTab).mockClear();
    const { tabs, win } = harness(true);
    tabs.seedWebTab(new FakeView()); // survivor
    const view = new FakeView();
    const id = tabs.seedWebTab(view);
    tabs.seedGroup(id, 'Secret plans', 'green');
    win.contentView.addChildView(view);
    tabs.closeTab(id);
    view.webContents!.emit('destroyed');
    expect(tabs.tabIds()).not.toContain(id);
    expect(shared.rememberClosedTab).not.toHaveBeenCalled();
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

  it('reloadTab reloads an internal page tab through its own view (outside `views`)', () => {
    const { tabs } = harness();
    const view = new FakeView();
    const id = tabs.seedInternalTabWithView('tepegoz://settings', view);

    tabs.reloadTab(id);
    expect(view.webContents!.reloadCalls).toBe(1);
  });
});
