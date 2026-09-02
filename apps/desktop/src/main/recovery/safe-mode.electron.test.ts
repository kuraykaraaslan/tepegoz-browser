import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `safe-mode.ts` — the per-launch state machine. `crash-counter.ts` (the pure record helpers) has its
 * own test; this covers the decision layer on top: `--safe-mode` OR a tripped crash counter enters
 * safe mode, a clean launch does not, `beginLaunch` runs exactly once, and the health timer / clean
 * exit both clear the counter.
 */

const electron = vi.hoisted(() => ({
  app: {
    getPath: vi.fn(() => '/ud'),
    commandLine: { hasSwitch: vi.fn(() => false) },
  },
}));
const counter = vi.hoisted(() => ({
  HEALTHY_AFTER_MS: 60_000,
  RECOVERY_FILE: 'recovery.json',
  readRecord: vi.fn<(f: string) => unknown>(() => null),
  nextLaunchRecord: vi.fn(() => ({ strikes: 1, pending: true, lastLaunch: 1 })),
  healthyRecord: vi.fn(() => ({ strikes: 0, pending: false, lastLaunch: 2 })),
  writeRecord: vi.fn(),
  trippedSafeMode: vi.fn(() => false),
}));

vi.mock('electron', () => electron);
vi.mock('./crash-counter', () => counter);
vi.mock('@tepegoz/libs', () => ({ Logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));

const ORIGINAL_ARGV = [...process.argv];
const RECOVERY_PATH = join('/ud', 'recovery.json');

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.useFakeTimers();
  electron.app.commandLine.hasSwitch.mockReturnValue(false);
  counter.trippedSafeMode.mockReturnValue(false);
  counter.readRecord.mockReturnValue(null);
  counter.nextLaunchRecord.mockReturnValue({ strikes: 1, pending: true, lastLaunch: 1 });
  process.argv = [...ORIGINAL_ARGV];
});
afterEach(() => {
  vi.useRealTimers();
  process.argv = [...ORIGINAL_ARGV];
});

async function load() {
  return import('./safe-mode');
}

describe('beginLaunch', () => {
  it('an ordinary launch does not enter safe mode, and stamps the launch record', async () => {
    const m = await load();
    m.beginLaunch();
    expect(m.isSafeMode()).toBe(false);
    expect(m.safeModeReason()).toBeNull();
    expect(counter.writeRecord).toHaveBeenCalledWith(
      RECOVERY_PATH,
      { strikes: 1, pending: true, lastLaunch: 1 },
    );
  });

  it('enters safe mode with reason "flag" when --safe-mode is on the command line', async () => {
    process.argv = [...ORIGINAL_ARGV, '--safe-mode'];
    const m = await load();
    m.beginLaunch();
    expect(m.isSafeMode()).toBe(true);
    expect(m.safeModeReason()).toBe('flag');
  });

  it('also honours app.commandLine.hasSwitch("safe-mode")', async () => {
    electron.app.commandLine.hasSwitch.mockReturnValue(true);
    const m = await load();
    m.beginLaunch();
    expect(m.safeModeReason()).toBe('flag');
  });

  it('enters safe mode with reason "crash-loop" when the counter has tripped', async () => {
    counter.trippedSafeMode.mockReturnValue(true);
    const m = await load();
    m.beginLaunch();
    expect(m.isSafeMode()).toBe(true);
    expect(m.safeModeReason()).toBe('crash-loop');
  });

  it('reports whether the previous launch crashed, from the stored record', async () => {
    counter.readRecord.mockReturnValue({ strikes: 1, pending: true, lastLaunch: 1 });
    const m = await load();
    m.beginLaunch();
    expect(m.previousLaunchCrashed()).toBe(true);
  });

  it('runs exactly once — a second call reads nothing new', async () => {
    const m = await load();
    m.beginLaunch();
    m.beginLaunch();
    expect(counter.readRecord).toHaveBeenCalledTimes(1);
  });
});

describe('health timer and clean exit', () => {
  it('clears the counter once a launch survives the health window', async () => {
    const m = await load();
    m.beginLaunch();
    counter.writeRecord.mockClear();
    m.armHealthTimer();
    m.armHealthTimer(); // second call must not arm a second timer
    vi.advanceTimersByTime(60_000);
    expect(counter.writeRecord).toHaveBeenCalledTimes(1);
    expect(counter.writeRecord).toHaveBeenCalledWith(RECOVERY_PATH, {
      strikes: 0,
      pending: false,
      lastLaunch: 2,
    });
  });

  it('markCleanExit clears the counter and cancels a pending health timer', async () => {
    const m = await load();
    m.beginLaunch();
    m.armHealthTimer();
    counter.writeRecord.mockClear();
    m.markCleanExit();
    expect(counter.writeRecord).toHaveBeenCalledWith(RECOVERY_PATH, {
      strikes: 0,
      pending: false,
      lastLaunch: 2,
    });
    // The timer was cancelled, so advancing time writes nothing further.
    counter.writeRecord.mockClear();
    vi.advanceTimersByTime(120_000);
    expect(counter.writeRecord).not.toHaveBeenCalled();
  });
});
