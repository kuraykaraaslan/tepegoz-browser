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
  ['activate', ['t1']],
  ['closeTab', ['t1']],
  ['reloadTab', ['t1']],
  ['moveTab', ['t1', 3, 'g1']],
  ['createGroup', [['t1', 't2']]],
  ['assignToGroup', ['t1', 'g1']],
  ['removeFromGroup', ['t1']],
  ['renameGroup', ['g1', 'Work']],
  ['recolorGroup', ['g1', 'blue']],
  ['setGroupCollapsed', ['g1', true]],
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
  ['copyActive', []],
  ['pasteActive', []],
  ['copyImageAtActive', [10, 20]],
  ['inspectActiveAt', [10, 20]],
  ['goHome', []],
  ['setContentBounds', [{ x: 0, y: 0, width: 1, height: 1 }]],
  ['setContentVisible', [true]],
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
    expect(TabManager.createGroup()).toBe('');
    expect(TabManager.hasGroup('g1')).toBe(false);
    expect(TabManager.getState()).toBe(EMPTY_STATE);
    expect(TabManager.activeWebContents()).toBeNull();
    expect(TabManager.rehostTab('t1', { __s: true } as never)).toBe(false);
  });
});
