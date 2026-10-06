import { describe, it, expect, vi } from 'vitest';
import type { ChatAccount } from '@tepegoz/shared-types';
import { ChatService } from './chat-service';
import { tick, FakeStore, fakeSecrets, account } from './chat-service.test-kit';

describe('ChatService — default adapter selection', () => {
  it('refuses an unimplemented protocol with an error state and no runner', async () => {
    const emit = vi.fn();
    const secrets = fakeSecrets({ 'chat:br-acc': 's' });
    const brAccount: ChatAccount = {
      ...account('br-acc'),
      server: { protocol: 'bridge', bridgeId: 'telegram', config: {} },
    };
    const service = new ChatService({
      loadAccounts: () => [brAccount],
      secrets,
      persistAccount: () => undefined,
      deleteAccount: () => undefined,
      makeRunnerStore: () => new FakeStore(),
      transport: {} as never,
      mayEgress: () => true,
      now: () => 1,
      setTimer: (fn) => fn,
      clearTimer: () => undefined,
      emit,
      isEnabled: () => true,
    });
    await service.start();
    expect(service.accountStates()).toEqual({});
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: 'br-acc', state: 'error' }),
    );
  });

  it('builds a SubprocessChatAdapter for a bridge account once resolveBridge finds a match', async () => {
    const secrets = fakeSecrets({ 'chat:br-acc': 's' });
    const brAccount: ChatAccount = {
      ...account('br-acc'),
      server: { protocol: 'bridge', bridgeId: 'echo', config: {} },
    };
    const writes: string[] = [];
    let exitHandler: ((code: number | null, signal: NodeJS.Signals | null) => void) | undefined;
    const fakeChild = {
      stdin: { write: (chunk: string) => writes.push(chunk) },
      stdout: {
        on: (event: 'data', cb: (chunk: string) => void) => {
          if (event !== 'data') return;
          // Reply to the adapter's readiness "connect" RPC on the next microtask, so the request has
          // already been written to `writes` before the fake child "answers" it.
          queueMicrotask(() => {
            const req = JSON.parse(writes[0]!) as { id: string };
            cb(`${JSON.stringify({ id: req.id, result: {} })}\n`);
          });
        },
      },
      stderr: { on: () => undefined },
      on: (event: 'exit' | 'error', cb: never) => {
        if (event === 'exit') exitHandler = cb;
      },
      kill: () => exitHandler?.(null, 'SIGTERM'),
    };
    const spawnBridge = vi.fn(() => fakeChild as never);
    const service = new ChatService({
      loadAccounts: () => [brAccount],
      secrets,
      persistAccount: () => undefined,
      deleteAccount: () => undefined,
      makeRunnerStore: () => new FakeStore(),
      transport: {} as never,
      mayEgress: () => true,
      now: () => 1,
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
      emit: vi.fn(),
      isEnabled: () => true,
      resolveBridge: (bridgeId) =>
        bridgeId === 'echo' ? { command: 'node', args: ['echo-bridge.js'] } : null,
      spawnBridge,
      bridgeStateDirFor: (accountId) => `/state/${accountId}`,
    });
    await service.start();
    await tick();
    expect(spawnBridge).toHaveBeenCalledWith(
      'node',
      ['echo-bridge.js'],
      expect.any(Object),
      '/state/br-acc',
    );
    expect(service.accountStates()).toHaveProperty('br-acc');
    expect(service.accountStates()['br-acc']).not.toBe('error');
  });

  it('builds a real MatrixAdapter for a matrix account', async () => {
    const secrets = fakeSecrets({ 'chat:mx-acc': 's' });
    const mxAccount: ChatAccount = {
      ...account('mx-acc'),
      server: { protocol: 'matrix', homeserverUrl: 'https://m.example', userId: '@a:m.example' },
    };
    const service = new ChatService({
      loadAccounts: () => [mxAccount],
      secrets,
      persistAccount: () => undefined,
      deleteAccount: () => undefined,
      makeRunnerStore: () => new FakeStore(),
      transport: { fetch: () => new Promise(() => undefined) } as never,
      mayEgress: () => true,
      now: () => 1,
      setTimer: (fn) => fn,
      clearTimer: () => undefined,
      emit: vi.fn(),
      isEnabled: () => true,
    });
    await service.start();
    await tick();
    expect(service.accountStates()).toHaveProperty('mx-acc');
  });

  it('builds a real IrcAdapter for an irc account', async () => {
    const secrets = fakeSecrets({ 'chat:irc-acc': 's' });
    const service = new ChatService({
      loadAccounts: () => [account('irc-acc', 'irc')],
      secrets,
      persistAccount: () => undefined,
      deleteAccount: () => undefined,
      makeRunnerStore: () => new FakeStore(),
      transport: { openTCP: () => new Promise(() => undefined) } as never,
      mayEgress: () => true,
      now: () => 1,
      setTimer: (fn) => fn,
      clearTimer: () => undefined,
      emit: vi.fn(),
      isEnabled: () => true,
    });
    await service.start();
    await tick();
    expect(service.accountStates()).toHaveProperty('irc-acc');
  });

  it('builds a real XmppAdapter when none is injected', async () => {
    const secrets = fakeSecrets({ 'chat:a': 's' });
    const service = new ChatService({
      loadAccounts: () => [account('a')],
      secrets,
      persistAccount: () => undefined,
      deleteAccount: () => undefined,
      makeRunnerStore: () => new FakeStore(),
      transport: {
        openTCP: () => new Promise(() => undefined), // never resolves -> connect parks
        upgradeTLS: () => new Promise(() => undefined),
        openWebSocket: () => new Promise(() => undefined),
        fetch: () => new Promise(() => undefined),
        openEventStream: () => new Promise(() => undefined),
      } as never,
      mayEgress: () => true,
      now: () => 1,
      setTimer: (fn) => fn,
      clearTimer: () => undefined,
      emit: vi.fn(),
      isEnabled: () => true,
    });
    await service.start();
    expect(service.accountStates()).toHaveProperty('a', 'connecting');
  });
});
