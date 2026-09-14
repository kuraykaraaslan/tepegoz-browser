import { foldForSearch } from '@tepegoz/i18n';
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

/** Fold-aware filter over a conversation's title/address — used by `<NewChatDialog>`'s "your rooms"
 *  quick list, same matching rule as `filterRoster`/`filterRoomListings`. */
export function filterConversations<T extends Pick<ChatConversation, 'name' | 'address'>>(
  conversations: readonly T[],
  query: string,
): T[] {
  const needle = foldForSearch(query.trim());
  if (needle === '') return [...conversations];
  return conversations.filter(
    (c) => foldForSearch(c.name).includes(needle) || foldForSearch(c.address).includes(needle),
  );
}

export function totalUnread(conversations: readonly Pick<ChatConversation, 'unread'>[]): number {
  return conversations.reduce((sum, c) => sum + c.unread, 0);
}

export function totalMentions(conversations: readonly Pick<ChatConversation, 'mentions'>[]): number {
  return conversations.reduce((sum, c) => sum + c.mentions, 0);
}
