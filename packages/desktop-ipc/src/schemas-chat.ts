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
 *  vault by the main process, never echoed back). Empty is valid — IRC (and possibly a future
 *  protocol) supports connecting without authenticating at all, and the vault / adapter layer
 *  already treat an empty secret as "no credential" rather than a malformed one. */
export const ChatAddAccountSchema = z.object({
  account: ChatAccountSchema,
  secret: z.string().max(4096),
});

/** `chat:update-account` — like `chat:add-account`, but `secret: null` means "keep the vault's
 *  existing credential" (the edit form never round-trips a stored secret, so blank has to mean
 *  "unchanged" rather than "clear it" — distinct from an empty STRING, which still means "no
 *  credential", same as on add). */
export const ChatUpdateAccountSchema = z.object({
  account: ChatAccountSchema,
  secret: z.string().max(4096).nullable(),
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

/** `chat:discover-rooms` — browse a conference service's rooms. */
export const ChatDiscoverRoomsSchema = z.object({
  accountId: z.string().min(1).max(64),
  service: z.string().min(1).max(255),
});

/** `chat:join-room` — join a MUC room by its bare JID. */
export const ChatJoinRoomSchema = z.object({
  accountId: z.string().min(1).max(64),
  roomJid: z.string().min(3).max(512),
});

/** `chat:leave-room` — leave a joined room. */
export const ChatLeaveRoomSchema = z.object({
  accountId: z.string().min(1).max(64),
  conversationId: z.string().min(1).max(128),
});

export const CHAT_ROOM_NOTIFY_LEVELS = ['all', 'mentions', 'none'] as const;

/** `chat:set-room-notify-level` — persist a room's notification level. */
export const ChatSetRoomNotifyLevelSchema = z.object({
  accountId: z.string().min(1).max(64),
  conversationId: z.string().min(1).max(128),
  level: z.enum(CHAT_ROOM_NOTIFY_LEVELS),
});

/** `chat:set-muted` — mute / unmute one conversation (DM or room). */
export const ChatSetMutedSchema = z.object({
  accountId: z.string().min(1).max(64),
  conversationId: z.string().min(1).max(128),
  muted: z.boolean(),
});

/** `chat:mute-for` — a TIMED mute (`durationMs`) or forever (`null`), independent of `chat:set-muted`'s
 *  binary toggle — the two share the same underlying `muted`/`mutedUntil` fields (see
 *  `ChatAccountRunner.muteFor`), this is just the "for how long" entry point. Capped at 30 days —
 *  the UI only ever offers 1h/3h/8h/forever, this is a defensive bound, not a real limit. */
export const ChatMuteForSchema = z.object({
  accountId: z.string().min(1).max(64),
  conversationId: z.string().min(1).max(128),
  durationMs: z
    .number()
    .int()
    .positive()
    .max(30 * 24 * 3600_000)
    .nullable(),
});

/** `chat:set-archived` — a purely local presentation flag, no protocol wire concept. */
export const ChatSetArchivedSchema = z.object({
  accountId: z.string().min(1).max(64),
  conversationId: z.string().min(1).max(128),
  archived: z.boolean(),
});

/** `chat:block-contact` — block / unblock an address at the server (XEP-0191, …). 501s on a
 *  protocol with no server-side blocking concept. */
export const ChatBlockContactSchema = z.object({
  accountId: z.string().min(1).max(64),
  address: z.string().min(1).max(512),
  blocked: z.boolean(),
});

/** `chat:set-room-topic` — change a room's topic / subject (empty string clears it). */
export const ChatSetRoomTopicSchema = z.object({
  accountId: z.string().min(1).max(64),
  conversationId: z.string().min(1).max(128),
  topic: z.string().max(4096),
});

/** `chat:invite-to-room` — invite a contact (JID / nick / Matrix user id) to a room. */
export const ChatInviteToRoomSchema = z.object({
  accountId: z.string().min(1).max(64),
  conversationId: z.string().min(1).max(128),
  invitee: z.string().min(1).max(320),
});

/** `chat:add-contact` — add a contact to the roster and request their presence. */
export const ChatAddContactSchema = z.object({
  accountId: z.string().min(1).max(64),
  address: z.string().min(1).max(320),
});

/** `chat:remove-contact` — remove a contact from the roster and cancel any subscription. */
export const ChatRemoveContactSchema = z.object({
  accountId: z.string().min(1).max(64),
  address: z.string().min(1).max(320),
});

/** `chat:resolve-media` — turn a message `mediaRef` (a protocol URI) into a quarantined data URL. */
export const ChatResolveMediaSchema = z.object({
  accountId: z.string().min(1).max(64),
  mediaRef: z.string().min(1).max(2048),
});

/** `chat:react` — add / remove one emoji reaction of the local user's on a message. */
export const ChatReactSchema = z.object({
  accountId: z.string().min(1).max(64),
  conversationId: z.string().min(1).max(128),
  messageId: z.string().min(1).max(128),
  emoji: z.string().min(1).max(64),
  on: z.boolean(),
});

/** `chat:edit-message` — replace an already-sent message's body (XEP-0308 / Matrix `m.replace`;
 *  501s on a protocol with no edit capability, IRC has none). Reuses `OutgoingMessageSchema`'s own
 *  body bound so the length limit can never drift between send and edit. */
export const ChatEditMessageSchema = z.object({
  accountId: z.string().min(1).max(64),
  conversationId: z.string().min(1).max(128),
  messageId: z.string().min(1).max(128),
  body: OutgoingMessageSchema.shape.body,
});
