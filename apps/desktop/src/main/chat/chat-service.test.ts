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
  inviteToRoom = vi.fn(() => Promise.resolve());
  addContact = vi.fn(() => Promise.resolve());
}

class FakeStore implements ChatRunnerStore {
  upsertMessage(): void {}
  redactMessage(): void {}
  upsertConversation(): void {}
  upsertContact(): void {}
  getConversation(): ChatConversation | null {
    return null;
  }
  listMessages(): [] {
    return [];
  }
  listRoomIds(): [] {
    return [];
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
  const audit = vi.fn();
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
    audit,
    isEnabled: () => true,
    ...over,
  };
  return { service: new ChatService(deps), adapter, secrets, emit, audit, setAccounts: (a: ChatAccount[]) => (accounts = a) };
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

  it('X-chat.10: a profile switch drops every connection; the next profile sees only its own accounts', async () => {
    // A profile switch is a process swap (ADR-0045 process-per-profile): the outgoing process runs
    // `before-quit` → `ChatMessenger.stop()` → this `stop()`, and the incoming process is a fresh
    // `ChatService` whose `loadAccounts` is scoped to that profile's own SQLite file.
    const outgoing = harness({ loadAccounts: () => [account('a'), account('b')] });
    await outgoing.service.start();
    await tick();
    expect(Object.keys(outgoing.service.accountStates())).toEqual(['a', 'b']);

    await outgoing.service.stop();
    expect(outgoing.adapter.disconnect).toHaveBeenCalledTimes(2);
    expect(outgoing.service.accountStates()).toEqual({});
    outgoing.emit.mockClear();
    outgoing.service.notifyEgressChange(); // nothing left to fan to
    expect(outgoing.emit).not.toHaveBeenCalled();
    await outgoing.service.stop(); // idempotent

    // The next profile's service only ever knows what its own `loadAccounts` returns.
    const incoming = harness({ loadAccounts: () => [account('a')] });
    await incoming.service.start();
    await tick();
    expect(Object.keys(incoming.service.accountStates())).toEqual(['a']);
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

  it('X-chat.10: the "account added" audit fact carries no secret', async () => {
    const { service, audit } = harness();
    await service.start();
    await service.addAccount(account('new'), 'hunter2-the-vault-secret');
    expect(audit).toHaveBeenCalledTimes(1);
    const event = audit.mock.calls[0]?.[0] as { kind: string; accountId: string; protocol: string };
    expect(JSON.stringify(event)).not.toContain('hunter2-the-vault-secret');
    expect(event).toMatchObject({ kind: 'account-added', accountId: 'new', protocol: 'xmpp' });
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
    await service.inviteToRoom('a', 'general@conf.example', 'carol@x.com');
    expect(adapter.inviteToRoom).toHaveBeenCalledWith(expect.anything(), 'general@conf.example', 'carol@x.com');
    await service.addContact('a', 'bob@x.com');
    expect(adapter.addContact).toHaveBeenCalledWith(expect.anything(), 'bob@x.com');
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
