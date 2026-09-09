import { turkishCompare } from '@tepegoz/i18n';
import type { ChatPresence } from '@tepegoz/shared-types';

/**
 * Room (MUC) occupant + subject state — the Electron-free heart of a group chat. The XMPP adapter
 * parses a room `<presence>` into an {@link RoomOccupantUpdate} (structurally a chat-adapters
 * `MucOccupant`); this folds a stream of those into a stable member list and tracks the self nick, the
 * joined flag and the topic. Pure and immutable — every `apply*` returns a new view or the same one.
 */

export const ROOM_AFFILIATIONS = ['owner', 'admin', 'member', 'outcast', 'none'] as const;
export type RoomAffiliation = (typeof ROOM_AFFILIATIONS)[number];

export const ROOM_ROLES = ['moderator', 'participant', 'visitor', 'none'] as const;
export type RoomRole = (typeof ROOM_ROLES)[number];

export interface RoomOccupant {
  nick: string;
  /** Real bare JID when the room is non-anonymous, else `null`. */
  realJid: string | null;
  affiliation: RoomAffiliation;
  role: RoomRole;
  presence: ChatPresence;
  statusText: string;
}

/** What the adapter hands `applyOccupant` — a `MucOccupant` is assignable to this. */
export interface RoomOccupantUpdate extends RoomOccupant {
  /** MUC status code 110 — this presence is about the connected account. */
  self: boolean;
}

export interface RoomView {
  joined: boolean;
  selfNick: string | null;
  subject: string;
  /** Occupants by nick. */
  occupants: Readonly<Record<string, RoomOccupant>>;
}

export function emptyRoom(): RoomView {
  return { joined: false, selfNick: null, subject: '', occupants: {} };
}

function stripSelf(u: RoomOccupantUpdate): RoomOccupant {
  return {
    nick: u.nick,
    realJid: u.realJid,
    affiliation: u.affiliation,
    role: u.role,
    presence: u.presence,
    statusText: u.statusText,
  };
}

/**
 * Fold one occupant presence. An `offline` presence removes the occupant (they left / were kicked); a
 * self presence (status 110) sets `selfNick` and marks the room joined — or, when it is `offline`,
 * marks it left.
 */
export function applyOccupant(room: RoomView, update: RoomOccupantUpdate): RoomView {
  const leaving = update.presence === 'offline';
  const occupants = { ...room.occupants };
  if (leaving) delete occupants[update.nick];
  else occupants[update.nick] = stripSelf(update);

  let { joined, selfNick } = room;
  if (update.self) {
    if (leaving) {
      joined = false;
    } else {
      joined = true;
      selfNick = update.nick;
    }
  }

  return { ...room, joined, selfNick, occupants };
}

export function applySubject(room: RoomView, subject: string): RoomView {
  return subject === room.subject ? room : { ...room, subject };
}

/** Leaving a room entirely — drop every occupant and the joined flag, keep the last subject. */
export function leaveRoom(room: RoomView): RoomView {
  return { ...room, joined: false, selfNick: null, occupants: {} };
}

const ROLE_RANK: Record<RoomRole, number> = {
  moderator: 0,
  participant: 1,
  visitor: 2,
  none: 3,
};

/** Member list ordered by role (moderators first) then Turkish-aware by nick. */
export function occupantList(room: RoomView): RoomOccupant[] {
  return Object.values(room.occupants).sort(
    (a, b) => ROLE_RANK[a.role] - ROLE_RANK[b.role] || turkishCompare(a.nick, b.nick),
  );
}

export function occupantCount(room: RoomView): number {
  return Object.keys(room.occupants).length;
}
