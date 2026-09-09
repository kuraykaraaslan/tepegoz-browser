import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `chat-service.electron.ts` — the process singleton + the `ChatIpcService` the `chat:*` handlers
 * delegate to. The tested logic (fold, lifecycle, store, secrets) lives in the sibling concern
 * modules; here we pin the composition: db-absent read fallbacks, the "not initialised" guard, the
 * kill-switch derivation from the egress route, and the broadcast to every chrome window.
 */

const getDb = vi.hoisted(() => vi.fn((): unknown => ({ tag: 'db' })));
vi.mock('../db/database.electron', () => ({ getDb }));

const route = vi.hoisted(
  (): { current: { mode: string; socksPort?: number } } => ({ current: { mode: 'direct' } }),
);
vi.mock('@tepegoz/http', () => ({ currentEgressRoute: () => route.current }));

const win = vi.hoisted(() => ({ isDestroyed: () => false, webContents: { send: vi.fn() } }));
const deadWin = vi.hoisted(() => ({ isDestroyed: () => true, webContents: { send: vi.fn() } }));
vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [win, deadWin] },
}));

vi.mock('@tepegoz/chat-transport-node', () => ({ NodeChatTransport: vi.fn(() => ({})) }));
vi.mock('./egress-dialer', () => ({ createChatDialer: () => vi.fn() }));
vi.mock('./chat-secrets.electron', () => ({ default: { get: vi.fn(), set: vi.fn(), delete: vi.fn() } }));

const store = vi.hoisted(() => ({
  listAccounts: vi.fn(() => []),
  listAccountSummaries: vi.fn(() => [{ id: 'a' }]),
  listConversations: vi.fn(() => [{ id: 'c' }]),
  listContacts: vi.fn(() => [{ id: 'k' }]),
  makeRunnerStore: vi.fn(),
  upsertAccount: vi.fn(),
  deleteAccount: vi.fn(),
}));
vi.mock('./chat-store-adapter', () => store);

const prefs = vi.hoisted(() => ({ default: { getAll: () => ({ extensions: {} }) } }));
vi.mock('@tepegoz/preferences', () => prefs);
vi.mock('@tepegoz/desktop-ipc', async (orig) => ({
  ...(await orig<typeof import('@tepegoz/desktop-ipc')>()),
  isExtensionEnabled: vi.fn(() => true),
}));

type Deps = import('./chat-service').ChatServiceDeps;
const captured = vi.hoisted(() => ({ deps: null as Deps | null }));
vi.mock('./chat-service', () => ({
  ChatService: vi.fn((deps: Deps) => {
    captured.deps = deps;
    return {
      start: vi.fn(() => Promise.resolve()),
      stop: vi.fn(() => Promise.resolve()),
      setEnabled: vi.fn(() => Promise.resolve()),
      notifyEgressChange: vi.fn(),
      accountStates: vi.fn(() => ({})),
    };
  }),
}));

const mod = await import('./chat-service.electron');

const fakeService = {
  start: vi.fn(() => Promise.resolve()),
  stop: vi.fn(() => Promise.resolve()),
  setEnabled: vi.fn(() => Promise.resolve()),
  notifyEgressChange: vi.fn(),
  accountStates: vi.fn(() => ({ a: 'online' })),
  addAccount: vi.fn(() => Promise.resolve()),
  removeAccount: vi.fn(() => Promise.resolve()),
  history: vi.fn(() => Promise.resolve({ messages: [], nextCursor: null })),
  sendMessage: vi.fn(() => Promise.resolve('srv-1')),
  setPresence: vi.fn(() => Promise.resolve()),
  markRead: vi.fn(() => Promise.resolve()),
  discoverRooms: vi.fn(() => Promise.resolve([])),
  joinRoom: vi.fn(() => Promise.resolve()),
};

beforeEach(() => {
  vi.clearAllMocks();
  getDb.mockReturnValue({ tag: 'db' });
  route.current = { mode: 'direct' };
  mod.__setServiceForTest(null);
});

describe('buildChatService', () => {
  it('constructs without touching IO', () => {
    expect(() => mod.buildChatService()).not.toThrow();
  });

  it('wires the process singletons through to the ChatService deps', () => {
    mod.buildChatService();
    const deps = captured.deps;
    expect(deps).not.toBeNull();
    if (deps === null) return;

    // the DB-backed adapters are reached through the store mock
    deps.loadAccounts();
    expect(store.listAccounts).toHaveBeenCalledWith({ tag: 'db' });
    deps.persistAccount({ id: 'a' } as never);
    expect(store.upsertAccount).toHaveBeenCalledWith({ tag: 'db' }, { id: 'a' });
    deps.deleteAccount('a');
    expect(store.deleteAccount).toHaveBeenCalledWith({ tag: 'db' }, 'a');
    deps.makeRunnerStore();
    expect(store.makeRunnerStore).toHaveBeenCalledWith({ tag: 'db' });

    // db absent → loadAccounts is empty, not a throw
    getDb.mockReturnValue(null);
    expect(deps.loadAccounts()).toEqual([]);
    getDb.mockReturnValue({ tag: 'db' });

    // the timer + clock lambdas are real
    expect(typeof deps.now()).toBe('number');
    const handle = deps.setTimer(() => {}, 0);
    expect(() => deps.clearTimer(handle)).not.toThrow();
  });
});

describe('helpers', () => {
  it('chatMayEgress: true for direct, true for a live tunnel, false for a dead one', () => {
    route.current = { mode: 'direct' };
    expect(mod.chatMayEgress()).toBe(true);
    route.current = { mode: 'tunnel', socksPort: 41080 };
    expect(mod.chatMayEgress()).toBe(true);
    route.current = { mode: 'tunnel', socksPort: 0 };
    expect(mod.chatMayEgress()).toBe(false);
  });

  it('chatExtensionEnabled reads the preference', () => {
    expect(mod.chatExtensionEnabled()).toBe(true);
  });

  it('broadcastChatEvent sends chat:state to every live window', () => {
    mod.broadcastChatEvent({ kind: 'state', accountId: 'a', state: 'online' });
    expect(win.webContents.send).toHaveBeenCalledWith('chat:state', {
      kind: 'state',
      accountId: 'a',
      state: 'online',
    });
    expect(deadWin.webContents.send).not.toHaveBeenCalled();
  });
});

describe('chatIpcService — db-absent fallbacks', () => {
  it('reads return empty when the profile DB is not open', () => {
    getDb.mockReturnValue(null);
    expect(mod.chatIpcService.listAccounts()).toEqual([]);
    expect(mod.chatIpcService.listConversations()).toEqual([]);
    expect(mod.chatIpcService.getRoster('a')).toEqual([]);
    expect(mod.chatIpcService.accountStates()).toEqual({});
  });

  it('reads hit the store when the DB is open', () => {
    expect(mod.chatIpcService.listAccounts()).toEqual([{ id: 'a' }]);
    expect(mod.chatIpcService.listConversations('a')).toEqual([{ id: 'c' }]);
    expect(store.listConversations).toHaveBeenCalledWith({ tag: 'db' }, 'a');
    expect(mod.chatIpcService.getRoster('a')).toEqual([{ id: 'k' }]);
  });
});

describe('chatIpcService — the "not initialised" guard', () => {
  it('actions throw before init() (the async IPC boundary catches this in production)', () => {
    expect(() => mod.chatIpcService.sendMessage('a', 'c', { body: 'x' })).toThrow(/not initialised/);
    expect(() => mod.chatIpcService.markRead('a', 'c', 'm1')).toThrow(/not initialised/);
    expect(() => mod.chatIpcService.getHistory('a', 'c', null)).toThrow(/not initialised/);
  });

  it('every action delegates once a service is set', async () => {
    mod.__setServiceForTest(fakeService as never);
    expect(await mod.chatIpcService.sendMessage('a', 'c', { body: 'x' })).toBe('srv-1');
    await mod.chatIpcService.markRead('a', 'c', 'm1');
    expect(fakeService.markRead).toHaveBeenCalledWith('a', 'c', 'm1');
    await mod.chatIpcService.addAccount('a', 'pw', { id: 'a' });
    expect(fakeService.addAccount).toHaveBeenCalledWith({ id: 'a' }, 'pw');
    await mod.chatIpcService.removeAccount('a');
    expect(fakeService.removeAccount).toHaveBeenCalledWith('a');
    await mod.chatIpcService.getHistory('a', 'c', 'cur');
    expect(fakeService.history).toHaveBeenCalledWith('a', 'c', 'cur');
    await mod.chatIpcService.setPresence('a', 'dnd', 'busy');
    expect(fakeService.setPresence).toHaveBeenCalledWith('a', 'dnd', 'busy');
    await mod.chatIpcService.discoverRooms('a', 'conf.example');
    expect(fakeService.discoverRooms).toHaveBeenCalledWith('a', 'conf.example');
    await mod.chatIpcService.joinRoom('a', 'room@conf.example');
    expect(fakeService.joinRoom).toHaveBeenCalledWith('a', 'room@conf.example');
    expect(mod.chatIpcService.accountStates()).toEqual({ a: 'online' });
    // reads still hit the store, not the service
    expect(mod.chatIpcService.getRoster('a')).toEqual([{ id: 'k' }]);
  });
});

describe('lifecycle', () => {
  it('init() builds + starts once; stop() clears; reconcile/notifyEgressChange delegate', async () => {
    await mod.init();
    await mod.init(); // idempotent
    await mod.stop();
    await mod.stop();

    mod.__setServiceForTest(fakeService as never);
    await mod.reconcile();
    expect(fakeService.setEnabled).toHaveBeenCalledWith(true); // isExtensionEnabled mock → true
    mod.notifyEgressChange();
    expect(fakeService.notifyEgressChange).toHaveBeenCalled();

    // the default-export facade forwards to the same module functions
    mod.__setServiceForTest(fakeService as never);
    await mod.default.init(); // no-op: a service is already set
    await mod.default.reconcile();
    mod.default.notifyEgressChange();
    await mod.default.stop();
    expect(fakeService.stop).toHaveBeenCalled();
  });
});
