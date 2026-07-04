import { describe, it, expect } from 'vitest';
import { resolveBarDrop } from './bar-drop-resolver';

const items = ['a', 'b', 'f', 'c']; // f is a folder
const isFolder = (id: string): boolean => id === 'f';

describe('resolveBarDrop', () => {
  it('returns null when dropped on itself', () => {
    expect(resolveBarDrop(items, 'a', 'a', isFolder)).toBeNull();
  });

  it('moves into a folder when dropped onto one', () => {
    expect(resolveBarDrop(items, 'a', 'f', isFolder)).toEqual({
      kind: 'move-into',
      id: 'a',
      folderId: 'f',
    });
  });

  it('reorders within the bar when dropped between chips', () => {
    // Drag 'a' onto 'c' → 'a' ends up at the last index.
    expect(resolveBarDrop(items, 'a', 'c', isFolder)).toEqual({
      kind: 'reorder',
      id: 'a',
      toIndex: 3,
    });
  });

  it('reorders leftward too', () => {
    expect(resolveBarDrop(items, 'c', 'a', isFolder)).toEqual({
      kind: 'reorder',
      id: 'c',
      toIndex: 0,
    });
  });

  it('returns null for unknown ids', () => {
    expect(resolveBarDrop(items, 'a', 'zzz', isFolder)).toBeNull();
  });
});
