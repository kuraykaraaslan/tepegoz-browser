import { join } from 'node:path';
import { app } from 'electron';
import { Logger } from '@tepegoz/libs';
import {
  HEALTHY_AFTER_MS,
  RECOVERY_FILE,
  healthyRecord,
  nextLaunchRecord,
  readRecord,
  trippedSafeMode,
  writeRecord,
} from './crash-counter';

/**
 * Safe mode — rung three of ADR-0038's recovery ladder.
 *
 * A browser that will not start is unrecoverable by its own user: there is no UI left to click. So the
 * launch after two consecutive crashes brings the app up with the parts that most plausibly caused them
 * switched off — extensions, the agent runtime, MCP, and session restore — while keeping the chrome,
 * preferences, and the settings surface, because the user has to be able to reach the setting that FIXES
 * the thing that broke.
 *
 * Session restore is on that list for the reason Chrome shows its "Restore pages?" prompt: the page that
 * crashed the browser is in the session, and restoring it unconditionally re-crashes the browser. Chrome
 * asks; we refuse to restore once, without a dialog, and let the user reopen what they want from the
 * recently-closed list. Nothing is deleted — the snapshot is preserved untouched (see
 * `TabManagerBase.persistNow`, which does not write while safe mode is on), so a normal next launch
 * brings the whole session back.
 */

export type SafeModeReason =
  /** `--safe-mode` on the command line — the user (or a support instruction) asked for it. */
  | 'flag'
  /** Two consecutive launches died before proving themselves healthy. */
  | 'crash-loop';

let reason: SafeModeReason | null = null;
let previousCrashed = false;
let recordFile = '';
let healthTimer: ReturnType<typeof setTimeout> | null = null;
let begun = false;

/**
 * Read the crash counter, decide this launch's mode, and stamp the launch as in-flight. Call ONCE, at
 * module scope, right after the userData path is pinned and before `whenReady` — every gate downstream
 * ({@link isSafeMode}) reads the answer this computes.
 */
export function beginLaunch(): void {
  if (begun) return;
  begun = true;
  recordFile = join(app.getPath('userData'), RECOVERY_FILE);
  const prev = readRecord(recordFile);
  const record = nextLaunchRecord(prev, Date.now());
  previousCrashed = prev !== null && prev.pending;
  // The flag is checked with BOTH accessors on purpose: Electron strips switches it recognises out of
  // `process.argv` in some launch paths, and passes unknown ones through in others.
  const flagged =
    app.commandLine.hasSwitch('safe-mode') || process.argv.includes('--safe-mode');
  reason = flagged ? 'flag' : trippedSafeMode(record.strikes) ? 'crash-loop' : null;
  writeRecord(recordFile, record);
  if (reason !== null) {
    Logger.warn('Booting in safe mode', { reason, strikes: record.strikes });
  } else if (previousCrashed) {
    Logger.warn('Previous session did not shut down cleanly', { strikes: record.strikes });
  }
}

/** Whether extensions, the agent runtime, MCP, and session restore are switched off for this launch. */
export function isSafeMode(): boolean {
  return reason !== null;
}

/** Why safe mode was entered, or null when it was not. */
export function safeModeReason(): SafeModeReason | null {
  return reason;
}

/**
 * Whether the PREVIOUS launch ended without a clean quit — i.e. it crashed, was killed, or the machine
 * went down under it. This is the signal the session-restore notice is gated on: an ordinary launch
 * restores silently, and only an unclean one is worth telling the user about.
 */
export function previousLaunchCrashed(): boolean {
  return previousCrashed;
}

/** Start the health countdown: a launch still alive after {@link HEALTHY_AFTER_MS} clears the counter,
 *  so a crash tomorrow starts from zero rather than inheriting today's. Call once, from `whenReady`. */
export function armHealthTimer(): void {
  if (healthTimer !== null || recordFile.length === 0) return;
  healthTimer = setTimeout(() => {
    healthTimer = null;
    writeRecord(recordFile, healthyRecord(Date.now()));
  }, HEALTHY_AFTER_MS);
}

/** Clear the counter on an orderly quit — including one inside the health window, which is a user
 *  deciding to leave, not a crash. Call from `before-quit`. */
export function markCleanExit(): void {
  if (recordFile.length === 0) return;
  if (healthTimer !== null) {
    clearTimeout(healthTimer);
    healthTimer = null;
  }
  writeRecord(recordFile, healthyRecord(Date.now()));
}
