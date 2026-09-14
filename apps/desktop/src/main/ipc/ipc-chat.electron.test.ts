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
  getAccount: vi.fn(() => account),
  updateAccount: vi.fn(() => Promise.resolve()),
  removeAccount: vi.fn(() => Promise.resolve()),
  listConversations: vi.fn(() => []),
  getRoster: vi.fn(() => []),
  addContact: vi.fn(() => Promise.resolve()),
  removeContact: vi.fn(() => Promise.resolve()),
  getHistory: vi.fn(() => Promise.resolve({ messages: [], nextCursor: null })),
  sendMessage: vi.fn(() => Promise.resolve('srv-1')),
  setPresence: vi.fn(() => Promise.resolve()),
  markRead: vi.fn(() => Promise.resolve()),
  discoverRooms: vi.fn(() => Promise.resolve([])),
  joinRoom: vi.fn(() => Promise.resolve('general@conf.example')),
  leaveRoom: vi.fn(() => Promise.resolve()),
  setRoomNotifyLevel: vi.fn(() => Promise.resolve()),
  setMuted: vi.fn(() => Promise.resolve()),
  muteFor: vi.fn(() => Promise.resolve()),
  setArchived: vi.fn(() => Promise.resolve()),
  blockContact: vi.fn(() => Promise.resolve()),
  setRoomTopic: vi.fn(() => Promise.resolve()),
  inviteToRoom: vi.fn(() => Promise.resolve()),
  resolveMedia: vi.fn(() => Promise.resolve({ dataUrl: 'data:image/png;base64,AAAA' })),
  react: vi.fn(() => Promise.resolve()),
  editMessage: vi.fn(() => Promise.resolve()),
};

const ev = { senderFrame: { url: TRUSTED }, sender: {} };
const evil = { senderFrame: { url: 'https://evil.example/' }, sender: {} };
const call = (channel: string, payload?: unknown): unknown => h.handlers.get(channel)?.(ev, payload);

const account = {
  id: 'work',
  label: 'Work',
  displayName: '',
  server: {
    protocol: 'xmpp' as const,
    jid: 'ada@example.com',
    host: null,
    port: null,
    security: 'tls' as const,
    wsUrl: null,
  },
  secretRef: 'chat:work',
  color: null,
  order: 0,
  updatedAt: 1,
  version: 1,
};

beforeEach(() => {
  h.handlers.clear();
  Object.values(svc).forEach((f) => f.mockClear());
  registerChatIpc(svc);
});

it('registers every chat channel', () => {
  expect(h.handlers.size).toBe(26);
});

it('chat:react validates + delegates', async () => {
  await call(IpcChannels.chatReact, {
    accountId: 'work',
    conversationId: 'general@conf.example',
    messageId: 'm1',
    emoji: '👍',
    on: true,
  });
  expect(svc.react).toHaveBeenCalledWith('work', 'general@conf.example', 'm1', '👍', true);
  await expect(
    call(IpcChannels.chatReact, { accountId: 'work', conversationId: 'c', messageId: 'm1', emoji: '👍' }),
  ).rejects.toBeDefined();
});

it('chat:mute-for validates + delegates; caps the duration', async () => {
  await call(IpcChannels.chatMuteFor, {
    accountId: 'work',
    conversationId: 'general@conf.example',
    durationMs: 3_600_000,
  });
  expect(svc.muteFor).toHaveBeenCalledWith('work', 'general@conf.example', 3_600_000);

  await call(IpcChannels.chatMuteFor, {
    accountId: 'work',
    conversationId: 'general@conf.example',
    durationMs: null,
  });
  expect(svc.muteFor).toHaveBeenCalledWith('work', 'general@conf.example', null);

  await expect(
    call(IpcChannels.chatMuteFor, {
      accountId: 'work',
      conversationId: 'c',
      durationMs: 31 * 24 * 3600_000,
    }),
  ).rejects.toBeDefined();
});

it('chat:set-archived validates + delegates', async () => {
  await call(IpcChannels.chatSetArchived, {
    accountId: 'work',
    conversationId: 'general@conf.example',
    archived: true,
  });
  expect(svc.setArchived).toHaveBeenCalledWith('work', 'general@conf.example', true);
  await expect(
    call(IpcChannels.chatSetArchived, { accountId: 'work', conversationId: 'c' }),
  ).rejects.toBeDefined();
});

it('chat:block-contact validates + delegates', async () => {
  await call(IpcChannels.chatBlockContact, { accountId: 'work', address: 'bob@example.com', blocked: true });
  expect(svc.blockContact).toHaveBeenCalledWith('work', 'bob@example.com', true);
  await expect(
    call(IpcChannels.chatBlockContact, { accountId: 'work', address: '' }),
  ).rejects.toBeDefined();
});

it('chat:edit-message validates + delegates', async () => {
  await call(IpcChannels.chatEditMessage, {
    accountId: 'work',
    conversationId: 'general@conf.example',
    messageId: 'm1',
    body: 'fixed typo',
  });
  expect(svc.editMessage).toHaveBeenCalledWith('work', 'general@conf.example', 'm1', 'fixed typo');
  await expect(
    call(IpcChannels.chatEditMessage, { accountId: 'work', conversationId: 'c', messageId: 'm1' }),
  ).rejects.toBeDefined();
});

it('chat:add-contact validates + delegates', async () => {
  await call(IpcChannels.chatAddContact, { accountId: 'work', address: 'bob@example.com' });
  expect(svc.addContact).toHaveBeenCalledWith('work', 'bob@example.com');
  await expect(call(IpcChannels.chatAddContact, { accountId: 'work', address: '' })).rejects.toBeDefined();
});

it('chat:remove-contact validates + delegates', async () => {
  await call(IpcChannels.chatRemoveContact, { accountId: 'work', address: 'bob@example.com' });
  expect(svc.removeContact).toHaveBeenCalledWith('work', 'bob@example.com');
  await expect(
    call(IpcChannels.chatRemoveContact, { accountId: 'work', address: '' }),
  ).rejects.toBeDefined();
});

describe('rooms', () => {
  it('chat:discover-rooms validates + delegates', async () => {
    await call(IpcChannels.chatDiscoverRooms, { accountId: 'work', service: 'conf.example' });
    expect(svc.discoverRooms).toHaveBeenCalledWith('work', 'conf.example');
    await expect(call(IpcChannels.chatDiscoverRooms, { accountId: 'work' })).rejects.toBeDefined();
  });

  it('chat:invite-to-room validates + delegates', async () => {
    await call(IpcChannels.chatInviteToRoom, {
      accountId: 'work',
      conversationId: 'general@conf.example',
      invitee: 'carol@example.com',
    });
    expect(svc.inviteToRoom).toHaveBeenCalledWith('work', 'general@conf.example', 'carol@example.com');
    await expect(
      call(IpcChannels.chatInviteToRoom, { accountId: 'work', conversationId: 'g', invitee: '' }),
    ).rejects.toBeDefined();
  });

  it('chat:join-room validates + delegates + resolves the joined conversation id', async () => {
    await expect(
      call(IpcChannels.chatJoinRoom, { accountId: 'work', roomJid: 'general@conf.example' }),
    ).resolves.toBe('general@conf.example');
    expect(svc.joinRoom).toHaveBeenCalledWith('work', 'general@conf.example');
    await expect(call(IpcChannels.chatJoinRoom, { accountId: 'work', roomJid: 'x' })).rejects.toBeDefined();
  });

  it('chat:leave-room validates + delegates', async () => {
    await call(IpcChannels.chatLeaveRoom, { accountId: 'work', conversationId: 'general@conf.example' });
    expect(svc.leaveRoom).toHaveBeenCalledWith('work', 'general@conf.example');
    await expect(call(IpcChannels.chatLeaveRoom, { accountId: 'work' })).rejects.toBeDefined();
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

  it('chat:get-account requires an account id and returns the service result', () => {
    expect(() => call(IpcChannels.chatGetAccount, { accountId: '' })).toThrow();
    const res = call(IpcChannels.chatGetAccount, { accountId: 'work' });
    expect(svc.getAccount).toHaveBeenCalledWith('work');
    expect(res).toBe(account);
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

  it('chat:update-account accepts secret: null (keep the vault existing one) and a fresh secret alike', async () => {
    await call(IpcChannels.chatUpdateAccount, { account, secret: null });
    expect(svc.updateAccount).toHaveBeenCalledWith('work', null, expect.objectContaining({ id: 'work' }));

    await call(IpcChannels.chatUpdateAccount, { account, secret: 'new-pw' });
    expect(svc.updateAccount).toHaveBeenCalledWith('work', 'new-pw', expect.objectContaining({ id: 'work' }));
  });

  it('chat:update-account rejects an over-long secret and a bad account, before the service', async () => {
    await expect(
      call(IpcChannels.chatUpdateAccount, { account, secret: 'x'.repeat(4097) }),
    ).rejects.toBeDefined();
    await expect(
      call(IpcChannels.chatUpdateAccount, { account: { ...account, id: 'Bad Id' }, secret: null }),
    ).rejects.toBeDefined();
    expect(svc.updateAccount).not.toHaveBeenCalled();
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

  // AppError contract (ADR-0009): a malformed payload must map to a 400, never the generic 500
  // `toBoundary` gives anything that isn't an `AppError` — a raw `Schema.parse()` throws a bare
  // ZodError, which collapses to 500. Every handler here goes through `parsePayload` specifically so
  // this holds; looping every registered handler (bar the one with no payload schema at all) means a
  // future handler added with a raw `.parse()` fails this test immediately instead of silently
  // regressing to an opaque "Internal error" for every one of its callers.
  it('every chat:* handler maps a malformed payload to a 400, never a bare/500 error', async () => {
    for (const [channel, fn] of h.handlers) {
      if (channel === IpcChannels.chatListAccounts) continue; // no payload schema — never rejects
      await expect(
        Promise.resolve().then(() => fn(ev, { garbage: true })),
        channel,
      ).rejects.toThrow(/^\[400\]/);
    }
  });
});

describe('untrusted sender', () => {
  it('an evil frame reaches nothing', () => {
    expect(() => h.handlers.get(IpcChannels.chatListAccounts)?.(evil, undefined)).toThrow();
    expect(svc.listAccounts).not.toHaveBeenCalled();
  });
});
