import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  SAFE_MODE_STRIKES,
  healthyRecord,
  nextLaunchRecord,
  readRecord,
  trippedSafeMode,
  writeRecord,
  type RecoveryRecord,
} from './crash-counter';

/**
 * The crash counter is the only thing standing between a page that kills the main process and a browser
 * the user can never open again, so the properties worth pinning are the ones a wrong implementation
 * gets subtly wrong: strikes must be CONSECUTIVE, a clean quit must reset them, and an unreadable file
 * must read as "first launch" rather than throw on the boot path.
 */

const dir = mkdtempSync(join(tmpdir(), 'tepegoz-recovery-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** Replay a sequence of launches through the counter, returning each launch's strike count. */
function replay(outcomes: ('crash' | 'clean')[]): number[] {
  let prev: RecoveryRecord | null = null;
  const strikes: number[] = [];
  for (const outcome of outcomes) {
    const record = nextLaunchRecord(prev, 1_000);
    strikes.push(record.strikes);
    prev = outcome === 'crash' ? record : healthyRecord(2_000);
  }
  return strikes;
}

describe('crash counter', () => {
  it('counts a launch that never cleared its pending mark as a strike', () => {
    expect(replay(['crash', 'crash', 'crash'])).toEqual([0, 1, 2]);
  });

  it('trips safe mode only on the launch AFTER two crashes', () => {
    const strikes = replay(['crash', 'crash', 'crash']);
    expect(strikes.map(trippedSafeMode)).toEqual([false, false, true]);
    expect(SAFE_MODE_STRIKES).toBe(2);
  });

  it('requires the crashes to be consecutive — one good session resets the count', () => {
    // crash, crash would trip on the third launch; a clean session in between must not.
    expect(replay(['crash', 'clean', 'crash', 'crash'])).toEqual([0, 1, 0, 1]);
  });

  it('treats a clean quit inside the health window as clean, not as a crash', () => {
    const launch = nextLaunchRecord(null, 1_000);
    const quit = healthyRecord(1_500); // user quit 500 ms in — well inside HEALTHY_AFTER_MS
    expect(nextLaunchRecord(quit, 2_000).strikes).toBe(0);
    expect(launch.pending).toBe(true);
    expect(quit.pending).toBe(false);
  });

  it('round-trips through the file', () => {
    const file = join(dir, 'roundtrip.json');
    const record = nextLaunchRecord(null, 1_234);
    writeRecord(file, record);
    expect(readRecord(file)).toEqual(record);
  });

  it('reads a missing, malformed, or wrong-shaped file as a first launch', () => {
    expect(readRecord(join(dir, 'absent.json'))).toBeNull();
    const bad = join(dir, 'bad.json');
    writeFileSync(bad, 'not json at all', 'utf8');
    expect(readRecord(bad)).toBeNull();
    const wrong = join(dir, 'wrong.json');
    writeFileSync(wrong, JSON.stringify({ strikes: 'two', pending: 'yes' }), 'utf8');
    expect(readRecord(wrong)).toBeNull();
  });

  it('never throws when the record cannot be written', () => {
    // A directory path is not a writable file — the boot path must survive it.
    expect(() => writeRecord(dir, healthyRecord(1))).not.toThrow();
  });
});
