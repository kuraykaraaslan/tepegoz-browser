import type { ChatContact, ChatPresence } from '@tepegoz/shared-types';
import type { AgentChatMessage } from '@tepegoz/chat-core';

/**
 * The host contract the **agent** capabilities (`capabilities.ts`) run against — implemented in the
 * main process over `ChatService` and injected by the capability supervisor (ADR-0021). Distinct
 * from the UI host (`ChatHostApi` in `panel.tsx`): every read path here returns content the host has
 * already run through `wrapUntrustedContent`, and the unknown-contact gate lives on this side.
 */
export interface ChatCapabilityHost {
  /** Conversations for one account — summaries only. Unknown-contact DMs are excluded unless opted in. */
  listItems(accountId: string): Promise<ChatConversationSummary[]>;
  /** One conversation's metadata + participants, or `null` if unknown / gated. */
  getItem(accountId: string, conversationId: string): Promise<ChatConversationDetail | null>;
  /** Recent messages oldest-first, each body wrapped untrusted. Paginated with an opaque cursor. */
  getHistory(input: ChatHistoryRequest): Promise<ChatHistorySlice>;
  /** Structured / full-text search over local history (wrapped bodies, gated conversations excluded). */
  searchItems(input: ChatSearchRequest): Promise<ChatMessageHit[]>;
  /** Send one message to one conversation. Always HITL-gated at the PEP — this runs post-confirm. */
  createMessage(input: ChatCreateMessageRequest): Promise<{ protocolId: string }>;
  /** Mark read / set a per-conversation mute / add a reaction — one of these per call. */
  updateItem(input: ChatUpdateItemRequest): Promise<{ ok: true }>;
  /** Set the account's presence + optional status text. */
  updatePresence(input: ChatUpdatePresenceRequest): Promise<{ ok: true }>;
  /** Join a room / channel by address. HITL-gated at the PEP. */
  createMembership(input: ChatCreateMembershipRequest): Promise<{ conversationId: string }>;
  /** Leave a room, or drop the local copy of a conversation. */
  deleteItem(input: ChatDeleteItemRequest): Promise<{ ok: true }>;
  /** Quarantine an attachment and materialize it into the file-operations sandbox → its path. */
  getMedia(input: ChatGetMediaRequest): Promise<{ sandboxPath: string } | null>;
}

export interface ChatConversationSummary {
  conversationId: string;
  accountId: string;
  kind: 'dm' | 'room';
  title: string;
  unread: number;
  lastMessagePreview: string | null;
  isKnownContact: boolean;
}

export interface ChatConversationDetail extends ChatConversationSummary {
  topic: string | null;
  participants: ChatContact[];
}

export interface ChatHistoryRequest {
  accountId: string;
  conversationId: string;
  before?: string | null;
  limit?: number;
}

export interface ChatHistorySlice {
  messages: AgentChatMessage[];
  nextCursor: string | null;
}

export interface ChatSearchRequest {
  text: string;
  accountId?: string;
  conversationId?: string;
  limit?: number;
}

export interface ChatMessageHit {
  conversationId: string;
  accountId: string;
  message: AgentChatMessage;
}

export interface ChatCreateMessageRequest {
  accountId: string;
  conversationId: string;
  body: string;
  replyToId?: string | null;
}

export interface ChatUpdateItemRequest {
  accountId: string;
  conversationId: string;
  markReadUpTo?: string;
  muted?: boolean;
  reaction?: { messageId: string; emoji: string; on: boolean };
}

export interface ChatUpdatePresenceRequest {
  accountId: string;
  presence: ChatPresence;
  statusText?: string;
}

export interface ChatCreateMembershipRequest {
  accountId: string;
  address: string;
}

export interface ChatDeleteItemRequest {
  accountId: string;
  conversationId: string;
}

export interface ChatGetMediaRequest {
  accountId: string;
  conversationId: string;
  messageId: string;
}
