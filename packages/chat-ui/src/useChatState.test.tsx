// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ChatContact, ChatMessage } from '@tepegoz/shared-types';
import { useChatState } from './useChatState';
import { conv, createMakePort, msg } from './use-chat-state-test-helpers';

afterEach(cleanup);

const { makePort } = createMakePort(vi);

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

  it('unifies conversations across every account, and selecting one from a non-active account follows it there', async () => {
    const { port } = makePort({
      listChatConversations: () =>
        Promise.resolve([
          conv({ id: 'home-1', accountId: 'home', updatedAt: 100 }),
          conv({ id: 'work-1', accountId: 'work', updatedAt: 200 }),
        ]),
    });
    const { result } = renderHook(() => useChatState(port));
    await waitFor(() => expect(result.current.conversations.length).toBe(2));
    // Both accounts' rows show up in one list, most-recent first, regardless of which account tab
    // is "active" — this is the unified Chats tab.
    expect(result.current.conversations.map((c) => c.id)).toEqual(['work-1', 'home-1']);
    expect(result.current.activeAccountId).toBe('home');

    // Selecting a conversation that belongs to the OTHER account follows the switcher to it, so the
    // composer / roster / rooms tabs stay pointed at the account that actually owns it.
    act(() => {
      result.current.selectConversation('work-1');
    });
    expect(result.current.activeAccountId).toBe('work');
  });

  it("selectConversation's hintAccountId resolves a brand-new (not-yet-existing) conversation to the RIGHT account, not activeAccountId", async () => {
    const { port } = makePort({
      listChatConversations: () =>
        Promise.resolve([
          conv({ id: 'home-1', accountId: 'home', updatedAt: 100 }),
          conv({ id: 'work-1', accountId: 'work', updatedAt: 200 }),
        ]),
    });
    const { result } = renderHook(() => useChatState(port));
    await waitFor(() => expect(result.current.conversations.length).toBe(2));
    expect(result.current.activeAccountId).toBe('home'); // the default, order-sorted first account

    // 'brand-new@x.example' has no existing row — without the hint this would silently resolve to
    // the (wrong) activeAccountId ('home') instead of the account the caller actually knows it for.
    act(() => {
      result.current.selectConversation('brand-new@x.example', 'work');
    });
    expect(result.current.activeAccountId).toBe('work');
    expect(result.current.selectedConversationId).toBe('brand-new@x.example');
  });

  it('unifies the roster across every configured account, fetched in parallel', async () => {
    const contact = (accountId: string, address: string): ChatContact => ({
      id: `${accountId}:${address}`,
      accountId,
      address,
      name: '',
      groups: [],
      presence: 'offline',
      statusText: '',
      subscription: 'both',
      blocked: false,
    });
    const { port } = makePort({
      getChatRoster: (accountId: string) =>
        Promise.resolve(
          accountId === 'home'
            ? [contact('home', 'alice@x.example')]
            : [contact('work', 'bob@x.example')],
        ),
    });
    const { result } = renderHook(() => useChatState(port));
    await waitFor(() => expect(Object.keys(result.current.client.roster).length).toBe(2));
    expect(
      Object.values(result.current.client.roster)
        .map((c) => c.address)
        .sort(),
    ).toEqual(['alice@x.example', 'bob@x.example']);
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

  it('a message pushed before the history fetch resolves is not dropped from a freshly opened conversation', async () => {
    // Regression: found by a live e2e run where a message sent immediately after joining a brand
    // new room never rendered (the conversation's unread badge still bumped — that fold path is
    // unconditional — but chat-store's message-append path only fires when the conversation's
    // message window is already seeded, and a race meant the live event arrived before
    // `getChatHistory`'s response did).
    let resolveHistory: ((page: { messages: ChatMessage[]; nextCursor: null }) => void) | null =
      null;
    const { port, emit } = makePort({
      listChatConversations: () => Promise.resolve([conv({ accountId: 'home' })]),
      getChatHistory: () =>
        new Promise((resolve) => {
          resolveHistory = resolve;
        }),
    });
    const { result } = renderHook(() => useChatState(port));
    await waitFor(() => expect(result.current.conversations.length).toBe(1));

    act(() => {
      result.current.selectConversation('c1');
    });
    // The history fetch is still pending — a live message arrives before it resolves.
    act(() => {
      emit({
        kind: 'change',
        accountId: 'home',
        change: {
          kind: 'message',
          conversationId: 'c1',
          message: msg({ protocolId: 'live', receivedAt: 999 }),
        },
      });
    });
    expect(result.current.client.messages.c1?.some((m) => m.protocolId === 'live')).toBe(true);

    // The history page resolves afterwards and merges in rather than clobbering the live arrival.
    act(() => {
      resolveHistory?.({ messages: [msg({ protocolId: 'h1' })], nextCursor: null });
    });
    await waitFor(() => expect(result.current.client.messages.c1?.length).toBe(2));
    expect(result.current.client.messages.c1?.map((m) => m.protocolId).sort()).toEqual([
      'h1',
      'live',
    ]);
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
        change: {
          kind: 'message',
          conversationId: 'c1',
          message: msg({ protocolId: 'live', receivedAt: 999 }),
        },
      });
      emit({ kind: 'state', accountId: 'home', state: 'error' });
    });

    expect(result.current.client.messages.c1?.some((m) => m.protocolId === 'live')).toBe(true);
    expect(result.current.connectionStates.home).toBe('error');
  });

  it('send() posts to the active account + selected conversation, then marks its own message read', async () => {
    const { port, sendChatMessage, markChatRead } = makePort({
      listChatConversations: () => Promise.resolve([conv({ accountId: 'home' })]),
    });
    const { result } = renderHook(() => useChatState(port));
    await waitFor(() => expect(result.current.conversations.length).toBe(1));
    act(() => {
      result.current.selectConversation('c1');
    });
    await waitFor(() => expect(markChatRead).toHaveBeenCalledWith('home', 'c1', 'h1')); // the history-open mark
    markChatRead.mockClear();

    await act(async () => {
      await result.current.send('hello', { replyToId: 'r1' });
    });
    expect(sendChatMessage).toHaveBeenCalledWith('home', 'c1', {
      body: 'hello',
      replyToId: 'r1',
      mediaPath: null,
    });
    // Your own just-sent message must never sit past the "new messages" divider.
    expect(markChatRead).toHaveBeenCalledWith('home', 'c1', 'srv-1');
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

    const discoverChatRooms = vi.fn(() => Promise.resolve([]));
    const joinChatRoom = vi.fn(() => Promise.resolve('room@conf'));
    const listChatConversations = vi
      .fn<(a?: string) => Promise<import('@tepegoz/shared-types').ChatConversation[]>>()
      .mockResolvedValueOnce([])
      .mockResolvedValue([conv({ id: 'room@conf', accountId: 'home', kind: 'room' })]);
    const withRooms = makePort({ discoverChatRooms, joinChatRoom, listChatConversations });

    const { result } = renderHook(() => useChatState(withRooms.port));
    await waitFor(() => expect(result.current.rooms).not.toBeNull());

    await act(async () => {
      await result.current.rooms?.discover('home', 'conf.example');
    });
    expect(discoverChatRooms).toHaveBeenCalledWith('home', 'conf.example');

    await act(async () => {
      await result.current.rooms?.join('home', 'room@conf');
    });
    expect(joinChatRoom).toHaveBeenCalledWith('home', 'room@conf');
    await waitFor(() => expect(result.current.selectedConversationId).toBe('room@conf'));
    // The joined room must actually be selectable, not just referenced by id — this is what was
    // broken before: the panel would flip to the chats tab with nothing to show.
    expect(result.current.client.conversations['room@conf']).toBeDefined();
  });
});
