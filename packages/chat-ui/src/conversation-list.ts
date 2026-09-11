import type { ChatConversation } from '@tepegoz/shared-types';

/**
 * The pure ordering / grouping / labelling behind `<ConversationList>`. Kept separate from the
 * component so the rules — recency order, account grouping, the name→address title fallback — are
 * unit-tested without a DOM.
 */

/** The slice of an account the conversation list needs: an id, a display label, an optional accent. */
export interface ChatAccountRef {
  id: string;
  label: string;
  color?: string | null;
  /** `ChatAccount['server']['protocol']` — drives each row's {@link ProtocolBadge}. */
  protocol?: string;
}

/** `name` when the protocol gave us one, otherwise the raw address (JID / room / nick). */
export function conversationTitle(conv: Pick<ChatConversation, 'name' | 'address'>): string {
  const name = conv.name.trim();
  return name.length > 0 ? name : conv.address;
}

/**
 * Most-recently-active first. `id` is the deterministic tiebreak so a render never reorders two
 * conversations that share an `updatedAt` (which happens on a history backfill).
 */
export function sortConversations<T extends Pick<ChatConversation, 'updatedAt' | 'id'>>(
  conversations: readonly T[],
): T[] {
  return [...conversations].sort((a, b) => b.updatedAt - a.updatedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function totalUnread(conversations: readonly Pick<ChatConversation, 'unread'>[]): number {
  return conversations.reduce((sum, c) => sum + c.unread, 0);
}

export function totalMentions(conversations: readonly Pick<ChatConversation, 'mentions'>[]): number {
  return conversations.reduce((sum, c) => sum + c.mentions, 0);
}

export interface AccountGroup<T> {
  /** `null` for conversations whose `accountId` is not in the supplied account list. */
  readonly account: ChatAccountRef | null;
  readonly conversations: readonly T[];
}

/**
 * Bucket conversations under their account, preserving the given account order; a trailing `null`
 * group collects any conversation whose account is unknown. Empty groups are dropped. Within each
 * group the conversations keep the order they were passed in (sort first if you want recency).
 */
export function groupConversationsByAccount<T extends Pick<ChatConversation, 'accountId'>>(
  conversations: readonly T[],
  accounts: readonly ChatAccountRef[],
): AccountGroup<T>[] {
  const byId = new Map<string, T[]>();
  const unknown: T[] = [];
  for (const conv of conversations) {
    if (accounts.some((a) => a.id === conv.accountId)) {
      const bucket = byId.get(conv.accountId) ?? [];
      bucket.push(conv);
      byId.set(conv.accountId, bucket);
    } else {
      unknown.push(conv);
    }
  }

  const groups: AccountGroup<T>[] = [];
  for (const account of accounts) {
    const conversations = byId.get(account.id);
    if (conversations !== undefined && conversations.length > 0) groups.push({ account, conversations });
  }
  if (unknown.length > 0) groups.push({ account: null, conversations: unknown });
  return groups;
}
