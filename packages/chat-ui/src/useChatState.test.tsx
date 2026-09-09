// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ChatContact, ChatConversation, ChatMessage } from '@tepegoz/shared-types';
import { useChatState } from './useChatState';
import type { ChatClientPort, ChatStateEvent } from './types';

afterEach(cleanup);

function conv(over: Partial<ChatConversation> = {}): ChatConversation {
  return {
    id: 'c1',
    accountId: 'work',
    kind: 'dm',
    address: 'bob@x.example',
    name: 'Bob',
    topic: '',
    memberCount: 2,
    unread: 0,
    mentions: 0,
    lastReadId: null,
    muted: false,
    isKnownContact: true,
    updatedAt: 100,
    ...over,
  };
}

function msg(over: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'm1',
    conversationId: 'c1',
    accountId: 'work',
    protocolId: 'p1',
    senderAddress: 'bob@x.example',
    senderName: 'Bob',
    kind: 'text',
    body: 'hi',
    mediaRef: null,
    replyToId: null,
    reactions: [],
    editedAt: null,
    redacted: false,
    originTs: 200,
    receivedAt: 200,
    deliveryState: 'delivered',
    ...over,
  };
}

function makePort(over: Partial<ChatClientPort> = {}): {
  port: ChatClientPort;
  emit: (event: ChatStateEvent) => void;
  sendChatMessage: ReturnType<typeof vi.fn>;
  markChatRead: ReturnType<typeof vi.fn>;
} {
  let listener: ((e: ChatStateEvent) => void) | null = null;
  const sendChatMessage = vi.fn(() => Promise.resolve({ protocolId: 'srv-1' }));
  const markChatRead = vi.fn(() => Promise.resolve());
  const port: ChatClientPort = {
    listChatAccounts: () =>
      Promise.resolve({
        accounts: [
          { id: 'work', label: 'Work', displayName: '', protocol: 'xmpp', color: null, order: 1 },
          { id: 'home', label: 'Home', displayName: '', protocol: 'xmpp', color: null, order: 0 },
        ],
        states: { work: 'online', home: 'reconnecting' },
      }),
    listChatConversations: (accountId?: string) =>
      Promise.resolve([
        conv({ accountId: accountId ?? 'work' }),
        conv({ id: 'c2', accountId: accountId ?? 'work', updatedAt: 300 }),
      ]),
    getChatRoster: () => Promise.resolve([] as ChatContact[]),
    getChatHistory: () => Promise.resolve({ messages: [msg({ protocolId: 'h1' })], nextCursor: null }),
    sendChatMessage,
    setChatPresence: () => Promise.resolve(),
    markChatRead,
    onChatState: (cb) => {
      listener = cb;
      return () => {
        listener = null;
      };
    },
    ...over,
  };
  return { port, emit: (e) => listener?.(e), sendChatMessage, markChatRead };
}

describe('useChatState', () => {
  it('loads accounts (order-sorted), picks the first active, seeds its conversations', async () => {
    const { port } = makePort();
    const { result } = renderHook(() => useChatState(port));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.accounts.map((a) => a.id)).toEqual(['home', 'work']);
    expect(result.current.activeAccountId).toBe('home');
    expect(result.current.connectionStates).toEqual({ work: 'online', home: 'reconnecting' });

    await waitFor(() => expect(result.current.conversations.length).toBeGreaterThan(0));
    // recency order: c2 (300) before c1 (100)
    expect(result.current.conversations.map((c) => c.id)).toEqual(['c2', 'c1']);
  });

  it('selecting a conversation loads history once and marks it read', async () => {
    const { port, markChatRead } = makePort({
      listChatConversations: () => Promise.resolve([conv({ accountId: 'home' })]),
    });
    const { result } = renderHook(() => useChatState(port));
    await waitFor(() => expect(result.current.conversations.length).toBe(1));

    act(() => {
      result.current.selectConversation('c1');
    });
    await waitFor(() => expect(result.current.client.messages.c1?.length).toBe(1));
    expect(markChatRead).toHaveBeenCalledWith('home', 'c1', 'h1');

    const spy = vi.spyOn(port, 'getChatHistory');
    act(() => {
      result.current.selectConversation('c1');
    });
    expect(spy).not.toHaveBeenCalled(); // already seeded
  });

  it('applies a pushed change event and a connection-state event', async () => {
    const { port, emit } = makePort({
      listChatConversations: () => Promise.resolve([conv({ accountId: 'home' })]),
    });
    const { result } = renderHook(() => useChatState(port));
    await waitFor(() => expect(result.current.conversations.length).toBe(1));
    act(() => {
      result.current.selectConversation('c1');
    });
    await waitFor(() => expect(result.current.client.messages.c1).toBeDefined());

    act(() => {
      emit({
        kind: 'change',
        accountId: 'home',
        change: { kind: 'message', conversationId: 'c1', message: msg({ protocolId: 'live', receivedAt: 999 }) },
      });
      emit({ kind: 'state', accountId: 'home', state: 'error' });
    });

    expect(result.current.client.messages.c1?.some((m) => m.protocolId === 'live')).toBe(true);
    expect(result.current.connectionStates.home).toBe('error');
  });

  it('send() posts to the active account + selected conversation', async () => {
    const { port, sendChatMessage } = makePort({
      listChatConversations: () => Promise.resolve([conv({ accountId: 'home' })]),
    });
    const { result } = renderHook(() => useChatState(port));
    await waitFor(() => expect(result.current.conversations.length).toBe(1));
    act(() => {
      result.current.selectConversation('c1');
    });

    await act(async () => {
      await result.current.send('hello', { replyToId: 'r1' });
    });
    expect(sendChatMessage).toHaveBeenCalledWith('home', 'c1', {
      body: 'hello',
      replyToId: 'r1',
      mediaPath: null,
    });
  });

  it('send() is a no-op with nothing selected', async () => {
    const { port, sendChatMessage } = makePort();
    const { result } = renderHook(() => useChatState(port));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.send('nope');
    });
    expect(sendChatMessage).not.toHaveBeenCalled();
  });

  it('exposes rooms only when the port supports them; join refreshes + selects', async () => {
    const plain = makePort();
    const { result: noRooms } = renderHook(() => useChatState(plain.port));
    await waitFor(() => expect(noRooms.current.loading).toBe(false));
    expect(noRooms.current.rooms).toBeNull();

    const discoverRooms = vi.fn(() => Promise.resolve([]));
    const joinRoom = vi.fn(() => Promise.resolve());
    const listChatConversations = vi
      .fn<(a?: string) => Promise<import('@tepegoz/shared-types').ChatConversation[]>>()
      .mockResolvedValueOnce([])
      .mockResolvedValue([conv({ id: 'room@conf', accountId: 'home', kind: 'room' })]);
    const withRooms = makePort({ discoverRooms, joinRoom, listChatConversations });

    const { result } = renderHook(() => useChatState(withRooms.port));
    await waitFor(() => expect(result.current.rooms).not.toBeNull());

    await act(async () => {
      await result.current.rooms?.discover('conf.example');
    });
    expect(discoverRooms).toHaveBeenCalledWith('home', 'conf.example');

    await act(async () => {
      await result.current.rooms?.join('room@conf');
    });
    expect(joinRoom).toHaveBeenCalledWith('home', 'room@conf');
    await waitFor(() => expect(result.current.selectedConversationId).toBe('room@conf'));
  });

  it('switching accounts clears the selection', async () => {
    const { port } = makePort();
    const { result } = renderHook(() => useChatState(port));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => {
      result.current.selectConversation('c2');
    });
    act(() => {
      result.current.setActiveAccount('work');
    });
    expect(result.current.selectedConversationId).toBeNull();
    expect(result.current.activeAccountId).toBe('work');
  });
});
