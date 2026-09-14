import type { ChatConversation } from '@tepegoz/shared-types';

/**
 * Whether a conversation's notifications are silenced right now — the forever flag, OR a timed mute
 * that hasn't expired yet. A past `mutedUntil` reads the same as `null` (expired): no separate
 * cleanup step clears it, this check is what makes an expired timed mute stop applying.
 */
export function isMutedNow(
  conversation: Pick<ChatConversation, 'muted' | 'mutedUntil'>,
  now: number,
): boolean {
  return conversation.muted || (conversation.mutedUntil !== null && conversation.mutedUntil > now);
}
