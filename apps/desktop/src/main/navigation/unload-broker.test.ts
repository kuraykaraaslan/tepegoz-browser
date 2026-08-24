import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const showMessageBoxSync = vi.fn();
const fromWebContents = vi.fn();

vi.mock('electron', () => ({
  dialog: { showMessageBoxSync: (...a: unknown[]) => showMessageBoxSync(...a) as unknown },
  BrowserWindow: { fromWebContents: (...a: unknown[]) => fromWebContents(...a) as unknown },
}));
vi.mock('@tepegoz/libs', () => ({ Logger: { warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
vi.mock('../lib/i18n-main', () => ({
  mainStrings: () => ({
    browser: {
      unloadTitle: 'Leave this site?',
      unloadDetail: 'Changes you have made may not be saved.',
      unloadLeave: 'Leave',
      unloadStay: 'Stay',
    },
  }),
}));

const { installUnloadPrompt, suppressUnloadPrompt, askBeforeClose, unloadStateOf } =
  await import('./unload-broker');

const LEAVE = 0;
const STAY = 1;

/**
 * A `will-prevent-unload` event the way Electron delivers it: `preventDefault()` here means "ignore the
 * page and let the unload happen", the opposite of the DOM sense, and `defaultPrevented` is how a later
 * listener reads what an earlier one decided.
 */
function unloadEvent(): { preventDefault: () => void; defaultPrevented: boolean } {
  const e = {
    defaultPrevented: false,
    preventDefault: () => {
      e.defaultPrevented = true;
    },
  };
  return e;
}

class FakeContents extends EventEmitter {
  destroyed = false;
  closeCalls: unknown[] = [];
  isDestroyed(): boolean {
    return this.destroyed;
  }
  close(opts?: unknown): void {
    this.closeCalls.push(opts);
  }
  /** What Electron does when the page had nothing to say, or the unload was allowed. */
  destroy(): void {
    this.destroyed = true;
    this.emit('destroyed');
  }
  /** Fire the event the way Chromium does, and answer whether the unload was allowed through. */
  raiseUnload(): boolean {
    const e = unloadEvent();
    this.emit('will-prevent-unload', e);
    return e.defaultPrevented;
  }
}

function wired(): FakeContents {
  const wc = new FakeContents();
  installUnloadPrompt(wc as unknown as Electron.WebContents);
  return wc;
}

beforeEach(() => {
  vi.clearAllMocks();
  fromWebContents.mockReturnValue(null);
  showMessageBoxSync.mockReturnValue(STAY);
});

describe('installUnloadPrompt', () => {
  it('keeps the page when the user picks "stay"', () => {
    const wc = wired();
    expect(wc.raiseUnload()).toBe(false);
    expect(showMessageBoxSync).toHaveBeenCalledOnce();
  });

  it('lets the unload through when the user picks "leave"', () => {
    showMessageBoxSync.mockReturnValue(LEAVE);
    expect(wired().raiseUnload()).toBe(true);
  });

  it('makes "stay" both the default and the cancel, so Enter and Escape are the SAFE answer', () => {
    wired().raiseUnload();
    const [options] = showMessageBoxSync.mock.calls[0] as [{ defaultId: number; cancelId: number }];
    expect(options.defaultId).toBe(STAY);
    expect(options.cancelId).toBe(STAY);
  });

  it('parents the box on the owning window when there is one', () => {
    const win = { id: 7 };
    fromWebContents.mockReturnValue(win);
    wired().raiseUnload();
    const [parent] = showMessageBoxSync.mock.calls[0] as [unknown];
    expect(parent).toBe(win);
  });

  it('keeps the page — never loses it — when the box cannot be shown at all', () => {
    showMessageBoxSync.mockImplementation(() => {
      throw new Error('no display');
    });
    // The user's typing survives a navigation that did not happen. It does not survive one that did.
    expect(wired().raiseUnload()).toBe(false);
  });

  it('installs once, so a tab moved between windows does not stack a second prompt', () => {
    const wc = wired();
    installUnloadPrompt(wc as unknown as Electron.WebContents);
    installUnloadPrompt(wc as unknown as Electron.WebContents);
    wc.raiseUnload();
    expect(showMessageBoxSync).toHaveBeenCalledOnce();
  });

  it('does not prompt on a tab an agent is driving', () => {
    const wc = wired();
    suppressUnloadPrompt(wc as unknown as Electron.WebContents);
    // Allowed silently — and it must be ALLOWED, not merely unprompted: leaving the event untouched
    // is a veto in Electron's semantics, so a broker that only skipped the dialog would strand the run
    // on a page it could not leave.
    expect(wc.raiseUnload()).toBe(true);
    expect(showMessageBoxSync).not.toHaveBeenCalled();
    expect(unloadStateOf(wc as unknown as Electron.WebContents).agentDriven).toBe(true);
  });

  it('CANNOT be used to trap the user: a re-prompt right after "leave" is not shown', () => {
    showMessageBoxSync.mockReturnValue(LEAVE);
    const wc = wired();
    expect(wc.raiseUnload()).toBe(true);
    // A page that fires again during the departure — a redirect, a re-entrant handler — gets silence,
    // not a second bite at keeping the user.
    expect(wc.raiseUnload()).toBe(true);
    expect(showMessageBoxSync).toHaveBeenCalledOnce();
  });
});

describe('askBeforeClose', () => {
  it('fires beforeunload on close — which a bare webContents.close() does NOT', () => {
    const wc = wired();
    expect(askBeforeClose(wc as unknown as Electron.WebContents, vi.fn())).toBe(true);
    expect(wc.closeCalls).toEqual([{ waitForBeforeUnload: true }]);
  });

  it('closes for real once the page has nothing to say', () => {
    const wc = wired();
    const retry = vi.fn();
    expect(askBeforeClose(wc as unknown as Electron.WebContents, retry)).toBe(true);
    expect(retry).not.toHaveBeenCalled();
    wc.destroy(); // no beforeunload handler → Electron destroys it straight away
    expect(retry).toHaveBeenCalledOnce();
    // The retried close must not ask a second time.
    expect(askBeforeClose(wc as unknown as Electron.WebContents, retry)).toBe(false);
  });

  it('closes after the user picks "leave"', () => {
    showMessageBoxSync.mockReturnValue(LEAVE);
    const wc = wired();
    const retry = vi.fn();
    askBeforeClose(wc as unknown as Electron.WebContents, retry);
    expect(wc.raiseUnload()).toBe(true);
    wc.destroy();
    expect(retry).toHaveBeenCalledOnce();
  });

  it('KEEPS the tab when the user picks "stay"', () => {
    const wc = wired();
    const retry = vi.fn();
    askBeforeClose(wc as unknown as Electron.WebContents, retry);
    expect(wc.raiseUnload()).toBe(false);
    expect(retry).not.toHaveBeenCalled();
    expect(wc.destroyed).toBe(false);
  });

  it('asks again on the NEXT close after a "stay", and retries exactly once', () => {
    const wc = wired();
    const retry = vi.fn();
    askBeforeClose(wc as unknown as Electron.WebContents, retry);
    wc.raiseUnload(); // stay
    expect(askBeforeClose(wc as unknown as Electron.WebContents, retry)).toBe(true);
    expect(wc.closeCalls).toHaveLength(2);
    wc.destroy();
    // If the first attempt's `destroyed` listener had been left armed, this would be 2 — and the tab
    // would be torn down twice.
    expect(retry).toHaveBeenCalledOnce();
  });

  it('swallows a second Ctrl+W while the question is still up', () => {
    const wc = wired();
    askBeforeClose(wc as unknown as Electron.WebContents, vi.fn());
    expect(askBeforeClose(wc as unknown as Electron.WebContents, vi.fn())).toBe(true);
    expect(wc.closeCalls).toHaveLength(1);
  });

  it('lets an already-destroyed contents through rather than asking a corpse', () => {
    const wc = wired();
    wc.destroyed = true;
    expect(askBeforeClose(wc as unknown as Electron.WebContents, vi.fn())).toBe(false);
    expect(wc.closeCalls).toHaveLength(0);
  });
});
