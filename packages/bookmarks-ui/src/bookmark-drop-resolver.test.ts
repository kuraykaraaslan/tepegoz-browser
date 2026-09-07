import { describe, expect, it } from 'vitest';
import { TREE_PREFIX } from './bookmark-rows';
import { END_INDEX, resolveBookmarkDrop } from './bookmark-drop-resolver';
import type { BookmarkManagerNode } from './bookmarks-ui';

/**
 * Where a dragged bookmark or folder actually lands. Extracted from the manager so it can be driven
 * directly: a dnd-kit pointer drag in jsdom proves the library works, not that the right bookmark
 * ends up in the right folder — and the wrong answer here silently files somebody's bookmark
 * somewhere they will not look for it.
 */

const bm = (id: string): BookmarkManagerNode => ({
  id,
  type: 'bookmark',
  title: id,
  url: `https://${id}.test/`,
  favicon: null,
  children: [],
});
const folder = (id: string): BookmarkManagerNode => ({
  id,
  type: 'folder',
  title: id,
  url: null,
  favicon: null,
  children: [],
});

const tree = (id: string): string => `${TREE_PREFIX}${id}`;

/** The open folder's contents: two bookmarks around a subfolder. */
const CHILDREN = [bm('a'), folder('sub'), bm('b')];

describe('dropping on the left tree', () => {
  it('moves a list row into the folder it was dropped on', () => {
    expect(resolveBookmarkDrop('a', tree('work'), 'root-bar', CHILDREN)).toEqual({
      nodeId: 'a',
      parentId: 'work',
      index: END_INDEX,
    });
  });

  it('is also how a bookmark LEAVES a folder — by landing on a parent or a root', () => {
    expect(resolveBookmarkDrop('a', tree('root-other'), 'root-bar', CHILDREN)).toEqual({
      nodeId: 'a',
      parentId: 'root-other',
      index: END_INDEX,
    });
  });

  it('moves a tree folder into another tree folder', () => {
    expect(resolveBookmarkDrop(tree('work'), tree('root-other'), 'root-bar', CHILDREN)).toEqual({
      nodeId: 'work',
      parentId: 'root-other',
      index: END_INDEX,
    });
  });

  it('refuses to move a folder into itself', () => {
    // The ids differ as strings — one is prefixed — so this has to compare the NODES behind them.
    expect(resolveBookmarkDrop(tree('work'), tree('work'), 'root-bar', CHILDREN)).toBeNull();
    expect(resolveBookmarkDrop('sub', tree('sub'), 'root-bar', CHILDREN)).toBeNull();
  });
});

describe('dropping inside the open folder', () => {
  it('moves a row into a folder ROW, the way Chrome does', () => {
    expect(resolveBookmarkDrop('a', 'sub', 'root-bar', CHILDREN)).toEqual({
      nodeId: 'a',
      parentId: 'sub',
      index: END_INDEX,
    });
  });

  it('reorders within the folder, reporting the index the node ends up at', () => {
    // a → past sub and b: [a, sub, b] becomes [sub, b, a]
    expect(resolveBookmarkDrop('a', 'b', 'root-bar', CHILDREN)).toEqual({
      nodeId: 'a',
      parentId: 'root-bar',
      index: 2,
    });
    // and back the other way
    expect(resolveBookmarkDrop('b', 'a', 'root-bar', CHILDREN)).toEqual({
      nodeId: 'b',
      parentId: 'root-bar',
      index: 0,
    });
  });

  it('does nothing when a row is dropped on itself', () => {
    expect(resolveBookmarkDrop('a', 'a', 'root-bar', CHILDREN)).toBeNull();
  });

  it('does nothing when either id is not in the open folder', () => {
    // The list is rebuilt as folders change; a stale drag must not be resolved against a guess.
    expect(resolveBookmarkDrop('ghost', 'b', 'root-bar', CHILDREN)).toBeNull();
    expect(resolveBookmarkDrop('a', 'ghost', 'root-bar', CHILDREN)).toBeNull();
  });
});

describe('the shapes that are not moves at all', () => {
  it('ignores a tree folder dragged into the right-hand list', () => {
    // The list shows ONE folder's contents; "into the list" is not a place to be moved to, and
    // guessing would silently reparent the folder to whatever happened to be under the cursor.
    expect(resolveBookmarkDrop(tree('work'), 'a', 'root-bar', CHILDREN)).toBeNull();
    expect(resolveBookmarkDrop(tree('work'), 'sub', 'root-bar', CHILDREN)).toBeNull();
  });

  it('ignores any drop while no folder is selected', () => {
    expect(resolveBookmarkDrop('a', 'b', null, CHILDREN)).toBeNull();
    expect(resolveBookmarkDrop('a', tree('work'), null, CHILDREN)).toBeNull();
  });
});
