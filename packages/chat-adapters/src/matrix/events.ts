import type { ChatEvent, ChatMessage } from '@tepegoz/shared-types';

/**
 * Matrix Client-Server timeline / ephemeral events → the normalized `ChatEvent` model. Pure and
 * lenient: a homeserver is a trust boundary and `/sync` returns attacker-influenced content, so an
 * event shape we do not model returns `null` (or `[]`), never a throw. `@tepegoz/chat-core`'s
 * `normalizeEvent` re-validates before anything downstream trusts it.
 *
 * Reactions (`m.reaction`) are handled once `ChatEvent` grows a reaction variant (next slice).
 */

/** The subset of a Matrix room event this layer reads. */
export interface MatrixRoomEvent {
  type: string;
  sender: string;
  event_id: string;
  origin_server_ts: number;
  content: Record<string, unknown>;
  unsigned?: { redacted_because?: unknown; 'm.relations'?: unknown };
}

export interface MatrixContext {
  accountId: string;
  /** `@me:server` — a timeline event from it is a local echo. */
  selfUserId: string;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function rec(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

const MEDIA_MSGTYPES = new Set(['m.image', 'm.file', 'm.video', 'm.audio']);

function relatesTo(content: Record<string, unknown>): Record<string, unknown> {
  return rec(content['m.relates_to']);
}

/** The `mxc://` uri of a (non-encrypted) media message, or `null`. */
function mediaRef(content: Record<string, unknown>): string | null {
  const url = str(content.url);
  if (url.startsWith('mxc://')) return url;
  const fileUrl = str(rec(content.file).url);
  return fileUrl.startsWith('mxc://') ? fileUrl : null;
}

function buildMessage(
  ev: MatrixRoomEvent,
  roomId: string,
  ctx: MatrixContext,
  content: Record<string, unknown>,
): ChatMessage {
  const msgtype = str(content.msgtype);
  const media = MEDIA_MSGTYPES.has(msgtype);
  const inReplyTo = str(rec(relatesTo(content)['m.in_reply_to']).event_id);
  const bodyRaw = str(content.body);
  const body = msgtype === 'm.emote' ? `/me ${bodyRaw}` : bodyRaw;

  return {
    id: ev.event_id,
    conversationId: roomId,
    accountId: ctx.accountId,
    protocolId: ev.event_id,
    senderAddress: ev.sender,
    senderName: '',
    kind: media ? 'media' : msgtype === 'm.notice' ? 'system' : 'text',
    body,
    mediaRef: media ? mediaRef(content) : null,
    replyToId: inReplyTo.length > 0 ? inReplyTo : null,
    reactions: [],
    editedAt: null,
    redacted: false,
    originTs: ev.origin_server_ts,
    receivedAt: Date.now(),
    deliveryState: ev.sender === ctx.selfUserId ? 'sent' : 'delivered',
  };
}

/** Map one timeline event. `roomId` is the conversation id. */
export function matrixTimelineEvent(
  ev: MatrixRoomEvent,
  roomId: string,
  ctx: MatrixContext,
): ChatEvent | null {
  if (roomId.length === 0 || ev.sender.length === 0 || ev.event_id.length === 0) return null;

  if (ev.type === 'm.room.redaction') {
    const target = str(ev.content.redacts) || str(relatesTo(ev.content).event_id);
    if (target.length === 0) return null;
    return {
      type: 'message-redact',
      conversationId: roomId,
      protocolId: target,
      redactedAt: ev.origin_server_ts,
    };
  }

  if (ev.type === 'm.room.member') {
    const membership = str(ev.content.membership);
    if (membership !== 'join' && membership !== 'leave' && membership !== 'ban') return null;
    return {
      type: 'room-membership',
      conversationId: roomId,
      address: ev.sender,
      joined: membership === 'join',
      memberCount: 0,
      self: ev.sender === ctx.selfUserId,
      affiliation: 'none',
      role: 'participant',
      realJid: null,
    };
  }

  if (ev.type !== 'm.room.message') return null;

  const relation = relatesTo(ev.content);
  const newContent = rec(ev.content['m.new_content']);
  if (str(relation.rel_type) === 'm.replace' && Object.keys(newContent).length > 0) {
    const target = str(relation.event_id);
    if (target.length === 0) return null;
    return {
      type: 'message-edit',
      conversationId: roomId,
      protocolId: target,
      body: str(newContent.body),
      editedAt: ev.origin_server_ts,
    };
  }

  const body = str(ev.content.body);
  const isMedia = MEDIA_MSGTYPES.has(str(ev.content.msgtype));
  if (body.length === 0 && !isMedia) return null;

  return { type: 'message', message: buildMessage(ev, roomId, ctx, ev.content) };
}

/** The `m.typing` / `m.receipt` events from a room's `ephemeral` block. */
export function matrixEphemeralEvents(
  ev: { type: string; content: Record<string, unknown> },
  roomId: string,
  ctx: MatrixContext,
): ChatEvent[] {
  if (ev.type === 'm.typing') {
    const userIds = Array.isArray(ev.content.user_ids) ? (ev.content.user_ids as unknown[]) : [];
    return userIds
      .filter((u): u is string => typeof u === 'string' && u !== ctx.selfUserId)
      .map((u) => ({ type: 'typing', conversationId: roomId, senderAddress: u, active: true }));
  }

  if (ev.type === 'm.receipt') {
    const out: ChatEvent[] = [];
    for (const [eventId, byType] of Object.entries(ev.content)) {
      const read = rec(rec(byType)['m.read']);
      for (const [userId, data] of Object.entries(read)) {
        if (userId === ctx.selfUserId) continue;
        out.push({
          type: 'receipt',
          receipt: {
            conversationId: roomId,
            messageId: eventId,
            byAddress: userId,
            kind: 'read',
            ts: Number(rec(data).ts) || Date.now(),
          },
        });
      }
    }
    return out;
  }

  return [];
}
