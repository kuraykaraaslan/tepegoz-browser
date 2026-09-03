import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `TabManager` — the static facade. Every method is `TabManager.focused()?.<same name>(...args) ??
 * <default>`: it forwards to the focused window's `WindowTabs` and, when there is no focused window,
 * returns a safe default rather than throwing. Pinned: the forwarding (name + args) for a
 * representative slice, and the no-window default for each shape.
 */

const EMPTY_STATE = { tabs: [], groups: [], activeId: null };
vi.mock('./tabs-shared', () => ({ EMPTY_TABS_STATE: EMPTY_STATE }));

const state = vi.hoisted(
  (): {
    focused: Record<string, ReturnType<typeof vi.fn>> | undefined;
    all: Record<string, ReturnType<typeof vi.fn>>[];
  } => ({ focused: undefined, all: [] }),
);
vi.mock('./tabs-manager-base', () => ({
  TabManagerBase: class {
    static focused() {
      return state.focused;
    }
    static all() {
      return state.all;
    }
  },
}));

const { default: TabManager } = await import('./tabs-manager');

/** A WindowTabs stub whose every accessed method is a spy. */
function stubWindow(): Record<string, ReturnType<typeof vi.fn>> {
  const cache: Record<string, ReturnType<typeof vi.fn>> = {};
  return new Proxy(cache, {
    get: (t, prop: string) => (t[prop] ??= vi.fn()),
  });
}

beforeEach(() => {
  state.focused = stubWindow();
  state.all = [];
});

type Row = [name: string, args: unknown[]];
const FORWARDS: Row[] = [
  ['createTab', ['https://x.test/', { background: true }]],
  ['activeTabId', []],
  ['viewlessActiveTabId', []],
  ['activate', ['t1']],
  ['closeTab', ['t1']],
  ['reloadTab', ['t1']],
  ['openInternalPage', ['tepegoz://settings']],
  ['createTabRight', ['t1']],
  ['duplicateTab', ['t1']],
  ['closeOtherTabs', ['t1']],
  ['closeTabsToRight', ['t1']],
  ['moveTab', ['t1', 3, 'g1']],
  ['moveGroup', ['g1', 2]],
  ['createGroup', [['t1', 't2']]],
  ['assignToGroup', ['t1', 'g1']],
  ['removeFromGroup', ['t1']],
  ['renameGroup', ['g1', 'Work']],
  ['recolorGroup', ['g1', 'blue']],
  ['setGroupCollapsed', ['g1', true]],
  ['updateGroupSettings', ['g1', { agentEnabled: true }]],
  ['newTabInGroup', ['g1']],
  ['closeGroup', ['g1']],
  ['groupMenuInfo', ['g1']],
  ['ungroup', ['g1']],
  ['setPinned', ['t1', true]],
  ['hideTab', ['t1']],
  ['unhideTab', ['t1']],
  ['navigateActive', ['example.com']],
  ['navigateTab', ['t1', 'example.com']],
  ['goBack', []],
  ['goForward', []],
  ['reloadActive', []],
  ['printActive', []],
  ['viewSourceActive', []],
  ['saveActive', []],
  ['downloadUrlActive', ['https://f.test/x.zip']],
  ['copyActive', []],
  ['cutActive', []],
  ['pasteActive', []],
  ['selectAllActive', []],
  ['copyImageAtActive', [10, 20]],
  ['inspectActiveAt', [10, 20]],
  ['goHome', []],
  ['getContentBounds', []],
  ['setContentBounds', [{ x: 0, y: 0, width: 1, height: 1 }]],
  ['setContentVisible', [true]],
  ['captureActive', []],
  ['reopenClosedTab', ['closed-1']],
  ['discardTab', ['t1']],
];

describe('forwards to the focused window with the same name + args', () => {
  it.each(FORWARDS)('%s', (name, args) => {
    (TabManager as unknown as Record<string, (...a: unknown[]) => unknown>)[name]!(...args);
    expect(state.focused![name]).toHaveBeenCalledWith(...args);
  });
});

describe('rehostTab — scans every window, not just the focused one', () => {
  it('delegates to the window that actually owns the tab', () => {
    const other = stubWindow();
    other.hasTab!.mockReturnValue(true);
    other.rehostTab!.mockReturnValue(true);
    state.all = [state.focused!, other];
    state.focused!.hasTab!.mockReturnValue(false);

    const session = { __s: true } as never;
    expect(TabManager.rehostTab('t9', session)).toBe(true);
    expect(other.rehostTab).toHaveBeenCalledWith('t9', session);
    expect(state.focused!.rehostTab).not.toHaveBeenCalled();
  });

  it('returns false when no window owns the tab', () => {
    state.all = [state.focused!];
    state.focused!.hasTab!.mockReturnValue(false);
    expect(TabManager.rehostTab('gone', { __s: true } as never)).toBe(false);
  });
});

describe('cross-window aggregate reads', () => {
  it('bindingStates flattens every window’s tabs with their group', () => {
    const w1 = stubWindow();
    const w2 = stubWindow();
    w1.getState!.mockReturnValue({
      tabs: [{ id: 'a', groupId: 'g1' }],
      groups: [],
    });
    w2.getState!.mockReturnValue({
      tabs: [
        { id: 'b', groupId: null },
        { id: 'c', groupId: 'g2' },
      ],
      groups: [],
    });
    state.all = [w1, w2];

    expect(TabManager.bindingStates()).toEqual([
      { tabId: 'a', groupId: 'g1' },
      { tabId: 'b', groupId: null },
      { tabId: 'c', groupId: 'g2' },
    ]);
  });

  it('allGroups flattens every window’s groups with their settings bag', () => {
    const w1 = stubWindow();
    w1.getState!.mockReturnValue({
      tabs: [],
      groups: [{ id: 'g1', settings: { agentEnabled: true } }],
    });
    state.all = [w1];

    expect(TabManager.allGroups()).toEqual([{ id: 'g1', settings: { agentEnabled: true } }]);
  });

  it('webContentsForTab tries the focused window first, then every other live window', () => {
    const other = stubWindow();
    other.window = { isDestroyed: () => false } as never;
    const wc = { __wc: true } as never;
    other.webContentsForTab!.mockReturnValue(wc);
    state.focused!.webContentsForTab!.mockReturnValue(null);
    state.focused!.window = { isDestroyed: () => false } as never;
    state.all = [state.focused!, other];

    expect(TabManager.webContentsForTab('t9')).toBe(wc);
  });

  it('webContentsForTab returns the focused window’s answer without scanning others', () => {
    const wc = { __focused: true } as never;
    state.focused!.webContentsForTab!.mockReturnValue(wc);
    const other = stubWindow();
    state.all = [state.focused!, other];

    expect(TabManager.webContentsForTab('t1')).toBe(wc);
    expect(other.webContentsForTab).not.toHaveBeenCalled();
  });

  it('webContentsForTab returns null when no window owns the tab', () => {
    state.focused!.webContentsForTab!.mockReturnValue(null);
    state.focused!.window = { isDestroyed: () => false } as never;
    state.all = [state.focused!];

    expect(TabManager.webContentsForTab('gone')).toBeNull();
  });
});

describe('the name-mismatch delegators', () => {
  it('toggleDevTools calls openDevToolsActive and passes the verdict through', () => {
    state.focused!.openDevToolsActive!.mockReturnValue({ allowed: true });
    expect(TabManager.toggleDevTools()).toEqual({ allowed: true });
  });

  it('canDiscardTab calls canDiscard and passes the boolean through', () => {
    state.focused!.canDiscard!.mockReturnValue(true);
    expect(TabManager.canDiscardTab('t1')).toBe(true);
    expect(state.focused!.canDiscard).toHaveBeenCalledWith('t1');
  });
});

describe('no focused window → safe defaults, no throw', () => {
  beforeEach(() => {
    state.focused = undefined;
  });

  it('void methods are silent no-ops', () => {
    expect(() => TabManager.activate('t1')).not.toThrow();
    expect(() => TabManager.goBack()).not.toThrow();
  });

  it('value methods return their default', () => {
    expect(TabManager.activeTabId()).toBeNull();
    expect(TabManager.viewlessActiveTabId()).toBeNull();
    expect(TabManager.createGroup()).toBe('');
    expect(TabManager.hasGroup('g1')).toBe(false);
    expect(TabManager.getState()).toBe(EMPTY_STATE);
    expect(TabManager.activeWebContents()).toBeNull();
    expect(TabManager.webContentsForTab('t1')).toBeNull();
    expect(TabManager.rehostTab('t1', { __s: true } as never)).toBe(false);
    expect(TabManager.navigateTab('t1', 'x')).toBe(false);
    expect(TabManager.canDiscardTab('t1')).toBe(false);
    expect(TabManager.getContentBounds()).toEqual({ x: 0, y: 0, width: 0, height: 0 });
    expect(TabManager.toggleDevTools()).toEqual({ allowed: false, reason: 'no_page' });
    expect(TabManager.inspectActiveAt(1, 2)).toEqual({ allowed: false, reason: 'no_page' });
    void expect(TabManager.captureActive()).resolves.toBeNull();
    expect(TabManager.bindingStates()).toEqual([]);
    expect(TabManager.allGroups()).toEqual([]);
  });
});
