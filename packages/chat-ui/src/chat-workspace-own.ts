import type { RoomView } from '@tepegoz/chat-core';
import type { ChatConversation, ChatMessage } from '@tepegoz/shared-types';

/**
 * Is this message the local user's own? A DM has exactly two parties, so anything not from the
 * peer is ours. A room has no such shortcut — protocols disagree on what `senderAddress` holds for
 * a room message (XMPP: the full occupant JID `room@service/nick`; IRC: the bare nick; Matrix: the
 * bare user id) — so this compares against the room's `selfNick`, which every adapter's occupant
 * fold already derives in that SAME shape (see `chat-core`'s `RoomView`).
 */
export function messageIsOwn(
  message: ChatMessage,
  selected: ChatConversation,
  selectedRoom: RoomView | undefined,
): boolean {
  if (selected.kind === 'dm') return message.senderAddress !== selected.address;
  if (selectedRoom?.selfNick == null) return false;
  const slash = message.senderAddress.indexOf('/');
  const nick = slash === -1 ? message.senderAddress : message.senderAddress.slice(slash + 1);
  return nick === selectedRoom.selfNick;
}
