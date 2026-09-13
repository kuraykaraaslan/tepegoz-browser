import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChildProcessLike, SpawnFn } from '@tepegoz/adapter-subprocess';
import { BRIDGE_DEFAULT_CAPS } from '../caps';
import { SubprocessChatAdapter, type SubprocessChatAdapterConfig } from './subprocess-adapter';
import type { ChatAccountCreds, ChatSession } from '../adapter';

type Handler<T extends unknown[]> = (...args: T) => void;

/** Same fake-child shape as `@tepegoz/adapter-subprocess`'s own tests — no real OS process, full
 *  manual control over stdout/exit timing. */
class FakeChild implements ChildProcessLike {
  readonly writes: string[] = [];
  readonly stdin = { write: (chunk: string) => this.writes.push(chunk) };
  private readonly stdoutHandlers: Handler<[Buffer | string]>[] = [];
  private readonly exitHandlers: Handler<[number | null, NodeJS.Signals | null]>[] = [];
  private readonly errorHandlers: Handler<[Error]>[] = [];

  readonly stdout = {
    on: (event: 'data', cb: Handler<[Buffer | string]>) => {
      if (event === 'data') this.stdoutHandlers.push(cb);
    },
  };
  readonly stderr = { on: () => undefined };

  on(event: 'exit' | 'error', cb: never): void {
    if (event === 'exit') this.exitHandlers.push(cb);
    else this.errorHandlers.push(cb);
  }

  kill(): void {
    for (const h of this.exitHandlers) h(null, 'SIGTERM');
  }

  emitStdout(chunk: string): void {
    for (const h of this.stdoutHandlers) h(chunk);
  }
}

function sendFrame(child: FakeChild, frame: Record<string, unknown>): void {
  child.emitStdout(`${JSON.stringify(frame)}\n`);
}

function lastRequest(child: FakeChild): { id: string; method: string; params: unknown } {
  const last = child.writes.at(-1);
  if (last === undefined) throw new Error('no request sent yet');
  return JSON.parse(last) as { id: string; method: string; params: unknown };
}

/** Answers the most recent request on `child` with `result`, once it matches `method`. */
function reply(child: FakeChild, method: string, result: unknown): void {
  const req = lastRequest(child);
  expect(req.method).toBe(method);
  sendFrame(child, { id: req.id, result });
}

describe('SubprocessChatAdapter', () => {
  let children: FakeChild[];
  let spawn: SpawnFn;
  let session: ChatSession;
  let creds: ChatAccountCreds;

  beforeEach(() => {
    vi.useFakeTimers();
    children = [];
    spawn = vi.fn(() => {
      const child = new FakeChild();
      children.push(child);
      return child;
    });
    session = { accountId: 'acc-1', caps: BRIDGE_DEFAULT_CAPS };
    creds = { accountId: 'acc-1', server: { protocol: 'bridge', bridgeId: 'echo', config: {} }, secret: 's3cr3t' };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function make(overrides: Partial<SubprocessChatAdapterConfig> = {}): SubprocessChatAdapter {
    return new SubprocessChatAdapter({
      spawn,
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
      id: 'bridge:echo',
      capabilities: BRIDGE_DEFAULT_CAPS,
      command: 'node',
      stateDirFor: (accountId) => `/state/${accountId}`,
      ...overrides,
    });
  }

  async function connected(adapter: SubprocessChatAdapter): Promise<FakeChild> {
    const promise = adapter.connect(creds);
    const child = children.at(-1)!;
    reply(child, 'connect', {});
    await promise;
    return child;
  }

  it('connect() spawns with the account state dir as cwd and the secret in env, then round-trips a connect RPC', async () => {
    const adapter = make();
    const promise = adapter.connect(creds);
    expect(spawn).toHaveBeenCalledWith(
      'node',
      [],
      { TEPEGOZ_BRIDGE_ACCOUNT_ID: 'acc-1', TEPEGOZ_BRIDGE_SECRET: 's3cr3t' },
      '/state/acc-1',
    );
    const child = children[0]!;
    const req = lastRequest(child);
    expect(req.method).toBe('connect');
    reply(child, 'connect', {});
    const result = await promise;
    expect(result).toEqual({ accountId: 'acc-1', caps: BRIDGE_DEFAULT_CAPS });
  });

  it('roster() validates the response against ChatContactSchema and fills in defaulted fields', async () => {
    const adapter = make();
    const child = await connected(adapter);
    const promise = adapter.roster(session);
    reply(child, 'roster', [{ id: 'c1', accountId: 'acc-1', address: 'a@b', name: 'A' }]);
    const contacts = await promise;
    expect(contacts).toHaveLength(1);
    expect(contacts[0]).toMatchObject({ address: 'a@b', name: 'A', presence: 'offline' });
  });

  it('sendMessage() rejects when the child returns a shape that fails SendReceiptSchema', async () => {
    const adapter = make();
    const child = await connected(adapter);
    const promise = adapter.sendMessage(session, 'conv-1', { kind: 'text', text: 'hi' });
    const req = lastRequest(child);
    sendFrame(child, { id: req.id, result: { protocolId: '' } });
    await expect(promise).rejects.toThrow();
  });

  it('sendMessage() resolves a valid SendReceipt', async () => {
    const adapter = make();
    const child = await connected(adapter);
    const promise = adapter.sendMessage(session, 'conv-1', { kind: 'text', text: 'hi' });
    reply(child, 'sendMessage', { protocolId: 'p1', ts: 123 });
    await expect(promise).resolves.toEqual({ protocolId: 'p1', ts: 123 });
  });

  it('calling a method before connect() throws rather than silently no-oping', () => {
    const adapter = make();
    expect(() => adapter.roster(session)).toThrow(/no live subprocess/);
  });

  it('disconnect() stops the supervisor and a subsequent call throws', async () => {
    const adapter = make();
    await connected(adapter);
    await adapter.disconnect(session);
    expect(() => adapter.roster(session)).toThrow(/no live subprocess/);
  });

  it('events() yields the raw params of every event frame, unvalidated', async () => {
    const adapter = make();
    const child = await connected(adapter);
    const iterator = adapter.events(session)[Symbol.asyncIterator]();
    const next = iterator.next();
    sendFrame(child, { event: 'message', params: { anything: 'goes', missing: undefined } });
    const result = await next;
    expect(result.done).toBe(false);
    expect(result.value).toEqual({ anything: 'goes' });
  });

  it('joinRoom() round-trips through ChatConversationSchema', async () => {
    const adapter = make();
    const child = await connected(adapter);
    const promise = adapter.joinRoom(session, '#room@service');
    const req = lastRequest(child);
    expect(req.params).toEqual({ address: '#room@service' });
    reply(child, 'joinRoom', {
      id: 'conv-1',
      accountId: 'acc-1',
      kind: 'room',
      address: '#room@service',
      name: 'Room',
      updatedAt: 0,
    });
    const conv = await promise;
    expect(conv).toMatchObject({ id: 'conv-1', kind: 'room', name: 'Room' });
  });
});
