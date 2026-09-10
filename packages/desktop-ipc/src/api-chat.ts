import type {
  ChatAccount,
  ChatContact,
  ChatConversation,
  ChatMessage,
  ChatPresence,
  OutgoingMessage,
} from '@tepegoz/shared-types';
import type { ChatConnState, ChatStateChange, RoomNotifyLevel } from '@tepegoz/chat-core';

// The messenger wire model is owned by @tepegoz/shared-types (the account/conversation/message/contact
// schemas) and @tepegoz/chat-core (the connection state + folded change union). Type-only re-exports,
// erased at compile — the sandboxed preload never pulls the zod schemas or the chat-core runtime.
export type {
  ChatAccount,
  ChatContact,
  ChatConversation,
  ChatMessage,
  ChatPresence,
  OutgoingMessage,
} from '@tepegoz/shared-types';
export type { ChatConnState, ChatStateChange, RoomNotifyLevel } from '@tepegoz/chat-core';

/**
 * The multi-protocol messenger (`com.tepegoz.chat`, phase X-chat.1) bridge surface: the accounts the
 * user has configured, their live connection state, and the conversation / roster / send commands.
 *
 * What is deliberately NOT here: sockets, SASL secrets, stream handles. A secret crosses exactly once,
 * in {@link ChatApi.addChatAccount}, and is stored by the main process in the OS keychain — it is never
 * echoed back. Everything else is label / id addressed and executed in main, the same shape the network
 * and downloads bridges use for the same reason (the renderer is untrusted and hosts pages' chrome).
 */

/** One account as the chrome sees it — no `secretRef`, no server credentials. */
export interface ChatAccountSummary {
  id: string;
  label: string;
  displayName: string;
  protocol: string;
  /** A user-chosen accent for the account switcher, or `null` for the default. */
  color: string | null;
  order: number;
}

/** The accounts plus a snapshot of every account's live connection state, keyed by account id. */
export interface ChatAccountsSnapshot {
  accounts: ChatAccountSummary[];
  states: Record<string, ChatConnState>;
}

/** One backwards page through a conversation's archive (XEP-0313 MAM / equivalent). */
export interface ChatHistoryPage {
  messages: ChatMessage[];
  /** Feed back as `before` for the next page; `null` when the archive start has been reached. */
  nextCursor: string | null;
}

/** One room a conference / directory service advertises (XEP-0030 disco for XMPP). */
export interface ChatRoomSummary {
  jid: string;
  name: string | null;
  description: string | null;
  occupants: number | null;
  passwordProtected: boolean;
  membersOnly: boolean;
}

/**
 * The main→renderer `chat:state` push. `state` is a connection-lifecycle transition for one account;
 * `change` is a folded conversation / roster / presence delta the UI applies to its in-memory view.
 */
export type ChatStateEvent =
  | { kind: 'state'; accountId: string; state: ChatConnState; detail?: string }
  | { kind: 'change'; accountId: string; change: ChatStateChange };

export interface ChatApi {
  /** Every configured account plus a snapshot of their connection state. */
  listChatAccounts(): Promise<ChatAccountsSnapshot>;
  /**
   * Add an account: its row, plus the plaintext secret (password / token / SASL secret). The secret
   * crosses ONCE — main stores it in the OS keychain and never returns it.
   */
  addChatAccount(account: ChatAccount, secret: string): Promise<void>;
  removeChatAccount(accountId: string): Promise<void>;
  /** Every conversation, or just one account's when `accountId` is given. */
  listChatConversations(accountId?: string): Promise<ChatConversation[]>;
  getChatRoster(accountId: string): Promise<ChatContact[]>;
  /** Page one conversation backwards; omit `before` for the most-recent page. */
  getChatHistory(
    accountId: string,
    conversationId: string,
    before?: string | null,
  ): Promise<ChatHistoryPage>;
  /** Send one message from the user (the agent send path is separate and always HITL-gated). Resolves
   *  with the protocol id the message landed under, for optimistic-echo reconciliation. */
  sendChatMessage(
    accountId: string,
    conversationId: string,
    body: OutgoingMessage,
  ): Promise<{ protocolId: string }>;
  setChatPresence(accountId: string, presence: ChatPresence, statusText?: string): Promise<void>;
  markChatRead(accountId: string, conversationId: string, protocolId: string): Promise<void>;
  /** Browse a MUC service's advertised rooms. */
  discoverChatRooms(accountId: string, service: string): Promise<ChatRoomSummary[]>;
  /** Join a MUC room by its bare JID. */
  joinChatRoom(accountId: string, roomJid: string): Promise<void>;
  /** Persist a room's notification level. */
  setChatRoomNotifyLevel(
    accountId: string,
    conversationId: string,
    level: RoomNotifyLevel,
  ): Promise<void>;
  /** Mute / unmute one conversation (DM or room) — silences its notifications, a nick ping in a
   *  room still breaks through per `decideNotification`. */
  setChatMuted(accountId: string, conversationId: string, muted: boolean): Promise<void>;
  /** Change a room's topic / subject (empty string clears it). The server echo updates local state. */
  setChatRoomTopic(accountId: string, conversationId: string, topic: string): Promise<void>;
  /**
   * Resolve a message's `mediaRef` to a quarantined `data:` URL. The main process performs the
   * egress-bound download and size-caps it; `null` when the ref is unresolvable or too large.
   */
  resolveChatMedia(accountId: string, mediaRef: string): Promise<{ dataUrl: string } | null>;
  /** Subscribe to the `chat:state` push. Returns an unsubscribe. */
  onChatState(callback: (event: ChatStateEvent) => void): () => void;
}
