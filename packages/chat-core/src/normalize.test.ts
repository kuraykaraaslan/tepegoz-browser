import { describe, it, expect } from 'vitest';
import { ChatAdapterCapsSchema } from '@tepegoz/shared-types';
import { normalizeEvent, normalizeEvents } from './normalize';

const caps = (over: Record<string, boolean> = {}) => ChatAdapterCapsSchema.parse(over);

const message = {
  id: 'm1',
  conversationId: 'c1',
  accountId: 'acc',
  protocolId: 'p1',
  senderAddress: 'bob@x.com',
  originTs: 1,
  receivedAt: 2,
};

describe('normalizeEvent', () => {
  it('drops an invalid / hostile event', () => {
    expect(normalizeEvent({ type: 'shell', cmd: 'x' }, caps())).toEqual({
      event: null,
      dropped: 'invalid',
    });
  });

  it('gates out an edit when the adapter has no edits capability', () => {
    const res = normalizeEvent(
      { type: 'message-edit', conversationId: 'c1', protocolId: 'p1', body: 'x', editedAt: 3 },
      caps({ edits: false }),
    );
    expect(res).toEqual({ event: null, dropped: 'unsupported-capability' });
  });

  it('keeps an edit when edits is on', () => {
    const res = normalizeEvent(
      { type: 'message-edit', conversationId: 'c1', protocolId: 'p1', body: 'x', editedAt: 3 },
      caps({ edits: true }),
    );
    expect(res.event?.type).toBe('message-edit');
  });

  it('gates a reaction event on the reactions capability', () => {
    const raw = {
      type: 'reaction',
      conversationId: 'c1',
      protocolId: 'p1',
      emoji: '👍',
      senderAddress: 'bob@x',
      add: true,
    };
    expect(normalizeEvent(raw, caps({ reactions: false }))).toEqual({
      event: null,
      dropped: 'unsupported-capability',
    });
    expect(normalizeEvent(raw, caps({ reactions: true })).event?.type).toBe('reaction');
  });

  it('gates a room-topic event on the rooms capability', () => {
    const raw = { type: 'room-topic', conversationId: 'c1', topic: 'Weekly' };
    expect(normalizeEvent(raw, caps({ rooms: false }))).toEqual({
      event: null,
      dropped: 'unsupported-capability',
    });
    const ok = normalizeEvent(raw, caps({ rooms: true }));
    expect(ok.event?.type).toBe('room-topic');
    expect(ok.event?.type === 'room-topic' && ok.event.setBy).toBe(null);
  });

  it('strips reactions/media/threads from a message rather than dropping it', () => {
    const res = normalizeEvent(
      {
        type: 'message',
        message: {
          ...message,
          kind: 'media',
          mediaRef: 'blob:abc',
          replyToId: 'p0',
          reactions: [{ emoji: '👍', count: 1, me: false }],
          editedAt: 9,
        },
      },
      caps({ reactions: false, media: false, threads: false, edits: false }),
    );
    expect(res.event?.type).toBe('message');
    if (res.event?.type === 'message') {
      expect(res.event.message.reactions).toEqual([]);
      expect(res.event.message.kind).toBe('text');
      expect(res.event.message.mediaRef).toBeNull();
      expect(res.event.message.replyToId).toBeNull();
      expect(res.event.message.editedAt).toBeNull();
    }
  });

  it('keeps rich fields when the caps allow them', () => {
    const res = normalizeEvent(
      {
        type: 'message',
        message: { ...message, replyToId: 'p0', reactions: [{ emoji: '✅', count: 2, me: true }] },
      },
      caps({ reactions: true, threads: true }),
    );
    if (res.event?.type === 'message') {
      expect(res.event.message.reactions).toHaveLength(1);
      expect(res.event.message.replyToId).toBe('p0');
    }
  });

  it('normalizeEvents keeps only survivors', () => {
    const out = normalizeEvents(
      [
        { type: 'message', message },
        { type: 'garbage' },
        { type: 'typing', conversationId: 'c1', senderAddress: 'bob@x.com', active: true },
      ],
      caps({ typing: false }),
    );
    expect(out.map((e) => e.type)).toEqual(['message']);
  });
});
