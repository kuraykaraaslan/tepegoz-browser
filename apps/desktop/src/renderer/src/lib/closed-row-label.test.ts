import { describe, expect, it } from 'vitest';
import { closedRowLabel } from './closed-row-label';

const s = {
  closedGroupOne: '{name} — 1 tab',
  closedGroupOther: '{name} — {count} tabs',
  closedGroupUntitled: 'Tab group',
};
const base = { id: 'rc-1', url: 'https://a.example/', title: '', closedAt: 1 };

describe('closedRowLabel', () => {
  it('shows the title, falling back to the URL', () => {
    expect(closedRowLabel({ ...base, title: 'A' }, s)).toBe('A');
    expect(closedRowLabel(base, s)).toBe('https://a.example/');
  });

  it('shows a closed group as "Name — N tabs"', () => {
    const group = { name: 'Research', color: 'blue', count: 8 };
    expect(closedRowLabel({ ...base, group }, s)).toBe('Research — 8 tabs');
  });

  it('uses the singular form and the untitled fallback', () => {
    const group = { name: '  ', color: 'blue', count: 1 };
    expect(closedRowLabel({ ...base, group }, s)).toBe('Tab group — 1 tab');
  });

  it('does not treat $ in a group name as a replacement pattern', () => {
    const group = { name: 'A$&B', color: 'blue', count: 2 };
    expect(closedRowLabel({ ...base, group }, s)).toBe('A$&B — 2 tabs');
  });
});
