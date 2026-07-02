import { describe, it, expect, beforeEach } from 'vitest';
import type { AppNotification } from '@tepegoz/shared-types/notifications';
import NotificationStore from './notification-store';
import { NotificationInputSchema, toNotification } from './notification.schema';

let seq = 0;
function make(over: Partial<AppNotification> = {}): AppNotification {
  seq += 1;
  return {
    id: over.id ?? `n-${seq}`,
    kind: 'info',
    source: 'system',
    title: 'T',
    body: 'B',
    ts: seq,
    read: false,
    channels: ['center'],
    ...over,
  };
}

beforeEach(() => {
  seq = 0;
  NotificationStore.reset();
});

describe('NotificationStore', () => {
  it('adds newest-first and counts unread', () => {
    NotificationStore.add(make({ id: 'a' }));
    NotificationStore.add(make({ id: 'b' }));
    const s = NotificationStore.state();
    expect(s.items.map((i) => i.id)).toEqual(['b', 'a']);
    expect(s.unread).toBe(2);
  });

  it('dedupeKey replaces the prior match (kept newest-first, no duplicate)', () => {
    NotificationStore.add(make({ id: 'old', dedupeKey: 'k', title: 'old' }));
    NotificationStore.add(make({ id: 'mid' }));
    NotificationStore.add(make({ id: 'new', dedupeKey: 'k', title: 'new' }));
    const ids = NotificationStore.list().map((i) => i.id);
    expect(ids).toEqual(['new', 'mid']);
    expect(NotificationStore.list().find((i) => i.dedupeKey === 'k')?.title).toBe('new');
  });

  it('markRead / markAllRead lower the unread count', () => {
    NotificationStore.add(make({ id: 'a' }));
    NotificationStore.add(make({ id: 'b' }));
    NotificationStore.markRead('a');
    expect(NotificationStore.unreadCount()).toBe(1);
    NotificationStore.markAllRead();
    expect(NotificationStore.unreadCount()).toBe(0);
  });

  it('dismiss removes one, dismissAll clears', () => {
    NotificationStore.add(make({ id: 'a' }));
    NotificationStore.add(make({ id: 'b' }));
    NotificationStore.dismiss('a');
    expect(NotificationStore.list().map((i) => i.id)).toEqual(['b']);
    NotificationStore.dismissAll();
    expect(NotificationStore.list()).toEqual([]);
  });

  it('caps the ring at 200, evicting the oldest', () => {
    for (let i = 0; i < 250; i += 1) NotificationStore.add(make({ id: `n-${i}` }));
    const items = NotificationStore.list();
    expect(items).toHaveLength(200);
    expect(items[0]?.id).toBe('n-249'); // newest kept
    expect(items.at(-1)?.id).toBe('n-50'); // oldest 50 evicted
  });

  it('subscribe fires once per mutation and unsubscribe stops it', () => {
    let calls = 0;
    const off = NotificationStore.subscribe(() => {
      calls += 1;
    });
    NotificationStore.add(make());
    NotificationStore.add(make());
    expect(calls).toBe(2);
    off();
    NotificationStore.add(make());
    expect(calls).toBe(2);
  });

  it('no-op mutations do not notify', () => {
    let calls = 0;
    NotificationStore.subscribe(() => {
      calls += 1;
    });
    NotificationStore.dismiss('missing');
    NotificationStore.markRead('missing');
    NotificationStore.markAllRead();
    expect(calls).toBe(0);
  });
});

describe('NotificationInputSchema + toNotification', () => {
  it('defaults channels to the center and assigns id/ts/read', () => {
    const parsed = NotificationInputSchema.parse({
      kind: 'warning',
      source: 'agent',
      title: 'Handoff',
      body: 'Take over',
    });
    expect(parsed.channels).toEqual(['center']);
    const n = toNotification(parsed, 'n-1', 123);
    expect(n).toMatchObject({ id: 'n-1', ts: 123, read: false, kind: 'warning' });
  });

  it('rejects an empty title and an out-of-set channel', () => {
    expect(NotificationInputSchema.safeParse({ kind: 'info', source: 'system', title: '', body: '' }).success).toBe(false);
    expect(
      NotificationInputSchema.safeParse({
        kind: 'info',
        source: 'system',
        title: 'x',
        body: '',
        channels: ['bogus'],
      }).success,
    ).toBe(false);
  });
});
