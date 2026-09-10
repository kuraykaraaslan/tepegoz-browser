import { describe, it, expect, vi } from 'vitest';
import type { ChatAccount, ChatContact, ChatConversation, ChatMessage } from '@tepegoz/shared-types';
import { XMPP_CAPS } from '@tepegoz/chat-adapters';
import {
  ChatService,
  type ChatSecretStore,
  type ChatServiceDeps,
} from './chat-service';
import type { ChatRunnerStore } from './account-runner';

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

/** An event stream that never yields — the runner's pump just parks on it. */
const emptyChannel = (): AsyncIterable<unknown> => ({
  [Symbol.asyncIterator]: () => ({ next: () => new Promise<IteratorResult<unknown>>(() => undefined) }),
});

class FakeAdapter {
  readonly id = 'xmpp';
  readonly capabilities = XMPP_CAPS;
  connect = vi.fn(() => Promise.resolve({ accountId: 'x', caps: XMPP_CAPS }));
  disconnect = vi.fn(() => Promise.resolve());
  events = vi.fn(() => emptyChannel());
  sendMessage = vi.fn(() => Promise.resolve({ protocolId: 'srv-1', ts: 1 }));
  setPresence = vi.fn(() => Promise.resolve());
  markRead = vi.fn(() => Promise.resolve());
  history = vi.fn(() => Promise.resolve({ messages: [] as ChatMessage[], nextCursor: null }));
  roster = vi.fn(() => Promise.resolve([] as ChatContact[]));
  discoverRooms = vi.fn(() => Promise.resolve([]));
  joinRoom = vi.fn(() =>
    Promise.resolve({
      id: 'r@conf', accountId: 'a', kind: 'room' as const, address: 'r@conf', name: 'r', topic: '',
      memberCount: 0, unread: 0, mentions: 0, lastReadId: null, muted: false, notifyLevel: 'all' as const, isKnownContact: true, updatedAt: 1,
    }),
  );
}

class FakeStore implements ChatRunnerStore {
  upsertMessage(): void {}
  redactMessage(): void {}
  upsertConversation(): void {}
  upsertContact(): void {}
  getConversation(): ChatConversation | null {
    return null;
  }
}

function fakeSecrets(initial: Record<string, string> = {}): ChatSecretStore & { store: Map<string, string> } {
  const store = new Map(Object.entries(initial));
  return {
    store,
    get: (ref) => Promise.resolve(store.get(ref) ?? null),
    set: (ref, plain) => {
      store.set(ref, plain);
      return Promise.resolve();
    },
    delete: (ref) => {
      store.delete(ref);
      return Promise.resolve();
    },
  };
}

const account = (id: string, protocol: 'xmpp' | 'irc' = 'xmpp'): ChatAccount => ({
  id,
  label: id,
  displayName: id,
  server:
    protocol === 'xmpp'
      ? { protocol: 'xmpp', jid: `${id}@x.com`, host: null, port: null, security: 'tls', wsUrl: null }
      : { protocol: 'irc', server: 'irc.x', port: 6697, tls: true, nick: id, sasl: false },
  secretRef: `chat:${id}`,
  color: null,
  order: 0,
  updatedAt: 0,
  version: 1,
});

function harness(over: Partial<ChatServiceDeps> = {}) {
  const adapter = new FakeAdapter();
  let accounts: ChatAccount[] = over.loadAccounts?.() ?? [];
  const secrets = fakeSecrets({ 'chat:a': 's', 'chat:b': 's' });
  const emit = vi.fn();
  const deps: ChatServiceDeps = {
    loadAccounts: () => accounts,
    secrets,
    persistAccount: (a) => {
      accounts = [...accounts.filter((x) => x.id !== a.id), a];
    },
    deleteAccount: (id) => {
      accounts = accounts.filter((x) => x.id !== id);
    },
    makeRunnerStore: () => new FakeStore(),
    makeAdapter: () => adapter as never,
    transport: {} as never,
    mayEgress: () => true,
    now: () => 1,
    setTimer: (fn) => fn,
    clearTimer: () => undefined,
    emit,
    isEnabled: () => true,
    ...over,
  };
  return { service: new ChatService(deps), adapter, secrets, emit, setAccounts: (a: ChatAccount[]) => (accounts = a) };
}

describe('ChatService — lifecycle', () => {
  it('start() connects one runner per persisted account when enabled', async () => {
    const { service, adapter } = harness({ loadAccounts: () => [account('a'), account('b')] });
    await service.start();
    await tick();
    expect(adapter.connect).toHaveBeenCalledTimes(2);
    expect(Object.keys(service.accountStates())).toEqual(['a', 'b']);
  });

  it('start() does nothing while the extension is disabled', async () => {
    const { service, adapter } = harness({
      loadAccounts: () => [account('a')],
      isEnabled: () => false,
    });
    await service.start();
    expect(adapter.connect).not.toHaveBeenCalled();
  });

  it('an account with no stored secret emits an error and no runner', async () => {
    const { service, adapter, emit } = harness({ loadAccounts: () => [account('nosecret')] });
    await service.start();
    expect(adapter.connect).not.toHaveBeenCalled();
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: 'nosecret', state: 'error', detail: 'no stored credential' }),
    );
  });

  it('setEnabled toggles every runner off then back on', async () => {
    const { service, adapter } = harness({ loadAccounts: () => [account('a')] });
    await service.start();
    await service.setEnabled(false);
    expect(adapter.disconnect).toHaveBeenCalled();
    expect(service.accountStates()).toEqual({});
    await service.setEnabled(true);
    await tick();
    expect(adapter.connect).toHaveBeenCalledTimes(2);
  });

  it('stop() halts everything', async () => {
    const { service, adapter } = harness({ loadAccounts: () => [account('a'), account('b')] });
    await service.start();
    await service.stop();
    expect(adapter.disconnect).toHaveBeenCalledTimes(2);
    expect(service.accountStates()).toEqual({});
  });
});

describe('ChatService — accounts', () => {
  it('addAccount stores the secret, persists the row, and connects it', async () => {
    const { service, adapter, secrets } = harness();
    await service.start();
    await service.addAccount(account('new'), 'hunter2');
    await tick();
    expect(secrets.store.get('chat:new')).toBe('hunter2');
    expect(adapter.connect).toHaveBeenCalled();
    expect(service.accountStates()).toHaveProperty('new');
  });

  it('removeAccount stops the runner and drops the secret + row', async () => {
    const acc = account('a');
    const { service, adapter, secrets, setAccounts } = harness();
    setAccounts([acc]);
    await service.start();
    await service.removeAccount('a');
    expect(adapter.disconnect).toHaveBeenCalled();
    expect(secrets.store.has('chat:a')).toBe(false);
    expect(service.accountStates()).toEqual({});
  });
});

describe('ChatService — delegation', () => {
  async function ready() {
    const h = harness({ loadAccounts: () => [account('a')] });
    await h.service.start();
    await tick();
    return h;
  }

  it('routes actions to the named account', async () => {
    const { service, adapter } = await ready();
    await service.sendMessage('a', 'bob@x.com', { body: 'hi' });
    expect(adapter.sendMessage).toHaveBeenCalled();
    await service.setPresence('a', 'away');
    await service.roster('a');
    await service.history('a', 'bob@x.com', null);
    await service.discoverRooms('a', 'conf.example');
    await service.joinRoom('a', 'general@conf.example');
    await service.setRoomNotifyLevel('a', 'room@conf', 'none');
    expect(adapter.setPresence).toHaveBeenCalled();
    expect(adapter.roster).toHaveBeenCalled();
    expect(adapter.history).toHaveBeenCalled();
    expect(adapter.discoverRooms).toHaveBeenCalledWith(expect.anything(), 'conf.example');
    expect(adapter.joinRoom).toHaveBeenCalledWith(expect.anything(), 'general@conf.example');
  });

  it('throws 409 for an unknown / disconnected account', async () => {
    const { service } = await ready();
    await expect(service.sendMessage('ghost', 'c', { body: 'x' })).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it('notifyEgressChange reaches the runners without throwing', async () => {
    const { service } = await ready();
    expect(() => service.notifyEgressChange()).not.toThrow();
  });

  it('X-chat.10: losing egress fans the kill-switch out — every account goes "blocked"', async () => {
    let egress = true;
    const h = harness({
      loadAccounts: () => [account('a'), account('b')],
      mayEgress: () => egress,
    });
    await h.service.start();
    await tick();
    expect(Object.values(h.service.accountStates())).toEqual(['online', 'online']);

    egress = false;
    h.service.notifyEgressChange();
    await tick();
    expect(Object.values(h.service.accountStates())).toEqual(['blocked', 'blocked']);

    egress = true;
    h.service.notifyEgressChange();
    await tick();
    expect(Object.values(h.service.accountStates())).toEqual(['online', 'online']);
  });
});

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
