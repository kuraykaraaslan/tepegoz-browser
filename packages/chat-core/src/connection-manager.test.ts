import { describe, it, expect, vi } from 'vitest';
import {
  ChatConnectionManager,
  type ChatConnState,
  type ConnectionManagerDeps,
  type ManagedSession,
  reconnectDelayMs,
} from './connection-manager';

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

/** A controllable event stream. */
class EventChannel {
  private queue: unknown[] = [];
  private waiters: Array<(r: IteratorResult<unknown>) => void> = [];
  private ended = false;

  push(v: unknown): void {
    if (this.ended) return;
    const w = this.waiters.shift();
    if (w !== undefined) w({ value: v, done: false });
    else this.queue.push(v);
  }
  end(): void {
    this.ended = true;
    for (const w of this.waiters.splice(0)) w({ value: undefined, done: true });
  }
  async *[Symbol.asyncIterator](): AsyncIterator<unknown> {
    for (;;) {
      const v = this.queue.shift();
      if (v !== undefined) {
        yield v;
        continue;
      }
      if (this.ended) return;
      const next = await new Promise<IteratorResult<unknown>>((r) => this.waiters.push(r));
      if (next.done === true) return;
      yield next.value;
    }
  }
}

class FakeAdapter {
  channels: EventChannel[] = [];
  connectCalls = 0;
  disconnected: ManagedSession[] = [];
  private nextConnect: { resolve: (s: ManagedSession) => void; reject: (e: Error) => void } | null =
    null;

  connect(): Promise<ManagedSession> {
    this.connectCalls += 1;
    return new Promise((resolve, reject) => {
      this.nextConnect = { resolve, reject };
    });
  }
  disconnect(s: ManagedSession): Promise<void> {
    this.disconnected.push(s);
    return Promise.resolve();
  }
  events(): AsyncIterable<unknown> {
    const ch = new EventChannel();
    this.channels.push(ch);
    return ch;
  }

  lastSession: ManagedSession | null = null;

  succeed(): ManagedSession {
    const session: ManagedSession = { accountId: 'acc' };
    this.lastSession = session;
    this.nextConnect?.resolve(session);
    this.nextConnect = null;
    return session;
  }

  /** The event channel of the most recent connection (available after a tick). */
  channel(): EventChannel {
    const ch = this.channels.at(-1);
    if (ch === undefined) throw new Error('no channel yet — await a tick after succeed()');
    return ch;
  }
  fail(msg = 'boom'): void {
    this.nextConnect?.reject(new Error(msg));
    this.nextConnect = null;
  }
}

interface Harness {
  mgr: ChatConnectionManager;
  adapter: FakeAdapter;
  states: Array<{ state: ChatConnState; detail?: string }>;
  events: unknown[];
  timers: Array<{ fn: () => void; ms: number }>;
  fireTimers(): void;
  setEgress(v: boolean): void;
}

function harness(egress = true): Harness {
  const adapter = new FakeAdapter();
  const states: Harness['states'] = [];
  const events: unknown[] = [];
  const timers: Harness['timers'] = [];
  let mayEgress = egress;

  const deps: ConnectionManagerDeps = {
    adapter,
    creds: {},
    transport: {},
    now: () => 0,
    setTimer: (fn, ms) => {
      const entry = { fn, ms };
      timers.push(entry);
      return entry;
    },
    clearTimer: (h) => {
      const i = timers.indexOf(h as { fn: () => void; ms: number });
      if (i >= 0) timers.splice(i, 1);
    },
    mayEgress: () => mayEgress,
    random: () => 0.5, // no jitter
    onState: (state, detail) => states.push(detail !== undefined ? { state, detail } : { state }),
    onEvent: (raw) => events.push(raw),
  };

  return {
    mgr: new ChatConnectionManager(deps),
    adapter,
    states,
    events,
    timers,
    fireTimers: () => {
      for (const t of timers.splice(0)) t.fn();
    },
    setEgress: (v) => {
      mayEgress = v;
    },
  };
}

const names = (h: Harness): ChatConnState[] => h.states.map((s) => s.state);

describe('reconnectDelayMs', () => {
  it('is capped exponential; jitter stays within ±20%', () => {
    expect(reconnectDelayMs(1, () => 0.5)).toBe(1000);
    expect(reconnectDelayMs(3, () => 0.5)).toBe(4000);
    expect(reconnectDelayMs(50, () => 0.5)).toBe(300_000);
    expect(reconnectDelayMs(1, () => 0)).toBe(800); // -20%
    expect(reconnectDelayMs(1, () => 1)).toBe(1200); // +20%
  });
});

describe('ChatConnectionManager — happy path', () => {
  it('idle → connecting → online, then pumps events', async () => {
    const h = harness();
    h.mgr.start();
    expect(names(h)).toEqual(['connecting']);
    h.adapter.succeed();
    await tick();
    const channel = h.adapter.channel();
    expect(h.mgr.state).toBe('online');
    channel.push({ type: 'message' });
    await tick();
    expect(h.events).toEqual([{ type: 'message' }]);
  });

  it('start() is idempotent while connecting/online and exposes the session', async () => {
    const h = harness();
    h.mgr.start();
    h.mgr.start();
    expect(h.adapter.connectCalls).toBe(1);
    h.adapter.succeed();
    await tick();
    expect(h.mgr.currentSession).toBe(h.adapter.lastSession);
    h.mgr.start();
    expect(h.adapter.connectCalls).toBe(1);
  });

  it('onState is not re-emitted for an unchanged state', async () => {
    const h = harness();
    h.mgr.start();
    h.adapter.succeed();
    await tick();
    const count = h.states.length;
    h.mgr.notifyEgressChange(); // still may-egress, still online → no state change
    expect(h.states.length).toBe(count);
  });
});

describe('ChatConnectionManager — reconnect', () => {
  it('reconnects with backoff when the stream ends', async () => {
    const h = harness();
    h.mgr.start();
    h.adapter.succeed();
    await tick();
    const channel = h.adapter.channel();
    channel.end();
    await tick();
    expect(h.mgr.state).toBe('reconnecting');
    expect(h.timers[0]?.ms).toBe(1000);
    h.fireTimers();
    await tick();
    expect(h.adapter.connectCalls).toBe(2);
    h.adapter.succeed();
    await tick();
    expect(h.mgr.state).toBe('online');
  });

  it('reconnects with growing backoff when connect fails repeatedly', async () => {
    const h = harness();
    h.mgr.start();
    h.adapter.fail('no route');
    await tick();
    expect(h.states.at(-1)).toEqual({ state: 'error', detail: 'no route' });
    expect(h.timers[0]?.ms).toBe(1000);
    h.fireTimers();
    await tick();
    h.adapter.fail();
    await tick();
    expect(h.timers[0]?.ms).toBe(2000); // attempt 2
  });
});

describe('ChatConnectionManager — kill switch', () => {
  it('start() while egress is blocked lands in blocked, not connecting', () => {
    const h = harness(false);
    h.mgr.start();
    expect(names(h)).toEqual(['blocked']);
    expect(h.adapter.connectCalls).toBe(0);
  });

  it('losing egress mid-session tears down to blocked; regaining it reconnects', async () => {
    const h = harness();
    h.mgr.start();
    h.adapter.succeed();
    await tick();
    const session = h.adapter.lastSession!;
    h.setEgress(false);
    h.mgr.notifyEgressChange();
    expect(h.mgr.state).toBe('blocked');
    expect(h.adapter.disconnected).toContain(session);

    h.setEgress(true);
    h.mgr.notifyEgressChange();
    await tick();
    expect(h.adapter.connectCalls).toBe(2);
    expect(names(h)).toContain('connecting');
  });
});

describe('ChatConnectionManager — stop', () => {
  it('stop() disconnects and suppresses further reconnects', async () => {
    const h = harness();
    h.mgr.start();
    h.adapter.succeed();
    await tick();
    const session = h.adapter.lastSession!;
    const channel = h.adapter.channel();
    await h.mgr.stop();
    expect(h.mgr.state).toBe('stopped');
    expect(h.adapter.disconnected).toContain(session);
    // a late stream-end after stop schedules nothing
    channel.end();
    await tick();
    expect(h.timers).toHaveLength(0);
    h.mgr.start(); // no-op after stop
    expect(h.adapter.connectCalls).toBe(1);
  });

  it('a connect that resolves after stop is immediately disconnected', async () => {
    const h = harness();
    h.mgr.start();
    void h.mgr.stop();
    h.adapter.succeed();
    await tick();
    expect(h.adapter.disconnected).toHaveLength(1);
  });

  it('stop() swallows a disconnect that throws', async () => {
    const h = harness();
    h.mgr.start();
    h.adapter.succeed();
    await tick();
    vi.spyOn(h.adapter, 'disconnect').mockRejectedValueOnce(new Error('already gone'));
    await expect(h.mgr.stop()).resolves.toBeUndefined();
    expect(h.mgr.state).toBe('stopped');
  });

  it('stop() during backoff clears the pending reconnect timer', async () => {
    const h = harness();
    h.mgr.start();
    h.adapter.fail();
    await tick();
    expect(h.timers).toHaveLength(1);
    await h.mgr.stop();
    expect(h.timers).toHaveLength(0);
  });

  it('losing egress during backoff also clears the pending timer', async () => {
    const h = harness();
    h.mgr.start();
    h.adapter.fail();
    await tick();
    expect(h.timers).toHaveLength(1);
    h.setEgress(false);
    h.mgr.notifyEgressChange();
    expect(h.timers).toHaveLength(0);
    expect(h.mgr.state).toBe('blocked');
  });

  it('notifyEgressChange after stop is a no-op', async () => {
    const h = harness();
    h.mgr.start();
    h.adapter.succeed();
    await tick();
    await h.mgr.stop();
    h.setEgress(false);
    h.mgr.notifyEgressChange();
    expect(h.mgr.state).toBe('stopped');
  });

  it('an events stream that throws is treated as a drop', async () => {
    const h = harness();
    h.mgr.start();
    h.adapter.succeed();
    await tick();
    const throwing = {
      async *[Symbol.asyncIterator]() {
        await Promise.resolve();
        if (Date.now() >= 0) throw new Error('socket error');
        yield 1;
      },
    };
    vi.spyOn(h.adapter, 'events').mockReturnValue(throwing);
    // trigger a fresh pump by ending the current channel and reconnecting
    h.adapter.channel().end();
    await tick();
    h.fireTimers();
    await tick();
    h.adapter.succeed();
    await tick();
    await tick();
    expect(h.mgr.state).toBe('reconnecting');
  });
});
