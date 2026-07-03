import { describe, it, expect } from 'vitest';
import { resolveDrop } from './drop-resolver';

// A strip: [pinned '0'] then group g1 = ['1','2'], then ungrouped '3','4'.
// Flat sortable items as the strip renders them:
const ITEMS = ['0', 'group:g1', '1', '2', '3', '4'];
const groupOf = (id: string): string | null => (id === '1' || id === '2' ? 'g1' : null);

describe('resolveDrop', () => {
  it('is a no-op when dropped on itself or an unknown target', () => {
    expect(resolveDrop(ITEMS, '3', '3', groupOf)).toBeNull();
    expect(resolveDrop(ITEMS, '3', 'nope', groupOf)).toBeNull();
  });

  it('reorders a tab and reports its index in the tab-only projection', () => {
    // Drag '4' to where '3' is → tab order becomes 0,1,2,4,3 → '4' at index 3.
    expect(resolveDrop(ITEMS, '4', '3', groupOf)).toEqual({ kind: 'move-tab', id: '4', toIndex: 3 });
  });

  it('dropping a tab onto a group header joins that group explicitly', () => {
    expect(resolveDrop(ITEMS, '3', 'group:g1', groupOf)).toEqual({
      kind: 'assign',
      tabId: '3',
      groupId: 'g1',
    });
  });

  it('dragging a group header to the end reorders the whole run past every non-member', () => {
    // Drag the header over '4' (last): arrayMove → [0,1,2,3,4,group:g1]; non-members before it are
    // 0,3,4 → toIndex 3 (the group lands after all non-member tabs).
    expect(resolveDrop(ITEMS, 'group:g1', '4', groupOf)).toEqual({
      kind: 'move-group',
      groupId: 'g1',
      toIndex: 3,
    });
  });

  it('moving a group to the front yields toIndex 0', () => {
    const res = resolveDrop(ITEMS, 'group:g1', '0', groupOf);
    expect(res).toEqual({ kind: 'move-group', groupId: 'g1', toIndex: 0 });
  });
});
