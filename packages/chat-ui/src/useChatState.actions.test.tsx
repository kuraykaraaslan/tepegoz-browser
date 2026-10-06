// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ChatContact } from '@tepegoz/shared-types';
import { useChatState } from './useChatState';
import { conv, createMakePort } from './use-chat-state-test-helpers';

afterEach(cleanup);

const { makePort } = createMakePort(vi);

describe('useChatState', () => {
  it('setRoomNotifyLevel is null without port support; otherwise patches optimistically + calls the port', async () => {
    const plain = makePort();
    const { result: noSupport } = renderHook(() => useChatState(plain.port));
    await waitFor(() => expect(noSupport.current.loading).toBe(false));
    expect(noSupport.current.setRoomNotifyLevel).toBeNull();

    const setChatRoomNotifyLevel = vi.fn(() => Promise.resolve());
    const { port } = makePort({
      setChatRoomNotifyLevel,
      listChatConversations: () =>
        Promise.resolve([conv({ id: 'room@conf', accountId: 'home', kind: 'room' })]),
    });
    const { result } = renderHook(() => useChatState(port));
    await waitFor(() => expect(result.current.conversations.length).toBe(1));

    await act(async () => {
      await result.current.setRoomNotifyLevel?.('room@conf', 'mentions');
    });
    expect(setChatRoomNotifyLevel).toHaveBeenCalledWith('home', 'room@conf', 'mentions');
    expect(result.current.client.conversations['room@conf']?.notifyLevel).toBe('mentions');
  });

  it('setMuted is null without port support; otherwise patches optimistically + calls the port', async () => {
    const plain = makePort();
    const { result: noSupport } = renderHook(() => useChatState(plain.port));
    await waitFor(() => expect(noSupport.current.loading).toBe(false));
    expect(noSupport.current.setMuted).toBeNull();

    const setChatMuted = vi.fn(() => Promise.resolve());
    const { port } = makePort({
      setChatMuted,
      listChatConversations: () => Promise.resolve([conv({ id: 'c1', accountId: 'home' })]),
    });
    const { result } = renderHook(() => useChatState(port));
    await waitFor(() => expect(result.current.conversations.length).toBe(1));

    await act(async () => {
      await result.current.setMuted?.('c1', true);
    });
    expect(setChatMuted).toHaveBeenCalledWith('home', 'c1', true);
    expect(result.current.client.conversations['c1']?.muted).toBe(true);
  });

  it('setRoomTopic is null without port support; otherwise calls the port (no optimistic patch)', async () => {
    const plain = makePort();
    const { result: noSupport } = renderHook(() => useChatState(plain.port));
    await waitFor(() => expect(noSupport.current.loading).toBe(false));
    expect(noSupport.current.setRoomTopic).toBeNull();

    const setChatRoomTopic = vi.fn(() => Promise.resolve());
    const { port } = makePort({
      setChatRoomTopic,
      listChatConversations: () =>
        Promise.resolve([conv({ id: 'room@conf', accountId: 'home', kind: 'room' })]),
    });
    const { result } = renderHook(() => useChatState(port));
    await waitFor(() => expect(result.current.conversations.length).toBe(1));

    await act(async () => {
      await result.current.setRoomTopic?.('room@conf', 'new agenda');
    });
    expect(setChatRoomTopic).toHaveBeenCalledWith('home', 'room@conf', 'new agenda');
  });

  it('inviteToRoom is null without port support; otherwise calls the port', async () => {
    const plain = makePort();
    const { result: noSupport } = renderHook(() => useChatState(plain.port));
    await waitFor(() => expect(noSupport.current.loading).toBe(false));
    expect(noSupport.current.inviteToRoom).toBeNull();

    const inviteToChatRoom = vi.fn(() => Promise.resolve());
    const { port } = makePort({
      inviteToChatRoom,
      listChatConversations: () =>
        Promise.resolve([conv({ id: 'room@conf', accountId: 'home', kind: 'room' })]),
    });
    const { result } = renderHook(() => useChatState(port));
    await waitFor(() => expect(result.current.conversations.length).toBe(1));

    await act(async () => {
      await result.current.inviteToRoom?.('room@conf', 'carol@example.org');
    });
    expect(inviteToChatRoom).toHaveBeenCalledWith('home', 'room@conf', 'carol@example.org');
  });

  it('addContact is null without port support; otherwise calls the port for the named account', async () => {
    const plain = makePort();
    const { result: noSupport } = renderHook(() => useChatState(plain.port));
    await waitFor(() => expect(noSupport.current.loading).toBe(false));
    expect(noSupport.current.addContact).toBeNull();

    const addChatContact = vi.fn(() => Promise.resolve());
    const { port } = makePort({
      addChatContact,
      listChatConversations: () => Promise.resolve([conv({ accountId: 'home' })]),
    });
    const { result } = renderHook(() => useChatState(port));
    await waitFor(() => expect(result.current.conversations.length).toBe(1));

    await act(async () => {
      await result.current.addContact?.('home', 'bob@example.org');
    });
    expect(addChatContact).toHaveBeenCalledWith('home', 'bob@example.org');
  });

  it('removeContact is null without port support; otherwise calls the port for the named account', async () => {
    const plain = makePort();
    const { result: noSupport } = renderHook(() => useChatState(plain.port));
    await waitFor(() => expect(noSupport.current.loading).toBe(false));
    expect(noSupport.current.removeContact).toBeNull();

    const removeChatContact = vi.fn(() => Promise.resolve());
    const { port } = makePort({
      removeChatContact,
      listChatConversations: () => Promise.resolve([conv({ accountId: 'home' })]),
    });
    const { result } = renderHook(() => useChatState(port));
    await waitFor(() => expect(result.current.conversations.length).toBe(1));

    await act(async () => {
      await result.current.removeContact?.('home', 'bob@example.org');
    });
    expect(removeChatContact).toHaveBeenCalledWith('home', 'bob@example.org');
  });

  it('blockContact is null without port support; otherwise calls the port and optimistically patches the roster', async () => {
    const plain = makePort();
    const { result: noSupport } = renderHook(() => useChatState(plain.port));
    await waitFor(() => expect(noSupport.current.loading).toBe(false));
    expect(noSupport.current.blockContact).toBeNull();

    const blockChatContact = vi.fn(() => Promise.resolve());
    const { port } = makePort({
      blockChatContact,
      listChatConversations: () => Promise.resolve([conv({ accountId: 'home' })]),
      getChatRoster: () =>
        Promise.resolve([
          {
            id: 'home:bob@example.org',
            accountId: 'home',
            address: 'bob@example.org',
            name: 'Bob',
            groups: [],
            presence: 'offline',
            statusText: '',
            subscription: 'both',
            blocked: false,
          } satisfies ChatContact,
        ]),
    });
    const { result } = renderHook(() => useChatState(port));
    await waitFor(() => expect(result.current.conversations.length).toBe(1));
    await waitFor(() => expect(result.current.client.roster['home:bob@example.org']).toBeDefined());

    await act(async () => {
      await result.current.blockContact?.('home', 'bob@example.org', true);
    });
    expect(blockChatContact).toHaveBeenCalledWith('home', 'bob@example.org', true);
    expect(result.current.client.roster['home:bob@example.org']?.blocked).toBe(true);
  });

  it('leaveRoom is null without port support; otherwise calls the port and deselects the room', async () => {
    const plain = makePort();
    const { result: noSupport } = renderHook(() => useChatState(plain.port));
    await waitFor(() => expect(noSupport.current.loading).toBe(false));
    expect(noSupport.current.leaveRoom).toBeNull();

    const leaveChatRoom = vi.fn(() => Promise.resolve());
    const { port } = makePort({
      leaveChatRoom,
      listChatConversations: () =>
        Promise.resolve([conv({ id: 'room@conf', accountId: 'home', kind: 'room' })]),
    });
    const { result } = renderHook(() => useChatState(port));
    await waitFor(() => expect(result.current.conversations.length).toBe(1));
    act(() => result.current.selectConversation('room@conf'));
    expect(result.current.selectedConversationId).toBe('room@conf');

    await act(async () => {
      await result.current.leaveRoom?.('room@conf');
    });
    expect(leaveChatRoom).toHaveBeenCalledWith('home', 'room@conf');
    expect(result.current.selectedConversationId).toBeNull();
  });

  it('editMessage is null without port support; otherwise calls the port for the selected conversation (no optimistic patch)', async () => {
    const plain = makePort();
    const { result: noSupport } = renderHook(() => useChatState(plain.port));
    await waitFor(() => expect(noSupport.current.loading).toBe(false));
    expect(noSupport.current.editMessage).toBeNull();

    const editChatMessage = vi.fn(() => Promise.resolve());
    const { port } = makePort({
      editChatMessage,
      listChatConversations: () => Promise.resolve([conv({ accountId: 'home' })]),
    });
    const { result } = renderHook(() => useChatState(port));
    await waitFor(() => expect(result.current.conversations.length).toBe(1));
    act(() => {
      result.current.selectConversation('c1');
    });
    await waitFor(() => expect(result.current.activeAccountId).toBe('home'));

    await act(async () => {
      await result.current.editMessage?.('p1', 'fixed typo');
    });
    expect(editChatMessage).toHaveBeenCalledWith('home', 'c1', 'p1', 'fixed typo');
  });

  it('startEditing / cancelEditing track the Composer edit target; switching conversation clears it', async () => {
    const { port } = makePort({
      listChatConversations: () =>
        Promise.resolve([conv({ accountId: 'home' }), conv({ id: 'c2', accountId: 'home' })]),
    });
    const { result } = renderHook(() => useChatState(port));
    await waitFor(() => expect(result.current.conversations.length).toBe(2));
    expect(result.current.editingMessage).toBeNull();

    act(() => {
      result.current.startEditing('p1', 'hi');
    });
    expect(result.current.editingMessage).toEqual({ messageId: 'p1', body: 'hi' });

    act(() => {
      result.current.cancelEditing();
    });
    expect(result.current.editingMessage).toBeNull();

    act(() => {
      result.current.startEditing('p1', 'hi');
    });
    // A conversation switch must not leave a stale edit target pointed at the old conversation.
    act(() => {
      result.current.selectConversation('c2');
    });
    expect(result.current.editingMessage).toBeNull();
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
