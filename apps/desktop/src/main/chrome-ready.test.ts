import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserWindow } from 'electron';

/**
 * The "trusted UI is actually on screen" signal. What is pinned here is the wiring contract the rest
 * of the launch path leans on: listeners are ONE-SHOT, a listener registered after the window is
 * already ready fires immediately, `whenAnyChromeReady` is satisfied by whichever window reports
 * first, per-window listeners never fire for a different window, and a listener that throws is
 * isolated so it cannot stop the others or take down the launch it exists to speed up.
 */

// Module-level state (anyReadySeen / WeakSets) never resets, so each test gets a fresh module.
beforeEach(() => {
  vi.resetModules();
});

async function load() {
  return import('./chrome-ready');
}

// The module only uses a window as a WeakSet/WeakMap key, so an opaque object is a faithful stand-in.
const makeWin = (): BrowserWindow => ({}) as BrowserWindow;

describe('markChromeReady + whenChromeReady', () => {
  it('runs a per-window listener once when the window first reports ready', async () => {
    const { markChromeReady, whenChromeReady } = await load();
    const win = makeWin();
    const seen: BrowserWindow[] = [];
    whenChromeReady(win, (w) => seen.push(w));

    markChromeReady(win);
    expect(seen).toEqual([win]);

    // One-shot: a second report does not fire it again.
    markChromeReady(win);
    expect(seen).toEqual([win]);
  });

  it('fires a per-window listener immediately when the window is already ready', async () => {
    const { markChromeReady, whenChromeReady } = await load();
    const win = makeWin();
    markChromeReady(win);

    const seen: BrowserWindow[] = [];
    whenChromeReady(win, (w) => seen.push(w));
    expect(seen).toEqual([win]);
  });

  it('never fires a per-window listener for a different window', async () => {
    const { markChromeReady, whenChromeReady } = await load();
    const a = makeWin();
    const b = makeWin();
    const fired = vi.fn();
    whenChromeReady(a, fired);

    markChromeReady(b);
    expect(fired).not.toHaveBeenCalled();

    markChromeReady(a);
    expect(fired).toHaveBeenCalledTimes(1);
  });
});

describe('whenAnyChromeReady', () => {
  it('runs pending any-listeners once when the first window reports ready', async () => {
    const { markChromeReady, whenAnyChromeReady } = await load();
    const first = vi.fn();
    const second = vi.fn();
    whenAnyChromeReady(first);
    whenAnyChromeReady(second);

    markChromeReady(makeWin());
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);

    // A later, different window does not re-fire the already-consumed listeners.
    markChromeReady(makeWin());
    expect(first).toHaveBeenCalledTimes(1);
  });

  it('fires immediately once any window has ever reported ready', async () => {
    const { markChromeReady, whenAnyChromeReady } = await load();
    markChromeReady(makeWin());

    const late = vi.fn();
    whenAnyChromeReady(late);
    expect(late).toHaveBeenCalledTimes(1);
  });
});

describe('listener isolation', () => {
  it('a throwing listener does not stop the others', async () => {
    const { markChromeReady, whenAnyChromeReady } = await load();
    const after = vi.fn();
    whenAnyChromeReady(() => {
      throw new Error('boom');
    });
    whenAnyChromeReady(after);

    expect(() => markChromeReady(makeWin())).not.toThrow();
    expect(after).toHaveBeenCalledTimes(1);
  });

  it('a throwing immediate listener is swallowed too', async () => {
    const { markChromeReady, whenChromeReady } = await load();
    const win = makeWin();
    markChromeReady(win);
    expect(() =>
      whenChromeReady(win, () => {
        throw new Error('boom');
      }),
    ).not.toThrow();
  });
});
