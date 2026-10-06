import { createHash } from 'node:crypto';
import type {
  ChatAccount,
  ChatContact,
  ChatConversation,
  ChatMessage,
} from '@tepegoz/shared-types';
import type { ChatAdapter, ChatTransport } from '@tepegoz/chat-adapters';
import type { ChatConnState, ChatStateChange } from '@tepegoz/chat-core';

/** The narrow slice of `ChatStore` a runner writes. */
export interface ChatRunnerStore {
  upsertMessage: (message: ChatMessage) => void;
  redactMessage: (conversationId: string, protocolId: string) => void;
  upsertConversation: (conversation: ChatConversation) => void;
  upsertContact: (contact: ChatContact) => void;
  /** A targeted update, deliberately separate from `upsertContact` — see
   *  `ChatStore.setContactBlocked`'s own docstring for why. */
  setContactBlocked: (accountId: string, address: string, blocked: boolean) => void;
  getConversation: (id: string) => ChatConversation | null;
  /** Newest-first-then-reversed page of everything already persisted for this conversation. */
  listMessages: (conversationId: string) => ChatMessage[];
  /** Every room-kind conversation id already known for this account — who to rejoin on connect. */
  listRoomIds: (accountId: string) => string[];
  /** Every conversation's persisted read marker (DMs and rooms) — seeds `ChatAccountState` so a
   *  reconnect's history replay doesn't recount already-read messages as unread. See
   *  `ChatAccountState.seedLastRead`. */
  listReadMarkers: (accountId: string) => ReadonlyArray<{ id: string; lastReadId: string | null }>;
}

/** What the runner pushes to the renderer (the desktop maps these onto an IPC channel). */
export type RunnerEmit =
  | { kind: 'state'; accountId: string; state: ChatConnState; detail?: string }
  | { kind: 'change'; accountId: string; change: ChatStateChange };

/** A message worth surfacing — the host maps it to a redacted OS / center notification. */
export interface ChatNotification {
  accountId: string;
  conversationId: string;
  /** Sender display name / room name — never a raw JID where a name is known. */
  title: string;
  /** Message body, already length-capped. */
  body: string;
}

/**
 * A redacted audit fact for the Event Journal. NEVER carries a message body, a sender/JID, a room
 * address or any secret — only a truncated SHA-256 of the conversation id (enough to correlate a
 * thread across events), the account id, the protocol message id, the protocol name and a timestamp.
 */
export type ChatAuditEvent =
  | {
      kind: 'message-sent';
      accountId: string;
      conversationHash: string;
      protocolId: string;
      ts: number;
    }
  | { kind: 'account-added'; accountId: string; protocol: string; ts: number };

/** Truncated SHA-256 of a conversation id — a stable correlation key that reveals no JID / channel. */
export function hashConversationId(conversationId: string): string {
  return createHash('sha256').update(conversationId).digest('hex').slice(0, 16);
}

export interface AccountRunnerDeps {
  account: ChatAccount;
  /** Plaintext secret, resolved from the vault by `ChatService`. */
  secret: string;
  adapter: ChatAdapter;
  transport: ChatTransport;
  store: ChatRunnerStore;
  now: () => number;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (h: unknown) => void;
  mayEgress: () => boolean;
  emit: (event: RunnerEmit) => void;
  /** Raise a notification for an inbound message (after `decideNotification`). Optional. */
  notify?: (notification: ChatNotification) => void;
  /** Record a redacted "message sent" fact in the Event Journal. Optional. */
  audit?: (event: ChatAuditEvent) => void;
  /** Read an attachment's bytes out of the file-operations sandbox, for `sendMessage`'s `mediaPath`
   *  → `uploadMedia` → `mediaRef` step. Optional — a `mediaPath` on a deps-less runner (or a
   *  protocol whose adapter has no `uploadMedia`) throws rather than silently dropping the
   *  attachment; see `sendMessage`. */
  readMediaBytes?: (
    sandboxPath: string,
  ) => Promise<{ bytes: Uint8Array; mime: string; filename: string }>;
}
