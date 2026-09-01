/**
 * Drives periodic refresh of the Safe Browsing prefix database ([ADR-0043](../../../../../docs/adr/0043-safe-browsing-service-and-egress.md) §1):
 * a full refresh on a bounded cadence, plus an immediate one on first launch when nothing is stored.
 *
 * Pure and injected — no `setInterval`, no `Date` — so the cadence, the first-run behaviour and the
 * failure backoff are testable with fake timers. The `.electron` wiring passes real implementations
 * and stops the scheduler on quit.
 */

export interface RefreshSchedulerPorts {
  /** Do one refresh. Resolves on success, rejects on any failure (network, parse, HTTP status). */
  refresh(): Promise<void>;
  /** ms since epoch of the last successful refresh, or `null` if none — from the prefix store. */
  lastRefreshAt(): number | null;
  now(): number;
  /** `setTimeout`-shaped. Returns a handle the scheduler passes back to {@link clearTimer}. */
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
  /** Whether the feature is on. When it flips to `false` the scheduler idles; `start` re-checks it. */
  enabled(): boolean;
}

export interface RefreshSchedulerOptions {
  /** Normal gap between successful refreshes. Default 6h. */
  intervalMs?: number;
  /** First backoff after a failure; doubles each consecutive failure up to {@link maxBackoffMs}. */
  minBackoffMs?: number;
  maxBackoffMs?: number;
}

const HOUR = 60 * 60 * 1000;

export class SafeBrowsingRefreshScheduler {
  private readonly intervalMs: number;
  private readonly minBackoffMs: number;
  private readonly maxBackoffMs: number;
  private handle: unknown = null;
  private failures = 0;
  private running = false;
  private stopped = false;

  constructor(
    private readonly ports: RefreshSchedulerPorts,
    opts: RefreshSchedulerOptions = {},
  ) {
    this.intervalMs = opts.intervalMs ?? 6 * HOUR;
    this.minBackoffMs = opts.minBackoffMs ?? 5 * 60 * 1000;
    this.maxBackoffMs = opts.maxBackoffMs ?? 6 * HOUR;
  }

  /** Begin scheduling. Runs a refresh immediately if the stored data is missing or older than the interval. */
  start(): void {
    this.stopped = false;
    if (!this.ports.enabled()) {
      this.arm(this.intervalMs); // idle re-check; picks up a later toggle-on
      return;
    }
    const at = this.ports.lastRefreshAt();
    const dueIn = at === null ? 0 : Math.max(0, this.intervalMs - (this.ports.now() - at));
    this.arm(dueIn);
  }

  stop(): void {
    this.stopped = true;
    if (this.handle !== null) {
      this.ports.clearTimer(this.handle);
      this.handle = null;
    }
  }

  private arm(ms: number): void {
    if (this.stopped) return;
    if (this.handle !== null) this.ports.clearTimer(this.handle);
    this.handle = this.ports.setTimer(() => {
      this.handle = null;
      void this.tick();
    }, ms);
  }

  private async tick(): Promise<void> {
    if (this.stopped || this.running) return;
    if (!this.ports.enabled()) {
      this.arm(this.intervalMs);
      return;
    }
    this.running = true;
    try {
      await this.ports.refresh();
      this.failures = 0;
      this.arm(this.intervalMs);
    } catch {
      this.failures += 1;
      const backoff = Math.min(
        this.maxBackoffMs,
        this.minBackoffMs * 2 ** (this.failures - 1),
      );
      this.arm(backoff);
    } finally {
      this.running = false;
    }
  }
}
