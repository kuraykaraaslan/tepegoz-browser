import type { vi as Vi } from 'vitest';
import type { ChatContact, ChatConversation, ChatMessage } from '@tepegoz/shared-types';
import type { ChatClientPort, ChatStateEvent } from './types';

export function conv(over: Partial<ChatConversation> = {}): ChatConversation {
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
    mutedUntil: null,
    notifyLevel: 'all',
    isKnownContact: true,
    archived: false,
    lastMessage: null,
    updatedAt: 100,
    ...over,
  };
}

export function msg(over: Partial<ChatMessage> = {}): ChatMessage {
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

/**
 * The helpers that need `vitest` / Testing Library at runtime. Those are devDependencies and this file
 * is not a `*.test.*` file, so it receives them as arguments (type-only imports above) instead of
 * importing them — keeps dependency-cruiser's not-to-dev-dep rule satisfied.
 */
export function createMakePort(vi: typeof Vi) {
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
      getChatHistory: () =>
        Promise.resolve({ messages: [msg({ protocolId: 'h1' })], nextCursor: null }),
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

  return { makePort };
}
