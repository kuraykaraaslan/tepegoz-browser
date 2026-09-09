import { describe, expect, it } from 'vitest';
import type { ChatConversation } from '@tepegoz/shared-types';
import {
  conversationTitle,
  groupConversationsByAccount,
  sortConversations,
  totalMentions,
  totalUnread,
} from './conversation-list';

function conv(over: Partial<ChatConversation> = {}): ChatConversation {
  return {
    id: 'c1',
    accountId: 'work',
    kind: 'dm',
    address: 'bob@x.example',
    name: '',
    topic: '',
    memberCount: 2,
    unread: 0,
    mentions: 0,
    lastReadId: null,
    muted: false,
    notifyLevel: 'all',
    isKnownContact: true,
    updatedAt: 1000,
    ...over,
  };
}

describe('conversationTitle', () => {
  it('prefers the name, falls back to the address', () => {
    expect(conversationTitle(conv({ name: 'Bob' }))).toBe('Bob');
    expect(conversationTitle(conv({ name: '   ' }))).toBe('bob@x.example');
  });
});

describe('sortConversations', () => {
  it('orders by updatedAt desc, tiebreaking on id for a stable render', () => {
    const list = [
      conv({ id: 'a', updatedAt: 100 }),
      conv({ id: 'c', updatedAt: 300 }),
      conv({ id: 'b', updatedAt: 300 }),
    ];
    expect(sortConversations(list).map((c) => c.id)).toEqual(['b', 'c', 'a']);
  });

  it('does not mutate the input', () => {
    const list = [conv({ id: 'a', updatedAt: 1 }), conv({ id: 'b', updatedAt: 2 })];
    sortConversations(list);
    expect(list.map((c) => c.id)).toEqual(['a', 'b']);
  });
});

describe('totalUnread / totalMentions', () => {
  it('sum across the list', () => {
    const list = [conv({ unread: 3, mentions: 1 }), conv({ unread: 2, mentions: 0 })];
    expect(totalUnread(list)).toBe(5);
    expect(totalMentions(list)).toBe(1);
  });
});

describe('groupConversationsByAccount', () => {
  const accounts = [
    { id: 'work', label: 'Work' },
    { id: 'home', label: 'Home' },
  ];

  it('buckets under accounts in the given order, dropping empty groups', () => {
    const list = [
      conv({ id: 'w1', accountId: 'work' }),
      conv({ id: 'h1', accountId: 'home' }),
      conv({ id: 'w2', accountId: 'work' }),
    ];
    const groups = groupConversationsByAccount(list, accounts);
    expect(groups.map((g) => [g.account?.id, g.conversations.map((c) => c.id)])).toEqual([
      ['work', ['w1', 'w2']],
      ['home', ['h1']],
    ]);
  });

  it('collects conversations of an unknown account into a trailing null group', () => {
    const list = [conv({ id: 'w1', accountId: 'work' }), conv({ id: 'x1', accountId: 'ghost' })];
    const groups = groupConversationsByAccount(list, accounts);
    expect(groups.at(-1)?.account).toBeNull();
    expect(groups.at(-1)?.conversations.map((c) => c.id)).toEqual(['x1']);
  });
});
