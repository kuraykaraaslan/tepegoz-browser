import { describe, expect, it } from 'vitest';
import {
  matrixEphemeralEvents,
  matrixTimelineEvent,
  type MatrixContext,
  type MatrixRoomEvent,
} from './events';

const ctx: MatrixContext = { accountId: 'acc', selfUserId: '@me:s' };
const ROOM = '!room:s';

function ev(over: Partial<MatrixRoomEvent> = {}): MatrixRoomEvent {
  return {
    type: 'm.room.message',
    sender: '@bob:s',
    event_id: '$1',
    origin_server_ts: 1_700_000_000_000,
    content: { msgtype: 'm.text', body: 'hello' },
    ...over,
  };
}

describe('matrixTimelineEvent — messages', () => {
  it('a plain text message', () => {
    expect(matrixTimelineEvent(ev(), ROOM, ctx)).toMatchObject({
      type: 'message',
      message: {
        conversationId: ROOM,
        senderAddress: '@bob:s',
        protocolId: '$1',
        body: 'hello',
        kind: 'text',
        originTs: 1_700_000_000_000,
        deliveryState: 'delivered',
      },
    });
  });

  it('m.emote → /me, m.notice → system kind, own message → sent', () => {
    expect(
      matrixTimelineEvent(ev({ content: { msgtype: 'm.emote', body: 'waves' } }), ROOM, ctx),
    ).toMatchObject({ message: { body: '/me waves' } });
    expect(
      matrixTimelineEvent(ev({ content: { msgtype: 'm.notice', body: 'fyi' } }), ROOM, ctx)?.type ===
        'message',
    ).toBe(true);
    expect(matrixTimelineEvent(ev({ sender: '@me:s' }), ROOM, ctx)).toMatchObject({
      message: { deliveryState: 'sent' },
    });
  });

  it('a media message carries the mxc ref and media kind', () => {
    const e = matrixTimelineEvent(
      ev({ content: { msgtype: 'm.image', body: 'cat.png', url: 'mxc://s/abc' } }),
      ROOM,
      ctx,
    );
    expect(e).toMatchObject({ message: { kind: 'media', mediaRef: 'mxc://s/abc', body: 'cat.png' } });
    // encrypted-file url shape
    expect(
      matrixTimelineEvent(
        ev({ content: { msgtype: 'm.file', body: 'x', file: { url: 'mxc://s/enc' } } }),
        ROOM,
        ctx,
      ),
    ).toMatchObject({ message: { mediaRef: 'mxc://s/enc' } });
  });

  it('a reply relation becomes replyToId', () => {
    const e = matrixTimelineEvent(
      ev({ content: { msgtype: 'm.text', body: 're', 'm.relates_to': { 'm.in_reply_to': { event_id: '$0' } } } }),
      ROOM,
      ctx,
    );
    expect(e).toMatchObject({ message: { replyToId: '$0' } });
  });

  it('an m.replace edit → message-edit', () => {
    const e = matrixTimelineEvent(
      ev({
        content: {
          msgtype: 'm.text',
          body: '* fixed',
          'm.new_content': { msgtype: 'm.text', body: 'fixed' },
          'm.relates_to': { rel_type: 'm.replace', event_id: '$1' },
        },
      }),
      ROOM,
      ctx,
    );
    expect(e).toEqual({
      type: 'message-edit',
      conversationId: ROOM,
      protocolId: '$1',
      body: 'fixed',
      editedAt: 1_700_000_000_000,
    });
  });

  it('m.room.redaction → message-redact (redacts or a relation)', () => {
    expect(
      matrixTimelineEvent(ev({ type: 'm.room.redaction', content: { redacts: '$1' } }), ROOM, ctx),
    ).toMatchObject({ type: 'message-redact', protocolId: '$1' });
    expect(
      matrixTimelineEvent(
        ev({ type: 'm.room.redaction', content: { 'm.relates_to': { event_id: '$2' } } }),
        ROOM,
        ctx,
      ),
    ).toMatchObject({ protocolId: '$2' });
  });

  it('m.room.member join/leave → room-membership', () => {
    expect(
      matrixTimelineEvent(ev({ type: 'm.room.member', sender: '@me:s', content: { membership: 'join' } }), ROOM, ctx),
    ).toMatchObject({ type: 'room-membership', joined: true, self: true });
    expect(
      matrixTimelineEvent(ev({ type: 'm.room.member', content: { membership: 'leave' } }), ROOM, ctx),
    ).toMatchObject({ joined: false });
    expect(
      matrixTimelineEvent(ev({ type: 'm.room.member', content: { membership: 'invite' } }), ROOM, ctx),
    ).toBeNull();
  });

  it('drops an unmodelled type, an empty body, and a bad shape', () => {
    expect(matrixTimelineEvent(ev({ type: 'm.room.topic' }), ROOM, ctx)).toBeNull();
    expect(matrixTimelineEvent(ev({ content: { msgtype: 'm.text', body: '' } }), ROOM, ctx)).toBeNull();
    expect(matrixTimelineEvent(ev({ sender: '' }), ROOM, ctx)).toBeNull();
  });
});

describe('matrixEphemeralEvents', () => {
  it('m.typing → a typing event per other user', () => {
    expect(
      matrixEphemeralEvents({ type: 'm.typing', content: { user_ids: ['@a:s', '@me:s', '@b:s'] } }, ROOM, ctx),
    ).toEqual([
      { type: 'typing', conversationId: ROOM, senderAddress: '@a:s', active: true },
      { type: 'typing', conversationId: ROOM, senderAddress: '@b:s', active: true },
    ]);
  });

  it('m.receipt → a read receipt per reader (skipping self)', () => {
    const out = matrixEphemeralEvents(
      {
        type: 'm.receipt',
        content: { $5: { 'm.read': { '@a:s': { ts: 111 }, '@me:s': { ts: 222 } } } },
      },
      ROOM,
      ctx,
    );
    expect(out).toEqual([
      {
        type: 'receipt',
        receipt: { conversationId: ROOM, messageId: '$5', byAddress: '@a:s', kind: 'read', ts: 111 },
      },
    ]);
  });

  it('an unknown ephemeral type → []', () => {
    expect(matrixEphemeralEvents({ type: 'm.presence', content: {} }, ROOM, ctx)).toEqual([]);
  });
});
