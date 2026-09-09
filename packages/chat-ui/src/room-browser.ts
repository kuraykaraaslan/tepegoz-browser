import { foldForSearch } from '@tepegoz/i18n';

/**
 * The pure part of `<RoomBrowser>` — a MUC service's advertised rooms (from XEP-0030 disco), filtered
 * by a fold-aware query over the address, name and description.
 */

export interface RoomListing {
  /** Bare room JID (`room@service`). */
  jid: string;
  name: string | null;
  description: string | null;
  /** Advertised occupant count, or `null` when the room does not publish it. */
  occupants: number | null;
  passwordProtected: boolean;
  membersOnly: boolean;
}

export function roomListingLabel(room: Pick<RoomListing, 'jid' | 'name'>): string {
  const name = room.name?.trim();
  return name !== undefined && name.length > 0 ? name : (room.jid.split('@')[0] ?? room.jid);
}

export function filterRoomListings(rooms: readonly RoomListing[], query: string): RoomListing[] {
  const needle = foldForSearch(query.trim());
  if (needle === '') return [...rooms];
  return rooms.filter(
    (room) =>
      foldForSearch(room.jid).includes(needle) ||
      foldForSearch(room.name ?? '').includes(needle) ||
      foldForSearch(room.description ?? '').includes(needle),
  );
}

/** Most-populated first, then by label — the order the browser lists them in. */
export function sortRoomListings(rooms: readonly RoomListing[]): RoomListing[] {
  return [...rooms].sort(
    (a, b) => (b.occupants ?? -1) - (a.occupants ?? -1) || roomListingLabel(a).localeCompare(roomListingLabel(b)),
  );
}
