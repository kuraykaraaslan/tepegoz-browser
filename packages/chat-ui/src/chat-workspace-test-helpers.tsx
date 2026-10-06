import type { vi as Vi } from 'vitest';
import type { ReactElement } from 'react';
import type { render as Render } from '@testing-library/react';
import { I18nProvider } from '@tepegoz/i18n/react';
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
    body: 'hi there',
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
export function createWorkspaceHelpers(vi: typeof Vi, render: typeof Render) {
  const wrap = (ui: ReactElement) => render(<I18nProvider locale="en">{ui}</I18nProvider>);

  function makePort(over: Partial<ChatClientPort> = {}): {
    port: ChatClientPort;
    emit: (e: ChatStateEvent) => void;
    sendChatMessage: ReturnType<typeof vi.fn>;
  } {
    let listener: ((e: ChatStateEvent) => void) | null = null;
    const sendChatMessage = vi.fn(() => Promise.resolve({ protocolId: 's1' }));
    const port: ChatClientPort = {
      listChatAccounts: () =>
        Promise.resolve({
          accounts: [
            { id: 'work', label: 'Work', displayName: '', protocol: 'xmpp', color: null, order: 0 },
          ],
          states: { work: 'online' },
        }),
      listChatConversations: () => Promise.resolve([conv()]),
      getChatRoster: () =>
        Promise.resolve([
          {
            id: 'work:bob@x.example',
            accountId: 'work',
            address: 'bob@x.example',
            name: 'Bob',
            groups: [],
            presence: 'online',
            statusText: '',
            subscription: 'both',
            blocked: false,
          } satisfies ChatContact,
        ]),
      getChatHistory: () => Promise.resolve({ messages: [msg()], nextCursor: null }),
      sendChatMessage,
      setChatPresence: () => Promise.resolve(),
      markChatRead: () => Promise.resolve(),
      onChatState: (cb) => {
        listener = cb;
        return () => {
          listener = null;
        };
      },
      ...over,
    };
    return { port, emit: (e) => listener?.(e), sendChatMessage };
  }

  return { wrap, makePort };
}
