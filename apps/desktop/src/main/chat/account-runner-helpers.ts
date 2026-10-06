import { AppError } from '@tepegoz/libs';
import type {
  ChatAccount,
  ChatConversation,
  ChatConversationLastMessage,
  ChatMessage,
} from '@tepegoz/shared-types';
import type { ChatAdapter, ChatSession, ChatTransport } from '@tepegoz/chat-adapters';
import { decideNotification } from '@tepegoz/chat-core';
import type { ChatNotification } from './account-runner-types';

/** Pure, IO-free helpers `ChatAccountRunner` leans on (identity derivation, row shaping, media). */

export const MEDIA_MAX_BYTES = 12 * 1024 * 1024;
export const MEDIA_FETCH_TIMEOUT_MS = 20_000;

/** Keep only a sane `type/subtype` from the server's `content-type`; default to a safe octet-stream. */
export function sanitizeMediaMime(raw: string | undefined): string {
  const first = (raw ?? '').split(';', 1)[0]?.trim().toLowerCase() ?? '';
  return /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/.test(first)
    ? first
    : 'application/octet-stream';
}

export function deriveBareJid(account: ChatAccount): string {
  if (account.server.protocol === 'xmpp') {
    const jid = account.server.jid;
    return jid.includes('/') ? jid.slice(0, jid.indexOf('/')) : jid;
  }
  if (account.server.protocol === 'matrix') return account.server.userId;
  if (account.server.protocol === 'irc') return account.server.nick;
  return account.id;
}

export function selfNames(account: ChatAccount, bareJid: string): string[] {
  const names = new Set<string>([bareJid]);
  if (account.displayName.length > 0) names.add(account.displayName);
  const at = bareJid.indexOf('@');
  if (at > 0) names.add(bareJid.slice(0, at));
  return [...names];
}

export function toLastMessage(message: ChatMessage): ChatConversationLastMessage {
  return {
    protocolId: message.protocolId,
    body: message.body,
    senderAddress: message.senderAddress,
    kind: message.kind,
    redacted: message.redacted,
    originTs: message.originTs,
  };
}

export function blankConversation(accountId: string, id: string): ChatConversation {
  return {
    id,
    accountId,
    kind: id.includes('/') ? 'room' : 'dm',
    address: id,
    name: id,
    topic: '',
    memberCount: 0,
    unread: 0,
    mentions: 0,
    lastReadId: null,
    muted: false,
    mutedUntil: null,
    notifyLevel: 'all',
    isKnownContact: false,
    archived: false,
    lastMessage: null,
    updatedAt: 0,
  };
}

/**
 * Resolve a message `mediaRef` to a quarantined `data:` URL: the adapter turns the ref into a
 * fetchable {@link MediaLocator}, this performs the egress-bound GET (the kill-switch applies), caps
 * the size, and base64s the bytes. `null` when the protocol has no media repo, the ref is malformed,
 * the download fails, or it is over {@link MEDIA_MAX_BYTES}.
 */
export async function fetchMediaDataUrl(
  adapter: ChatAdapter,
  transport: ChatTransport,
  mayEgress: () => boolean,
  session: ChatSession,
  mediaRef: string,
): Promise<{ dataUrl: string } | null> {
  if (adapter.resolveMedia === undefined) return null;
  const locator = adapter.resolveMedia(session, mediaRef);
  if (locator === null) return null;
  if (!mayEgress()) throw new AppError('chat egress is blocked by the kill-switch', 403);

  const res = await transport.fetch(locator.url, {
    method: 'GET',
    headers: locator.headers,
    timeoutMs: MEDIA_FETCH_TIMEOUT_MS,
  });
  if (res.status >= 400) return null;
  const bytes = await res.bytes();
  if (bytes.byteLength === 0 || bytes.byteLength > MEDIA_MAX_BYTES) return null;

  const mime = sanitizeMediaMime(res.headers['content-type']);
  const base64 = Buffer.from(bytes).toString('base64');
  return { dataUrl: `data:${mime};base64,${base64}` };
}

/** The optimistic local echo for a send: shown immediately, reconciled against the server's receipt. */
export function buildOptimisticMessage(
  account: ChatAccount,
  tempId: string,
  conversationId: string,
  body: { body: string; replyToId?: string | null },
  mediaRef: string | null,
  now: () => number,
): ChatMessage {
  return {
    id: tempId,
    conversationId,
    accountId: account.id,
    protocolId: tempId,
    senderAddress: deriveBareJid(account),
    senderName: account.displayName,
    kind: mediaRef !== null ? 'media' : 'text',
    body: body.body,
    mediaRef,
    replyToId: body.replyToId ?? null,
    reactions: [],
    editedAt: null,
    redacted: false,
    originTs: now(),
    receivedAt: now(),
    deliveryState: 'pending',
  };
}

const NOTIFY_BODY_MAX = 180;

/** The notification (if any) an inbound message earns, after `decideNotification`; `null` when it
 *  is redacted / empty or the decision says to stay quiet. */
export function buildNotification(input: {
  accountId: string;
  message: ChatMessage;
  conversation: ChatConversation | null;
  fromSelf: boolean;
  selfNames: string[];
}): ChatNotification | null {
  const { message, conversation } = input;
  if (message.redacted || message.body === '') return null;
  const decision = decideNotification({
    isRoom: conversation?.kind === 'room',
    ...(conversation !== null
      ? { level: conversation.notifyLevel, muted: conversation.muted }
      : {}),
    fromSelf: input.fromSelf,
    selfNames: input.selfNames,
    body: message.body,
  });
  if (!decision.notify) return null;
  return {
    accountId: input.accountId,
    conversationId: message.conversationId,
    title: message.senderName.trim() || (conversation?.name ?? '').trim() || message.senderAddress,
    body: message.body.slice(0, NOTIFY_BODY_MAX),
  };
}
