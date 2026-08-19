import type { BrowserWindow, Rectangle } from 'electron';

/**
 * Which windows are parked off-screen (hidden to the tray / started in the background), and where they
 * belong when they come back.
 *
 * A three-line leaf module on purpose. `window.ts` reads `app` at import time, so anything that imports
 * it inherits the whole Electron main graph — which is how a unit test of an unrelated module ends up
 * failing on `getAppPath()`. The parked state is exactly the sort of small fact other modules need to
 * *ask about* (the agent's visibility gate, S7 PR3) without taking on window creation, and keeping it
 * here is what lets them.
 */

/** Off-screen park position — far enough that no real display can contain it. */
export const PARK_X = -32000;
export const PARK_Y = -32000;

/** Parked window → the on-screen bounds to restore. Written by `window.ts`, read by anyone. */
export const trayParked = new Map<BrowserWindow, Rectangle>();

/** True while `win` is hidden to the tray (parked off-screen, dropped from the taskbar). */
export function isParkedToTray(win: BrowserWindow): boolean {
  return trayParked.has(win);
}
