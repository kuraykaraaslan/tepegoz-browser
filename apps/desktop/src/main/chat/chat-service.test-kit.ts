import { vi } from 'vitest';
import type {
  ChatAccount,
  ChatContact,
  ChatConversation,
  ChatMessage,
} from '@tepegoz/shared-types';
import { XMPP_CAPS } from '@tepegoz/chat-adapters';
import { ChatService, type ChatSecretStore, type ChatServiceDeps } from './chat-service';
import type { ChatRunnerStore } from './account-runner';

export const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

/** An event stream that never yields — the runner's pump just parks on it. */
export const emptyChannel = (): AsyncIterable<unknown> => ({
  [Symbol.asyncIterator]: () => ({
    next: () => new Promise<IteratorResult<unknown>>(() => undefined),
  }),
});

export class FakeAdapter {
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
      id: 'r@conf',
      accountId: 'a',
      kind: 'room' as const,
      address: 'r@conf',
      name: 'r',
      topic: '',
      memberCount: 0,
      unread: 0,
      mentions: 0,
      lastReadId: null,
      muted: false,
      notifyLevel: 'all' as const,
      isKnownContact: true,
      updatedAt: 1,
    }),
  );
  inviteToRoom = vi.fn(() => Promise.resolve());
  addContact = vi.fn(() => Promise.resolve());
  removeContact = vi.fn(() => Promise.resolve());
}

export class FakeStore implements ChatRunnerStore {
  upsertMessage(): void {}
  redactMessage(): void {}
  upsertConversation(): void {}
  upsertContact(): void {}
  setContactBlocked(): void {}
  getConversation(): ChatConversation | null {
    return null;
  }
  listMessages(): [] {
    return [];
  }
  listRoomIds(): [] {
    return [];
  }
  listReadMarkers(): [] {
    return [];
  }
}

export function fakeSecrets(
  initial: Record<string, string> = {},
): ChatSecretStore & { store: Map<string, string> } {
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

export const account = (id: string, protocol: 'xmpp' | 'irc' = 'xmpp'): ChatAccount => ({
  id,
  label: id,
  displayName: id,
  server:
    protocol === 'xmpp'
      ? {
          protocol: 'xmpp',
          jid: `${id}@x.com`,
          host: null,
          port: null,
          security: 'tls',
          wsUrl: null,
        }
      : { protocol: 'irc', server: 'irc.x', port: 6697, tls: true, nick: id, sasl: false },
  secretRef: `chat:${id}`,
  color: null,
  order: 0,
  updatedAt: 0,
  version: 1,
});

export function harness(over: Partial<ChatServiceDeps> = {}) {
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
  return {
    service: new ChatService(deps),
    adapter,
    secrets,
    emit,
    audit,
    setAccounts: (a: ChatAccount[]) => (accounts = a),
  };
}
