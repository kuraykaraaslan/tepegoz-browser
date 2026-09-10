import { foldForSearch } from '@tepegoz/i18n';
import type {
  ChatAccount,
  ChatContact,
  ChatConversation,
  ChatMessage,
  ChatReceipt,
} from '@tepegoz/shared-types';
import type { Db } from './db';

/**
 * `ChatStore` — the local projection for `@tepegoz/ext-chat` (phase X-chat.1), migration 21.
 *
 * Snake_case columns ⇄ camelCase domain types; JSON columns for the small arrays (`server`,
 * `groups`, `reactions`). Messages are deduped by `(conversation_id, protocol_id)` — the wire id —
 * so a re-delivered stanza / re-synced Matrix event upserts rather than duplicating. `body_fold` is
 * written here with the one `foldForSearch` (never SQLite `LOWER()`).
 *
 * The store holds no secret: `chat_accounts.secret_ref` is a vault key. E2EE session material
 * (X-chat.7) and the FTS writer land with their own phases.
 */

// ── accounts ────────────────────────────────────────────────────────────────

interface ChatAccountRow {
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

function rowToAccount(row: ChatAccountRow): ChatAccount {
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

interface ChatContactRow {
  id: string;
  account_id: string;
  address: string;
  name: string;
  groups_json: string;
  presence: ChatContact['presence'];
  status_text: string;
  subscription: ChatContact['subscription'];
}

function rowToContact(row: ChatContactRow): ChatContact {
  return {
    id: row.id,
    accountId: row.account_id,
    address: row.address,
    name: row.name,
    groups: parseJson<string[]>(row.groups_json, []),
    presence: row.presence,
    statusText: row.status_text,
    subscription: row.subscription,
  };
}

// ── conversations ───────────────────────────────────────────────────────────

interface ChatConversationRow {
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
  notify_level: ChatConversation['notifyLevel'];
  is_known_contact: number;
  updated_at: number;
}

function rowToConversation(row: ChatConversationRow): ChatConversation {
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
    notifyLevel: row.notify_level,
    isKnownContact: row.is_known_contact === 1,
    updatedAt: row.updated_at,
  };
}

// ── messages ────────────────────────────────────────────────────────────────

interface ChatMessageRow {
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

function rowToMessage(row: ChatMessageRow): ChatMessage {
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

export class ChatStore {
  // accounts ----------------------------------------------------------------

  static listAccounts(db: Db): ChatAccount[] {
    const rows = db
      .prepare('SELECT * FROM chat_accounts WHERE tombstone = 0 ORDER BY "order" ASC, label ASC')
      .all() as ChatAccountRow[];
    return rows.map(rowToAccount);
  }

  static getAccount(db: Db, id: string): ChatAccount | null {
    const row = db.prepare('SELECT * FROM chat_accounts WHERE id = ?').get(id) as
      | ChatAccountRow
      | undefined;
    return row === undefined ? null : rowToAccount(row);
  }

  static upsertAccount(db: Db, account: ChatAccount): void {
    db.prepare(
      `INSERT INTO chat_accounts (
        id, label, protocol, display_name, server_json, secret_ref, color, "order",
        updated_at, version, tombstone
      ) VALUES (
        @id, @label, @protocol, @displayName, @serverJson, @secretRef, @color, @order,
        @updatedAt, @version, 0
      )
      ON CONFLICT(id) DO UPDATE SET
        label = excluded.label,
        protocol = excluded.protocol,
        display_name = excluded.display_name,
        server_json = excluded.server_json,
        secret_ref = excluded.secret_ref,
        color = excluded.color,
        "order" = excluded."order",
        updated_at = excluded.updated_at,
        version = excluded.version,
        tombstone = 0`,
    ).run({
      id: account.id,
      label: account.label,
      protocol: account.server.protocol,
      displayName: account.displayName,
      serverJson: JSON.stringify(account.server),
      secretRef: account.secretRef,
      color: account.color,
      order: account.order,
      updatedAt: account.updatedAt,
      version: account.version,
    });
  }

  /** Soft delete (tombstone) — a hard delete on one device is indistinguishable from a not-yet-synced
   *  row. The cascade of conversations/messages is done separately by the host on real removal. */
  static tombstoneAccount(db: Db, id: string, now: number): void {
    db.prepare(
      'UPDATE chat_accounts SET tombstone = 1, updated_at = ?, version = version + 1 WHERE id = ?',
    ).run(now, id);
  }

  static deleteAccount(db: Db, id: string): void {
    db.prepare('DELETE FROM chat_accounts WHERE id = ?').run(id);
  }

  // contacts --------------------------------------------------------------

  static listContacts(db: Db, accountId: string): ChatContact[] {
    const rows = db
      .prepare('SELECT * FROM chat_contacts WHERE account_id = ? ORDER BY name ASC, address ASC')
      .all(accountId) as ChatContactRow[];
    return rows.map(rowToContact);
  }

  static upsertContact(db: Db, contact: ChatContact): void {
    db.prepare(
      `INSERT INTO chat_contacts (
        id, account_id, address, name, groups_json, presence, status_text, subscription
      ) VALUES (
        @id, @accountId, @address, @name, @groupsJson, @presence, @statusText, @subscription
      )
      ON CONFLICT(account_id, address) DO UPDATE SET
        name = excluded.name,
        groups_json = excluded.groups_json,
        presence = excluded.presence,
        status_text = excluded.status_text,
        subscription = excluded.subscription`,
    ).run({
      id: contact.id,
      accountId: contact.accountId,
      address: contact.address,
      name: contact.name,
      groupsJson: JSON.stringify(contact.groups),
      presence: contact.presence,
      statusText: contact.statusText,
      subscription: contact.subscription,
    });
  }

  static deleteContact(db: Db, accountId: string, address: string): void {
    db.prepare('DELETE FROM chat_contacts WHERE account_id = ? AND address = ?').run(
      accountId,
      address,
    );
  }

  // conversations -------------------------------------------------------

  static listConversations(db: Db, accountId?: string): ChatConversation[] {
    const rows =
      accountId === undefined
        ? (db
            .prepare('SELECT * FROM chat_conversations ORDER BY updated_at DESC')
            .all() as ChatConversationRow[])
        : (db
            .prepare(
              'SELECT * FROM chat_conversations WHERE account_id = ? ORDER BY updated_at DESC',
            )
            .all(accountId) as ChatConversationRow[]);
    return rows.map(rowToConversation);
  }

  static getConversation(db: Db, id: string): ChatConversation | null {
    const row = db.prepare('SELECT * FROM chat_conversations WHERE id = ?').get(id) as
      | ChatConversationRow
      | undefined;
    return row === undefined ? null : rowToConversation(row);
  }

  static upsertConversation(db: Db, conv: ChatConversation): void {
    db.prepare(
      `INSERT INTO chat_conversations (
        id, account_id, kind, address, name, topic, member_count, unread, mentions,
        last_read_id, muted, notify_level, is_known_contact, updated_at
      ) VALUES (
        @id, @accountId, @kind, @address, @name, @topic, @memberCount, @unread, @mentions,
        @lastReadId, @muted, @notifyLevel, @isKnownContact, @updatedAt
      )
      ON CONFLICT(account_id, address) DO UPDATE SET
        kind = excluded.kind,
        name = excluded.name,
        topic = excluded.topic,
        member_count = excluded.member_count,
        unread = excluded.unread,
        mentions = excluded.mentions,
        last_read_id = excluded.last_read_id,
        muted = excluded.muted,
        notify_level = excluded.notify_level,
        is_known_contact = excluded.is_known_contact,
        updated_at = excluded.updated_at`,
    ).run({
      id: conv.id,
      accountId: conv.accountId,
      kind: conv.kind,
      address: conv.address,
      name: conv.name,
      topic: conv.topic,
      memberCount: conv.memberCount,
      unread: conv.unread,
      mentions: conv.mentions,
      lastReadId: conv.lastReadId,
      muted: conv.muted ? 1 : 0,
      notifyLevel: conv.notifyLevel,
      isKnownContact: conv.isKnownContact ? 1 : 0,
      updatedAt: conv.updatedAt,
    });
  }

  // messages ----------------------------------------------------------------

  /** Newest-first page; pass `beforeTs` to page backwards through history. */
  static listMessages(
    db: Db,
    conversationId: string,
    limit = 100,
    beforeTs?: number,
  ): ChatMessage[] {
    const n = Math.max(1, Math.min(Math.trunc(limit), 500));
    const rows =
      beforeTs === undefined
        ? (db
            .prepare(
              'SELECT * FROM chat_messages WHERE conversation_id = ? ORDER BY origin_ts DESC LIMIT ?',
            )
            .all(conversationId, n) as ChatMessageRow[])
        : (db
            .prepare(
              'SELECT * FROM chat_messages WHERE conversation_id = ? AND origin_ts < ? ORDER BY origin_ts DESC LIMIT ?',
            )
            .all(conversationId, beforeTs, n) as ChatMessageRow[]);
    return rows.map(rowToMessage).reverse();
  }

  /**
   * Keep a message's `chat_search` (FTS5) row in step with `chat_messages`: a redacted or
   * empty-fold message has no row, everything else has exactly one. Called from every write path so
   * the fold and the index stay in one code path (never a SQL trigger — the Turkish fold is JS).
   */
  private static syncSearchRow(
    db: Db,
    id: string,
    bodyFold: string,
    senderName: string,
    redacted: boolean,
  ): void {
    db.prepare('DELETE FROM chat_search WHERE message_id = ?').run(id);
    if (!redacted && bodyFold !== '') {
      db.prepare('INSERT INTO chat_search (message_id, body, sender) VALUES (?, ?, ?)').run(
        id,
        bodyFold,
        senderName,
      );
    }
  }

  /**
   * Full-text search over message bodies, newest-first, backed by the `chat_search` FTS5 index. The
   * needle is folded with the same Turkish-aware `foldForSearch` as the stored `body`, split into
   * tokens, and each token is matched as a quoted phrase (so an FTS operator character in the user's
   * text is inert); the final token is a prefix match, so `toplantı` still finds `toplantısı`.
   * Redacted messages have no index row. Optionally scoped to one account or one conversation.
   */
  static searchMessages(
    db: Db,
    opts: { text: string; accountId?: string; conversationId?: string; limit?: number },
  ): ChatMessage[] {
    const tokens = foldForSearch(opts.text).match(/[\p{L}\p{N}]+/gu) ?? [];
    if (tokens.length === 0) return [];
    const match = tokens
      .map((t, i) => (i === tokens.length - 1 ? `"${t}"*` : `"${t}"`))
      .join(' ');
    const n = Math.max(1, Math.min(Math.trunc(opts.limit ?? 50), 200));
    const where = ['chat_search MATCH ?'];
    const params: unknown[] = [match];
    if (opts.accountId !== undefined) {
      where.push('m.account_id = ?');
      params.push(opts.accountId);
    }
    if (opts.conversationId !== undefined) {
      where.push('m.conversation_id = ?');
      params.push(opts.conversationId);
    }
    params.push(n);
    const rows = db
      .prepare(
        `SELECT m.* FROM chat_search
         JOIN chat_messages m ON m.id = chat_search.message_id
         WHERE ${where.join(' AND ')}
         ORDER BY m.origin_ts DESC LIMIT ?`,
      )
      .all(...params) as ChatMessageRow[];
    return rows.map(rowToMessage);
  }

  /** One message by its local id within a conversation, or `null`. */
  static getMessage(db: Db, conversationId: string, messageId: string): ChatMessage | null {
    const row = db
      .prepare('SELECT * FROM chat_messages WHERE conversation_id = ? AND id = ?')
      .get(conversationId, messageId) as ChatMessageRow | undefined;
    return row === undefined ? null : rowToMessage(row);
  }

  static upsertMessage(db: Db, message: ChatMessage): void {
    db.prepare(
      `INSERT INTO chat_messages (
        id, conversation_id, account_id, protocol_id, sender_address, sender_name, kind, body,
        body_fold, media_ref, reply_to_id, reactions_json, edited_at, redacted, origin_ts,
        received_at, delivery_state
      ) VALUES (
        @id, @conversationId, @accountId, @protocolId, @senderAddress, @senderName, @kind, @body,
        @bodyFold, @mediaRef, @replyToId, @reactionsJson, @editedAt, @redacted, @originTs,
        @receivedAt, @deliveryState
      )
      ON CONFLICT(conversation_id, protocol_id) DO UPDATE SET
        body = excluded.body,
        body_fold = excluded.body_fold,
        kind = excluded.kind,
        media_ref = excluded.media_ref,
        reactions_json = excluded.reactions_json,
        edited_at = excluded.edited_at,
        redacted = excluded.redacted,
        delivery_state = excluded.delivery_state`,
    ).run({
      id: message.id,
      conversationId: message.conversationId,
      accountId: message.accountId,
      protocolId: message.protocolId,
      senderAddress: message.senderAddress,
      senderName: message.senderName,
      kind: message.kind,
      body: message.body,
      bodyFold: foldForSearch(message.body),
      mediaRef: message.mediaRef,
      replyToId: message.replyToId,
      reactionsJson: JSON.stringify(message.reactions),
      editedAt: message.editedAt,
      redacted: message.redacted ? 1 : 0,
      originTs: message.originTs,
      receivedAt: message.receivedAt,
      deliveryState: message.deliveryState,
    });
    ChatStore.syncSearchRow(
      db,
      message.id,
      foldForSearch(message.body),
      message.senderName,
      message.redacted,
    );
  }

  /** Redact in place — clears the body (and its fold) so a deleted message leaves no searchable trace. */
  static redactMessage(db: Db, conversationId: string, protocolId: string): void {
    db.prepare(
      "UPDATE chat_messages SET redacted = 1, body = '', body_fold = '' WHERE conversation_id = ? AND protocol_id = ?",
    ).run(conversationId, protocolId);
    db.prepare(
      `DELETE FROM chat_search WHERE message_id IN
         (SELECT id FROM chat_messages WHERE conversation_id = ? AND protocol_id = ?)`,
    ).run(conversationId, protocolId);
  }

  // receipts --------------------------------------------------------------

  static addReceipt(db: Db, receipt: ChatReceipt): void {
    db.prepare(
      `INSERT INTO chat_receipts (conversation_id, message_id, by_address, kind, ts)
       VALUES (@conversationId, @messageId, @byAddress, @kind, @ts)
       ON CONFLICT(conversation_id, message_id, by_address, kind) DO UPDATE SET ts = excluded.ts`,
    ).run({
      conversationId: receipt.conversationId,
      messageId: receipt.messageId,
      byAddress: receipt.byAddress,
      kind: receipt.kind,
      ts: receipt.ts,
    });
  }

  static listReceipts(db: Db, conversationId: string): ChatReceipt[] {
    const rows = db
      .prepare('SELECT * FROM chat_receipts WHERE conversation_id = ? ORDER BY ts ASC')
      .all(conversationId) as {
      conversation_id: string;
      message_id: string;
      by_address: string;
      kind: ChatReceipt['kind'];
      ts: number;
    }[];
    return rows.map((r) => ({
      conversationId: r.conversation_id,
      messageId: r.message_id,
      byAddress: r.by_address,
      kind: r.kind,
      ts: r.ts,
    }));
  }
}
