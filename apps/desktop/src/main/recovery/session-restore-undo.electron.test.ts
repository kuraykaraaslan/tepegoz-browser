import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Undo for session restore, against the two ways it could hurt: closing tabs it does not own, and
 * closing so many that the app quits under the user. The second is not hypothetical — closing a
 * window's last tab closes the window, and closing the last window quits on non-macOS, so an undo that
 * simply closed every restored tab would end the session it was supposed to rescue.
 */

interface FakeWindow {
  id: number;
  destroyed: boolean;
  isDestroyed(): boolean;
}

const windows = new Map<number, FakeWindow>();
const managers = new Map<number, FakeManager>();
/** Every close/create in the order it happened, across all windows — the ordering is the invariant. */
let log: string[] = [];

class FakeManager {
  constructor(private readonly windowId: number) {}
  createTab(): string {
    log.push(`create:${String(this.windowId)}`);
    return 'new';
  }
  closeTab(id: string): void {
    log.push(`close:${String(this.windowId)}:${id}`);
  }
}

function makeWindow(id: number): FakeWindow {
  const win: FakeWindow = { id, destroyed: false, isDestroyed: () => win.destroyed };
  windows.set(id, win);
  managers.set(id, new FakeManager(id));
  return win;
}

vi.mock('electron', () => ({
  BrowserWindow: { fromId: (id: number) => windows.get(id) ?? null },
}));
vi.mock('../tabs', () => ({
  default: {
    forWindow: (win: FakeWindow) => managers.get(win.id),
  },
}));

const { clearRestoreUndo, recordRestoredTabs, restoredTabCount, undoSessionRestore } = await import(
  './session-restore-undo'
);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-28T10:00:00Z'));
  windows.clear();
  managers.clear();
  log = [];
  clearRestoreUndo();
});
afterEach(() => vi.useRealTimers());

describe('session-restore undo', () => {
  it('counts what the restore opened, across every window', () => {
    recordRestoredTabs(makeWindow(1) as never, ['a', 'b']);
    recordRestoredTabs(makeWindow(2) as never, ['c']);
    expect(restoredTabCount()).toBe(3);
  });

  it('opens a blank tab in the first window BEFORE closing anything, so the app cannot quit', () => {
    recordRestoredTabs(makeWindow(1) as never, ['a', 'b']);
    recordRestoredTabs(makeWindow(2) as never, ['c']);
    undoSessionRestore();
    expect(log).toEqual(['create:1', 'close:1:a', 'close:1:b', 'close:2:c']);
  });

  it('closes only the tabs the restore created — never the ones the user opened after it', () => {
    recordRestoredTabs(makeWindow(1) as never, ['restored-1', 'restored-2']);
    undoSessionRestore();
    expect(log.filter((e) => e.startsWith('close:'))).toEqual([
      'close:1:restored-1',
      'close:1:restored-2',
    ]);
  });

  it('is one-shot: a double-clicked toast cannot close a second round of tabs', () => {
    recordRestoredTabs(makeWindow(1) as never, ['a']);
    undoSessionRestore();
    log = [];
    undoSessionRestore();
    expect(log).toEqual([]);
    expect(restoredTabCount()).toBe(0);
  });

  it('expires, so a stale action cannot reach in and close tabs the user is working in', () => {
    recordRestoredTabs(makeWindow(1) as never, ['a']);
    vi.setSystemTime(new Date('2026-08-28T10:05:00Z')); // five minutes later
    undoSessionRestore();
    expect(log).toEqual([]);
  });

  it('skips a window the user already closed and keeps the next live one alive', () => {
    const gone = makeWindow(1);
    gone.destroyed = true;
    recordRestoredTabs(gone as never, ['a']);
    recordRestoredTabs(makeWindow(2) as never, ['b']);
    undoSessionRestore();
    expect(log).toEqual(['create:2', 'close:2:b']);
  });

  it('does nothing at all when there was no restore to undo', () => {
    undoSessionRestore();
    expect(log).toEqual([]);
  });
});
