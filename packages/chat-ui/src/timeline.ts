import type { ChatMessage } from '@tepegoz/shared-types';
import { startOfDay } from './time';

/**
 * The pure render model behind `<MessageTimeline>`: an ordered message list becomes a flat item list
 * with day separators, a single "new messages" divider, and per-message grouping flags (consecutive
 * messages from the same sender within a short window collapse under one header). Kept DOM-free so the
 * bucketing rules are unit-tested directly.
 */

type TimelineMessageFields = Pick<ChatMessage, 'id' | 'senderAddress' | 'kind' | 'originTs' | 'receivedAt'>;

export type TimelineItem<M> =
  | { readonly kind: 'day'; readonly day: number; readonly key: string }
  | { readonly kind: 'unread-divider'; readonly key: string }
  | { readonly kind: 'message'; readonly message: M; readonly key: string; readonly startsGroup: boolean };

export interface BuildTimelineOptions<M> {
  /** Sender-grouping window: a gap wider than this opens a new group even for the same sender. */
  groupWindowMs?: number;
  /**
   * The `id` of the last message the user has read. The "new messages" divider is inserted directly
   * before the first message after it. `null` / not found ⇒ no divider.
   */
  lastReadId?: string | null;
  /** Timestamp accessor; defaults to `originTs` falling back to `receivedAt`. */
  tsOf?: (message: M) => number;
}

const DEFAULT_GROUP_WINDOW_MS = 5 * 60_000;

function defaultTs(message: TimelineMessageFields): number {
  return message.originTs || message.receivedAt;
}

export function buildTimeline<M extends TimelineMessageFields>(
  messages: readonly M[],
  options: BuildTimelineOptions<M> = {},
): TimelineItem<M>[] {
  const groupWindow = options.groupWindowMs ?? DEFAULT_GROUP_WINDOW_MS;
  const tsOf = options.tsOf ?? ((m: M) => defaultTs(m));

  const readIndex =
    options.lastReadId == null ? -1 : messages.findIndex((m) => m.id === options.lastReadId);
  const dividerBefore = readIndex >= 0 && readIndex < messages.length - 1 ? readIndex + 1 : -1;

  const items: TimelineItem<M>[] = [];
  let currentDay: number | null = null;
  let previous: { sender: string; ts: number; system: boolean } | null = null;

  messages.forEach((message, index) => {
    const ts = tsOf(message);
    const day = startOfDay(ts);
    const isSystem = message.kind === 'system';

    let boundary = false;
    if (day !== currentDay) {
      items.push({ kind: 'day', day, key: `day-${day}` });
      currentDay = day;
      boundary = true;
    }
    if (index === dividerBefore) {
      items.push({ kind: 'unread-divider', key: 'unread-divider' });
      boundary = true;
    }

    const startsGroup =
      boundary ||
      isSystem ||
      previous === null ||
      previous.system ||
      previous.sender !== message.senderAddress ||
      ts - previous.ts > groupWindow;

    items.push({ kind: 'message', message, key: `msg-${message.id}`, startsGroup });
    previous = { sender: message.senderAddress, ts, system: isSystem };
  });

  return items;
}
