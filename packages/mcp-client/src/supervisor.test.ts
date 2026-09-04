import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CapabilityRegistry } from '@tepegoz/capability-plane';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import McpSupervisor from './supervisor';
import type { McpClientLike } from './connection';
import type { McpServerConfig } from './config';

const stubTransport = {} as unknown as Transport;

function config(id: string): McpServerConfig {
  return {
    id,
    label: id,
    transport: 'stdio',
    command: 'x',
    args: [],
    env: {},
    enabled: true,
    source: 'prefs',
  };
}

class FakeClient implements McpClientLike {
  onclose?: () => void;
  constructor(private readonly toolName: string) {}
  connect(): Promise<void> {
    return Promise.resolve();
  }
  listTools(): Promise<unknown> {
    return Promise.resolve({ tools: [{ name: this.toolName, description: '', inputSchema: {} }] });
  }
  callTool(): Promise<unknown> {
    return Promise.resolve({ content: [] });
  }
  close(): Promise<void> {
    return Promise.resolve();
  }
}

let clients: FakeClient[];

function makeSupervisor(): McpSupervisor {
  clients = [];
  return new McpSupervisor({
    clientFactory: () => {
      const c = new FakeClient(`tool_${String(clients.length)}`);
      clients.push(c);
      return c;
    },
    transportFactory: () => stubTransport,
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  CapabilityRegistry.reset();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('McpSupervisor', () => {
  it('connects all enabled servers and registers their tools', async () => {
    const sup = makeSupervisor();
    sup.start([config('a'), config('b')]);
    await vi.advanceTimersByTimeAsync(0);
    const states = sup.status().map((s) => s.state);
    expect(states).toEqual(['ready', 'ready']);
    expect(CapabilityRegistry.list().filter((d) => d.source === 'mcp')).toHaveLength(2);
  });

  it('marks a server errored (no reconnect loop) when the transport factory throws, others unaffected', async () => {
    const sup = new McpSupervisor({
      clientFactory: () => new FakeClient('tool_x'),
      transportFactory: (c) => {
        if (c.id === 'bad') throw new Error('unsupported transport');
        return stubTransport;
      },
    });
    sup.start([config('good'), config('bad')]);
    await vi.advanceTimersByTimeAsync(0);
    const byId = new Map(sup.status().map((s) => [s.id, s.state]));
    expect(byId.get('good')).toBe('ready');
    expect(byId.get('bad')).toBe('error');
    // A permanent factory error must not schedule a reconnect.
    await vi.advanceTimersByTimeAsync(120_000);
    expect(sup.status().find((s) => s.id === 'bad')?.state).toBe('error');
  });

  it('reconcile removes a dropped server and unregisters its tools', async () => {
    const sup = makeSupervisor();
    sup.start([config('a'), config('b')]);
    await vi.advanceTimersByTimeAsync(0);
    await sup.reconcile([config('a')]);
    expect(sup.status().map((s) => s.id)).toEqual(['a']);
    expect(CapabilityRegistry.list().filter((d) => d.source === 'mcp')).toHaveLength(1);
  });

  it('reconnects with backoff after the connection drops mid-session', async () => {
    const sup = makeSupervisor();
    sup.start([config('a')]);
    await vi.advanceTimersByTimeAsync(0);
    expect(sup.status()[0]?.state).toBe('ready');

    clients[0]?.onclose?.(); // server crashed / stream closed
    await vi.advanceTimersByTimeAsync(0);
    expect(sup.status()[0]?.state).toBe('error');

    await vi.advanceTimersByTimeAsync(60_000); // backoff elapses → reconnect
    expect(sup.status()[0]?.state).toBe('ready');
    expect(clients.length).toBeGreaterThanOrEqual(2); // a fresh client was created
  });

  it('stop() disconnects everything and clears the registry', async () => {
    const sup = makeSupervisor();
    sup.start([config('a'), config('b')]);
    await vi.advanceTimersByTimeAsync(0);
    await sup.stop();
    expect(sup.status()).toHaveLength(0);
    expect(CapabilityRegistry.list().filter((d) => d.source === 'mcp')).toHaveLength(0);
  });

  it('reconcile adds a newly-desired server without touching the existing one', async () => {
    const sup = makeSupervisor();
    sup.start([config('a')]);
    await vi.advanceTimersByTimeAsync(0);

    await sup.reconcile([config('a'), config('b')]);
    await vi.advanceTimersByTimeAsync(0);

    expect(sup.status().map((s) => s.id).sort()).toEqual(['a', 'b']);
    expect(sup.status().every((s) => s.state === 'ready')).toBe(true);
  });

  it('reconcile replaces a server whose config changed (remove + re-add)', async () => {
    const sup = makeSupervisor();
    sup.start([config('a')]);
    await vi.advanceTimersByTimeAsync(0);
    const before = clients.length;

    await sup.reconcile([{ ...config('a'), command: 'a-different-binary' }]);
    await vi.advanceTimersByTimeAsync(0);

    expect(sup.status()[0]?.state).toBe('ready');
    expect(clients.length).toBeGreaterThan(before); // a fresh client for the replacement
  });

  it('feeds every state transition to deps.onStatus', async () => {
    const seen: string[] = [];
    const sup = new McpSupervisor({
      clientFactory: () => {
        const c = new FakeClient(`tool_${String(clients.length)}`);
        clients.push(c);
        return c;
      },
      transportFactory: () => stubTransport,
      onStatus: (s) => seen.push(s.state),
    });
    clients = [];
    sup.start([config('a')]);
    await vi.advanceTimersByTimeAsync(0);
    expect(seen).toContain('connecting');
    expect(seen).toContain('ready');
  });

  it('marks a server errored and schedules a reconnect when connect() itself rejects', async () => {
    class DeadClient extends FakeClient {
      override connect(): Promise<void> {
        return Promise.reject(new Error('spawn ENOENT'));
      }
    }
    const sup = new McpSupervisor({
      clientFactory: () => {
        const c = new DeadClient('t');
        clients.push(c);
        return c;
      },
      transportFactory: () => stubTransport,
    });
    clients = [];
    sup.start([config('a')]);
    await vi.advanceTimersByTimeAsync(0);
    expect(sup.status()[0]?.state).toBe('error');
    expect(sup.status()[0]?.error).toContain('ENOENT');
  });

  it('disconnects a connection that finished handshaking AFTER its server was removed (race)', async () => {
    let releaseConnect: () => void = () => undefined;
    let disconnected = false;
    class SlowClient extends FakeClient {
      override connect(): Promise<void> {
        return new Promise((r) => {
          releaseConnect = r;
        });
      }
      override close(): Promise<void> {
        disconnected = true;
        return Promise.resolve();
      }
    }
    const sup = new McpSupervisor({
      clientFactory: () => {
        const c = new SlowClient('t');
        clients.push(c);
        return c;
      },
      transportFactory: () => stubTransport,
    });
    clients = [];
    sup.start([config('a')]);
    await vi.advanceTimersByTimeAsync(0); // connectEntry is now awaiting connect()

    await sup.reconcile([]); // server removed → entry.removing = true, entry deleted
    releaseConnect(); // the handshake completes late
    await vi.advanceTimersByTimeAsync(0);

    expect(sup.status()).toHaveLength(0);
    expect(disconnected).toBe(true); // the orphaned connection was torn down, not left running
  });

  it('clears a pending reconnect timer when the server is removed before backoff elapses', async () => {
    const sup = makeSupervisor();
    sup.start([config('a')]);
    await vi.advanceTimersByTimeAsync(0);
    clients[0]?.onclose?.(); // drop → schedules a reconnect timer
    await vi.advanceTimersByTimeAsync(0);
    expect(sup.status()[0]?.state).toBe('error');

    await sup.reconcile([]); // remove before the 60s backoff — must clearTimeout the pending reconnect
    expect(sup.status()).toHaveLength(0);
    const clientsAfter = clients.length;
    await vi.advanceTimersByTimeAsync(120_000); // the cancelled timer must NOT fire
    expect(clients.length).toBe(clientsAfter);
  });
});
