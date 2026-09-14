import { describe, expect, it } from 'vitest';
import type { ChatConversation } from '@tepegoz/shared-types';
import {
  conversationTitle,
  filterConversations,
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
    mutedUntil: null,
    notifyLevel: 'all',
    isKnownContact: true,
    archived: false,
    lastMessage: null,
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

describe('filterConversations', () => {
  it('matches on name or address, case/fold-insensitive', () => {
    const list = [
      conv({ id: 'a', name: 'General', address: 'general@conf.example' }),
      conv({ id: 'b', name: '', address: 'bob@x.example' }),
    ];
    expect(filterConversations(list, 'gen').map((c) => c.id)).toEqual(['a']);
    expect(filterConversations(list, 'BOB').map((c) => c.id)).toEqual(['b']);
    expect(filterConversations(list, '').map((c) => c.id)).toEqual(['a', 'b']);
  });
});

describe('totalUnread / totalMentions', () => {
  it('sum across the list', () => {
    const list = [conv({ unread: 3, mentions: 1 }), conv({ unread: 2, mentions: 0 })];
    expect(totalUnread(list)).toBe(5);
    expect(totalMentions(list)).toBe(1);
  });
});
