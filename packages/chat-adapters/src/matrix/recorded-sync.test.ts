import { describe, expect, it } from 'vitest';
import type { MatrixContext } from './events';
import { parseSyncResponse } from './sync';

/**
 * Recorded-exchange fixtures — real Synapse `/sync` response shapes (v1.11x), trimmed to the keys
 * this stack reads but structurally faithful (`summary`, `state.events`, `timeline.{events,limited,
 * prev_batch}`, `ephemeral.events`, `unread_notifications`, `account_data`). The walker must stay
 * lenient to the extra keys and stable on ordering.
 */

const ctx: MatrixContext = { accountId: 'acc-1', selfUserId: '@ada:example.org' };

// ---------------------------------------------------------------------------
// Fixture 1 — an initial sync (no `since`): one joined room + one space + an invite.
// ---------------------------------------------------------------------------
const INITIAL_SYNC = {
  next_batch: 's72_1_0_1_1_1_1_1',
  account_data: { events: [{ type: 'm.push_rules', content: { global: {} } }] },
  presence: { events: [{ type: 'm.presence', sender: '@bob:example.org', content: { presence: 'online' } }] },
  rooms: {
    join: {
      '!general:example.org': {
        summary: {
          'm.heroes': ['@bob:example.org', '@carol:example.org'],
          'm.joined_member_count': 3,
          'm.invited_member_count': 0,
        },
        state: {
          events: [
            {
              type: 'm.room.create',
              sender: '@ada:example.org',
              event_id: '$create1',
              origin_server_ts: 1_700_000_000_000,
              state_key: '',
              content: { creator: '@ada:example.org', room_version: '10' },
            },
            {
              type: 'm.room.name',
              sender: '@ada:example.org',
              event_id: '$name1',
              origin_server_ts: 1_700_000_000_100,
              state_key: '',
              content: { name: 'General' },
            },
            {
              type: 'm.room.topic',
              sender: '@ada:example.org',
              event_id: '$topic1',
              origin_server_ts: 1_700_000_000_200,
              state_key: '',
              content: { topic: 'Everything and nothing' },
            },
            {
              type: 'm.room.member',
              sender: '@ada:example.org',
              event_id: '$m_ada',
              origin_server_ts: 1_700_000_000_300,
              state_key: '@ada:example.org',
              content: { membership: 'join', displayname: 'Ada' },
            },
            {
              type: 'm.room.member',
              sender: '@bob:example.org',
              event_id: '$m_bob',
              origin_server_ts: 1_700_000_000_400,
              state_key: '@bob:example.org',
              content: { membership: 'join', displayname: 'Bob' },
            },
          ],
        },
        timeline: {
          limited: true,
          prev_batch: 't34-req',
          events: [
            {
              type: 'm.room.message',
              sender: '@bob:example.org',
              event_id: '$msg1',
              origin_server_ts: 1_700_000_001_000,
              content: { msgtype: 'm.text', body: 'morning all' },
            },
            {
              type: 'm.room.message',
              sender: '@ada:example.org',
              event_id: '$msg2',
              origin_server_ts: 1_700_000_002_000,
              content: {
                msgtype: 'm.image',
                body: 'graph.png',
                url: 'mxc://example.org/AbCdEf',
                info: { mimetype: 'image/png', w: 800, h: 600 },
              },
            },
          ],
        },
        ephemeral: {
          events: [
            { type: 'm.typing', content: { user_ids: ['@carol:example.org'] } },
            {
              type: 'm.receipt',
              content: {
                $msg1: { 'm.read': { '@bob:example.org': { ts: 1_700_000_001_500 } } },
              },
            },
          ],
        },
        unread_notifications: { notification_count: 1, highlight_count: 0 },
      },
      '!spaceroom:example.org': {
        summary: { 'm.joined_member_count': 12 },
        state: {
          events: [
            {
              type: 'm.room.create',
              sender: '@ada:example.org',
              event_id: '$screate',
              origin_server_ts: 1_699_000_000_000,
              state_key: '',
              content: { type: 'm.space', creator: '@ada:example.org' },
            },
            {
              type: 'm.room.name',
              sender: '@ada:example.org',
              event_id: '$sname',
              origin_server_ts: 1_699_000_000_100,
              state_key: '',
              content: { name: 'The Lab' },
            },
          ],
        },
        timeline: {
          limited: false,
          prev_batch: 't1-space',
          events: [
            {
              type: 'm.space.child',
              sender: '@ada:example.org',
              event_id: '$child1',
              origin_server_ts: 1_699_000_000_200,
              state_key: '!general:example.org',
              content: { via: ['example.org'] },
            },
          ],
        },
      },
    },
    invite: {
      '!secret:other.org': {
        invite_state: {
          events: [
            {
              type: 'm.room.name',
              sender: '@mallory:other.org',
              state_key: '',
              content: { name: 'Secret Plans' },
            },
            {
              type: 'm.room.member',
              sender: '@mallory:other.org',
              state_key: '@ada:example.org',
              content: { membership: 'invite' },
            },
          ],
        },
      },
    },
    leave: {},
  },
};

// ---------------------------------------------------------------------------
// Fixture 2 — an incremental sync (with `since`): an edit, a reaction, a redaction, a leave.
// ---------------------------------------------------------------------------
const INCREMENTAL_SYNC = {
  next_batch: 's73_2_0_1_1_1_1_1',
  rooms: {
    join: {
      '!general:example.org': {
        timeline: {
          limited: false,
          prev_batch: 't40-req',
          events: [
            {
              type: 'm.room.message',
              sender: '@ada:example.org',
              event_id: '$edit1',
              origin_server_ts: 1_700_000_010_000,
              content: {
                msgtype: 'm.text',
                body: '* morning everyone',
                'm.new_content': { msgtype: 'm.text', body: 'morning everyone' },
                'm.relates_to': { rel_type: 'm.replace', event_id: '$msg1' },
              },
            },
            {
              type: 'm.reaction',
              sender: '@bob:example.org',
              event_id: '$react1',
              origin_server_ts: 1_700_000_011_000,
              content: { 'm.relates_to': { rel_type: 'm.annotation', event_id: '$msg2', key: '🔥' } },
            },
            {
              type: 'm.room.redaction',
              sender: '@ada:example.org',
              event_id: '$redact1',
              origin_server_ts: 1_700_000_012_000,
              redacts: '$msg2',
              content: { reason: 'wrong chart' },
            },
            {
              type: 'm.room.member',
              sender: '@carol:example.org',
              event_id: '$leave_carol',
              origin_server_ts: 1_700_000_013_000,
              state_key: '@carol:example.org',
              content: { membership: 'leave' },
            },
          ],
        },
        ephemeral: { events: [] },
        unread_notifications: { notification_count: 0, highlight_count: 0 },
      },
    },
    leave: {
      '!oldroom:example.org': {
        timeline: { events: [], limited: false, prev_batch: 't0' },
        state: { events: [] },
      },
    },
  },
};

describe('recorded Synapse /sync — initial', () => {
  const result = parseSyncResponse(INITIAL_SYNC, ctx);

  it('reports the joined room and the space, but not the space timeline', () => {
    const general = result.rooms.find((r) => r.roomId === '!general:example.org');
    const space = result.rooms.find((r) => r.roomId === '!spaceroom:example.org');
    expect(general).toMatchObject({ name: 'General', topic: 'Everything and nothing', isSpace: false });
    expect(general?.memberCount).toBe(3); // summary count wins over the 2 join state events
    expect(general).toMatchObject({ limited: true, prevBatch: 't34-req' });
    expect(space).toMatchObject({ name: 'The Lab', isSpace: true });
  });

  it('flattens the joined-room timeline + ephemeral in order, skipping the space', () => {
    expect(result.events.map((e) => e.type)).toEqual(['message', 'message', 'typing', 'receipt']);
    const [text, image] = result.events;
    expect(text).toMatchObject({ type: 'message', message: { body: 'morning all', kind: 'text' } });
    expect(image).toMatchObject({
      type: 'message',
      message: { kind: 'media', mediaRef: 'mxc://example.org/AbCdEf' },
    });
  });

  it('surfaces the invite with its inviter', () => {
    expect(result.invites).toEqual([{ roomId: '!secret:other.org', inviter: '@mallory:other.org' }]);
  });

  it('carries the next_batch token forward', () => {
    expect(result.nextBatch).toBe('s72_1_0_1_1_1_1_1');
  });
});

describe('recorded Synapse /sync — incremental', () => {
  const result = parseSyncResponse(INCREMENTAL_SYNC, ctx);

  it('maps edit / reaction / redaction / leave to the normalized events', () => {
    expect(result.events.map((e) => e.type)).toEqual([
      'message-edit',
      'reaction',
      'message-redact',
      'room-membership',
    ]);
    expect(result.events[0]).toMatchObject({ type: 'message-edit', protocolId: '$msg1', body: 'morning everyone' });
    expect(result.events[1]).toMatchObject({ type: 'reaction', protocolId: '$msg2', emoji: '🔥', add: true });
    expect(result.events[2]).toMatchObject({ type: 'message-redact', protocolId: '$msg2' });
    expect(result.events[3]).toMatchObject({ type: 'room-membership', address: '@carol:example.org', joined: false });
  });

  it('reports the room we left', () => {
    expect(result.left).toEqual(['!oldroom:example.org']);
  });
});
