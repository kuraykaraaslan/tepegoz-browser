import { describe, it, expect } from 'vitest';
import type { ExtensionState } from '@tepegoz/desktop-ipc';
import { hasPageAccess, movePinned, pinnedOrder, togglePinned } from './pinning';

const A = 'com.tepegoz.adblock';
const B = 'com.tepegoz.agent';
const C = 'com.tepegoz.macros';
const ITEMS = [{ id: A }, { id: B }, { id: C }];
const NONE: ExtensionState[] = [];

describe('pinnedOrder', () => {
  it('returns pinned items in the pinned order, not the catalog order', () => {
    expect(pinnedOrder(ITEMS, NONE, [C, A]).map((i) => i.id)).toEqual([C, A]);
  });

  it('is empty when nothing is pinned (the fresh-profile default)', () => {
    expect(pinnedOrder(ITEMS, NONE, [])).toEqual([]);
  });

  it('drops ids that are disabled or no longer installed, and de-duplicates', () => {
    const states: ExtensionState[] = [{ id: B, status: 'disabled' }];
    expect(pinnedOrder(ITEMS, states, [B, A, 'com.tepegoz.gone', A]).map((i) => i.id)).toEqual([A]);
  });
});

describe('togglePinned', () => {
  it('appends an unpinned id so it lands at the end, like Chrome', () => {
    expect(togglePinned([A], B)).toEqual([A, B]);
  });

  it('removes a pinned id', () => {
    expect(togglePinned([A, B], A)).toEqual([B]);
  });
});

describe('movePinned', () => {
  it('moves a dragged id into the target slot (forwards and backwards)', () => {
    expect(movePinned([A, B, C], A, C)).toEqual([B, C, A]);
    expect(movePinned([A, B, C], C, A)).toEqual([C, A, B]);
  });

  it('leaves the list alone for a self-drop or an unknown id', () => {
    expect(movePinned([A, B], A, A)).toEqual([A, B]);
    expect(movePinned([A, B], 'com.tepegoz.gone', A)).toEqual([A, B]);
  });
});

describe('hasPageAccess', () => {
  it('is true only when page content is read or written', () => {
    expect(hasPageAccess({ permissions: ['read-page'] })).toBe(true);
    expect(hasPageAccess({ permissions: ['tabs', 'write-page'] })).toBe(true);
    expect(hasPageAccess({ permissions: ['tabs', 'network', 'navigate'] })).toBe(false);
    expect(hasPageAccess({ permissions: [] })).toBe(false);
  });
});
