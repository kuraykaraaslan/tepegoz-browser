/**
 * Per-account connection lifecycle — a pure state machine that drives an injected chat adapter:
 * connect → pump events → (drop) → reconnect with capped, jittered backoff → repeat, until
 * `stop()`. The kill-switch (`mayEgress`) gates every connect attempt, and flipping it off tears
 * the session down into `blocked`.
 *
 * IO-free: the adapter, transport, clock and timer are all injected, so the desktop `ChatService`
 * is a thin wrapper and this is fully testable.
 */

export type ChatConnState =
  | 'idle'
  | 'connecting'
  | 'online'
  | 'reconnecting'
  | 'blocked'
  | 'error'
  | 'stopped';

/** The adapter surface the manager needs — a structural subset of `ChatAdapter`. */
export interface ManagedAdapter {
  connect(creds: unknown, transport: unknown): Promise<ManagedSession>;
  disconnect(session: ManagedSession): Promise<void>;
  events(session: ManagedSession): AsyncIterable<unknown>;
}

export interface ManagedSession {
  readonly accountId: string;
}

export interface ConnectionManagerDeps {
  adapter: ManagedAdapter;
  creds: unknown;
  transport: unknown;
  now(): number;
  /** Schedule `fn` after `ms`; return a handle for `clearTimer`. */
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
  /** False ⇒ egress is blocked for this profile (Phase 5 kill switch). */
  mayEgress(): boolean;
  /** 0..1 jitter source (default `Math.random`). */
  random?: () => number;
  onState(state: ChatConnState, detail?: string): void;
  /** A raw event from the adapter's stream — the host validates + folds it. */
  onEvent(raw: unknown): void;
}

const BASE_DELAY_MS = 1_000;
const MAX_DELAY_MS = 5 * 60_000;

/** Capped exponential backoff with ±20% jitter: ~1s, 2s, 4s … ≤ 5min. */
export function reconnectDelayMs(attempt: number, random: () => number = Math.random): number {
  const n = Math.max(1, Math.trunc(attempt));
  const base = Math.min(BASE_DELAY_MS * 2 ** (n - 1), MAX_DELAY_MS);
  const jitter = 1 + (random() * 2 - 1) * 0.2;
  return Math.round(base * jitter);
}

export class ChatConnectionManager {
  private _state: ChatConnState = 'idle';
  private session: ManagedSession | null = null;
  private attempt = 0;
  private timer: unknown = null;
  private stopped = false;
  /** Bumped on every (re)connect so a stale event pump from an old session is ignored. */
  private generation = 0;

  constructor(private readonly deps: ConnectionManagerDeps) {}

  get state(): ChatConnState {
    return this._state;
  }

  get currentSession(): ManagedSession | null {
    return this.session;
  }

  private setState(next: ChatConnState, detail?: string): void {
    if (this._state === next) return;
    this._state = next;
    this.deps.onState(next, detail);
  }

  start(): void {
    if (this.stopped) return;
    if (this._state === 'connecting' || this._state === 'online') return;
    void this.attemptConnect();
  }

  private clearPendingTimer(): void {
    if (this.timer !== null) {
      this.deps.clearTimer(this.timer);
      this.timer = null;
    }
  }

  private async attemptConnect(): Promise<void> {
    this.clearPendingTimer();
    if (this.stopped) return;

    if (!this.deps.mayEgress()) {
      this.setState('blocked', 'egress blocked');
      return;
    }

    this.setState(this.attempt === 0 ? 'connecting' : 'reconnecting');
    const gen = ++this.generation;

    try {
      const session = await this.deps.adapter.connect(this.deps.creds, this.deps.transport);
      if (this.stopped || gen !== this.generation) {
        void this.deps.adapter.disconnect(session);
        return;
      }
      this.session = session;
      this.attempt = 0;
      this.setState('online');
      void this.pump(session, gen);
    } catch (err) {
      if (this.stopped || gen !== this.generation) return;
      this.session = null;
      this.setState('error', err instanceof Error ? err.message : String(err));
      this.scheduleReconnect();
    }
  }

  private async pump(session: ManagedSession, gen: number): Promise<void> {
    try {
      for await (const raw of this.deps.adapter.events(session)) {
        if (this.stopped || gen !== this.generation) return;
        this.deps.onEvent(raw);
      }
    } catch {
      /* the stream faulted — treated the same as a clean end below */
    }
    if (this.stopped || gen !== this.generation) return;
    // The event stream ended → the connection dropped.
    this.session = null;
    this.setState('reconnecting', 'stream ended');
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.stopped) return;
    this.attempt += 1;
    const delay = reconnectDelayMs(this.attempt, this.deps.random);
    this.timer = this.deps.setTimer(() => {
      this.timer = null;
      void this.attemptConnect();
    }, delay);
  }

  /** Re-evaluate the kill switch. Blocks (tearing down) when egress is lost; resumes when regained. */
  notifyEgressChange(): void {
    if (this.stopped) return;
    const may = this.deps.mayEgress();
    if (!may && this._state !== 'blocked') {
      this.generation += 1; // orphan any in-flight connect / pump
      this.clearPendingTimer();
      const s = this.session;
      this.session = null;
      if (s !== null) void this.deps.adapter.disconnect(s);
      this.setState('blocked', 'egress blocked');
      return;
    }
    if (may && this._state === 'blocked') {
      this.attempt = 0;
      void this.attemptConnect();
    }
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.generation += 1;
    this.clearPendingTimer();
    const s = this.session;
    this.session = null;
    this.setState('stopped');
    if (s !== null) {
      try {
        await this.deps.adapter.disconnect(s);
      } catch {
        /* best-effort */
      }
    }
  }
}
