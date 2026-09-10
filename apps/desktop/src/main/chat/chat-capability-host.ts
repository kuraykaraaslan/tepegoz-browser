import { AppError } from '@tepegoz/libs';
import {
  agentMessageView,
  filterAgentConversations,
  isConversationAgentVisible,
  wrapChatContent,
} from '@tepegoz/chat-core';
import type { ChatContact, ChatConversation, ChatMessage, ChatPresence } from '@tepegoz/shared-types';
import type {
  ChatCapabilityHost,
  ChatConversationDetail,
  ChatConversationSummary,
  ChatCreateMembershipRequest,
  ChatCreateMessageRequest,
  ChatDeleteItemRequest,
  ChatGetMediaRequest,
  ChatHistoryRequest,
  ChatHistorySlice,
  ChatMessageHit,
  ChatSearchRequest,
  ChatUpdateItemRequest,
  ChatUpdatePresenceRequest,
} from '@tepegoz/ext-chat/types';

/**
 * The concrete {@link ChatCapabilityHost} — the agent's `chat_*` tools over `ChatService` + the local
 * `ChatStore`. Every read path runs through `@tepegoz/chat-core`'s agent-view: bodies / sender names /
 * topics are wrapped untrusted content, and a conversation is withheld unless it is a known contact
 * or the user opted it in for this session ({@link ChatCapabilityHostDeps.sessionOptIns}).
 *
 * IO-free by injection so it is unit-tested against fakes; `chat-service.electron.ts` supplies the
 * real `ChatService` + DB-backed reads.
 */
export interface ChatCapabilityHostDeps {
  listConversations: (accountId: string) => ChatConversation[];
  getConversation: (id: string) => ChatConversation | null;
  listContacts: (accountId: string) => ChatContact[];
  searchMessages: (opts: {
    text: string;
    accountId?: string;
    conversationId?: string;
    limit?: number;
  }) => ChatMessage[];
  history: (
    accountId: string,
    conversationId: string,
    before: string | null,
  ) => Promise<{ messages: ChatMessage[]; nextCursor: string | null }>;
  setPresence: (accountId: string, presence: ChatPresence, statusText?: string) => Promise<void>;
  markRead: (accountId: string, conversationId: string, protocolId: string) => Promise<void>;
  sendMessage: (
    accountId: string,
    conversationId: string,
    body: { body: string; replyToId?: string | null },
  ) => Promise<string>;
  joinRoom: (accountId: string, address: string) => Promise<string | null>;
  leaveRoom: (accountId: string, conversationId: string) => Promise<void>;
  setMuted: (accountId: string, conversationId: string, muted: boolean) => Promise<void>;
  react: (
    accountId: string,
    conversationId: string,
    messageId: string,
    emoji: string,
    on: boolean,
  ) => Promise<void>;
  /** Conversation ids the user opted the agent into this session (on top of persisted known-contact). */
  sessionOptIns: () => ReadonlySet<string>;
}

const notYet = (tool: string): Promise<never> =>
  Promise.reject(new AppError(`${tool} is not wired yet (X-chat.6 follow-up)`, 501));

function summarize(conv: ChatConversation, lastPreview: string | null): ChatConversationSummary {
  return {
    conversationId: conv.id,
    accountId: conv.accountId,
    kind: conv.kind,
    title: conv.name.length > 0 ? conv.name : conv.address,
    unread: conv.unread,
    lastMessagePreview: lastPreview,
    isKnownContact: conv.isKnownContact,
  };
}

export function createChatCapabilityHost(deps: ChatCapabilityHostDeps): ChatCapabilityHost {
  const visible = (conv: ChatConversation | null): conv is ChatConversation =>
    conv !== null && isConversationAgentVisible(conv, deps.sessionOptIns());

  return {
    listItems(accountId: string): Promise<ChatConversationSummary[]> {
      const convs = filterAgentConversations(deps.listConversations(accountId), deps.sessionOptIns());
      return Promise.resolve(convs.map((c) => summarize(c, null)));
    },

    getItem(accountId: string, conversationId: string): Promise<ChatConversationDetail | null> {
      const conv = deps.getConversation(conversationId);
      if (!visible(conv) || conv.accountId !== accountId) return Promise.resolve(null);
      const participants = deps
        .listContacts(accountId)
        .filter((c) => conv.kind === 'dm' && c.address === conv.address);
      return Promise.resolve({
        ...summarize(conv, null),
        topic: conv.topic.length > 0 ? wrapChatContent(conv.topic) : null,
        participants,
      });
    },

    async getHistory(input: ChatHistoryRequest): Promise<ChatHistorySlice> {
      const conv = deps.getConversation(input.conversationId);
      if (!visible(conv) || conv.accountId !== input.accountId) {
        return { messages: [], nextCursor: null };
      }
      const page = await deps.history(input.accountId, input.conversationId, input.before ?? null);
      const limit = input.limit ?? page.messages.length;
      return {
        messages: page.messages.slice(-limit).map(agentMessageView),
        nextCursor: page.nextCursor,
      };
    },

    searchItems(input: ChatSearchRequest): Promise<ChatMessageHit[]> {
      const optIns = deps.sessionOptIns();
      const seenVisible = new Map<string, boolean>();
      const hits = deps
        .searchMessages({
          text: input.text,
          ...(input.accountId !== undefined ? { accountId: input.accountId } : {}),
          ...(input.conversationId !== undefined ? { conversationId: input.conversationId } : {}),
          ...(input.limit !== undefined ? { limit: input.limit } : {}),
        })
        .filter((m) => {
          let ok = seenVisible.get(m.conversationId);
          if (ok === undefined) {
            const conv = deps.getConversation(m.conversationId);
            ok = conv !== null && isConversationAgentVisible(conv, optIns);
            seenVisible.set(m.conversationId, ok);
          }
          return ok;
        })
        .map((m) => ({ conversationId: m.conversationId, accountId: m.accountId, message: agentMessageView(m) }));
      return Promise.resolve(hits);
    },

    updatePresence(input: ChatUpdatePresenceRequest): Promise<{ ok: true }> {
      const call =
        input.statusText !== undefined
          ? deps.setPresence(input.accountId, input.presence, input.statusText)
          : deps.setPresence(input.accountId, input.presence);
      return call.then(() => ({ ok: true as const }));
    },

    async updateItem(input: ChatUpdateItemRequest): Promise<{ ok: true }> {
      if (input.markReadUpTo !== undefined) {
        await deps.markRead(input.accountId, input.conversationId, input.markReadUpTo);
      }
      if (input.muted !== undefined) {
        await deps.setMuted(input.accountId, input.conversationId, input.muted);
      }
      if (input.reaction !== undefined) {
        const { messageId, emoji, on } = input.reaction;
        await deps.react(input.accountId, input.conversationId, messageId, emoji, on);
      }
      return { ok: true };
    },

    async createMessage(input: ChatCreateMessageRequest): Promise<{ protocolId: string }> {
      const protocolId = await deps.sendMessage(input.accountId, input.conversationId, {
        body: input.body,
        replyToId: input.replyToId ?? null,
      });
      return { protocolId };
    },

    async createMembership(
      input: ChatCreateMembershipRequest,
    ): Promise<{ conversationId: string }> {
      const conversationId = await deps.joinRoom(input.accountId, input.address);
      if (conversationId === null) {
        throw new AppError('this protocol cannot join a room by address', 400);
      }
      return { conversationId };
    },

    async deleteItem(input: ChatDeleteItemRequest): Promise<{ ok: true }> {
      await deps.leaveRoom(input.accountId, input.conversationId);
      return { ok: true };
    },

    getMedia(input: ChatGetMediaRequest): Promise<{ sandboxPath: string } | null> {
      return notYet(`chat_get_media (${input.messageId})`);
    },
  };
}
