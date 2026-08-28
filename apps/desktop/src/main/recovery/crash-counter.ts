import { readFileSync, writeFileSync } from 'node:fs';
import { z } from 'zod';
import { Logger } from '@tepegoz/libs';

/**
 * The crash counter — the one mechanism ADR-0038 hands to two consumers (safe-mode entry today, update
 * rollback when the updater lands), so a bad extension and a bad update recover through the same tested
 * path.
 *
 * The whole design is one fact written to disk: **a launch is presumed to have crashed until it proves
 * otherwise.** Every launch stamps `pending: true`; a session that survives {@link HEALTHY_AFTER_MS}, or
 * that exits through `before-quit`, clears it. So the next launch reading `pending: true` back is reading
 * a launch that neither survived nor said goodbye — which is what a crash looks like from the outside.
 *
 * That inversion is why this file exists at all rather than a crash HANDLER: an Electron main process
 * killed by the GPU, the OOM killer, or a wedged render process runs no handler, and a recovery
 * mechanism that only works when the app is well enough to run code is not a recovery mechanism.
 *
 * Schema-checked with a local zod schema rather than one from `@tepegoz/shared-types`: this record never
 * crosses IPC and is never synced — it is main-local boot state, and putting it in the shared contract
 * would advertise a wire type that has no wire. It is still a trust boundary (a file on disk that a
 * previous build, or a disk error, may have left in any shape), hence `safeParse` and not a cast.
 */

/** How long a launch must survive before it counts as healthy (ADR-0038: the counter is "cleared once a
 *  session survives 60 s"). */
export const HEALTHY_AFTER_MS = 60_000;

/** Consecutive unhealthy launches that trip safe mode (ADR-0038: "2 crashes within 60 s of launch"). */
export const SAFE_MODE_STRIKES = 2;

/** File name inside the user-data directory. Deliberately NOT in `preferences.json`: this is written on
 *  every launch and must stay readable when the preferences file is the thing that is corrupt. */
export const RECOVERY_FILE = 'recovery.json';

const RecoveryRecordSchema = z.object({
  /** Consecutive launches that neither reached the health mark nor exited cleanly. */
  strikes: z.number().int().min(0).max(1_000_000),
  /** True while a launch is in flight — read back as `true` next boot ⟺ that launch died. */
  pending: z.boolean(),
  /** Epoch millis the pending launch started. Diagnostics only; the decision never reads a clock
   *  difference across runs, because a clock that moved between launches would then decide it. */
  startedAt: z.number().int().min(0),
});

export type RecoveryRecord = z.infer<typeof RecoveryRecordSchema>;

/** The record a launch writes on the way up. A previous record still marked `pending` is a strike;
 *  anything else resets the count, so two crashes must be CONSECUTIVE to trip safe mode. */
export function nextLaunchRecord(prev: RecoveryRecord | null, now: number): RecoveryRecord {
  const crashed = prev !== null && prev.pending;
  return { strikes: crashed ? prev.strikes + 1 : 0, pending: true, startedAt: now };
}

/** The record a launch writes once it is healthy (survived the window) or quits cleanly. */
export function healthyRecord(now: number): RecoveryRecord {
  return { strikes: 0, pending: false, startedAt: now };
}

/** Whether `strikes` has reached the safe-mode threshold. */
export function trippedSafeMode(strikes: number): boolean {
  return strikes >= SAFE_MODE_STRIKES;
}

/** Read the record, or null when absent/unreadable/malformed. Never throws — a recovery mechanism that
 *  can itself fail the boot is worse than none, so an unreadable counter means "first launch". */
export function readRecord(file: string): RecoveryRecord | null {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null; // absent on first launch; unreadable/invalid JSON → start the count over
  }
  const parsed = RecoveryRecordSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** Write the record. Never throws — a read-only profile must still boot, it just loses crash detection. */
export function writeRecord(file: string, record: RecoveryRecord): void {
  try {
    writeFileSync(file, JSON.stringify(record), 'utf8');
  } catch (err) {
    Logger.warn('Failed to write the crash-counter record', { err: String(err) });
  }
}
