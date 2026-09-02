import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * System power lifecycle. Two independent contracts:
 *   1. `reconcileTrayPowerBlocker` — the OS app-suspension blocker is ON exactly when a window is
 *      parked to the tray AND `keepAwakeInTray` is set, and the reconcile is idempotent (it never
 *      starts a second blocker or stops one that was never started).
 *   2. the pause/resume seam — subscribers registered via `onSystemPause` / `onSystemResume` fire on
 *      the matching `emit*`, and the returned unsubscribe actually detaches them.
 */

const psb = vi.hoisted(() => ({
  start: vi.fn(() => 7),
  stop: vi.fn(),
  isStarted: vi.fn(() => true),
}));
vi.mock('electron', () => ({ powerSaveBlocker: psb }));
vi.mock('@tepegoz/libs', () => ({ Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const prefs = vi.hoisted(() => ({ keepAwakeInTray: false }));
vi.mock('@tepegoz/preferences', () => ({ default: { getAll: () => prefs } }));

const tabs = vi.hoisted(() => ({ parked: [] as boolean[] }));
vi.mock('./tabs', () => ({
  default: { all: () => tabs.parked.map((p) => ({ window: { parked: p } })) },
}));
vi.mock('./window', () => ({
  isParkedToTray: (w: { parked: boolean }) => w.parked,
}));

async function load() {
  return import('./power-lifecycle');
}

beforeEach(() => {
  vi.resetModules();
  psb.start.mockClear().mockReturnValue(7);
  psb.stop.mockClear();
  psb.isStarted.mockClear().mockReturnValue(true);
  prefs.keepAwakeInTray = false;
  tabs.parked = [];
});

describe('reconcileTrayPowerBlocker', () => {
  it('starts the blocker when a window is parked AND the pref is on', async () => {
    const { reconcileTrayPowerBlocker } = await load();
    tabs.parked = [false, true];
    prefs.keepAwakeInTray = true;

    reconcileTrayPowerBlocker();
    expect(psb.start).toHaveBeenCalledWith('prevent-app-suspension');
  });

  it('does not start a second blocker on a repeat call (idempotent)', async () => {
    const { reconcileTrayPowerBlocker } = await load();
    tabs.parked = [true];
    prefs.keepAwakeInTray = true;

    reconcileTrayPowerBlocker();
    reconcileTrayPowerBlocker();
    expect(psb.start).toHaveBeenCalledTimes(1);
  });

  it('does nothing when parked but the pref is off', async () => {
    const { reconcileTrayPowerBlocker } = await load();
    tabs.parked = [true];
    prefs.keepAwakeInTray = false;

    reconcileTrayPowerBlocker();
    expect(psb.start).not.toHaveBeenCalled();
  });

  it('stops the blocker once nothing is parked any more', async () => {
    const { reconcileTrayPowerBlocker } = await load();
    tabs.parked = [true];
    prefs.keepAwakeInTray = true;
    reconcileTrayPowerBlocker();

    tabs.parked = [false];
    reconcileTrayPowerBlocker();
    expect(psb.stop).toHaveBeenCalledWith(7);
  });

  it('stops the blocker when the pref is turned off while still parked', async () => {
    const { reconcileTrayPowerBlocker } = await load();
    tabs.parked = [true];
    prefs.keepAwakeInTray = true;
    reconcileTrayPowerBlocker();

    prefs.keepAwakeInTray = false;
    reconcileTrayPowerBlocker();
    expect(psb.stop).toHaveBeenCalledWith(7);
  });

  it('does not call stop on a blocker the OS reports as already gone', async () => {
    const { reconcileTrayPowerBlocker } = await load();
    tabs.parked = [true];
    prefs.keepAwakeInTray = true;
    reconcileTrayPowerBlocker();

    psb.isStarted.mockReturnValue(false);
    tabs.parked = [false];
    reconcileTrayPowerBlocker();
    expect(psb.stop).not.toHaveBeenCalled();
  });

  it('is a no-op when there is nothing parked and nothing running', async () => {
    const { reconcileTrayPowerBlocker } = await load();
    reconcileTrayPowerBlocker();
    expect(psb.start).not.toHaveBeenCalled();
    expect(psb.stop).not.toHaveBeenCalled();
  });
});

describe('pause / resume seam', () => {
  it('fires every pause subscriber on emitSystemPause and every resume subscriber on emitSystemResume', async () => {
    const { onSystemPause, onSystemResume, emitSystemPause, emitSystemResume } = await load();
    const p1 = vi.fn();
    const p2 = vi.fn();
    const r1 = vi.fn();
    onSystemPause(p1);
    onSystemPause(p2);
    onSystemResume(r1);

    emitSystemPause();
    expect(p1).toHaveBeenCalledTimes(1);
    expect(p2).toHaveBeenCalledTimes(1);
    expect(r1).not.toHaveBeenCalled();

    emitSystemResume();
    expect(r1).toHaveBeenCalledTimes(1);
  });

  it('the returned unsubscribe detaches the listener', async () => {
    const { onSystemPause, emitSystemPause } = await load();
    const fn = vi.fn();
    const off = onSystemPause(fn);
    off();
    emitSystemPause();
    expect(fn).not.toHaveBeenCalled();
  });
});
