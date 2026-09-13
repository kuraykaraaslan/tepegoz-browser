import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ProcessSupervisor, type ProcessSupervisorConfig, type ProcessSupervisorDeps } from './process-supervisor';
import type { ChildProcessLike, SpawnFn } from './types';

type Handler<T extends unknown[]> = (...args: T) => void;

/** A fake child process: no real OS process, full manual control over stdout/exit/error timing, so
 *  the supervisor's restart/heartbeat/backoff logic is testable without ever touching node:child_process. */
class FakeChild implements ChildProcessLike {
  readonly writes: string[] = [];
  killed = false;
  readonly stdin = { write: (chunk: string) => this.writes.push(chunk) };
  private readonly stdoutHandlers: Handler<[Buffer | string]>[] = [];
  private readonly stderrHandlers: Handler<[Buffer | string]>[] = [];
  private readonly exitHandlers: Handler<[number | null, NodeJS.Signals | null]>[] = [];
  private readonly errorHandlers: Handler<[Error]>[] = [];

  readonly stdout = {
    on: (event: 'data', cb: Handler<[Buffer | string]>) => {
      if (event === 'data') this.stdoutHandlers.push(cb);
    },
  };
  readonly stderr = {
    on: (event: 'data', cb: Handler<[Buffer | string]>) => {
      if (event === 'data') this.stderrHandlers.push(cb);
    },
  };

  on(event: 'exit' | 'error', cb: never): void {
    if (event === 'exit') this.exitHandlers.push(cb);
    else this.errorHandlers.push(cb);
  }

  kill(): void {
    this.killed = true;
    this.emitExit(null, 'SIGTERM');
  }

  emitStdout(chunk: string): void {
    for (const h of this.stdoutHandlers) h(chunk);
  }
  emitStderr(chunk: string): void {
    for (const h of this.stderrHandlers) h(chunk);
  }
  emitExit(code: number | null, signal: NodeJS.Signals | null): void {
    for (const h of this.exitHandlers) h(code, signal);
  }
  emitError(err: Error): void {
    for (const h of this.errorHandlers) h(err);
  }
}

/** Write a raw child→parent frame straight to the fake child's stdout — clearer than routing
 *  through `encodeFrame`, which is for the opposite (parent→child) direction. */
function sendFrame(child: FakeChild, frame: Record<string, unknown>): void {
  child.emitStdout(`${JSON.stringify(frame)}\n`);
}

function lastRequestId(child: FakeChild): string {
  const last = child.writes.at(-1);
  if (last === undefined) throw new Error('no request sent yet');
  return (JSON.parse(last) as { id: string }).id;
}

describe('ProcessSupervisor', () => {
  let children: FakeChild[];
  let spawn: SpawnFn;
  let deps: ProcessSupervisorDeps;
  let log: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    children = [];
    spawn = vi.fn(() => {
      const child = new FakeChild();
      children.push(child);
      return child;
    });
    log = vi.fn();
    deps = {
      spawn,
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
      log,
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function make(config: Partial<ProcessSupervisorConfig> = {}): ProcessSupervisor {
    return new ProcessSupervisor(
      { command: 'bridge', args: ['--x'], env: { A: '1' }, cwd: '/state', ...config },
      deps,
    );
  }

  it('start() spawns exactly once with the configured command/args/env/cwd, and reaches running', () => {
    const sup = make();
    sup.start();
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(spawn).toHaveBeenCalledWith('bridge', ['--x'], { A: '1' }, '/state');
    expect(sup.getState()).toBe('running');
  });

  it('start() is a no-op while already starting/running', () => {
    const sup = make();
    sup.start();
    sup.start();
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  it('call() sends a framed request and resolves once a matching ok response arrives', async () => {
    const sup = make();
    sup.start();
    const child = children[0]!;
    const promise = sup.call('sendMessage', { body: 'hi' }, z.object({ protocolId: z.string() }));
    const req = JSON.parse(child.writes.at(-1)!) as { method: string; params: unknown };
    expect(req.method).toBe('sendMessage');
    expect(req.params).toEqual({ body: 'hi' });

    sendFrame(child, { id: lastRequestId(child), result: { protocolId: 'p1' } });
    await expect(promise).resolves.toEqual({ protocolId: 'p1' });
  });

  it('call() rejects with the child-reported message on an error response', async () => {
    const sup = make();
    sup.start();
    const child = children[0]!;
    const promise = sup.call('sendMessage', {}, z.unknown());
    sendFrame(child, { id: lastRequestId(child), error: { message: 'refused' } });
    await expect(promise).rejects.toThrow('refused');
  });

  it('call() rejects when the response fails the caller-supplied result schema', async () => {
    const sup = make();
    sup.start();
    const child = children[0]!;
    const promise = sup.call('sendMessage', {}, z.object({ protocolId: z.string() }));
    sendFrame(child, { id: lastRequestId(child), result: { wrong: 'shape' } });
    await expect(promise).rejects.toThrow(/invalid result/);
  });

  it('call() rejects after callTimeoutMs with no response', async () => {
    const sup = make({ callTimeoutMs: 5_000 });
    sup.start();
    const promise = sup.call('sendMessage', {}, z.unknown());
    const assertion = expect(promise).rejects.toThrow(/timed out/);
    await vi.advanceTimersByTimeAsync(5_000);
    await assertion;
  });

  it('call() rejects immediately when not running', async () => {
    const sup = make();
    await expect(sup.call('x', {}, z.unknown())).rejects.toThrow(/not running/);
  });

  it('an unknown/stale response id is dropped silently, not thrown', () => {
    const sup = make();
    sup.start();
    const child = children[0]!;
    expect(() => sendFrame(child, { id: 'no-such-call', result: 1 })).not.toThrow();
  });

  it('onEvent fires for an event-shaped frame, with no matching request needed', () => {
    const sup = make();
    sup.start();
    const child = children[0]!;
    const handler = vi.fn();
    sup.onEvent(handler);
    sendFrame(child, { event: 'message', params: { body: 'hi' } });
    expect(handler).toHaveBeenCalledWith('message', { body: 'hi' });
  });

  it('a malformed stdout line is logged and ignored, not thrown', () => {
    const sup = make();
    sup.start();
    const child = children[0]!;
    expect(() => child.emitStdout('{not json\n')).not.toThrow();
    expect(log).toHaveBeenCalledWith('adapter subprocess sent a malformed frame — ignored', expect.anything());
  });

  it('stderr output is logged, not thrown', () => {
    const sup = make();
    sup.start();
    children[0]!.emitStderr('warning: deprecated flag\n');
    expect(log).toHaveBeenCalledWith('adapter subprocess stderr', expect.anything());
  });

  describe('heartbeat', () => {
    it('sends __ping on the configured interval and reschedules on pong', async () => {
      const sup = make({ heartbeatIntervalMs: 1_000 });
      sup.start();
      const child = children[0]!;
      await vi.advanceTimersByTimeAsync(1_000);
      const req = JSON.parse(child.writes.at(-1)!) as { method: string };
      expect(req.method).toBe('__ping');
      sendFrame(child, { id: lastRequestId(child), result: 'pong' });
      await vi.advanceTimersByTimeAsync(0);
      expect(sup.getState()).toBe('running'); // survived one heartbeat cycle
    });

    it('a missed heartbeat (no reply within heartbeatTimeoutMs) restarts the child', async () => {
      const sup = make({ heartbeatIntervalMs: 1_000, heartbeatTimeoutMs: 500, callTimeoutMs: 500 });
      sup.start();
      await vi.advanceTimersByTimeAsync(1_000); // ping sent
      await vi.advanceTimersByTimeAsync(500); // call times out (no pong sent) → restart triggered
      expect(spawn).toHaveBeenCalledTimes(1); // restart is scheduled via backoff, not yet spawned
      expect(sup.getState()).toBe('restarting');
    });
  });

  describe('lifetime budget', () => {
    it('restarts the child after maxLifetimeMs even with no crash and no missed heartbeat', async () => {
      const sup = make({ maxLifetimeMs: 10_000, heartbeatIntervalMs: 100_000 });
      sup.start();
      await vi.advanceTimersByTimeAsync(10_000);
      expect(sup.getState()).toBe('restarting');
    });

    it('never restarts on a lifetime budget when unset', async () => {
      const sup = make(); // maxLifetimeMs omitted entirely
      sup.start();
      await vi.advanceTimersByTimeAsync(10_000_000);
      expect(sup.getState()).toBe('running');
    });
  });

  describe('crash restart + backoff', () => {
    it('restarts after backoffMs[0] on an unexpected exit', async () => {
      const sup = make({ backoffMs: [1_000, 5_000] });
      sup.start();
      children[0]!.emitExit(1, null);
      expect(sup.getState()).toBe('restarting');
      expect(spawn).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1_000);
      expect(spawn).toHaveBeenCalledTimes(2);
      expect(sup.getState()).toBe('running');
    });

    it('uses successive backoff delays for consecutive crashes within the same streak', async () => {
      const sup = make({ backoffMs: [1_000, 5_000, 20_000] });
      sup.start();
      // Crash immediately, every time — never gives the stability timer a chance to reset the streak.
      children[0]!.emitExit(1, null);
      await vi.advanceTimersByTimeAsync(1_000);
      expect(spawn).toHaveBeenCalledTimes(2);
      children[1]!.emitExit(1, null);
      await vi.advanceTimersByTimeAsync(4_999);
      expect(spawn).toHaveBeenCalledTimes(2); // not yet — 5_000 is the second delay
      await vi.advanceTimersByTimeAsync(1);
      expect(spawn).toHaveBeenCalledTimes(3);
    });

    it('settles into the terminal crashed state after maxRestarts, and stops retrying', async () => {
      const sup = make({ backoffMs: [10], maxRestarts: 2 });
      const states: string[] = [];
      sup.onStateChange((s) => states.push(s));
      sup.start();
      children[0]!.emitExit(1, null); // 1st failure — restartCount 0 → schedules restart
      await vi.advanceTimersByTimeAsync(10);
      children[1]!.emitExit(1, null); // 2nd failure — restartCount 1 → schedules restart
      await vi.advanceTimersByTimeAsync(10);
      children[2]!.emitExit(1, null); // 3rd failure — restartCount 2 >= maxRestarts → crashed
      expect(sup.getState()).toBe('crashed');
      expect(spawn).toHaveBeenCalledTimes(3); // no further attempt
      await vi.advanceTimersByTimeAsync(100_000);
      expect(spawn).toHaveBeenCalledTimes(3);
      expect(states).toContain('crashed');
    });

    it("resets the restart streak once the child has stayed up past backoffMs[0] (a flaky one-off isn't a crash loop)", async () => {
      const sup = make({ backoffMs: [1_000], maxRestarts: 1 });
      sup.start();
      children[0]!.emitExit(1, null); // uses up the only allowed restart
      await vi.advanceTimersByTimeAsync(1_000); // restarts (restartCount now 1)
      expect(spawn).toHaveBeenCalledTimes(2);
      // Stay up past the stability window (backoffMs[0] = 1_000) before crashing again.
      await vi.advanceTimersByTimeAsync(1_000);
      children[1]!.emitExit(1, null); // would be restartCount 1 >= maxRestarts 1 WITHOUT the reset
      expect(sup.getState()).toBe('restarting'); // reset happened — this crash still gets a retry
    });

    it('an explicit stop() after a restart is scheduled cancels it — no further spawn', async () => {
      const sup = make({ backoffMs: [1_000] });
      sup.start();
      children[0]!.emitExit(1, null);
      sup.stop();
      await vi.advanceTimersByTimeAsync(10_000);
      expect(spawn).toHaveBeenCalledTimes(1);
      expect(sup.getState()).toBe('stopped');
    });
  });

  describe('stop()', () => {
    it('kills the child, rejects pending calls, and sets state to stopped — idempotent', async () => {
      const sup = make();
      sup.start();
      const promise = sup.call('x', {}, z.unknown());
      sup.stop();
      await expect(promise).rejects.toThrow(/stopped/);
      expect(children[0]!.killed).toBe(true);
      expect(sup.getState()).toBe('stopped');
      expect(() => sup.stop()).not.toThrow(); // idempotent
    });

    it("the child's own (self-triggered) exit event after stop() does not schedule a second restart", () => {
      const sup = make({ backoffMs: [1_000] });
      sup.start();
      const child = children[0]!;
      sup.stop(); // kill() synchronously fires FakeChild's own exit handler once already
      expect(spawn).toHaveBeenCalledTimes(1);
      expect(sup.getState()).toBe('stopped');
      // A late, redundant real exit event (e.g. a duplicate OS signal) must not double-handle.
      child.emitExit(0, null);
      expect(spawn).toHaveBeenCalledTimes(1);
    });
  });

  it('onStateChange reports the full lifecycle in order', () => {
    const sup = make({ backoffMs: [10] });
    const states: string[] = [];
    sup.onStateChange((s) => states.push(s));
    sup.start();
    sup.stop();
    expect(states).toEqual(['starting', 'running', 'stopped']);
  });

  it("an 'error' event on the child (e.g. spawn failure) is treated the same as an exit", () => {
    const sup = make({ backoffMs: [1_000] });
    sup.start();
    children[0]!.emitError(new Error('ENOENT'));
    expect(sup.getState()).toBe('restarting');
  });
});
