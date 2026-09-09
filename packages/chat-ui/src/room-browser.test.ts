import { describe, expect, it } from 'vitest';
import {
  filterRoomListings,
  roomListingLabel,
  sortRoomListings,
  type RoomListing,
} from './room-browser';

function room(over: Partial<RoomListing> = {}): RoomListing {
  return {
    jid: 'general@conf.example',
    name: 'General',
    description: null,
    occupants: null,
    passwordProtected: false,
    membersOnly: false,
    ...over,
  };
}

describe('roomListingLabel', () => {
  it('uses the name, falling back to the JID local part', () => {
    expect(roomListingLabel(room({ name: 'General' }))).toBe('General');
    expect(roomListingLabel(room({ name: '  ' }))).toBe('general');
    expect(roomListingLabel({ jid: 'weird', name: null })).toBe('weird');
  });
});

describe('filterRoomListings', () => {
  it('fold-matches jid, name or description', () => {
    const list = [
      room({ jid: 'a@conf', name: 'İdare', description: null }),
      room({ jid: 'b@conf', name: 'Random', description: 'about cats' }),
    ];
    expect(filterRoomListings(list, 'idare').map((r) => r.jid)).toEqual(['a@conf']);
    expect(filterRoomListings(list, 'CATS').map((r) => r.jid)).toEqual(['b@conf']);
    expect(filterRoomListings(list, '  ')).toHaveLength(2);
  });
});

describe('sortRoomListings', () => {
  it('most-populated first, then by label; unknown counts sink', () => {
    const list = [
      room({ jid: 'a@conf', name: 'Alpha', occupants: 3 }),
      room({ jid: 'z@conf', name: 'Zeta', occupants: 10 }),
      room({ jid: 'n@conf', name: 'None', occupants: null }),
      room({ jid: 'b@conf', name: 'Beta', occupants: 3 }),
    ];
    expect(sortRoomListings(list).map((r) => r.name)).toEqual(['Zeta', 'Alpha', 'Beta', 'None']);
  });
});
