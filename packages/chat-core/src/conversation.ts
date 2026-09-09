import type { ChatEvent, ChatMessage } from '@tepegoz/shared-types';
import { isMention } from './mentions';

/**
 * The pure conversation folder. Given the current message window and a normalized `ChatEvent`, it
 * returns the next window — deduped, ordered, with unread/mention counters maintained.
 *
 * Ordering is `(originTs, receivedAt, protocolId)`: the sender's clock first, our arrival clock as
 * the tiebreak (two messages in the same millisecond keep insertion-stable order), the id last so
 * the sort is total. Out-of-order delivery, an edit that arrives before its original, a redaction,
 * and a duplicate all fold to the same final state regardless of arrival order.
 */

export interface ConversationView {
  messages: ChatMessage[];
  unread: number;
  mentions: number;
  /** Protocol id of the newest message the user has read. */
  lastReadId: string | null;
}

export interface FoldOptions {
  /** The user's own address on this account — messages from it never count as unread/mention. */
  selfAddress: string;
  /** The user's names for mention detection (nick, `@handle`, display name). */
  selfNames: readonly string[];
  /** Cap the retained window; oldest messages beyond it are dropped from the view (not the DB). */
  windowLimit?: number;
}

const DEFAULT_WINDOW = 500;

export function emptyConversation(): ConversationView {
  return { messages: [], unread: 0, mentions: 0, lastReadId: null };
}

function orderKey(m: ChatMessage): [number, number, string] {
  return [m.originTs, m.receivedAt, m.protocolId];
}

function compare(a: ChatMessage, b: ChatMessage): number {
  const [a1, a2, a3] = orderKey(a);
  const [b1, b2, b3] = orderKey(b);
  if (a1 !== b1) return a1 - b1;
  if (a2 !== b2) return a2 - b2;
  return a3 < b3 ? -1 : a3 > b3 ? 1 : 0;
}

function insertOrdered(list: ChatMessage[], message: ChatMessage): ChatMessage[] {
  const next = list.filter((m) => m.protocolId !== message.protocolId);
  let lo = 0;
  let hi = next.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const at = next[mid];
    if (at !== undefined && compare(at, message) < 0) lo = mid + 1;
    else hi = mid;
  }
  next.splice(lo, 0, message);
  return next;
}

/** Recount unread + mentions from scratch over the current window (cheap; the window is bounded). */
function recount(view: ConversationView, opts: FoldOptions): ConversationView {
  const readIdx =
    view.lastReadId === null
      ? -1
      : view.messages.findIndex((m) => m.protocolId === view.lastReadId);
  let unread = 0;
  let mentions = 0;
  view.messages.forEach((m, i) => {
    if (i <= readIdx) return;
    if (m.senderAddress === opts.selfAddress) return;
    if (m.redacted) return;
    unread += 1;
    if (isMention(m.body, opts.selfNames)) mentions += 1;
  });
  return { ...view, unread, mentions };
}

/** Fold one normalized event into the view. Unknown/irrelevant events return the view unchanged. */
export function foldEvent(
  view: ConversationView,
  event: ChatEvent,
  opts: FoldOptions,
): ConversationView {
  const windowLimit = opts.windowLimit ?? DEFAULT_WINDOW;

  switch (event.type) {
    case 'message': {
      let messages = insertOrdered(view.messages, event.message);
      if (messages.length > windowLimit) messages = messages.slice(messages.length - windowLimit);
      return recount({ ...view, messages }, opts);
    }
    case 'message-edit': {
      const messages = view.messages.map((m) =>
        m.protocolId === event.protocolId
          ? { ...m, body: event.body, editedAt: event.editedAt }
          : m,
      );
      return { ...view, messages };
    }
    case 'message-redact': {
      const messages = view.messages.map((m) =>
        m.protocolId === event.protocolId ? { ...m, redacted: true, body: '' } : m,
      );
      return recount({ ...view, messages }, opts);
    }
    case 'receipt': {
      if (event.receipt.byAddress === opts.selfAddress) return view;
      const target: ChatMessage['deliveryState'] =
        event.receipt.kind === 'read' ? 'read' : 'delivered';
      const messages = view.messages.map((m) =>
        m.protocolId === event.receipt.messageId && m.senderAddress === opts.selfAddress
          ? { ...m, deliveryState: target }
          : m,
      );
      return { ...view, messages };
    }
    case 'reaction': {
      const mine = event.senderAddress === opts.selfAddress;
      const messages = view.messages.map((m) =>
        m.protocolId === event.protocolId
          ? { ...m, reactions: applyReaction(m.reactions, event.emoji, event.add, mine) }
          : m,
      );
      return { ...view, messages };
    }
    default:
      return view;
  }
}

/** Add / remove one reactor's emoji from a message's aggregated reaction list. */
function applyReaction(
  reactions: ChatMessage['reactions'],
  emoji: string,
  add: boolean,
  mine: boolean,
): ChatMessage['reactions'] {
  const existing = reactions.find((r) => r.emoji === emoji);
  if (add) {
    if (existing === undefined) return [...reactions, { emoji, count: 1, me: mine }];
    return reactions.map((r) =>
      r.emoji === emoji ? { emoji, count: r.count + 1, me: r.me || mine } : r,
    );
  }
  if (existing === undefined) return reactions;
  const count = existing.count - 1;
  if (count <= 0) return reactions.filter((r) => r.emoji !== emoji);
  return reactions.map((r) =>
    r.emoji === emoji ? { emoji, count, me: mine ? false : r.me } : r,
  );
}

export function foldEvents(
  view: ConversationView,
  events: readonly ChatEvent[],
  opts: FoldOptions,
): ConversationView {
  return events.reduce((acc, e) => foldEvent(acc, e, opts), view);
}

/**
 * Reconcile an optimistic local echo: the message was shown with a temporary protocol id; the server
 * has now acked it with its real id. Replace in place (keeping position) rather than inserting a
 * second copy.
 */
export function reconcileEcho(
  view: ConversationView,
  tempProtocolId: string,
  serverMessage: ChatMessage,
): ConversationView {
  let replaced = false;
  const messages = view.messages.map((m) => {
    if (m.protocolId === tempProtocolId) {
      replaced = true;
      return { ...serverMessage, deliveryState: 'sent' as const };
    }
    return m;
  });
  return replaced ? { ...view, messages } : view;
}

/** Mark everything up to and including `protocolId` as read. */
export function markRead(
  view: ConversationView,
  protocolId: string,
  opts: FoldOptions,
): ConversationView {
  const exists = view.messages.some((m) => m.protocolId === protocolId);
  if (!exists) return view;
  return recount({ ...view, lastReadId: protocolId }, opts);
}
