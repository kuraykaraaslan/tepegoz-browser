import type { ChatConnState, ChatStateChange, RoomNotifyLevel } from '@tepegoz/chat-core';
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
  /** Persist a room's notification level — optional; the header picker needs it. */
  setChatRoomNotifyLevel?: (
    accountId: string,
    conversationId: string,
    level: RoomNotifyLevel,
  ) => Promise<void>;
  /** Mute / unmute a conversation — optional; the header mute toggle needs it. */
  setChatMuted?: (accountId: string, conversationId: string, muted: boolean) => Promise<void>;
  /** Change a room's topic — optional; the room-header topic editor needs it. */
  setChatRoomTopic?: (accountId: string, conversationId: string, topic: string) => Promise<void>;
  /**
   * Resolve a message `mediaRef` to a quarantined `data:` URL — optional; when present,
   * {@link ChatWorkspace} feeds it to `<MessageMedia>` so attachments render inline.
   */
  resolveChatMedia?: (accountId: string, mediaRef: string) => Promise<{ dataUrl: string } | null>;
}
