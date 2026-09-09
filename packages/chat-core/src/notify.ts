import { isDirectMention, scanMentions } from './mentions';

/**
 * Should an incoming message raise a desktop notification? Cross-cutting rule the host asks per
 * message. The important guarantee (X-chat.3): **a direct nick mention always notifies** — even in a
 * room the user has set to "mentions only" or muted; only an explicit "none" silences it. A room-wide
 * ping (`@room` …) notifies at "all" / "mentions" but respects "none".
 */

export const ROOM_NOTIFY_LEVELS = ['all', 'mentions', 'none'] as const;
export type RoomNotifyLevel = (typeof ROOM_NOTIFY_LEVELS)[number];

export type NotifyReason =
  | 'direct-message'
  | 'room-all'
  | 'mention'
  | 'room-ping'
  | 'from-self'
  | 'muted'
  | 'level-mentions'
  | 'level-none';

export interface NotifyContext {
  /** A room (MUC) message vs a 1:1. */
  isRoom: boolean;
  /** The room's notification level. Ignored for DMs. */
  level?: RoomNotifyLevel;
  /** The conversation is muted ("all messages" off). */
  muted?: boolean;
  /** The message is an echo of something the connected account sent. */
  fromSelf: boolean;
  /** The user's own nick(s) / names for mention detection. */
  selfNames: readonly string[];
  body: string;
}

export interface NotifyDecision {
  notify: boolean;
  reason: NotifyReason;
}

export function decideNotification(ctx: NotifyContext): NotifyDecision {
  if (ctx.fromSelf) return { notify: false, reason: 'from-self' };

  const directMention = isDirectMention(ctx.body, ctx.selfNames);
  if (directMention) return { notify: true, reason: 'mention' };

  const level: RoomNotifyLevel = ctx.isRoom ? ctx.level ?? 'all' : 'all';
  const roomPing = scanMentions(ctx.body).roomPing;

  if (roomPing) {
    return level === 'none'
      ? { notify: false, reason: 'level-none' }
      : { notify: true, reason: 'room-ping' };
  }

  if (level === 'none') return { notify: false, reason: 'level-none' };
  if (level === 'mentions') return { notify: false, reason: 'level-mentions' };
  if (ctx.muted === true) return { notify: false, reason: 'muted' };

  return { notify: true, reason: ctx.isRoom ? 'room-all' : 'direct-message' };
}
