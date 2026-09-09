import { z } from 'zod';
import { ChatAccountSchema, OutgoingMessageSchema } from '@tepegoz/shared-types';

// ── Multi-protocol messenger (com.tepegoz.chat) ────────────────────────────────────────────────────
// The account model (ChatAccount, per-protocol server config, OutgoingMessage) is owned by
// @tepegoz/shared-types — the single schema source; re-exported here so the main-process IPC handlers
// validate at the boundary from one import surface. Everything a renderer sends is bounded/`safeParse`d.

export { ChatAccountSchema, OutgoingMessageSchema };

export const ChatAccountIdArgSchema = z.object({
  accountId: z.string().min(1).max(64),
});

export const ChatConversationArgSchema = z.object({
  accountId: z.string().min(1).max(64),
  conversationId: z.string().min(1).max(128),
});

/** `chat:add-account` — the account row plus its plaintext secret (crosses ONCE, stored in the
 *  vault by the main process, never echoed back). */
export const ChatAddAccountSchema = z.object({
  account: ChatAccountSchema,
  secret: z.string().min(1).max(4096),
});

/** `chat:get-history` — page one conversation backwards through the archive. */
export const ChatGetHistorySchema = z.object({
  accountId: z.string().min(1).max(64),
  conversationId: z.string().min(1).max(128),
  /** RSM cursor from a previous page's `nextCursor`; `null` for the most recent page. */
  before: z.string().max(512).nullable().default(null),
});

/** `chat:send-message` — one conversation, one message (the agent path is separate + HITL-gated). */
export const ChatSendMessageSchema = z.object({
  accountId: z.string().min(1).max(64),
  conversationId: z.string().min(1).max(128),
  body: OutgoingMessageSchema,
});

export const CHAT_PRESENCE_STATES = ['online', 'away', 'xa', 'dnd', 'offline'] as const;

/** `chat:set-presence` — the account's own presence + a free-text status line. */
export const ChatSetPresenceSchema = z.object({
  accountId: z.string().min(1).max(64),
  presence: z.enum(CHAT_PRESENCE_STATES),
  statusText: z.string().max(512).optional(),
});

/** `chat:mark-read` — mark a conversation read up to `protocolId`. */
export const ChatMarkReadSchema = z.object({
  accountId: z.string().min(1).max(64),
  conversationId: z.string().min(1).max(128),
  protocolId: z.string().min(1).max(512),
});
