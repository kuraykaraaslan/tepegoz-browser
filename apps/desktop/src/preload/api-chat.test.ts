import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IpcChannels } from '@tepegoz/desktop-ipc';

/**
 * The `com.tepegoz.chat` (X-chat.1) slice of the preload bridge. The renderer names accounts +
 * conversations by id and never sees a socket / SASL secret / stream handle — so what's pinned is the
 * exact channel and the payload SHAPE each method wraps its args in, plus `onChatState`
 * subscribe/forward/unsubscribe. The `secret` in `addChatAccount` crosses in the payload once.
 */

const invoke = vi.hoisted(() =>
  vi.fn<(channel: string, payload?: unknown) => Promise<unknown>>(() => Promise.resolve()),
);
vi.mock('./ipc-invoke', () => ({ invoke }));
const ipc = vi.hoisted(() => ({ on: vi.fn(), removeListener: vi.fn() }));
vi.mock('electron', () => ({ ipcRenderer: ipc }));

const { chatApi } = await import('./api-chat');

beforeEach(() => {
  invoke.mockClear().mockResolvedValue(undefined);
  ipc.on.mockClear();
  ipc.removeListener.mockClear();
});

describe('reads', () => {
  it('listChatAccounts invokes its channel with no payload', () => {
    void chatApi.listChatAccounts();
    expect(invoke).toHaveBeenCalledWith(IpcChannels.chatListAccounts);
  });

  it('listChatConversations sends the bare account id (undefined for "all")', () => {
    void chatApi.listChatConversations('work');
    expect(invoke).toHaveBeenCalledWith(IpcChannels.chatListConversations, 'work');
    void chatApi.listChatConversations();
    expect(invoke).toHaveBeenCalledWith(IpcChannels.chatListConversations, undefined);
  });

  it('getChatRoster → { accountId }', () => {
    void chatApi.getChatRoster('work');
    expect(invoke).toHaveBeenCalledWith(IpcChannels.chatGetRoster, { accountId: 'work' });
  });

  it('getChatHistory normalises a missing cursor to null', () => {
    void chatApi.getChatHistory('work', 'bob@x.com');
    expect(invoke).toHaveBeenCalledWith(IpcChannels.chatGetHistory, {
      accountId: 'work',
      conversationId: 'bob@x.com',
      before: null,
    });
    void chatApi.getChatHistory('work', 'bob@x.com', 'cur-1');
    expect(invoke).toHaveBeenCalledWith(IpcChannels.chatGetHistory, {
      accountId: 'work',
      conversationId: 'bob@x.com',
      before: 'cur-1',
    });
  });
});

describe('account + message commands', () => {
  it('addChatAccount → { account, secret }', () => {
    const account = { id: 'work' } as never;
    void chatApi.addChatAccount(account, 'pencil');
    expect(invoke).toHaveBeenCalledWith(IpcChannels.chatAddAccount, { account, secret: 'pencil' });
  });

  it('removeChatAccount → { accountId }', () => {
    void chatApi.removeChatAccount('work');
    expect(invoke).toHaveBeenCalledWith(IpcChannels.chatRemoveAccount, { accountId: 'work' });
  });

  it('sendChatMessage → { accountId, conversationId, body }', () => {
    const body = { body: 'hi' } as never;
    void chatApi.sendChatMessage('work', 'bob@x.com', body);
    expect(invoke).toHaveBeenCalledWith(IpcChannels.chatSendMessage, {
      accountId: 'work',
      conversationId: 'bob@x.com',
      body,
    });
  });

  it('setChatPresence omits statusText when not given', () => {
    void chatApi.setChatPresence('work', 'dnd');
    expect(invoke).toHaveBeenCalledWith(IpcChannels.chatSetPresence, {
      accountId: 'work',
      presence: 'dnd',
    });
    void chatApi.setChatPresence('work', 'away', 'brb');
    expect(invoke).toHaveBeenCalledWith(IpcChannels.chatSetPresence, {
      accountId: 'work',
      presence: 'away',
      statusText: 'brb',
    });
  });

  it('discoverChatRooms / joinChatRoom wrap their args', () => {
    void chatApi.discoverChatRooms('work', 'conf.example');
    expect(invoke).toHaveBeenCalledWith(IpcChannels.chatDiscoverRooms, {
      accountId: 'work',
      service: 'conf.example',
    });
    void chatApi.joinChatRoom('work', 'general@conf.example');
    expect(invoke).toHaveBeenCalledWith(IpcChannels.chatJoinRoom, {
      accountId: 'work',
      roomJid: 'general@conf.example',
    });
  });

  it('markChatRead → { accountId, conversationId, protocolId }', () => {
    void chatApi.markChatRead('work', 'bob@x.com', 'm-9');
    expect(invoke).toHaveBeenCalledWith(IpcChannels.chatMarkRead, {
      accountId: 'work',
      conversationId: 'bob@x.com',
      protocolId: 'm-9',
    });
  });
});

describe('onChatState', () => {
  it('wires a listener, forwards only the event, and removes it on the returned fn', () => {
    const cb = vi.fn();
    const off = chatApi.onChatState(cb);
    expect(ipc.on).toHaveBeenCalledWith(IpcChannels.chatState, expect.any(Function));
    const listener = ipc.on.mock.calls[0]![1] as (e: unknown, s: unknown) => void;
    const event = { kind: 'state', accountId: 'work', state: 'online' };
    listener({}, event);
    expect(cb).toHaveBeenCalledWith(event);
    off();
    expect(ipc.removeListener).toHaveBeenCalledWith(IpcChannels.chatState, listener);
  });
});
