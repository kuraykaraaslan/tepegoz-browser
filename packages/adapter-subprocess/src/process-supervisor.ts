import { z } from 'zod';
import { LineBuffer, decodeFrame, encodeFrame, isRpcEvent, isRpcResponseOk, type RpcInbound } from './rpc-envelope';
import type { ChildProcessLike, SpawnFn } from './types';

export type SupervisorState = 'stopped' | 'starting' | 'running' | 'restarting' | 'crashed';

export interface ProcessSupervisorConfig {
  command: string;
  args?: readonly string[];
  env?: Record<string, string>;
  /** The adapter instance's own state directory (ADR-0048 §2.1) — the CALLER's job to have already
   *  confined to `<extension-id>/<adapter-instance-id>/state/`; this class just forwards it as `cwd`. */
  cwd?: string;
  /** How long a single {@link ProcessSupervisor.call} may take before it's treated as failed. */
  callTimeoutMs?: number;
  /** Heartbeat cadence + how long a `__ping` may go unanswered before the child is treated as hung. */
  heartbeatIntervalMs?: number;
  heartbeatTimeoutMs?: number;
  /** Restart the child if it has been running longer than this — a defensive upper bound on a bridge
   *  that has degraded silently without crashing or missing a heartbeat. Unset = no lifetime budget. */
  maxLifetimeMs?: number;
  /** Backoff delay before each successive restart attempt; the last value repeats past its length. */
  backoffMs?: readonly number[];
  /** Restart attempts allowed before giving up and settling into the terminal `crashed` state. Reset
   *  by an explicit {@link ProcessSupervisor.start} call, and by the child staying up longer than
   *  `backoffMs[0]` (a "was this actually a crash loop, or one flaky exit" distinction). */
  maxRestarts?: number;
}

type RequiredConfig = Required<
  Pick<
    ProcessSupervisorConfig,
    'callTimeoutMs' | 'heartbeatIntervalMs' | 'heartbeatTimeoutMs' | 'backoffMs' | 'maxRestarts'
  >
>;

const DEFAULTS: RequiredConfig = {
  callTimeoutMs: 30_000,
  heartbeatIntervalMs: 30_000,
  heartbeatTimeoutMs: 10_000,
  backoffMs: [1_000, 5_000, 15_000, 60_000],
  maxRestarts: 5,
};

export interface ProcessSupervisorDeps {
  spawn: SpawnFn;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
  log?: (msg: string, meta?: Record<string, unknown>) => void;
}

interface PendingCall {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  timer: unknown;
}

let callSeq = 0;

/**
 * ADR-0048 §4: "one shared supervisor shape, not one per extension." Spawns a child, restarts it
 * with backoff on an unexpected exit or a missed heartbeat, enforces a wall-clock lifetime budget,
 * and speaks the typed newline-JSON RPC envelope (`rpc-envelope.ts`) over its stdio — generic across
 * whatever adapter interface (`ChatAdapter` today) the consuming extension's manifest declares via
 * `adapterSubprocess`. One instance per adapter subprocess instance (one bridge account, in chat's
 * case): isolation between instances is "there is no shared state here to leak across them", not an
 * enforced boundary this class draws itself.
 *
 * What this class does NOT enforce (ADR-0048 §2's guarantees 1/2 are the CALLER's job, same as a
 * native adapter's egress binding is `ChatService`'s job, not `ChatAdapter`'s): filesystem
 * confinement to a state dir and egress binding are properties of the `cwd`/`env` passed in and of
 * the OS-level profile binding, not something watching a child's stdio can enforce from here. What it
 * DOES enforce directly: no host RPC beyond the typed {@link call} surface (guarantee 3), and
 * wall-clock budget + crash isolation via restart-with-backoff (guarantee 4).
 */
export class ProcessSupervisor {
  private state: SupervisorState = 'stopped';
  private child: ChildProcessLike | null = null;
  private lineBuffer = new LineBuffer();
  private readonly pending = new Map<string, PendingCall>();
  private readonly eventHandlers = new Set<(event: string, params: unknown) => void>();
  private readonly stateHandlers = new Set<(state: SupervisorState, detail?: string) => void>();
  private restartCount = 0;
  private stopping = false;
  private heartbeatTimer: unknown = null;
  private lifetimeTimer: unknown = null;
  private restartTimer: unknown = null;
  private stabilityTimer: unknown = null;

  private readonly cfg: RequiredConfig;

  constructor(
    private readonly config: ProcessSupervisorConfig,
    private readonly deps: ProcessSupervisorDeps,
  ) {
    this.cfg = { ...DEFAULTS, ...config };
  }

  getState(): SupervisorState {
    return this.state;
  }

  /** Subscribe to the child's unsolicited events (a live `ChatEvent`, reshaped for the wire). */
  onEvent(handler: (event: string, params: unknown) => void): () => void {
    this.eventHandlers.add(handler);
    return () => {
      this.eventHandlers.delete(handler);
    };
  }

  /** Subscribe to lifecycle transitions — the caller (e.g. `ChatService`) surfaces `crashed` as that
   *  one account going into an error state, nothing else in the extension. */
  onStateChange(handler: (state: SupervisorState, detail?: string) => void): () => void {
    this.stateHandlers.add(handler);
    return () => {
      this.stateHandlers.delete(handler);
    };
  }

  /** Spawn the child. Resets the restart-attempt streak — an explicit start is a fresh session, not
   *  a continuation of whatever crash-looped last time. No-op while already starting/running. */
  start(): void {
    if (this.state === 'running' || this.state === 'starting') return;
    this.stopping = false;
    this.restartCount = 0;
    this.spawnChild();
  }

  /** Drop the child cleanly (app quit, profile switch, extension disabled). Idempotent. */
  stop(): void {
    if (this.state === 'stopped') return;
    this.stopping = true;
    this.clearTimers();
    this.failAllPending('adapter subprocess stopped');
    this.killChild();
    this.setState('stopped');
  }

  /** Invoke one method on the child, validated against `resultSchema`. Rejects on a child-reported
   *  error, a response failing `resultSchema`, the child not currently running, or
   *  {@link ProcessSupervisorConfig.callTimeoutMs}. */
  call<T>(method: string, params: unknown, resultSchema: z.ZodType<T>): Promise<T> {
    if (this.child === null || this.state !== 'running') {
      return Promise.reject(new Error(`adapter subprocess is not running (state: ${this.state})`));
    }
    const id = `c${String(++callSeq)}`;
    const child = this.child;
    return new Promise<T>((resolve, reject) => {
      const timer = this.deps.setTimer(() => {
        this.pending.delete(id);
        reject(new Error(`adapter subprocess call "${method}" timed out`));
      }, this.cfg.callTimeoutMs);
      this.pending.set(id, {
        resolve: (value) => {
          const parsed = resultSchema.safeParse(value);
          if (parsed.success) resolve(parsed.data);
          else reject(new Error(`adapter subprocess call "${method}" returned an invalid result`));
        },
        reject,
        timer,
      });
      child.stdin?.write(encodeFrame({ id, method, params }));
    });
  }

  private setState(next: SupervisorState, detail?: string): void {
    this.state = next;
    for (const h of this.stateHandlers) h(next, detail);
  }

  private spawnChild(): void {
    this.setState('starting');
    const child = this.deps.spawn(
      this.config.command,
      this.config.args ?? [],
      this.config.env ?? {},
      this.config.cwd,
    );
    this.child = child;
    this.lineBuffer = new LineBuffer();

    child.stdout?.on('data', (chunk) => {
      this.handleStdout(typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
    });
    child.stderr?.on('data', (chunk) => {
      const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      this.deps.log?.('adapter subprocess stderr', { line: text.slice(0, 2000) });
    });
    // Both guards below compare against the captured `child`, not `this.child`: a self-initiated
    // kill (restartAfterFailure / stop) nulls `this.child` BEFORE calling `.kill()`, so the real
    // exit/error event this child fires later is recognized as already-handled and skipped — without
    // this, a deliberate restart would schedule a SECOND restart on top of the first.
    child.on('error', (err) => {
      if (this.child !== child) return;
      this.deps.log?.('adapter subprocess spawn error', { err: String(err) });
      this.handleExit(`spawn error: ${String(err)}`);
    });
    child.on('exit', (code, signal) => {
      if (this.child !== child) return;
      this.handleExit(`exited (code=${String(code)}, signal=${String(signal)})`);
    });

    this.setState('running');
    this.armHeartbeat();
    this.armLifetimeBudget();
    // A flaky one-off crash must not count toward the SAME streak as a genuine crash loop: once the
    // child has stayed up longer than the shortest backoff step, treat the streak as over.
    this.stabilityTimer = this.deps.setTimer(() => {
      this.restartCount = 0;
    }, this.cfg.backoffMs[0] ?? 1_000);
  }

  private handleStdout(chunk: string): void {
    const { lines, overflow } = this.lineBuffer.push(chunk);
    if (overflow) this.deps.log?.('adapter subprocess sent an oversized line — dropped', {});
    for (const line of lines) {
      const frame = decodeFrame(line);
      if (frame === null) {
        this.deps.log?.('adapter subprocess sent a malformed frame — ignored', {
          line: line.slice(0, 500),
        });
        continue;
      }
      this.handleFrame(frame);
    }
  }

  private handleFrame(frame: RpcInbound): void {
    if (isRpcEvent(frame)) {
      for (const h of this.eventHandlers) h(frame.event, frame.params);
      return;
    }
    const pending = this.pending.get(frame.id);
    if (pending === undefined) return; // stale/unknown id — nothing waits on it, drop silently
    this.pending.delete(frame.id);
    this.deps.clearTimer(pending.timer);
    if (isRpcResponseOk(frame)) pending.resolve(frame.result);
    else pending.reject(new Error(frame.error.message));
  }

  private armHeartbeat(): void {
    this.heartbeatTimer = this.deps.setTimer(() => {
      this.call('__ping', undefined, z.literal('pong')).then(
        () => {
          if (this.state === 'running') this.armHeartbeat();
        },
        () => {
          this.deps.log?.('adapter subprocess missed its heartbeat — restarting', {});
          this.restartAfterFailure('missed heartbeat');
        },
      );
    }, this.cfg.heartbeatIntervalMs);
  }

  private armLifetimeBudget(): void {
    if (this.config.maxLifetimeMs === undefined) return;
    this.lifetimeTimer = this.deps.setTimer(() => {
      this.deps.log?.('adapter subprocess exceeded its lifetime budget — restarting', {});
      this.restartAfterFailure('lifetime budget exceeded');
    }, this.config.maxLifetimeMs);
  }

  private clearTimers(): void {
    if (this.heartbeatTimer !== null) this.deps.clearTimer(this.heartbeatTimer);
    if (this.lifetimeTimer !== null) this.deps.clearTimer(this.lifetimeTimer);
    if (this.restartTimer !== null) this.deps.clearTimer(this.restartTimer);
    if (this.stabilityTimer !== null) this.deps.clearTimer(this.stabilityTimer);
    this.heartbeatTimer = null;
    this.lifetimeTimer = null;
    this.restartTimer = null;
    this.stabilityTimer = null;
  }

  private failAllPending(reason: string): void {
    for (const p of this.pending.values()) {
      this.deps.clearTimer(p.timer);
      p.reject(new Error(reason));
    }
    this.pending.clear();
  }

  private killChild(): void {
    this.clearTimers();
    const child = this.child;
    this.child = null; // BEFORE kill() — see the exit-handler guard in spawnChild
    try {
      child?.kill();
    } catch {
      /* already gone */
    }
  }

  /** A supervisor-detected failure (missed heartbeat, lifetime budget) — as opposed to the child
   *  exiting/erroring on its own, which the `exit`/`error` handlers report via {@link handleExit}
   *  directly. Kills the child (if still alive) then runs the same restart decision. */
  private restartAfterFailure(reason: string): void {
    this.killChild();
    this.failAllPending(`adapter subprocess restarting: ${reason}`);
    this.handleExit(reason);
  }

  private handleExit(detail: string): void {
    this.clearTimers();
    this.child = null;
    this.failAllPending(`adapter subprocess exited: ${detail}`);
    if (this.stopping) {
      this.setState('stopped', detail);
      return;
    }
    if (this.restartCount >= this.cfg.maxRestarts) {
      this.setState('crashed', detail);
      return;
    }
    this.setState('restarting', detail);
    const idx = Math.min(this.restartCount, this.cfg.backoffMs.length - 1);
    const delay = this.cfg.backoffMs[idx] ?? 0;
    this.restartCount += 1;
    this.restartTimer = this.deps.setTimer(() => {
      if (this.stopping) return;
      this.spawnChild();
    }, delay);
  }
}
