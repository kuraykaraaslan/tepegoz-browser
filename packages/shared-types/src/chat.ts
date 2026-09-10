import { z } from 'zod';

/**
 * Multi-protocol messenger domain model (`@tepegoz/ext-chat`) — the one place its schemas live.
 *
 * Built on a Pidgin / libpurple-style **protocol-plugin** model: the core knows nothing about any
 * specific network, and every protocol difference is a `ChatAdapterCaps` flag rather than a special
 * case. The model is **multi-account first** — nothing is addressable without an `accountId`, and the
 * vault secret is per account (this file holds `secretRef`, the key, never the secret).
 *
 * Everything crossing IPC, coming off an adapter's wire (an XMPP stanza, a Matrix sync event, an IRC
 * line, a bridge payload), loaded from the DB, or arriving as an agent tool-call argument is
 * `safeParse`d against these. Strings are length-capped and arrays size-capped so a hostile peer
 * cannot DoS the parser.
 */

// ---------------------------------------------------------------------------
// Account
// ---------------------------------------------------------------------------

/** Account id: a lowercase dash-separated slug — used in conversation ids and as a vault-key
 *  component, so it can neither collide nor escape. */
export const CHAT_ACCOUNT_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const CHAT_ACCOUNT_ID_MAX = 64;

export function isValidChatAccountId(id: string): boolean {
  return id.length <= CHAT_ACCOUNT_ID_MAX && CHAT_ACCOUNT_ID_PATTERN.test(id);
}

export const ChatAccountIdSchema = z
  .string()
  .max(CHAT_ACCOUNT_ID_MAX)
  .regex(CHAT_ACCOUNT_ID_PATTERN, 'A chat account id must be a lowercase, dash-separated slug');

export const CHAT_PROTOCOLS = ['xmpp', 'irc', 'matrix', 'bridge'] as const;
export const ChatProtocolSchema = z.enum(CHAT_PROTOCOLS);
export type ChatProtocol = z.infer<typeof ChatProtocolSchema>;

/** Transport security for stream protocols. Cleartext is deliberately not representable. */
export const CHAT_CONNECTION_SECURITY = ['tls', 'starttls'] as const;
export const ChatConnectionSecuritySchema = z.enum(CHAT_CONNECTION_SECURITY);
export type ChatConnectionSecurity = z.infer<typeof ChatConnectionSecuritySchema>;

const xmppServer = z.object({
  protocol: z.literal('xmpp'),
  jid: z.string().min(3).max(320),
  /** Override the SRV-resolved host, optional. */
  host: z.string().max(255).nullable().default(null),
  port: z.number().int().min(1).max(65535).nullable().default(null),
  security: ChatConnectionSecuritySchema.default('tls'),
  /** WebSocket / BOSH endpoint, when connecting over HTTP rather than raw TCP. */
  wsUrl: z.string().url().max(2048).nullable().default(null),
});

export const CHAT_IRC_SASL_MECHANISMS = ['plain', 'external'] as const;
export const ChatIrcSaslMechanismSchema = z.enum(CHAT_IRC_SASL_MECHANISMS);
export type ChatIrcSaslMechanism = z.infer<typeof ChatIrcSaslMechanismSchema>;

const ircServer = z.object({
  protocol: z.literal('irc'),
  server: z.string().min(1).max(255),
  port: z.number().int().min(1).max(65535),
  tls: z.boolean().default(true),
  nick: z.string().min(1).max(64),
  /** Whether to authenticate over SASL at all (needs the server's `sasl` cap). */
  sasl: z.boolean().default(false),
  /**
   * Which SASL mechanism when `sasl` is on. `plain` (default) sends the nick + the vaulted secret;
   * `external` presents the TLS client certificate (CertFP) and carries no secret — the transport
   * supplies the cert. Absent ⇒ `plain`, so rows written before this field parse unchanged.
   */
  saslMechanism: ChatIrcSaslMechanismSchema.optional(),
});

const matrixServer = z.object({
  protocol: z.literal('matrix'),
  homeserverUrl: z.string().url().max(2048),
  userId: z.string().min(3).max(320),
});

const bridgeServer = z.object({
  protocol: z.literal('bridge'),
  /** Which out-of-process bridge adapter (`telegram`, `slack`, `discord`, …). */
  bridgeId: z.string().regex(/^[a-z0-9-]+$/).max(64),
  /** Opaque to the core — validated by the bridge subprocess, kept as bounded strings here. */
  config: z.record(z.string().max(64), z.string().max(4096)).default({}),
});

/** Per-protocol connection config — a discriminated union so an `xmpp` row without a JID, or an
 *  `irc` row carrying a `homeserverUrl`, is not representable. **No key material here.** */
export const ChatServerConfigSchema = z.discriminatedUnion('protocol', [
  xmppServer,
  ircServer,
  matrixServer,
  bridgeServer,
]);
export type ChatServerConfig = z.infer<typeof ChatServerConfigSchema>;

/** What a protocol actually supports. The UI and the agent tools degrade against these rather than
 *  faking a feature the wire cannot carry. */
export const ChatAdapterCapsSchema = z.object({
  receipts: z.boolean().default(false),
  typing: z.boolean().default(false),
  edits: z.boolean().default(false),
  reactions: z.boolean().default(false),
  threads: z.boolean().default(false),
  e2ee: z.boolean().default(false),
  media: z.boolean().default(false),
  presence: z.boolean().default(false),
  historySync: z.boolean().default(false),
  rooms: z.boolean().default(false),
});
export type ChatAdapterCaps = z.infer<typeof ChatAdapterCapsSchema>;

/** One configured account, as persisted (profile-scoped). `protocol` is `server.protocol` — not
 *  stored twice here; the store projects it to a column. */
export const ChatAccountSchema = z.object({
  id: ChatAccountIdSchema,
  label: z.string().min(1).max(64),
  displayName: z.string().max(255).default(''),
  server: ChatServerConfigSchema,
  /** Vault key the credential / token is stored under — NEVER the credential. */
  secretRef: z.string().min(1).max(256),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable()
    .default(null),
  order: z.number().int().min(0).max(9999).default(0),
  // sync-meta (Phase 3 account sync owes no migration).
  updatedAt: z.number().int().nonnegative(),
  version: z.number().int().nonnegative(),
});
export type ChatAccount = z.infer<typeof ChatAccountSchema>;

// ---------------------------------------------------------------------------
// Roster / presence
// ---------------------------------------------------------------------------

/** `xa` = XMPP "extended away"; the others map cleanly across protocols. */
export const CHAT_PRESENCE = ['online', 'away', 'xa', 'dnd', 'offline'] as const;
export const ChatPresenceSchema = z.enum(CHAT_PRESENCE);
export type ChatPresence = z.infer<typeof ChatPresenceSchema>;

export const CHAT_SUBSCRIPTION = ['none', 'to', 'from', 'both'] as const;
export const ChatSubscriptionSchema = z.enum(CHAT_SUBSCRIPTION);
export type ChatSubscription = z.infer<typeof ChatSubscriptionSchema>;

export const ChatContactSchema = z.object({
  id: z.string().min(1).max(128),
  accountId: ChatAccountIdSchema,
  /** Protocol address (JID / nick / Matrix id). */
  address: z.string().min(1).max(512),
  name: z.string().max(512).default(''),
  groups: z.array(z.string().max(128)).max(64).default([]),
  presence: ChatPresenceSchema.default('offline'),
  statusText: z.string().max(512).default(''),
  subscription: ChatSubscriptionSchema.default('none'),
});
export type ChatContact = z.infer<typeof ChatContactSchema>;

// ---------------------------------------------------------------------------
// Conversations / messages
// ---------------------------------------------------------------------------

export const CHAT_CONV_KINDS = ['dm', 'room'] as const;
export const ChatConvKindSchema = z.enum(CHAT_CONV_KINDS);
export type ChatConvKind = z.infer<typeof ChatConvKindSchema>;

export const ChatConversationSchema = z.object({
  id: z.string().min(1).max(128),
  accountId: ChatAccountIdSchema,
  kind: ChatConvKindSchema,
  address: z.string().min(1).max(512),
  name: z.string().max(512).default(''),
  topic: z.string().max(4096).default(''),
  memberCount: z.number().int().nonnegative().default(0),
  unread: z.number().int().nonnegative().default(0),
  mentions: z.number().int().nonnegative().default(0),
  lastReadId: z.string().max(128).nullable().default(null),
  muted: z.boolean().default(false),
  /** Room notification level — `all` every message, `mentions` only a nick/room ping, `none` silent.
   *  A direct nick mention still notifies at `mentions`; only `none` fully silences (see
   *  `@tepegoz/chat-core` `decideNotification`). Ignored for DMs, which use `muted`. */
  notifyLevel: z.enum(['all', 'mentions', 'none']).default('all'),
  /** The peer is a roster contact (DM) or the user explicitly opted this conversation in. Gates
   *  whether the agent may read it (`chat_get_history` withholds unknown-contact conversations). */
  isKnownContact: z.boolean().default(false),
  updatedAt: z.number().int().nonnegative(),
});
export type ChatConversation = z.infer<typeof ChatConversationSchema>;

export const CHAT_MESSAGE_KINDS = ['text', 'media', 'system', 'call'] as const;
export const ChatMessageKindSchema = z.enum(CHAT_MESSAGE_KINDS);
export type ChatMessageKind = z.infer<typeof ChatMessageKindSchema>;

export const CHAT_DELIVERY_STATES = ['pending', 'sent', 'delivered', 'read', 'failed'] as const;
export const ChatDeliveryStateSchema = z.enum(CHAT_DELIVERY_STATES);
export type ChatDeliveryState = z.infer<typeof ChatDeliveryStateSchema>;

export const ChatReactionSchema = z.object({
  emoji: z.string().min(1).max(64),
  count: z.number().int().nonnegative(),
  me: z.boolean(),
});
export type ChatReaction = z.infer<typeof ChatReactionSchema>;

/** Max stored/handled message body — chat is chattier and smaller than mail. */
export const CHAT_MESSAGE_BODY_MAX = 100_000;

export const ChatMessageSchema = z.object({
  id: z.string().min(1).max(128),
  conversationId: z.string().min(1).max(128),
  accountId: ChatAccountIdSchema,
  /** The wire message id from the protocol (dedup key within a conversation). */
  protocolId: z.string().min(1).max(512),
  senderAddress: z.string().min(1).max(512),
  senderName: z.string().max(512).default(''),
  kind: ChatMessageKindSchema.default('text'),
  body: z.string().max(CHAT_MESSAGE_BODY_MAX).default(''),
  mediaRef: z.string().max(128).nullable().default(null),
  replyToId: z.string().max(128).nullable().default(null),
  reactions: z.array(ChatReactionSchema).max(64).default([]),
  editedAt: z.number().int().nonnegative().nullable().default(null),
  redacted: z.boolean().default(false),
  /** The sender's timestamp (epoch ms). */
  originTs: z.number().int().nonnegative(),
  /** When this client received it (epoch ms) — the tiebreak for ordering. */
  receivedAt: z.number().int().nonnegative(),
  deliveryState: ChatDeliveryStateSchema.default('delivered'),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

/** What the composer / agent hands to the host to send. */
export const OutgoingMessageSchema = z.object({
  body: z.string().max(CHAT_MESSAGE_BODY_MAX),
  replyToId: z.string().max(128).nullable().default(null),
  /** Path inside the file-operations sandbox; resolved to bytes only at send time. */
  mediaPath: z.string().max(4096).nullable().default(null),
});
export type OutgoingMessage = z.infer<typeof OutgoingMessageSchema>;

export const ChatReceiptSchema = z.object({
  conversationId: z.string().min(1).max(128),
  messageId: z.string().min(1).max(512),
  byAddress: z.string().min(1).max(512),
  kind: z.enum(['delivered', 'read']),
  ts: z.number().int().nonnegative(),
});
export type ChatReceipt = z.infer<typeof ChatReceiptSchema>;

// ---------------------------------------------------------------------------
// Normalized adapter events (the "prpl" abstraction output)
// ---------------------------------------------------------------------------

/** The single event union every adapter emits (after `@tepegoz/chat-core` normalization). A
 *  discriminated union so an unknown/mistyped event from a hostile wire is rejected wholesale. */
export const ChatEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('message'), message: ChatMessageSchema }),
  z.object({
    type: z.literal('message-edit'),
    conversationId: z.string().min(1).max(128),
    protocolId: z.string().min(1).max(512),
    body: z.string().max(CHAT_MESSAGE_BODY_MAX),
    editedAt: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal('message-redact'),
    conversationId: z.string().min(1).max(128),
    protocolId: z.string().min(1).max(512),
    redactedAt: z.number().int().nonnegative(),
  }),
  z.object({ type: z.literal('receipt'), receipt: ChatReceiptSchema }),
  z.object({
    type: z.literal('reaction'),
    conversationId: z.string().min(1).max(128),
    /** The protocol id of the message being reacted to. */
    protocolId: z.string().min(1).max(512),
    emoji: z.string().min(1).max(64),
    senderAddress: z.string().min(1).max(512),
    /** `true` adds the reaction, `false` removes it. */
    add: z.boolean(),
  }),
  z.object({
    type: z.literal('typing'),
    conversationId: z.string().min(1).max(128),
    senderAddress: z.string().min(1).max(512),
    active: z.boolean(),
  }),
  z.object({
    type: z.literal('presence'),
    accountId: ChatAccountIdSchema,
    address: z.string().min(1).max(512),
    presence: ChatPresenceSchema,
    statusText: z.string().max(512).default(''),
  }),
  z.object({
    type: z.literal('roster-change'),
    contact: ChatContactSchema,
    removed: z.boolean().default(false),
  }),
  z.object({
    type: z.literal('room-membership'),
    conversationId: z.string().min(1).max(128),
    address: z.string().min(1).max(512),
    joined: z.boolean(),
    memberCount: z.number().int().nonnegative().default(0),
    /** This membership change is about the connected account (MUC status code 110). */
    self: z.boolean().default(false),
    /** The occupant's affiliation / role, when the protocol carries it. */
    affiliation: z.enum(['owner', 'admin', 'member', 'outcast', 'none']).default('none'),
    role: z.enum(['moderator', 'participant', 'visitor', 'none']).default('participant'),
    /** The occupant's real bare JID in a non-anonymous room. */
    realJid: z.string().max(512).nullable().default(null),
  }),
  z.object({
    type: z.literal('error'),
    scope: z.enum(['account', 'conversation']),
    message: z.string().max(2048),
    conversationId: z.string().max(128).nullable().default(null),
  }),
]);
export type ChatEvent = z.infer<typeof ChatEventSchema>;

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

export const ChatQuerySchema = z.object({
  text: z.string().max(256).optional(),
  accountId: ChatAccountIdSchema.optional(),
  conversationId: z.string().max(128).optional(),
  senderAddress: z.string().max(512).optional(),
  since: z.number().int().nonnegative().optional(),
  before: z.number().int().nonnegative().optional(),
  limit: z.number().int().min(1).max(500).default(50),
  offset: z.number().int().nonnegative().default(0),
});
export type ChatQuery = z.infer<typeof ChatQuerySchema>;

/** Safe-parse an untrusted account (IPC / DB / adapter boundary). */
export function parseChatAccount(input: unknown): z.SafeParseReturnType<unknown, ChatAccount> {
  return ChatAccountSchema.safeParse(input);
}

/** Safe-parse one untrusted adapter event. */
export function parseChatEvent(input: unknown): z.SafeParseReturnType<unknown, ChatEvent> {
  return ChatEventSchema.safeParse(input);
}
