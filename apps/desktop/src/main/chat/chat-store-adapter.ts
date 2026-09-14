import { ChatStore } from '@tepegoz/persistence';
import type { ChatAccount, ChatContact, ChatConversation } from '@tepegoz/shared-types';
import type { Db } from '@tepegoz/persistence';
import type { ChatRunnerStore } from './account-runner';

/**
 * `ChatStore` (migration 21) bound to a `Db` handle — the concrete `ChatRunnerStore` each
 * `ChatAccountRunner` writes to, plus the read projections the IPC layer serves. Kept separate from
 * `chat-service.electron.ts` so it is testable against an in-memory database.
 */

/** A `ChatRunnerStore` that writes through `ChatStore` to `db`. */
export function makeRunnerStore(db: Db): ChatRunnerStore {
  return {
    upsertMessage: (message) => ChatStore.upsertMessage(db, message),
    redactMessage: (conversationId, protocolId) =>
      ChatStore.redactMessage(db, conversationId, protocolId),
    upsertConversation: (conversation) => ChatStore.upsertConversation(db, conversation),
    upsertContact: (contact) => ChatStore.upsertContact(db, contact),
    getConversation: (id) => ChatStore.getConversation(db, id),
    listMessages: (conversationId) => ChatStore.listMessages(db, conversationId),
    listRoomIds: (accountId) =>
      ChatStore.listConversations(db, accountId)
        .filter((c) => c.kind === 'room')
        .map((c) => c.id),
    listReadMarkers: (accountId) =>
      ChatStore.listConversations(db, accountId).map((c) => ({ id: c.id, lastReadId: c.lastReadId })),
  };
}

/** Accounts, minus anything the renderer should not see (the vault key stays out of the wire). */
export interface ChatAccountSummary {
  id: string;
  label: string;
  displayName: string;
  protocol: string;
  color: string | null;
  order: number;
}

export function listAccountSummaries(db: Db): ChatAccountSummary[] {
  return ChatStore.listAccounts(db).map((a) => ({
    id: a.id,
    label: a.label,
    displayName: a.displayName,
    protocol: a.server.protocol,
    color: a.color,
    order: a.order,
  }));
}

export function listAccounts(db: Db): ChatAccount[] {
  return ChatStore.listAccounts(db);
}

/** One account's config for the edit form — everything `listAccountSummaries` omits, except the
 *  vault key itself, which still has no reason to cross (the renderer never uses it; only the
 *  plaintext secret it names is sensitive, and that never round-trips either way). */
export function getAccountForEdit(db: Db, id: string): Omit<ChatAccount, 'secretRef'> | null {
  const account = ChatStore.getAccount(db, id);
  if (account === null) return null;
  return {
    id: account.id,
    label: account.label,
    displayName: account.displayName,
    server: account.server,
    color: account.color,
    order: account.order,
    updatedAt: account.updatedAt,
    version: account.version,
  };
}

export function listConversations(db: Db, accountId?: string): ChatConversation[] {
  return ChatStore.listConversations(db, accountId);
}

export function listContacts(db: Db, accountId: string): ChatContact[] {
  return ChatStore.listContacts(db, accountId);
}

export function upsertAccount(db: Db, account: ChatAccount): void {
  ChatStore.upsertAccount(db, account);
}

export function deleteAccount(db: Db, id: string): void {
  ChatStore.deleteAccount(db, id);
}
