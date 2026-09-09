import { describe, expect, it } from 'vitest';
import { parseSyncResponse } from './sync';
import type { MatrixContext } from './events';

const ctx: MatrixContext = { accountId: 'acc', selfUserId: '@me:s' };

describe('parseSyncResponse', () => {
  it('flattens a joined room timeline + ephemeral into ChatEvents and a room summary', () => {
    const result = parseSyncResponse(
      {
        next_batch: 's2',
        rooms: {
          join: {
            '!r:s': {
              timeline: {
                limited: true,
                prev_batch: 'p1',
                events: [
                  {
                    type: 'm.room.name',
                    sender: '@x:s',
                    event_id: '$n',
                    origin_server_ts: 1,
                    content: { name: 'General' },
                  },
                  {
                    type: 'm.room.message',
                    sender: '@bob:s',
                    event_id: '$1',
                    origin_server_ts: 10,
                    content: { msgtype: 'm.text', body: 'hi' },
                  },
                ],
              },
              state: {
                events: [
                  { type: 'm.room.member', sender: '@bob:s', event_id: '$m1', origin_server_ts: 1, content: { membership: 'join' } },
                  { type: 'm.room.member', sender: '@me:s', event_id: '$m2', origin_server_ts: 1, content: { membership: 'join' } },
                ],
              },
              ephemeral: {
                events: [{ type: 'm.typing', content: { user_ids: ['@bob:s'] } }],
              },
            },
          },
        },
      },
      ctx,
    );

    expect(result.nextBatch).toBe('s2');
    expect(result.events.map((e) => e.type)).toEqual(['message', 'typing']);
    expect(result.rooms).toEqual([
      { roomId: '!r:s', name: 'General', topic: '', memberCount: 2, limited: true, prevBatch: 'p1' },
    ]);
  });

  it('prefers the summary joined_member_count when higher', () => {
    const r = parseSyncResponse(
      {
        next_batch: 's',
        rooms: {
          join: {
            '!r:s': {
              timeline: { events: [] },
              summary: { 'm.joined_member_count': 42 },
            },
          },
        },
      },
      ctx,
    );
    expect(r.rooms[0]?.memberCount).toBe(42);
  });

  it('reads invites and leaves', () => {
    const r = parseSyncResponse(
      {
        next_batch: 's',
        rooms: {
          invite: {
            '!inv:s': {
              invite_state: {
                events: [{ type: 'm.room.member', sender: '@host:s', content: { membership: 'invite' } }],
              },
            },
          },
          leave: { '!gone:s': {} },
        },
      },
      ctx,
    );
    expect(r.invites).toEqual([{ roomId: '!inv:s', inviter: '@host:s' }]);
    expect(r.left).toEqual(['!gone:s']);
  });

  it('tolerates a garbage body', () => {
    expect(parseSyncResponse(null, ctx)).toEqual({
      nextBatch: '',
      events: [],
      rooms: [],
      invites: [],
      left: [],
    });
    expect(parseSyncResponse({ rooms: { join: { '!r:s': 'nope' } } }, ctx).rooms).toHaveLength(1);
  });

  it('drops a timeline entry with no type', () => {
    const r = parseSyncResponse(
      { next_batch: 's', rooms: { join: { '!r:s': { timeline: { events: [{ sender: '@a:s' }, 'x'] } } } } },
      ctx,
    );
    expect(r.events).toEqual([]);
  });
});
