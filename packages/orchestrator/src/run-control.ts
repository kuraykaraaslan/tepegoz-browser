/**
 * A composed run-control gate for a live agent run — user pause/resume, connectivity hold, mid-run
 * steering, and terminal abort — all observed through ONE per-step await. Additive by design: when a run
 * has no {@link RunControl} (unit tests, the eval harness) the reactor skips it entirely and behaves
 * byte-identically to the legacy signal-only path.
 *
 * The desktop host implements this (a deadlock-free condition variable — see `RunControlHandle`); the
 * reactor consumes it once per step (hold), before each model call (cancel signal), and in the model-call
 * catch (offline hold). "Hold" = paused-by-user OR offline: the loop suspends but the run is never failed.
 */
export interface RunControl {
  /** Terminal cancel — mirrors the legacy `signal.aborted`. Abort ALWAYS wins over any hold. */
  readonly aborted: boolean;
  /** True while paused-by-user OR offline. The loop suspends here but the run is NOT failed. */
  isHeld(): boolean;
  /**
   * Resolves the instant no hold is active (immediately when not held). Wakes on resume / reconnect /
   * abort. NEVER rejects — abort is observed via {@link aborted} by the caller. Deadlock-free: a single
   * condition variable, no lost wakeups.
   */
  waitWhileHeld(): Promise<void>;
  /** Pull-and-clear user messages injected mid-run (steering). Empty when none pending. Non-blocking. */
  drainSteer(): readonly string[];
  /**
   * A fresh AbortSignal for the NEXT model call. Fires on abort OR offline-entry (so a call on a dead
   * socket is cancelled, not orphaned) — but NOT on a user pause (a pause lets the in-flight step finish
   * cheaply and holds at the next gate).
   */
  modelSignal(): AbortSignal;
  /**
   * Mark this run offline — a connection drop the reactor observed on the model socket — and ask the host
   * network monitor to begin active reconnect probing. Idempotent.
   */
  enterOfflineHold(): void;
}
