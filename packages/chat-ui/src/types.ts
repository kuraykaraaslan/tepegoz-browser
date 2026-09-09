import type { ChatConnState, ChatStateChange } from '@tepegoz/chat-core';
import type { RoomListing } from './room-browser';
import type {
  ChatContact,
  ChatConversation,
  ChatMessage,
  ChatPresence,
  OutgoingMessage,
} from '@tepegoz/shared-types';

/**
 * The renderer-facing shapes `@tepegoz/chat-ui` speaks. They mirror `@tepegoz/desktop-ipc`'s `ChatApi`
 * structurally — the desktop panel adapts `window.tepegoz` into a {@link ChatClientPort} and the
 * compiler checks the fit there — so this presentational package takes no dependency on the IPC
 * contract itself.
 */

export interface ChatAccountSummary {
  id: string;
  label: string;
  displayName: string;
  protocol: string;
  color: string | null;
  order: number;
}

export interface ChatAccountsSnapshot {
  accounts: ChatAccountSummary[];
  states: Record<string, ChatConnState>;
}

export interface ChatHistoryPage {
  messages: ChatMessage[];
  nextCursor: string | null;
}

export type ChatStateEvent =
  | { kind: 'state'; accountId: string; state: ChatConnState; detail?: string }
  | { kind: 'change'; accountId: string; change: ChatStateChange };

/** The slice of the bridge the {@link useChatState} hook drives. */
export interface ChatClientPort {
  listChatAccounts(): Promise<ChatAccountsSnapshot>;
  listChatConversations(accountId?: string): Promise<ChatConversation[]>;
  getChatRoster(accountId: string): Promise<ChatContact[]>;
  getChatHistory(
    accountId: string,
    conversationId: string,
    before?: string | null,
  ): Promise<ChatHistoryPage>;
  sendChatMessage(
    accountId: string,
    conversationId: string,
    body: OutgoingMessage,
  ): Promise<{ protocolId: string }>;
  setChatPresence(accountId: string, presence: ChatPresence, statusText?: string): Promise<void>;
  markChatRead(accountId: string, conversationId: string, protocolId: string): Promise<void>;
  onChatState(callback: (event: ChatStateEvent) => void): () => void;
  /** MUC support — optional; the room browser is shown only when both are provided. */
  discoverChatRooms?: (accountId: string, service: string) => Promise<RoomListing[]>;
  joinChatRoom?: (accountId: string, roomJid: string) => Promise<void>;
}
