import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * "Confirm before quitting". Pinned here:
 *   - the decision rule: only when enabled, not already a decided quit, not eval mode, and 2+ tabs;
 *   - `requestQuit` quits straight away when nothing needs asking — marking the quit REAL before
 *     `app.quit()` (reversed, close-to-tray swallows the quit and the app never exits);
 *   - when asking, nothing happens until "Quit"; Esc / dismissal / a dialog failure keep the app running;
 *   - one prompt at a time;
 *   - the `before-quit` backstop vetoes an unowned quit, asks, and re-issues it once confirmed.
 */
const calls = vi.hoisted(() => ({ order: [] as string[] }));
const el = vi.hoisted(() => ({
  quit: vi.fn(() => {
    calls.order.push('app.quit');
  }),
  showMessageBox: vi.fn(),
}));
vi.mock('electron', () => ({
  app: { quit: el.quit },
  dialog: { showMessageBox: el.showMessageBox },
}));

const prefs = vi.hoisted(() => ({ value: { confirmQuit: true } }));
vi.mock('@tepegoz/preferences', () => ({ default: { getAll: () => prefs.value } }));

vi.mock('./lib/i18n-main', () => ({
  mainStrings: () => ({
    browser: {
      quitTitle: 'Quit?',
      quitDetail: 'closes {count} tabs',
      quitConfirm: 'Quit',
      quitCancel: 'Keep running',
    },
  }),
}));

const tabs = vi.hoisted(() => ({
  counts: [] as number[],
  focused: null as null | { isDestroyed: () => boolean },
}));
vi.mock('./tabs', () => ({
  default: {
    all: () => tabs.counts.map((n) => ({ visibleTabCount: () => n })),
    focusedWindow: () => tabs.focused,
  },
}));

const state = vi.hoisted(() => ({ quitting: false }));
vi.mock('./quit-state', () => ({
  isQuitting: () => state.quitting,
  markQuitting: () => {
    calls.order.push('markQuitting');
    state.quitting = true;
  },
}));

const { shouldConfirmQuit, requestQuit, confirmBeforeQuit } = await import('./quit-confirm');

const flush = () => new Promise((r) => setTimeout(r, 0));
const answer = (response: number) => el.showMessageBox.mockResolvedValueOnce({ response });

beforeEach(() => {
  calls.order = [];
  el.quit.mockClear();
  el.showMessageBox.mockReset();
  prefs.value = { confirmQuit: true };
  tabs.counts = [3];
  tabs.focused = null;
  state.quitting = false;
  delete process.env.TEPEGOZ_EVAL;
});

describe('shouldConfirmQuit', () => {
  const base = { enabled: true, quitting: false, evalMode: false, tabCount: 2 };
  it('asks when enabled, undecided, not eval, with two or more tabs', () => {
    expect(shouldConfirmQuit(base)).toBe(true);
  });
  it.each([
    ['the setting is off', { enabled: false }],
    ['the quit is already decided (relaunch, update restart)', { quitting: true }],
    ['eval mode', { evalMode: true }],
    ['only one tab is open', { tabCount: 1 }],
    ['no tab is open', { tabCount: 0 }],
  ])('does not ask when %s', (_why, over) => {
    expect(shouldConfirmQuit({ ...base, ...over })).toBe(false);
  });
});

describe('requestQuit', () => {
  it('quits at once when the setting is off — marking the quit real BEFORE app.quit()', () => {
    prefs.value = { confirmQuit: false };
    requestQuit();
    expect(el.showMessageBox).not.toHaveBeenCalled();
    expect(calls.order).toEqual(['markQuitting', 'app.quit']);
  });

  it('counts tabs across every window, hidden ones included', async () => {
    tabs.counts = [1, 1]; // two windows, one tab each: still 2 tabs lost
    answer(0);
    requestQuit();
    await flush();
    expect(el.showMessageBox).toHaveBeenCalledTimes(1);
    const options = el.showMessageBox.mock.calls[0]!.at(-1) as { detail: string };
    expect(options.detail).toBe('closes 2 tabs');
  });

  it('does nothing until the user answers, then quits (marking first) on "Quit"', async () => {
    answer(0);
    requestQuit();
    expect(el.quit).not.toHaveBeenCalled();
    await flush();
    expect(calls.order).toEqual(['markQuitting', 'app.quit']);
  });

  it.each([
    ['"Keep running"', () => answer(1)],
    ['a dismissed dialog', () => el.showMessageBox.mockResolvedValueOnce({ response: 1 })],
    ['a dialog failure', () => el.showMessageBox.mockRejectedValueOnce(new Error('no window'))],
  ])('keeps the app running on %s', async (_label, setup) => {
    setup();
    requestQuit();
    await flush();
    expect(el.quit).not.toHaveBeenCalled();
    expect(state.quitting).toBe(false);
  });

  it('parents the dialog to the focused window when there is a live one', async () => {
    const win = { isDestroyed: () => false };
    tabs.focused = win;
    answer(1);
    requestQuit();
    await flush();
    expect(el.showMessageBox.mock.calls[0]![0]).toBe(win);
  });

  it('never stacks a second prompt while one is up', async () => {
    let finish: (v: { response: number }) => void = () => undefined;
    el.showMessageBox.mockReturnValueOnce(new Promise((r) => (finish = r)));
    requestQuit();
    requestQuit();
    expect(el.showMessageBox).toHaveBeenCalledTimes(1);
    finish({ response: 1 });
    await flush();
    // …and once answered, a later request may ask again.
    answer(1);
    requestQuit();
    await flush();
    expect(el.showMessageBox).toHaveBeenCalledTimes(2);
  });
});

describe('confirmBeforeQuit (the before-quit backstop)', () => {
  it('lets a quit through when nothing needs asking', () => {
    prefs.value = { confirmQuit: false };
    expect(confirmBeforeQuit()).toBe(false);
    state.quitting = true; // a decided quit (Exit, tray, relaunch)
    prefs.value = { confirmQuit: true };
    expect(confirmBeforeQuit()).toBe(false);
  });

  it('vetoes an unowned quit, asks, and re-issues it once confirmed', async () => {
    answer(0);
    expect(confirmBeforeQuit()).toBe(true); // the caller preventDefaults
    expect(el.quit).not.toHaveBeenCalled();
    await flush();
    expect(calls.order).toEqual(['markQuitting', 'app.quit']);
    // The re-issued quit now passes the backstop because the flag is set.
    expect(confirmBeforeQuit()).toBe(false);
  });

  it('keeps vetoing without re-asking while the first prompt is still up, and drops the quit on "Keep running"', async () => {
    let finish: (v: { response: number }) => void = () => undefined;
    el.showMessageBox.mockReturnValueOnce(new Promise((r) => (finish = r)));
    expect(confirmBeforeQuit()).toBe(true);
    expect(confirmBeforeQuit()).toBe(true);
    expect(el.showMessageBox).toHaveBeenCalledTimes(1);
    finish({ response: 1 });
    await flush();
    expect(el.quit).not.toHaveBeenCalled();
  });
});
