import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserWindow } from 'electron';

/**
 * What the user is TOLD about a recovery. The guarantees pinned here are the ones the docblocks make:
 *   - an ORDINARY launch announces nothing (every notice has a guard that returns early);
 *   - safe-mode and profile-reset go to the notification CENTER as well as a toast, because they are
 *     the notices a user re-reads to understand why the browser looks different;
 *   - a session-restore notice is toast-ONLY and carries the undo action;
 *   - the notice is deferred until the chrome renderer can actually receive it — immediately when the
 *     main frame has finished loading, otherwise after `did-finish-load` — and never fires into a
 *     window that was destroyed in the meantime.
 */

const push = vi.hoisted(() => vi.fn());
vi.mock('../notifications/notification-host', () => ({ default: { push } }));

const state = vi.hoisted((): {
  safeMode: boolean;
  safeModeReason: 'crash' | 'flag';
  profileKept: string | null;
  restoredTabs: number;
} => ({
  safeMode: false,
  safeModeReason: 'crash',
  profileKept: null,
  restoredTabs: 0,
}));
vi.mock('./safe-mode', () => ({
  isSafeMode: () => state.safeMode,
  safeModeReason: () => state.safeModeReason,
}));
vi.mock('./session-restore-undo', () => ({ restoredTabCount: () => state.restoredTabs }));
vi.mock('../db/database.electron', () => ({ profileWasReset: () => state.profileKept }));
vi.mock('../lib/i18n-main', () => ({
  mainLocale: () => 'en',
  mainStrings: () => ({
    browser: {
      safeModeTitle: 'Safe mode',
      safeModeBodyFlag: 'Started with --safe-mode.',
      safeModeBodyCrash: 'Started in safe mode after a crash.',
      profileResetTitle: 'Profile reset',
      profileResetBody: 'Your old data was kept in {file}.',
      sessionRestoredTitle: 'Tabs restored',
      sessionRestoredBodyOne: 'Restored {count} tab.',
      sessionRestoredBodyOther: 'Restored {count} tabs.',
      sessionRestoredUndo: 'Undo',
    },
  }),
}));

const { notifySafeMode, notifyProfileReset, notifySessionRestored } = await import(
  './recovery-notices'
);

const firstNotice = (): Record<string, unknown> => {
  const c = push.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
  if (c === undefined) throw new Error('expected a notification to have been pushed');
  return c;
};

type FakeWin = {
  destroyed: boolean;
  loading: boolean;
  finishLoad: (() => void) | null;
  win: BrowserWindow;
};

function fakeWindow(opts: { loading?: boolean; destroyed?: boolean } = {}): FakeWin {
  const f: FakeWin = {
    destroyed: opts.destroyed ?? false,
    loading: opts.loading ?? false,
    finishLoad: null,
    win: null as unknown as BrowserWindow,
  };
  f.win = {
    isDestroyed: () => f.destroyed,
    webContents: {
      isLoadingMainFrame: () => f.loading,
      once: (event: string, cb: () => void) => {
        if (event === 'did-finish-load') f.finishLoad = cb;
      },
    },
  } as unknown as BrowserWindow;
  return f;
}

beforeEach(() => {
  vi.useFakeTimers();
  push.mockClear();
  state.safeMode = false;
  state.safeModeReason = 'crash';
  state.profileKept = null;
  state.restoredTabs = 0;
});
afterEach(() => {
  vi.useRealTimers();
});

describe('notifySafeMode', () => {
  it('says nothing on an ordinary (non-safe-mode) launch', () => {
    const f = fakeWindow();
    notifySafeMode(f.win);
    vi.runAllTimers();
    expect(push).not.toHaveBeenCalled();
  });

  it('pushes a warning to center + toast, with the crash body after a crash', () => {
    state.safeMode = true;
    state.safeModeReason = 'crash';
    const f = fakeWindow();
    notifySafeMode(f.win);
    vi.runAllTimers();
    expect(push).toHaveBeenCalledTimes(1);
    expect(firstNotice()).toMatchObject({
      kind: 'warning',
      source: 'system',
      channels: ['center', 'toast'],
      dedupeKey: 'recovery:safe-mode',
      body: 'Started in safe mode after a crash.',
    });
  });

  it('uses the flag body when safe mode was requested with a switch', () => {
    state.safeMode = true;
    state.safeModeReason = 'flag';
    const f = fakeWindow();
    notifySafeMode(f.win);
    vi.runAllTimers();
    expect(firstNotice().body).toBe('Started with --safe-mode.');
  });

  it('waits for did-finish-load when the main frame is still loading', () => {
    state.safeMode = true;
    const f = fakeWindow({ loading: true });
    notifySafeMode(f.win);
    vi.runAllTimers();
    expect(push).not.toHaveBeenCalled(); // still loading — nothing scheduled yet

    f.finishLoad?.();
    vi.runAllTimers();
    expect(push).toHaveBeenCalledTimes(1);
  });

  it('does not fire into a window destroyed during the grace delay', () => {
    state.safeMode = true;
    const f = fakeWindow();
    notifySafeMode(f.win);
    f.destroyed = true;
    vi.runAllTimers();
    expect(push).not.toHaveBeenCalled();
  });
});

describe('notifyProfileReset', () => {
  it('says nothing when the profile was not reset', () => {
    notifyProfileReset(fakeWindow().win);
    vi.runAllTimers();
    expect(push).not.toHaveBeenCalled();
  });

  it('names the kept file in the body and goes to center + toast', () => {
    state.profileKept = 'profile-corrupt-2026.db';
    notifyProfileReset(fakeWindow().win);
    vi.runAllTimers();
    expect(push).toHaveBeenCalledTimes(1);
    expect(firstNotice()).toMatchObject({
      channels: ['center', 'toast'],
      dedupeKey: 'recovery:profile-reset',
      body: 'Your old data was kept in profile-corrupt-2026.db.',
    });
  });
});

describe('notifySessionRestored', () => {
  it('says nothing when no tabs were restored', () => {
    notifySessionRestored(fakeWindow().win);
    vi.runAllTimers();
    expect(push).not.toHaveBeenCalled();
  });

  it('is toast-only, carries the undo action, and pluralises the count', () => {
    state.restoredTabs = 3;
    notifySessionRestored(fakeWindow().win);
    vi.runAllTimers();
    const notice = firstNotice();
    expect(notice.channels).toEqual(['toast']);
    expect(notice.actions).toEqual([
      { id: 'undo-restore', label: 'Undo', type: 'undo_session_restore' },
    ]);
    expect(notice.body).toBe('Restored 3 tabs.');
  });

  it('uses the singular body for exactly one tab', () => {
    state.restoredTabs = 1;
    notifySessionRestored(fakeWindow().win);
    vi.runAllTimers();
    expect(firstNotice().body).toBe('Restored 1 tab.');
  });
});
