import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IpcChannels } from '@tepegoz/desktop-ipc';

/**
 * `ipc-chat.ts` — the messenger IPC surface. Nine delegation handlers; the tests pin that every
 * payload is schema-checked before it reaches the service (a bad id / an over-long secret / a huge
 * body all throw with no service call), that the send/history results are shaped, and that an
 * untrusted frame reaches nothing.
 */

const h = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, payload: unknown) => unknown>(),
}));
vi.mock('electron', () => ({
  ipcMain: {
    handle: (c: string, fn: (e: unknown, p: unknown) => unknown) => h.handlers.set(c, fn),
    on: () => undefined,
    removeHandler: () => undefined,
  },
  BrowserWindow: { fromWebContents: () => ({ id: 'win' }) },
}));

const TRUSTED = 'app://tepegoz/chrome.html';
vi.mock('../lib/trusted-origin', () => ({ isTrustedAppUrl: (u: string) => u === TRUSTED }));
vi.mock('../lib/i18n-main', () => ({ mainStrings: () => ({ errors: { forbidden: 'forbidden' } }) }));

const { registerChatIpc } = await import('./ipc-chat');

const svc = {
  listAccounts: vi.fn(() => [
    { id: 'a', label: 'A', displayName: 'Ada', protocol: 'xmpp', color: null, order: 0 },
  ]),
  accountStates: vi.fn(() => ({ a: 'online' })),
  addAccount: vi.fn(() => Promise.resolve()),
  removeAccount: vi.fn(() => Promise.resolve()),
  listConversations: vi.fn(() => []),
  getRoster: vi.fn(() => []),
  getHistory: vi.fn(() => Promise.resolve({ messages: [], nextCursor: null })),
  sendMessage: vi.fn(() => Promise.resolve('srv-1')),
  setPresence: vi.fn(() => Promise.resolve()),
  markRead: vi.fn(() => Promise.resolve()),
  discoverRooms: vi.fn(() => Promise.resolve([])),
  joinRoom: vi.fn(() => Promise.resolve()),
  setRoomNotifyLevel: vi.fn(() => Promise.resolve()),
  setMuted: vi.fn(() => Promise.resolve()),
  setRoomTopic: vi.fn(() => Promise.resolve()),
  resolveMedia: vi.fn(() => Promise.resolve({ dataUrl: 'data:image/png;base64,AAAA' })),
};

const ev = { senderFrame: { url: TRUSTED }, sender: {} };
const evil = { senderFrame: { url: 'https://evil.example/' }, sender: {} };
const call = (channel: string, payload?: unknown): unknown => h.handlers.get(channel)?.(ev, payload);

const account = {
  id: 'work',
  label: 'Work',
  server: { protocol: 'xmpp', jid: 'ada@example.com' },
  secretRef: 'chat:work',
  updatedAt: 1,
  version: 1,
};

beforeEach(() => {
  h.handlers.clear();
  Object.values(svc).forEach((f) => f.mockClear());
  registerChatIpc(svc);
});

it('registers every chat channel', () => {
  expect(h.handlers.size).toBe(15);
});

describe('rooms', () => {
  it('chat:discover-rooms validates + delegates', async () => {
    await call(IpcChannels.chatDiscoverRooms, { accountId: 'work', service: 'conf.example' });
    expect(svc.discoverRooms).toHaveBeenCalledWith('work', 'conf.example');
    await expect(call(IpcChannels.chatDiscoverRooms, { accountId: 'work' })).rejects.toBeDefined();
  });

  it('chat:join-room validates + delegates', async () => {
    await call(IpcChannels.chatJoinRoom, { accountId: 'work', roomJid: 'general@conf.example' });
    expect(svc.joinRoom).toHaveBeenCalledWith('work', 'general@conf.example');
    await expect(call(IpcChannels.chatJoinRoom, { accountId: 'work', roomJid: 'x' })).rejects.toBeDefined();
  });

  it('chat:set-room-notify-level validates the enum + delegates', async () => {
    await call(IpcChannels.chatSetRoomNotifyLevel, {
      accountId: 'work',
      conversationId: 'room@conf',
      level: 'mentions',
    });
    expect(svc.setRoomNotifyLevel).toHaveBeenCalledWith('work', 'room@conf', 'mentions');
    await expect(
      call(IpcChannels.chatSetRoomNotifyLevel, {
        accountId: 'work',
        conversationId: 'room@conf',
        level: 'loud',
      }),
    ).rejects.toBeDefined();
  });
});

describe('media', () => {
  it('chat:resolve-media validates + delegates + returns the data url', async () => {
    const out = await call(IpcChannels.chatResolveMedia, { accountId: 'work', mediaRef: 'mxc://s/abc' });
    expect(svc.resolveMedia).toHaveBeenCalledWith('work', 'mxc://s/abc');
    expect(out).toEqual({ dataUrl: 'data:image/png;base64,AAAA' });
    await expect(call(IpcChannels.chatResolveMedia, { accountId: 'work' })).rejects.toBeDefined();
  });
});

describe('reads', () => {
  it('chat:list-accounts returns accounts + states', () => {
    expect(call(IpcChannels.chatListAccounts)).toEqual({
      accounts: svc.listAccounts(),
      states: { a: 'online' },
    });
  });

  it('chat:list-conversations passes an optional account id through', () => {
    call(IpcChannels.chatListConversations, 'a');
    expect(svc.listConversations).toHaveBeenCalledWith('a');
    call(IpcChannels.chatListConversations);
    expect(svc.listConversations).toHaveBeenLastCalledWith(undefined);
  });

  it('chat:get-roster requires an account id', () => {
    expect(() => call(IpcChannels.chatGetRoster, { accountId: '' })).toThrow();
    call(IpcChannels.chatGetRoster, { accountId: 'a' });
    expect(svc.getRoster).toHaveBeenCalledWith('a');
  });
});

describe('validation gates the service', () => {
  it('chat:add-account rejects an over-long secret and a bad account, before the service', async () => {
    await expect(call(IpcChannels.chatAddAccount, { account, secret: 'x'.repeat(4097) })).rejects.toBeDefined();
    await expect(
      call(IpcChannels.chatAddAccount, { account: { ...account, id: 'Bad Id' }, secret: 'p' }),
    ).rejects.toBeDefined();
    expect(svc.addAccount).not.toHaveBeenCalled();
  });

  it('chat:add-account passes a valid payload through', async () => {
    await call(IpcChannels.chatAddAccount, { account, secret: 'pencil' });
    expect(svc.addAccount).toHaveBeenCalledWith('work', 'pencil', expect.objectContaining({ id: 'work' }));
  });

  it('chat:send-message caps the body and shapes the result', async () => {
    await expect(
      call(IpcChannels.chatSendMessage, { accountId: 'a', conversationId: 'c', body: { body: 'x'.repeat(100_001) } }),
    ).rejects.toBeDefined();
    expect(svc.sendMessage).not.toHaveBeenCalled();

    const res = await call(IpcChannels.chatSendMessage, {
      accountId: 'a',
      conversationId: 'c',
      body: { body: 'hi' },
    });
    expect(res).toEqual({ protocolId: 'srv-1' });
  });

  it('chat:set-presence rejects an unknown state', async () => {
    await expect(
      call(IpcChannels.chatSetPresence, { accountId: 'a', presence: 'invisible' }),
    ).rejects.toBeDefined();
    await call(IpcChannels.chatSetPresence, { accountId: 'a', presence: 'away', statusText: 'brb' });
    expect(svc.setPresence).toHaveBeenCalledWith('a', 'away', 'brb');
  });

  it('chat:get-history defaults `before` to null', async () => {
    await call(IpcChannels.chatGetHistory, { accountId: 'a', conversationId: 'c' });
    expect(svc.getHistory).toHaveBeenCalledWith('a', 'c', null);
  });

  it('chat:mark-read rejects an empty protocol id', async () => {
    await expect(
      call(IpcChannels.chatMarkRead, { accountId: 'a', conversationId: 'c', protocolId: '' }),
    ).rejects.toBeDefined();
    await call(IpcChannels.chatMarkRead, { accountId: 'a', conversationId: 'c', protocolId: 'm1' });
    expect(svc.markRead).toHaveBeenCalledWith('a', 'c', 'm1');
  });
});

describe('untrusted sender', () => {
  it('an evil frame reaches nothing', () => {
    expect(() => h.handlers.get(IpcChannels.chatListAccounts)?.(evil, undefined)).toThrow();
    expect(svc.listAccounts).not.toHaveBeenCalled();
  });
});
