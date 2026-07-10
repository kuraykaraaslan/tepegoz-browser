import type { RunControl } from '@tepegoz/orchestrator';

/**
 * Per-run control registry (single-agent-run lock lives here). Two coexisting maps:
 *  - `controllers` — the legacy/background-task path (raw AbortController; no pause/steer). Unchanged.
 *  - `controls` — the interactive Agent-panel path: a {@link RunControlHandle} that adds user pause/resume,
 *    connectivity hold, and mid-run steering on top of abort.
 * `hasActiveAgentRun()` unions both, so an interactive run and a background task still mutually exclude.
 */

interface Deferred {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
}
function deferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/**
 * The host-side implementation of {@link RunControl}. Deadlock-free by a single condition variable: every
 * state mutator swaps `wake` to a fresh deferred and resolves the previous one, so any awaiter re-checks
 * the loop condition. In `waitWhileHeld` there is NO `await` between the condition check and the `wake`
 * capture, so a `notify()` can only land while we are parked on `wake.promise` — never in an unobserved
 * window (JS is single-threaded). Abort always wins: the loop guard is `!aborted && isHeld()`, and
 * `abort()` sets `aborted` AND notifies.
 */
export class RunControlHandle implements RunControl {
  private readonly abortController = new AbortController();
  private pausedByUser = false;
  private offline = false;
  /** Held for a human handoff the run itself detected (login wall). Cleared by the same user `resume()`. */
  private handoffHeld = false;
  private steerQueue: string[] = [];
  private wake = deferred();
  private modelCtl: AbortController | null = null;

  /** `hintOffline` pokes the network monitor into active reconnect probing (for a drop seen only on the
   *  model socket, which page-traffic error observation never sees). */
  constructor(private readonly hintOffline: () => void) {}

  get signal(): AbortSignal {
    return this.abortController.signal;
  }
  get aborted(): boolean {
    return this.abortController.signal.aborted;
  }
  isHeld(): boolean {
    return this.pausedByUser || this.offline || this.handoffHeld;
  }

  private notify(): void {
    const prev = this.wake;
    this.wake = deferred();
    prev.resolve();
  }

  async waitWhileHeld(): Promise<void> {
    while (!this.aborted && this.isHeld()) {
      const w = this.wake; // capture BEFORE awaiting — no await between check and capture ⇒ no lost wakeup
      await w.promise;
    }
  }

  drainSteer(): readonly string[] {
    const q = this.steerQueue;
    this.steerQueue = [];
    return q;
  }

  modelSignal(): AbortSignal {
    this.modelCtl = new AbortController();
    if (this.aborted || this.offline) this.modelCtl.abort(); // already-known reason ⇒ pre-aborted
    return this.modelCtl.signal;
  }

  enterOfflineHold(): void {
    this.setOffline();
    this.hintOffline();
  }

  enterHandoffHold(guidance: string): void {
    if (this.handoffHeld) return; // idempotent — a re-detected wall on the same held page doesn't re-queue
    this.handoffHeld = true;
    if (guidance.length > 0) this.steerQueue.push(guidance); // drained on resume → re-perceive + continue
    this.notify(); // does NOT abort the in-flight step — hold at the next gate, exactly like a user pause
  }

  // --- host-driven mutators (each notifies the condition wait) ---
  pause(): void {
    this.pausedByUser = true;
    this.notify(); // does NOT abort the in-flight model call — let this step finish, hold at the next gate
  }
  resume(): void {
    // One "Resume" releases BOTH a user pause and a handoff (login) hold — after the user signs in they
    // press the same button, and the queued re-perceive guidance is drained at the next gate.
    this.pausedByUser = false;
    this.handoffHeld = false;
    this.notify();
  }
  setOffline(): void {
    if (this.offline) return;
    this.offline = true;
    this.modelCtl?.abort(); // cancel a call stuck on a dead socket
    this.notify();
  }
  setOnline(): void {
    if (!this.offline) return;
    this.offline = false;
    this.notify();
  }
  steer(text: string): void {
    this.steerQueue.push(text);
    this.notify();
  }
  abort(): void {
    this.abortController.abort();
    this.modelCtl?.abort();
    this.notify();
  }
}

const controllers = new Map<string, AbortController>(); // legacy / background-task path
const controls = new Map<string, RunControlHandle>(); // interactive Agent-panel path

export function hasActiveAgentRun(): boolean {
  return controllers.size > 0 || controls.size > 0;
}

// --- legacy / background-task path (behaviour unchanged) ---
export function registerAgentRunController(runId: string, controller: AbortController): void {
  controllers.set(runId, controller);
}
export function unregisterAgentRunController(runId: string): void {
  controllers.delete(runId);
}
export function agentRunController(runId: string): AbortController | undefined {
  return controllers.get(runId);
}
export function abortAllAgentRunControllers(): void {
  for (const c of controllers.values()) c.abort();
  controllers.clear();
  for (const h of controls.values()) h.abort();
  controls.clear();
}

// --- interactive run-control path ---
export function createRunControl(runId: string, hintOffline: () => void): RunControlHandle {
  const handle = new RunControlHandle(hintOffline);
  controls.set(runId, handle);
  return handle;
}
export function agentRunControl(runId: string): RunControlHandle | undefined {
  return controls.get(runId);
}
export function unregisterRunControl(runId: string): void {
  controls.delete(runId);
}
export function pauseAgentRun(runId: string): void {
  controls.get(runId)?.pause();
}
export function resumeAgentRun(runId: string): void {
  controls.get(runId)?.resume();
}
export function steerAgentRun(runId: string, text: string): void {
  controls.get(runId)?.steer(text);
}
/** Fan-out from the network monitor: hold / release every active interactive run. */
export function setAllRunsOffline(): void {
  for (const h of controls.values()) h.setOffline();
}
export function setAllRunsOnline(): void {
  for (const h of controls.values()) h.setOnline();
}
