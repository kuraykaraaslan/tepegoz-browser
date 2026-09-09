import type { ChatEvent } from '@tepegoz/shared-types';
import {
  matrixEphemeralEvents,
  matrixTimelineEvent,
  type MatrixContext,
  type MatrixRoomEvent,
} from './events';

/**
 * The Matrix `/sync` response walker — pure. It flattens every joined room's timeline + ephemeral
 * events into `ChatEvent`s, reads the room's name / member count / topic from its state, and reports
 * `limited` (gappy) sync so the adapter can backfill, plus invites and leaves.
 *
 * Everything here is attacker-influenced JSON from the homeserver — `arr` / `rec` / `str` coerce
 * defensively and an unrecognised shape contributes nothing.
 */

function rec(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function asRoomEvent(v: unknown): MatrixRoomEvent | null {
  const o = rec(v);
  const type = str(o.type);
  const eventId = str(o.event_id);
  if (type.length === 0) return null;
  const event: MatrixRoomEvent = {
    type,
    sender: str(o.sender),
    event_id: eventId,
    origin_server_ts: typeof o.origin_server_ts === 'number' ? o.origin_server_ts : 0,
    content: rec(o.content),
  };
  if (o.unsigned !== undefined) event.unsigned = rec(o.unsigned);
  if (typeof o.redacts === 'string') event.redacts = o.redacts;
  return event;
}

export interface SyncRoom {
  roomId: string;
  name: string;
  topic: string;
  memberCount: number;
  /** `m.room.create` carried `type: 'm.space'` — a space, not a chat conversation. */
  isSpace: boolean;
  /** The room's timeline had a gap — the adapter should backfill from `prevBatch`. */
  limited: boolean;
  prevBatch: string | null;
}

export interface SyncInvite {
  roomId: string;
  /** The `m.room.member` sender that invited us (best-effort). */
  inviter: string;
}

export interface SyncResult {
  nextBatch: string;
  events: ChatEvent[];
  rooms: SyncRoom[];
  invites: SyncInvite[];
  /** Rooms we are no longer in. */
  left: string[];
}

function roomSummary(roomId: string, joined: Record<string, unknown>): SyncRoom {
  const timeline = rec(joined.timeline);
  const stateEvents = [
    ...arr(rec(joined.state).events),
    ...arr(timeline.events),
  ]
    .map(asRoomEvent)
    .filter((e): e is MatrixRoomEvent => e !== null);

  let name = '';
  let topic = '';
  let members = 0;
  let isSpace = false;
  for (const e of stateEvents) {
    if (e.type === 'm.room.name' && str(e.content.name).length > 0) name = str(e.content.name);
    else if (e.type === 'm.room.topic') topic = str(e.content.topic);
    else if (e.type === 'm.room.member' && str(e.content.membership) === 'join') members += 1;
    else if (e.type === 'm.room.create' && str(e.content.type) === 'm.space') isSpace = true;
  }
  const summary = rec(joined['m.room.summary'] ?? rec(joined.summary));
  const joinedCount = summary['m.joined_member_count'];
  if (typeof joinedCount === 'number' && joinedCount > members) members = joinedCount;

  return {
    roomId,
    name,
    topic,
    memberCount: members,
    isSpace,
    limited: timeline.limited === true,
    prevBatch: typeof timeline.prev_batch === 'string' ? timeline.prev_batch : null,
  };
}

export function parseSyncResponse(body: unknown, ctx: MatrixContext): SyncResult {
  const root = rec(body);
  const rooms = rec(root.rooms);
  const out: SyncResult = {
    nextBatch: str(root.next_batch),
    events: [],
    rooms: [],
    invites: [],
    left: [],
  };

  for (const [roomId, raw] of Object.entries(rec(rooms.join))) {
    const joined = rec(raw);
    const summary = roomSummary(roomId, joined);
    out.rooms.push(summary);
    // A space is room-shaped but is not a chat conversation — surface it, but not its timeline.
    if (summary.isSpace) continue;
    for (const raw2 of arr(rec(joined.timeline).events)) {
      const e = asRoomEvent(raw2);
      if (e === null) continue;
      const mapped = matrixTimelineEvent(e, roomId, ctx);
      if (mapped !== null) out.events.push(mapped);
    }
    for (const raw2 of arr(rec(joined.ephemeral).events)) {
      const o = rec(raw2);
      out.events.push(...matrixEphemeralEvents({ type: str(o.type), content: rec(o.content) }, roomId, ctx));
    }
  }

  for (const [roomId, raw] of Object.entries(rec(rooms.invite))) {
    const state = arr(rec(rec(raw).invite_state).events).map(asRoomEvent);
    const memberEv = state.find(
      (e): e is MatrixRoomEvent => e !== null && e.type === 'm.room.member',
    );
    out.invites.push({ roomId, inviter: memberEv?.sender ?? '' });
  }

  out.left = Object.keys(rec(rooms.leave));
  return out;
}
