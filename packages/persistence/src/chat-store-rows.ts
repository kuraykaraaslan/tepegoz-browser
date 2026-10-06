import type {
  ChatAccount,
  ChatContact,
  ChatConversation,
  ChatMessage,
} from '@tepegoz/shared-types';

/**
 * Row shapes and row ⇄ domain mappers for `ChatStore` (migration 21+). Snake_case columns map to the
 * camelCase domain types; JSON columns decode through {@link parseJson}. Split out of `chat-store.ts`.
 */

// ── accounts ────────────────────────────────────────────────────────────────

export interface ChatAccountRow {
  id: string;
  label: string;
  protocol: string;
  display_name: string;
  server_json: string;
  secret_ref: string;
  color: string | null;
  order: number;
  updated_at: number;
  version: number;
}

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function rowToAccount(row: ChatAccountRow): ChatAccount {
  return {
    id: row.id,
    label: row.label,
    displayName: row.display_name,
    server: parseJson<ChatAccount['server']>(row.server_json, {
      protocol: 'xmpp',
      jid: '',
      host: null,
      port: null,
      security: 'tls',
      wsUrl: null,
    }),
    secretRef: row.secret_ref,
    color: row.color,
    order: row.order,
    updatedAt: row.updated_at,
    version: row.version,
  };
}

// ── contacts ────────────────────────────────────────────────────────────────

export interface ChatContactRow {
  id: string;
  account_id: string;
  address: string;
  name: string;
  groups_json: string;
  presence: ChatContact['presence'];
  status_text: string;
  subscription: ChatContact['subscription'];
  blocked: number;
}

export function rowToContact(row: ChatContactRow): ChatContact {
  return {
    id: row.id,
    accountId: row.account_id,
    address: row.address,
    name: row.name,
    groups: parseJson<string[]>(row.groups_json, []),
    presence: row.presence,
    statusText: row.status_text,
    subscription: row.subscription,
    blocked: row.blocked === 1,
  };
}

// ── conversations ───────────────────────────────────────────────────────────

export interface ChatConversationRow {
  id: string;
  account_id: string;
  kind: ChatConversation['kind'];
  address: string;
  name: string;
  topic: string;
  member_count: number;
  unread: number;
  mentions: number;
  last_read_id: string | null;
  muted: number;
  muted_until: number | null;
  notify_level: ChatConversation['notifyLevel'];
  is_known_contact: number;
  archived: number;
  last_message_json: string | null;
  updated_at: number;
}

export function rowToConversation(row: ChatConversationRow): ChatConversation {
  return {
    id: row.id,
    accountId: row.account_id,
    kind: row.kind,
    address: row.address,
    name: row.name,
    topic: row.topic,
    memberCount: row.member_count,
    unread: row.unread,
    mentions: row.mentions,
    lastReadId: row.last_read_id,
    muted: row.muted === 1,
    mutedUntil: row.muted_until,
    notifyLevel: row.notify_level,
    isKnownContact: row.is_known_contact === 1,
    archived: row.archived === 1,
    lastMessage:
      row.last_message_json === null
        ? null
        : parseJson<ChatConversation['lastMessage']>(row.last_message_json, null),
    updatedAt: row.updated_at,
  };
}

// ── messages ────────────────────────────────────────────────────────────────

export interface ChatMessageRow {
  id: string;
  conversation_id: string;
  account_id: string;
  protocol_id: string;
  sender_address: string;
  sender_name: string;
  kind: ChatMessage['kind'];
  body: string;
  media_ref: string | null;
  reply_to_id: string | null;
  reactions_json: string;
  edited_at: number | null;
  redacted: number;
  origin_ts: number;
  received_at: number;
  delivery_state: ChatMessage['deliveryState'];
}

export function rowToMessage(row: ChatMessageRow): ChatMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    accountId: row.account_id,
    protocolId: row.protocol_id,
    senderAddress: row.sender_address,
    senderName: row.sender_name,
    kind: row.kind,
    body: row.body,
    mediaRef: row.media_ref,
    replyToId: row.reply_to_id,
    reactions: parseJson<ChatMessage['reactions']>(row.reactions_json, []),
    editedAt: row.edited_at,
    redacted: row.redacted === 1,
    originTs: row.origin_ts,
    receivedAt: row.received_at,
    deliveryState: row.delivery_state,
  };
}
