import { z } from 'zod';

/**
 * Mail client domain model (`@tepegoz/ext-mail`, phase X-mail.0) — the one place its schemas live.
 *
 * **Multi-account first**: nothing is addressable without an `accountId`, and the vault secret is per
 * account (this file holds `secretRef`, the key, never the secret). Every protocol difference is a
 * flag or an adapter concern, never a special case in the model.
 *
 * Everything crossing IPC, coming off an adapter's wire (an IMAP FETCH, a JMAP response, a Graph
 * page), loaded from the DB, parsed out of a raw RFC 5322 message, or arriving as an agent tool-call
 * argument is `safeParse`d against these. Strings are length-capped and arrays size-capped so a
 * hostile server or a giant message cannot DoS the parser.
 */

// ---------------------------------------------------------------------------
// Account
// ---------------------------------------------------------------------------

/** Account id: a lowercase dash-separated slug — used in folder ids and as a vault-key component,
 *  so it can neither collide nor escape. */
export const MAIL_ACCOUNT_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MAIL_ACCOUNT_ID_MAX = 64;

export function isValidMailAccountId(id: string): boolean {
  return id.length <= MAIL_ACCOUNT_ID_MAX && MAIL_ACCOUNT_ID_PATTERN.test(id);
}

export const MailAccountIdSchema = z
  .string()
  .max(MAIL_ACCOUNT_ID_MAX)
  .regex(MAIL_ACCOUNT_ID_PATTERN, 'A mail account id must be a lowercase, dash-separated slug');

export const MAIL_ADAPTER_KINDS = ['imap-smtp', 'jmap', 'gmail', 'graph'] as const;
export const MailAdapterKindSchema = z.enum(MAIL_ADAPTER_KINDS);
export type MailAdapterKind = z.infer<typeof MailAdapterKindSchema>;

/** Transport security for a stream connection. Cleartext is deliberately not representable. */
export const MAIL_CONNECTION_SECURITY = ['tls', 'starttls'] as const;
export const MailConnectionSecuritySchema = z.enum(MAIL_CONNECTION_SECURITY);
export type MailConnectionSecurity = z.infer<typeof MailConnectionSecuritySchema>;

const imapSmtpServer = z.object({
  kind: z.literal('imap-smtp'),
  imapHost: z.string().min(1).max(255),
  imapPort: z.number().int().min(1).max(65535),
  imapSecurity: MailConnectionSecuritySchema.default('tls'),
  smtpHost: z.string().min(1).max(255),
  smtpPort: z.number().int().min(1).max(65535),
  smtpSecurity: MailConnectionSecuritySchema.default('starttls'),
  username: z.string().min(1).max(320),
});

const jmapServer = z.object({
  kind: z.literal('jmap'),
  sessionUrl: z.string().url().max(2048),
  username: z.string().min(1).max(320),
});

/** Gmail / Graph carry no host config — auth is entirely through the Phase 3 OAuth broker. */
const oauthServer = z.object({
  kind: z.enum(['gmail', 'graph']),
});

/** Per-adapter connection config — a discriminated union so an `imap-smtp` row without an SMTP host,
 *  or a `jmap` row carrying an `imapPort`, is not representable. **No key material here.** */
export const MailServerConfigSchema = z.discriminatedUnion('kind', [
  imapSmtpServer,
  jmapServer,
  oauthServer,
]);
export type MailServerConfig = z.infer<typeof MailServerConfigSchema>;

/** One "from" identity on an account (a plus-alias, a shared mailbox, a role address). */
export const MailIdentitySchema = z.object({
  id: z.string().min(1).max(64),
  displayName: z.string().max(255).default(''),
  address: z.string().email().max(320),
  replyTo: z.string().email().max(320).nullable().default(null),
  signature: z.string().max(8192).default(''),
  isDefault: z.boolean().default(false),
});
export type MailIdentity = z.infer<typeof MailIdentitySchema>;

export const MAIL_BODY_PREFETCH = ['none', 'inbox', 'all'] as const;
export const MailBodyPrefetchSchema = z.enum(MAIL_BODY_PREFETCH);
export type MailBodyPrefetch = z.infer<typeof MailBodyPrefetchSchema>;

export const MailSyncPrefsSchema = z.object({
  enabled: z.boolean().default(true),
  intervalSeconds: z.number().int().min(30).max(86_400).default(300),
  bodyPrefetch: MailBodyPrefetchSchema.default('inbox'),
  /** How far back the initial sync reaches; `0` ⇒ everything. */
  syncWindowDays: z.number().int().min(0).max(3650).default(365),
});
export type MailSyncPrefs = z.infer<typeof MailSyncPrefsSchema>;

export const MailAccountSchema = z.object({
  id: MailAccountIdSchema,
  label: z.string().min(1).max(64),
  email: z.string().email().max(320),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable()
    .default(null),
  order: z.number().int().min(0).max(9999).default(0),
  server: MailServerConfigSchema,
  /** Vault key the password / token is stored under — NEVER the credential. */
  secretRef: z.string().min(1).max(256),
  identities: z.array(MailIdentitySchema).min(1).max(32),
  sync: MailSyncPrefsSchema,
  // sync-meta from day 0 (Phase 3 account sync owes no migration).
  updatedAt: z.number().int().nonnegative(),
  version: z.number().int().nonnegative(),
});
export type MailAccount = z.infer<typeof MailAccountSchema>;

// ---------------------------------------------------------------------------
// Folders
// ---------------------------------------------------------------------------

/** SPECIAL-USE / role folders, normalised across IMAP `\Special-use`, JMAP roles and Gmail labels. */
export const MAIL_FOLDER_ROLES = [
  'inbox',
  'sent',
  'drafts',
  'trash',
  'junk',
  'archive',
  'all',
] as const;
export const MailFolderRoleSchema = z.enum(MAIL_FOLDER_ROLES);
export type MailFolderRole = z.infer<typeof MailFolderRoleSchema>;

export const MailFolderSchema = z.object({
  id: z.string().min(1).max(256),
  accountId: MailAccountIdSchema,
  /** Server path (`INBOX/Projects/Tepegöz`) — the addressable name. */
  path: z.string().min(1).max(1024),
  /** Leaf display name, already decoded from modified-UTF-7 where applicable. */
  name: z.string().min(1).max(256),
  /** Hierarchy delimiter (`/`, `.`); `null` for a flat namespace / labels. */
  delimiter: z.string().max(4).nullable().default(null),
  role: MailFolderRoleSchema.nullable().default(null),
  subscribed: z.boolean().default(true),
  /** `\Noselect` folders are containers only. */
  selectable: z.boolean().default(true),
  unread: z.number().int().nonnegative().default(0),
  total: z.number().int().nonnegative().default(0),
});
export type MailFolder = z.infer<typeof MailFolderSchema>;

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

/** The five RFC 3501 system flags. Client keywords live in `keywords[]`, not here. */
export const MAIL_FLAGS = ['seen', 'answered', 'flagged', 'draft', 'deleted'] as const;
export const MailFlagSchema = z.enum(MAIL_FLAGS);
export type MailFlag = z.infer<typeof MailFlagSchema>;

/** A parsed address — already split from the `Display Name <addr@host>` header form. */
export const MailAddressSchema = z.object({
  name: z.string().max(998).default(''),
  address: z.string().max(320),
});
export type MailAddress = z.infer<typeof MailAddressSchema>;

const addressList = z.array(MailAddressSchema).max(1024);
const MESSAGE_ID_MAX = 998;

export const MailMessageSchema = z.object({
  /** Local stable id (`accountId:folderId:uid` or a hash) — the one every other table references. */
  id: z.string().min(1).max(256),
  accountId: MailAccountIdSchema,
  folderId: z.string().min(1).max(256),
  /** IMAP UID / JMAP id within the folder. */
  uid: z.string().min(1).max(128),
  threadId: z.string().min(1).max(256),
  /** RFC 5322 `Message-ID` (with angle brackets stripped), when the message has one. */
  messageId: z.string().max(MESSAGE_ID_MAX).nullable().default(null),
  inReplyTo: z.string().max(MESSAGE_ID_MAX).nullable().default(null),
  references: z.array(z.string().max(MESSAGE_ID_MAX)).max(256).default([]),
  from: addressList.default([]),
  sender: MailAddressSchema.nullable().default(null),
  to: addressList.default([]),
  cc: addressList.default([]),
  bcc: addressList.default([]),
  replyTo: addressList.default([]),
  subject: z.string().max(2048).default(''),
  /** The `Date:` header, epoch ms. */
  date: z.number().int().nonnegative(),
  /** When this mailbox received it (INTERNALDATE), epoch ms. */
  receivedAt: z.number().int().nonnegative(),
  flags: z.array(MailFlagSchema).max(16).default([]),
  keywords: z.array(z.string().max(64)).max(64).default([]),
  hasAttachments: z.boolean().default(false),
  size: z.number().int().nonnegative().default(0),
  /** Plain-text preview (see `@tepegoz/mail-core` `snippet.ts`), already capped. */
  snippet: z.string().max(1024).default(''),
  /** `List-Id` of a mailing list, when present. */
  listId: z.string().max(512).nullable().default(null),
  /** Ref into the body store; `null` until the body is fetched. */
  bodyRef: z.string().max(512).nullable().default(null),
});
export type MailMessage = z.infer<typeof MailMessageSchema>;

export const MAIL_QUARANTINE = ['pending', 'clean', 'blocked'] as const;
export const MailQuarantineSchema = z.enum(MAIL_QUARANTINE);
export type MailQuarantine = z.infer<typeof MailQuarantineSchema>;

export const MailAttachmentMetaSchema = z.object({
  id: z.string().min(1).max(256),
  messageId: z.string().min(1).max(256),
  /** MIME part path (`1.2.3`). */
  partId: z.string().min(1).max(64),
  filename: z.string().max(1024).default(''),
  mimeType: z.string().max(255).default('application/octet-stream'),
  size: z.number().int().nonnegative().default(0),
  /** `Content-Disposition: inline` with a `Content-ID` referenced by the HTML body. */
  inline: z.boolean().default(false),
  contentId: z.string().max(998).nullable().default(null),
  /** Ref into the quarantined blob store; `null` until materialised. */
  blobRef: z.string().max(512).nullable().default(null),
  quarantine: MailQuarantineSchema.default('pending'),
});
export type MailAttachmentMeta = z.infer<typeof MailAttachmentMetaSchema>;

export const MailBodySchema = z.object({
  messageId: z.string().min(1).max(256),
  text: z.string().max(2_000_000).default(''),
  html: z.string().max(5_000_000).nullable().default(null),
  /** The HTML references a remote resource (image / CSS) — the reader blocks it until the user opts in. */
  hasRemoteContent: z.boolean().default(false),
  attachments: z.array(MailAttachmentMetaSchema).max(1024).default([]),
});
export type MailBody = z.infer<typeof MailBodySchema>;

// ---------------------------------------------------------------------------
// Drafts
// ---------------------------------------------------------------------------

export const MailDraftSchema = z.object({
  id: z.string().min(1).max(256),
  accountId: MailAccountIdSchema,
  identityId: z.string().min(1).max(64),
  to: addressList.default([]),
  cc: addressList.default([]),
  bcc: addressList.default([]),
  subject: z.string().max(2048).default(''),
  bodyText: z.string().max(2_000_000).default(''),
  bodyHtml: z.string().max(5_000_000).nullable().default(null),
  inReplyToMessageId: z.string().max(256).nullable().default(null),
  references: z.array(z.string().max(MESSAGE_ID_MAX)).max(256).default([]),
  /** Ids of already-staged attachments (in the file-operations sandbox). */
  attachments: z.array(z.string().max(256)).max(64).default([]),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});
export type MailDraft = z.infer<typeof MailDraftSchema>;

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

export const MAIL_FILTER_FIELDS = [
  'from',
  'to',
  'cc',
  'to-or-cc',
  'any-recipient',
  'subject',
  'list-id',
  'size',
] as const;
export const MailFilterFieldSchema = z.enum(MAIL_FILTER_FIELDS);
export type MailFilterField = z.infer<typeof MailFilterFieldSchema>;

export const MAIL_FILTER_OPS = [
  'contains',
  'not-contains',
  'is',
  'is-not',
  'starts-with',
  'ends-with',
  'matches',
  'gt',
  'lt',
] as const;
export const MailFilterOpSchema = z.enum(MAIL_FILTER_OPS);
export type MailFilterOp = z.infer<typeof MailFilterOpSchema>;

export const MAIL_FILTER_ACTIONS = [
  'move',
  'copy',
  'add-flag',
  'mark-read',
  'add-keyword',
  'delete',
] as const;
export const MailFilterActionKindSchema = z.enum(MAIL_FILTER_ACTIONS);
export type MailFilterActionKind = z.infer<typeof MailFilterActionKindSchema>;

export const MailFilterConditionSchema = z.object({
  field: MailFilterFieldSchema,
  op: MailFilterOpSchema,
  /** The comparand — a substring / pattern / anchored RegExp source / a number-as-string for `size`. */
  value: z.string().max(1024),
});
export type MailFilterCondition = z.infer<typeof MailFilterConditionSchema>;

export const MailFilterActionSchema = z.object({
  kind: MailFilterActionKindSchema,
  /** Target folder id (`move` / `copy`), flag (`add-flag`), or keyword (`add-keyword`); ignored otherwise. */
  arg: z.string().max(256).default(''),
});
export type MailFilterAction = z.infer<typeof MailFilterActionSchema>;

export const MailFilterSchema = z.object({
  id: z.string().min(1).max(256),
  /** `null` ⇒ applies to every account. */
  accountId: MailAccountIdSchema.nullable().default(null),
  name: z.string().min(1).max(128),
  enabled: z.boolean().default(true),
  match: z.enum(['all', 'any']).default('all'),
  conditions: z.array(MailFilterConditionSchema).min(1).max(32),
  actions: z.array(MailFilterActionSchema).min(1).max(16),
  order: z.number().int().min(0).max(9999).default(0),
  /** Stop evaluating later filters once this one matches. */
  stopOnMatch: z.boolean().default(false),
});
export type MailFilter = z.infer<typeof MailFilterSchema>;

// ---------------------------------------------------------------------------
// Query / sync cursor
// ---------------------------------------------------------------------------

export const MailQuerySchema = z.object({
  text: z.string().max(256).optional(),
  from: z.string().max(320).optional(),
  to: z.string().max(320).optional(),
  subject: z.string().max(256).optional(),
  accountId: MailAccountIdSchema.optional(),
  folderId: z.string().max(256).optional(),
  flag: MailFlagSchema.optional(),
  unreadOnly: z.boolean().optional(),
  hasAttachment: z.boolean().optional(),
  since: z.number().int().nonnegative().optional(),
  before: z.number().int().nonnegative().optional(),
  limit: z.number().int().min(1).max(500).default(50),
  offset: z.number().int().nonnegative().default(0),
});
export type MailQuery = z.infer<typeof MailQuerySchema>;

/** Per-folder sync state — the union of what IMAP (`CONDSTORE`/`QRESYNC`), JMAP and Graph each need. */
export const MailSyncCursorSchema = z.object({
  accountId: MailAccountIdSchema,
  folderId: z.string().min(1).max(256),
  uidValidity: z.number().int().nonnegative().nullable().default(null),
  uidNext: z.number().int().nonnegative().nullable().default(null),
  highestModSeq: z.number().int().nonnegative().nullable().default(null),
  jmapState: z.string().max(512).nullable().default(null),
  lastSyncAt: z.number().int().nonnegative().nullable().default(null),
});
export type MailSyncCursor = z.infer<typeof MailSyncCursorSchema>;

/** Parse-at-the-boundary convenience, mirroring `parseChatEvent`. */
export function parseMailMessage(
  input: unknown,
): z.SafeParseReturnType<unknown, MailMessage> {
  return MailMessageSchema.safeParse(input);
}
