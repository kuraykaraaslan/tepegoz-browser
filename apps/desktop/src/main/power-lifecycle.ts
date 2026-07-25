import { powerSaveBlocker } from 'electron';
import { Logger } from '@tepegoz/libs';
import PreferenceStore from '@tepegoz/preferences';
import TabManager from './tabs';
import { isParkedToTray } from './window';

/**
 * System power lifecycle: (1) an OS app-suspension blocker that keeps the app awake while it runs hidden
 * in the tray (gated on the `keepAwakeInTray` pref), and (2) a small pause/resume SEAM the app entry's
 * `powerMonitor` hooks fire on sleep / power-save transitions. The seam is where the future task-runtime
 * "resume interrupted work" feature will subscribe; today the transitions are captured, logged, and
 * fanned out here so that feature has a stable, ready hook — no work-pausing logic lives here yet.
 */

// ── keep-awake-in-tray (powerSaveBlocker) ──────────────────────────────────────────────────────────
let blockerId: number | null = null;

/** Start/stop the app-suspension blocker to match the current state: ON only when at least one window is
 *  hidden to the tray AND `keepAwakeInTray` is enabled. Call after any hide↔show transition + on the
 *  pref change. Idempotent. */
export function reconcileTrayPowerBlocker(): void {
  const anyParked = TabManager.all().some((wt) => isParkedToTray(wt.window));
  const want = anyParked && PreferenceStore.getAll().keepAwakeInTray;
  if (want && blockerId === null) {
    blockerId = powerSaveBlocker.start('prevent-app-suspension');
    Logger.info('Tray keep-awake: powerSaveBlocker started');
  } else if (!want && blockerId !== null) {
    if (powerSaveBlocker.isStarted(blockerId)) powerSaveBlocker.stop(blockerId);
    blockerId = null;
    Logger.info('Tray keep-awake: powerSaveBlocker stopped');
  }
}

// ── pause / resume seam ─────────────────────────────────────────────────────────────────────────────
type PowerListener = () => void;
const pauseListeners = new Set<PowerListener>();
const resumeListeners = new Set<PowerListener>();

/** Subscribe to "system is reducing power" (sleep / power-save enter). Returns an unsubscribe. */
export function onSystemPause(fn: PowerListener): () => void {
  pauseListeners.add(fn);
  return () => {
    pauseListeners.delete(fn);
  };
}

/** Subscribe to "system resumed" (wake / power-save exit). Returns an unsubscribe. */
export function onSystemResume(fn: PowerListener): () => void {
  resumeListeners.add(fn);
  return () => {
    resumeListeners.delete(fn);
  };
}

/** Fire the pause seam — invoked by the app-entry `powerMonitor` hooks (gated on `pauseTasksOnSleep`). */
export function emitSystemPause(): void {
  for (const fn of pauseListeners) fn();
}

/** Fire the resume seam — invoked by the app-entry `powerMonitor` hooks (gated on `pauseTasksOnSleep`). */
export function emitSystemResume(): void {
  for (const fn of resumeListeners) fn();
}
