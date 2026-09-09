import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '@tepegoz/shared-types';
import { buildTimeline } from './timeline';

const DAY = 86_400_000;
const T0 = new Date(2026, 2, 15, 10, 0, 0).getTime();

function msg(over: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'm1',
    conversationId: 'c1',
    accountId: 'work',
    protocolId: 'p1',
    senderAddress: 'alice@x.example',
    senderName: 'Alice',
    kind: 'text',
    body: 'hi',
    mediaRef: null,
    replyToId: null,
    reactions: [],
    editedAt: null,
    redacted: false,
    originTs: T0,
    receivedAt: T0,
    deliveryState: 'delivered',
    ...over,
  };
}

const kinds = (items: ReturnType<typeof buildTimeline>) => items.map((i) => i.kind);

describe('buildTimeline', () => {
  it('opens with a day separator', () => {
    const items = buildTimeline([msg()]);
    expect(kinds(items)).toEqual(['day', 'message']);
  });

  it('groups consecutive same-sender messages inside the window', () => {
    const items = buildTimeline([
      msg({ id: 'a', originTs: T0 }),
      msg({ id: 'b', originTs: T0 + 60_000 }),
    ]);
    const messages = items.filter((i) => i.kind === 'message');
    expect(messages.map((m) => (m.kind === 'message' ? m.startsGroup : null))).toEqual([true, false]);
  });

  it('breaks the group on a sender change or a long gap', () => {
    const items = buildTimeline([
      msg({ id: 'a', originTs: T0 }),
      msg({ id: 'b', originTs: T0 + 60_000, senderAddress: 'bob@x.example' }),
      msg({ id: 'c', originTs: T0 + 60_000, senderAddress: 'bob@x.example' }),
      msg({ id: 'd', originTs: T0 + 3 * 3600_000, senderAddress: 'bob@x.example' }),
    ]);
    const flags = items.flatMap((i) => (i.kind === 'message' ? [i.startsGroup] : []));
    expect(flags).toEqual([true, true, false, true]);
  });

  it('inserts a day separator when the calendar day changes', () => {
    const items = buildTimeline([msg({ id: 'a', originTs: T0 }), msg({ id: 'b', originTs: T0 + DAY })]);
    expect(kinds(items)).toEqual(['day', 'message', 'day', 'message']);
  });

  it('places the unread divider before the first message after lastReadId', () => {
    const items = buildTimeline(
      [msg({ id: 'a' }), msg({ id: 'b', originTs: T0 + 1000 }), msg({ id: 'c', originTs: T0 + 2000 })],
      { lastReadId: 'a' },
    );
    expect(kinds(items)).toEqual(['day', 'message', 'unread-divider', 'message', 'message']);
  });

  it('emits no divider when everything is read or lastReadId is unknown', () => {
    expect(kinds(buildTimeline([msg({ id: 'a' })], { lastReadId: 'a' }))).toEqual(['day', 'message']);
    expect(kinds(buildTimeline([msg({ id: 'a' })], { lastReadId: 'missing' }))).toEqual([
      'day',
      'message',
    ]);
    expect(kinds(buildTimeline([msg({ id: 'a' })], { lastReadId: null }))).toEqual(['day', 'message']);
  });

  it('never groups a system message', () => {
    const items = buildTimeline([
      msg({ id: 'a' }),
      msg({ id: 'b', kind: 'system', senderAddress: 'alice@x.example', originTs: T0 + 1000 }),
      msg({ id: 'c', originTs: T0 + 2000 }),
    ]);
    const flags = items.flatMap((i) => (i.kind === 'message' ? [i.startsGroup] : []));
    expect(flags).toEqual([true, true, true]);
  });

  it('falls back to receivedAt when originTs is 0', () => {
    const items = buildTimeline([msg({ id: 'a', originTs: 0, receivedAt: T0 })]);
    expect(items[0]).toMatchObject({ kind: 'day', day: new Date(2026, 2, 15).getTime() });
  });
});
