import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The `TabManager` registry: window↔`WindowTabs` map, sender/focused-window resolution. The routing
 * this pins is load-bearing — `forSenderWindow` walking a menu-popup child window up to its owning
 * browser window (then falling back to focused) is what every tab IPC handler relies on to land an
 * action in the RIGHT window, and `focused()`'s last-focused-then-any fallback is what "the current
 * browser" means for agent / menu / host code.
 */

type FakeWin = {
  id: string;
  destroyed: boolean;
  parent: FakeWin | null;
  onFocus: (() => void) | null;
  isDestroyed: () => boolean;
  getParentWindow: () => FakeWin | null;
  on: (e: string, cb: () => void) => void;
};
function win(id: string, parent: FakeWin | null = null): FakeWin {
  const w: FakeWin = {
    id,
    destroyed: false,
    parent,
    onFocus: null,
    isDestroyed: () => w.destroyed,
    getParentWindow: () => w.parent,
    on: (e, cb) => {
      if (e === 'focus') w.onFocus = cb;
    },
  };
  return w;
}

// The `WindowTabs` the registry stores — a stub with just the fields the base reads.
const madeFor: FakeWin[] = [];
vi.mock('./tabs-window', () => ({
  WindowTabs: class {
    disposed = false;
    constructor(
      public window: FakeWin,
      public isPrivate: boolean,
    ) {
      madeFor.push(window);
    }
    dispose() {
      this.disposed = true;
    }
  },
}));

vi.mock('electron', () => ({
  BrowserWindow: { fromWebContents: (wc: { win?: FakeWin }) => wc.win ?? null },
}));
vi.mock('@tepegoz/libs', () => ({ Logger: { warn: vi.fn(), info: vi.fn() } }));
vi.mock('@tepegoz/persistence', () => ({
  EventJournal: { append: vi.fn() },
  SessionStore: { load: () => null, save: vi.fn() },
}));
vi.mock('./db/database.electron', () => ({ getDb: () => null }));

const { TabManagerBase } = await import('./tabs-manager-base');

beforeEach(() => {
  madeFor.length = 0;
  // Clear the module-level registry by unregistering everything it might hold from a prior test.
  for (const wt of TabManagerBase.all()) TabManagerBase.unregister(wt.window);
});

describe('registry', () => {
  it('register is idempotent per window and returns the same WindowTabs', () => {
    const w = win('a');
    const a1 = TabManagerBase.register(w as unknown as never);
    const a2 = TabManagerBase.register(w as unknown as never);
    expect(a1).toBe(a2);
    expect(madeFor).toHaveLength(1);
  });

  it('unregister disposes the WindowTabs and drops it from the map', () => {
    const w = win('a');
    const wt = TabManagerBase.register(w as unknown as never) as unknown as { disposed: boolean };
    TabManagerBase.unregister(w as unknown as never);
    expect(wt.disposed).toBe(true);
    expect(TabManagerBase.all()).toHaveLength(0);
  });

  it('carries the private flag onto the WindowTabs', () => {
    const wt = TabManagerBase.register(win('p') as unknown as never, { isPrivate: true });
    expect((wt as unknown as { isPrivate: boolean }).isPrivate).toBe(true);
    expect(TabManagerBase.hasPrivateWindow()).toBe(true);
  });
});

describe('forSenderWindow', () => {
  it('walks a popup child window up to its owning browser window', () => {
    const owner = win('owner');
    const popup = win('popup', owner);
    const wt = TabManagerBase.register(owner as unknown as never);
    expect(TabManagerBase.forSenderWindow(popup as unknown as never)).toBe(wt);
  });

  it('falls back to the focused window for an unattached sender', () => {
    const wt = TabManagerBase.register(win('main') as unknown as never);
    const stray = win('stray'); // never registered, no parent
    expect(TabManagerBase.forSenderWindow(stray as unknown as never)).toBe(wt);
  });
});

describe('focused', () => {
  it('prefers the last-focused window, then any live one', () => {
    const a = win('a');
    const b = win('b');
    const wtA = TabManagerBase.register(a as unknown as never);
    const wtB = TabManagerBase.register(b as unknown as never);
    // register(b) set b as last-focused.
    expect(TabManagerBase.focused()).toBe(wtB);
    // a gains focus.
    a.onFocus?.();
    expect(TabManagerBase.focused()).toBe(wtA);
    // a is destroyed → fall through to the other live window.
    a.destroyed = true;
    expect(TabManagerBase.focused()).toBe(wtB);
  });

  it('is undefined when no window is registered', () => {
    expect(TabManagerBase.focused()).toBeUndefined();
    expect(TabManagerBase.focusedWindow()).toBeNull();
  });
});
