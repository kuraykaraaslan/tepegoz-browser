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
    applyUserAgent = vi.fn();
    snap: { tabs: unknown[]; groups: unknown[]; activeIndex: number } = {
      tabs: [{ url: 'https://x' }],
      groups: [],
      activeIndex: 0,
    };
    constructor(
      public window: FakeWin,
      public isPrivate: boolean,
    ) {
      madeFor.push(window);
    }
    dispose() {
      this.disposed = true;
    }
    snapshot() {
      return this.snap;
    }
  },
}));

vi.mock('electron', () => ({
  BrowserWindow: { fromWebContents: (wc: { win?: FakeWin }) => wc.win ?? null },
}));
const logger = vi.hoisted(() => ({ warn: vi.fn(), info: vi.fn() }));
vi.mock('@tepegoz/libs', () => ({ Logger: logger }));
const persistence = vi.hoisted(() => ({
  EventJournal: { append: vi.fn() },
  SessionStore: { load: () => null, save: vi.fn() },
}));
vi.mock('@tepegoz/persistence', () => persistence);
const getDb = vi.hoisted(() => vi.fn<() => unknown>(() => null));
vi.mock('./db/database.electron', () => ({ getDb }));
const isSafeMode = vi.hoisted(() => vi.fn(() => false));
vi.mock('./recovery/safe-mode', () => ({ isSafeMode }));

const { TabManagerBase } = await import('./tabs-manager-base');

beforeEach(() => {
  madeFor.length = 0;
  vi.clearAllMocks();
  getDb.mockReturnValue(null);
  isSafeMode.mockReturnValue(false);
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

describe('sender resolution + registry teardown', () => {
  it('forSender resolves via BrowserWindow.fromWebContents', () => {
    const w = win('s');
    const wt = TabManagerBase.register(w as unknown as never);
    expect(TabManagerBase.forSender({ win: w } as unknown as never)).toBe(wt);
    expect(TabManagerBase.forSender({} as unknown as never)).toBeUndefined();
  });

  it('unregister clears lastFocusedWin when it was the closing window', () => {
    const only = win('only');
    TabManagerBase.register(only as unknown as never); // becomes last-focused
    TabManagerBase.unregister(only as unknown as never);
    expect(TabManagerBase.focused()).toBeUndefined(); // lastFocusedWin was nulled, registry empty
  });
});

describe('observer subscriptions', () => {
  it('onNavigation / onContextMenu / onInvoluntaryGroupExit add then remove via the returned unsub', async () => {
    const shared = await import('./tabs-shared');
    const navFn = vi.fn();
    const ctxFn = vi.fn();
    const exitFn = vi.fn();

    const offNav = TabManagerBase.onNavigation(navFn);
    const offCtx = TabManagerBase.onContextMenu(ctxFn);
    const offExit = TabManagerBase.onInvoluntaryGroupExit(exitFn);
    expect(shared.navigationObservers.has(navFn)).toBe(true);
    expect(shared.contextMenuObservers.has(ctxFn)).toBe(true);
    expect(shared.involuntaryGroupExitObservers.has(exitFn)).toBe(true);

    offNav();
    offCtx();
    offExit();
    expect(shared.navigationObservers.has(navFn)).toBe(false);
    expect(shared.contextMenuObservers.has(ctxFn)).toBe(false);
    expect(shared.involuntaryGroupExitObservers.has(exitFn)).toBe(false);
  });

  it('applyUserAgent fans out to every registered window', () => {
    const wtA = TabManagerBase.register(win('a') as unknown as never) as unknown as {
      applyUserAgent: ReturnType<typeof vi.fn>;
    };
    const wtB = TabManagerBase.register(win('b') as unknown as never) as unknown as {
      applyUserAgent: ReturnType<typeof vi.fn>;
    };
    TabManagerBase.applyUserAgent('UA/1');
    expect(wtA.applyUserAgent).toHaveBeenCalledWith('UA/1');
    expect(wtB.applyUserAgent).toHaveBeenCalledWith('UA/1');
  });
});

describe('persistNow', () => {
  type Stub = {
    isPrivate: boolean;
    snap: { tabs: unknown[]; groups: unknown[]; activeIndex: number };
  };
  const register = (id: string, snap: Stub['snap'], isPrivate = false): Stub => {
    const wt = TabManagerBase.register(win(id) as unknown as never, {
      isPrivate,
    }) as unknown as Stub;
    wt.snap = snap;
    return wt;
  };

  it('does nothing without a DB connector', () => {
    getDb.mockReturnValue(null);
    register('a', { tabs: [{ url: 'https://a' }], groups: [], activeIndex: 0 });
    TabManagerBase.persistNow();
    expect(persistence.SessionStore.save).not.toHaveBeenCalled();
  });

  it('does nothing in safe mode', () => {
    getDb.mockReturnValue({ __db: true });
    isSafeMode.mockReturnValue(true);
    register('a', { tabs: [{ url: 'https://a' }], groups: [], activeIndex: 0 });
    TabManagerBase.persistNow();
    expect(persistence.SessionStore.save).not.toHaveBeenCalled();
  });

  it('saves a versioned snapshot of non-private, non-empty windows and journals it', () => {
    getDb.mockReturnValue({ __db: true });
    register('pub', { tabs: [{ url: 'https://pub-1' }], groups: [], activeIndex: 0 });
    register('priv', { tabs: [{ url: 'https://secret' }], groups: [], activeIndex: 0 }, true);
    register('empty', { tabs: [], groups: [], activeIndex: -1 });

    TabManagerBase.persistNow();

    expect(persistence.SessionStore.save).toHaveBeenCalledTimes(1);
    const [, snapshot] = persistence.SessionStore.save.mock.calls[0]! as [
      unknown,
      { version: number; windows: { tabs: unknown[] }[] },
    ];
    expect(snapshot.version).toBe(3);
    expect(snapshot.windows).toHaveLength(1); // private + empty dropped
    expect(persistence.EventJournal.append).toHaveBeenCalledWith(
      { __db: true },
      expect.objectContaining({ type: 'SessionSnapshotWritten' }),
    );
  });

  it('skips a re-persist of an identical snapshot', () => {
    getDb.mockReturnValue({ __db: true });
    register('pub', { tabs: [{ url: 'https://dedupe-me' }], groups: [], activeIndex: 0 });
    TabManagerBase.persistNow();
    TabManagerBase.persistNow();
    expect(persistence.SessionStore.save).toHaveBeenCalledTimes(1);
  });

  it('logs and bails when SessionStore.save throws', () => {
    getDb.mockReturnValue({ __db: true });
    persistence.SessionStore.save.mockImplementationOnce(() => {
      throw new Error('disk full');
    });
    register('pub', { tabs: [{ url: 'https://save-throws' }], groups: [], activeIndex: 0 });
    TabManagerBase.persistNow();
    expect(logger.warn).toHaveBeenCalledWith('Failed to persist session', expect.any(Object));
    expect(persistence.EventJournal.append).not.toHaveBeenCalled();
  });

  it('logs but does not throw when the journal append fails', () => {
    getDb.mockReturnValue({ __db: true });
    persistence.EventJournal.append.mockImplementationOnce(() => {
      throw new Error('journal locked');
    });
    register('pub', { tabs: [{ url: 'https://journal-throws' }], groups: [], activeIndex: 0 });
    expect(() => {
      TabManagerBase.persistNow();
    }).not.toThrow();
    expect(logger.warn).toHaveBeenCalledWith(
      'Failed to append session snapshot journal event',
      expect.any(Object),
    );
  });
});
