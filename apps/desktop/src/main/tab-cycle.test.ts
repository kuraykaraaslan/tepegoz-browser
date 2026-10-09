import { describe, expect, it } from 'vitest';
import { adjacentTabId, tabIdAtPosition } from './tab-cycle';

const IDS = ['a', 'b', 'c'];

describe('adjacentTabId', () => {
  it('steps forward and backward', () => {
    expect(adjacentTabId(IDS, 'a', 1)).toBe('b');
    expect(adjacentTabId(IDS, 'c', -1)).toBe('b');
  });

  it('wraps at both ends', () => {
    expect(adjacentTabId(IDS, 'c', 1)).toBe('a');
    expect(adjacentTabId(IDS, 'a', -1)).toBe('c');
  });

  it('does nothing with no tabs or a single tab', () => {
    expect(adjacentTabId([], null, 1)).toBeNull();
    expect(adjacentTabId(['a'], 'a', 1)).toBeNull();
    expect(adjacentTabId(['a'], 'a', -1)).toBeNull();
  });

  it('lands on the first/last tab when nothing valid is active', () => {
    expect(adjacentTabId(IDS, null, 1)).toBe('a');
    expect(adjacentTabId(IDS, null, -1)).toBe('c');
    expect(adjacentTabId(IDS, 'gone', 1)).toBe('a');
    expect(adjacentTabId(IDS, 'gone', -1)).toBe('c');
  });
});

describe('tabIdAtPosition', () => {
  it('is 1-based', () => {
    expect(tabIdAtPosition(IDS, 1)).toBe('a');
    expect(tabIdAtPosition(IDS, 3)).toBe('c');
  });

  it('"last" is the last tab whatever the count', () => {
    expect(tabIdAtPosition(IDS, 'last')).toBe('c');
    expect(tabIdAtPosition(['x'], 'last')).toBe('x');
    expect(tabIdAtPosition([], 'last')).toBeNull();
  });

  it('does not clamp a position past the end, and rejects nonsense', () => {
    expect(tabIdAtPosition(IDS, 5)).toBeNull();
    expect(tabIdAtPosition(IDS, 0)).toBeNull();
    expect(tabIdAtPosition(IDS, -1)).toBeNull();
    expect(tabIdAtPosition(IDS, 1.5)).toBeNull();
    expect(tabIdAtPosition(IDS, Number.NaN)).toBeNull();
  });
});
