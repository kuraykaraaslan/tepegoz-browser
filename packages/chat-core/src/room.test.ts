import { describe, expect, it } from 'vitest';
import {
  applyOccupant,
  applySubject,
  emptyRoom,
  leaveRoom,
  occupantCount,
  occupantList,
  type RoomOccupantUpdate,
} from './room';

function occ(over: Partial<RoomOccupantUpdate> = {}): RoomOccupantUpdate {
  return {
    nick: 'Ada',
    realJid: null,
    affiliation: 'member',
    role: 'participant',
    presence: 'online',
    statusText: '',
    self: false,
    ...over,
  };
}

describe('applyOccupant', () => {
  it('adds an occupant, keyed by nick, without the self flag', () => {
    const room = applyOccupant(emptyRoom(), occ({ nick: 'Ada', realJid: 'ada@x.org' }));
    expect(room.occupants.Ada).toEqual({
      nick: 'Ada',
      realJid: 'ada@x.org',
      affiliation: 'member',
      role: 'participant',
      presence: 'online',
      statusText: '',
    });
    expect(room.occupants.Ada).not.toHaveProperty('self');
  });

  it('a self presence sets selfNick + joined', () => {
    const room = applyOccupant(emptyRoom(), occ({ nick: 'Me', self: true }));
    expect(room).toMatchObject({ joined: true, selfNick: 'Me' });
  });

  it('an offline presence removes the occupant; a self-offline marks the room left', () => {
    let room = applyOccupant(emptyRoom(), occ({ nick: 'Me', self: true }));
    room = applyOccupant(room, occ({ nick: 'Bob' }));
    room = applyOccupant(room, occ({ nick: 'Bob', presence: 'offline' }));
    expect(room.occupants.Bob).toBeUndefined();
    expect(room.joined).toBe(true);

    room = applyOccupant(room, occ({ nick: 'Me', self: true, presence: 'offline' }));
    expect(room.joined).toBe(false);
    expect(room.occupants.Me).toBeUndefined();
  });

  it('updates an occupant in place on a role/presence change', () => {
    let room = applyOccupant(emptyRoom(), occ({ nick: 'Ada', role: 'participant' }));
    room = applyOccupant(room, occ({ nick: 'Ada', role: 'moderator', presence: 'away' }));
    expect(room.occupants.Ada).toMatchObject({ role: 'moderator', presence: 'away' });
    expect(occupantCount(room)).toBe(1);
  });
});

describe('applySubject / leaveRoom', () => {
  it('applySubject is a no-op when unchanged', () => {
    const room = applySubject(emptyRoom(), 'Topic');
    expect(applySubject(room, 'Topic')).toBe(room);
    expect(applySubject(room, 'New').subject).toBe('New');
  });

  it('leaveRoom drops occupants + joined but keeps the subject', () => {
    let room = applySubject(emptyRoom(), 'Weekly');
    room = applyOccupant(room, occ({ nick: 'Me', self: true }));
    room = applyOccupant(room, occ({ nick: 'Bob' }));
    const left = leaveRoom(room);
    expect(left).toMatchObject({ joined: false, selfNick: null, subject: 'Weekly' });
    expect(occupantCount(left)).toBe(0);
  });
});

describe('occupantList', () => {
  it('orders by role rank then Turkish-aware nick', () => {
    let room = emptyRoom();
    for (const u of [
      occ({ nick: 'zoe', role: 'participant' }),
      occ({ nick: 'ada', role: 'moderator' }),
      occ({ nick: 'bea', role: 'moderator' }),
      occ({ nick: 'ismail', role: 'visitor' }),
      occ({ nick: 'çınar', role: 'participant' }),
    ]) {
      room = applyOccupant(room, u);
    }
    expect(occupantList(room).map((o) => o.nick)).toEqual(['ada', 'bea', 'çınar', 'zoe', 'ismail']);
  });
});
