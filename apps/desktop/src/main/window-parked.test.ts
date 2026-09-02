import { beforeEach, describe, expect, it } from 'vitest';
import type { BrowserWindow, Rectangle } from 'electron';
import { PARK_X, PARK_Y, trayParked, isParkedToTray } from './window-parked';

/**
 * The tiny leaf that holds "which windows are hidden to the tray, and where they go when they come
 * back" — split from `window.ts` (which touches `app` at import time) so the agent visibility gate and
 * the power-lifecycle blocker can ASK without inheriting the whole Electron main graph.
 */

const win = (): BrowserWindow => ({}) as BrowserWindow;
const bounds: Rectangle = { x: 10, y: 20, width: 800, height: 600 };

beforeEach(() => {
  trayParked.clear();
});

describe('park position', () => {
  it('is far enough off-screen that no real display can contain it', () => {
    expect(PARK_X).toBeLessThanOrEqual(-32000);
    expect(PARK_Y).toBeLessThanOrEqual(-32000);
  });
});

describe('isParkedToTray', () => {
  it('is false for a window that was never parked', () => {
    expect(isParkedToTray(win())).toBe(false);
  });

  it('is true once the window is recorded in trayParked, false after it is removed', () => {
    const w = win();
    trayParked.set(w, bounds);
    expect(isParkedToTray(w)).toBe(true);
    trayParked.delete(w);
    expect(isParkedToTray(w)).toBe(false);
  });

  it('tracks each window independently', () => {
    const a = win();
    const b = win();
    trayParked.set(a, bounds);
    expect(isParkedToTray(a)).toBe(true);
    expect(isParkedToTray(b)).toBe(false);
  });
});
