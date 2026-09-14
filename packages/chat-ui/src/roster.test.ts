import { describe, expect, it } from 'vitest';
import type { ChatContact } from '@tepegoz/shared-types';
import {
  ROSTER_UNGROUPED,
  contactDisplayName,
  filterRoster,
  groupRoster,
  onlineCount,
} from './roster';

function contact(over: Partial<ChatContact> = {}): ChatContact {
  return {
    id: 'work:bob@x.example',
    accountId: 'work',
    address: 'bob@x.example',
    name: 'Bob',
    groups: [],
    presence: 'offline',
    statusText: '',
    subscription: 'both',
    blocked: false,
    ...over,
  };
}

describe('contactDisplayName', () => {
  it('prefers the name, falls back to the address', () => {
    expect(contactDisplayName(contact({ name: '  ' }))).toBe('bob@x.example');
    expect(contactDisplayName(contact({ name: 'Bob' }))).toBe('Bob');
  });
});

describe('filterRoster', () => {
  it('fold-matches name or address, Turkish-aware', () => {
    const list = [
      contact({ id: '1', name: 'İlknur', address: 'ilknur@x.example' }),
      contact({ id: '2', name: 'Bob', address: 'bob@x.example' }),
    ];
    expect(filterRoster(list, 'ilknur').map((c) => c.id)).toEqual(['1']);
    expect(filterRoster(list, 'BOB@X').map((c) => c.id)).toEqual(['2']);
    expect(filterRoster(list, '  ').map((c) => c.id)).toEqual(['1', '2']);
  });
});

describe('groupRoster', () => {
  it('sorts named groups alphabetically with the ungrouped bucket last', () => {
    const list = [
      contact({ id: 'a', groups: ['Work'] }),
      contact({ id: 'b', groups: ['Friends'] }),
      contact({ id: 'c', groups: [] }),
    ];
    expect(groupRoster(list).map((g) => g.group)).toEqual(['Friends', 'Work', ROSTER_UNGROUPED]);
  });

  it('places a contact in every group it belongs to', () => {
    const list = [contact({ id: 'a', groups: ['Work', 'VIP'] })];
    const groups = groupRoster(list);
    expect(groups.flatMap((g) => g.contacts.map((c) => c.id))).toEqual(['a', 'a']);
  });

  it('orders within a group by presence rank then name', () => {
    const list = [
      contact({ id: 'z-off', name: 'Zoe', presence: 'offline', groups: ['G'] }),
      contact({ id: 'a-dnd', name: 'Ada', presence: 'dnd', groups: ['G'] }),
      contact({ id: 'b-on', name: 'Bea', presence: 'online', groups: ['G'] }),
      contact({ id: 'a-on', name: 'Ana', presence: 'online', groups: ['G'] }),
    ];
    expect(groupRoster(list)[0]?.contacts.map((c) => c.id)).toEqual([
      'a-on',
      'b-on',
      'a-dnd',
      'z-off',
    ]);
  });
});

describe('onlineCount', () => {
  it('counts every non-offline contact', () => {
    expect(
      onlineCount([
        contact({ presence: 'online' }),
        contact({ presence: 'dnd' }),
        contact({ presence: 'offline' }),
      ]),
    ).toBe(2);
  });
});
