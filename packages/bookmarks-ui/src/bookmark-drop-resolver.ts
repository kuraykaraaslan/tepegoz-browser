import { arrayMove } from '@dnd-kit/sortable';
import { TREE_PREFIX } from './bookmark-rows';
import type { BookmarkManagerNode } from './bookmarks-ui';

/**
 * Where `onMove` puts a node that JOINS a folder rather than taking a slot inside one. Larger than any
 * real child count, so the store clamps it to the end.
 */
export const END_INDEX = 100000;

/** The move a drag-end resolves to, or null when the gesture changes nothing. */
export interface BookmarkDropResult {
  nodeId: string;
  parentId: string;
  index: number;
}

/**
 * Pure drag-end resolution for the bookmarks manager — kept out of the component so it is unit-
 * testable without simulating dnd-kit pointer drags, exactly as `@tepegoz/tab-strip`'s
 * `drop-resolver.ts` is. The component only wires the result into `onMove`.
 *
 * Three shapes, in order:
 *  1. Dropped on a folder in the LEFT TREE → move INTO it. This is also how a bookmark leaves the
 *     folder it is in: drop it on a parent or on a root.
 *  2. A right-pane row dropped on a FOLDER row in the list → move into that folder (Chrome's).
 *  3. Otherwise reorder within the folder currently open.
 *
 * A tree folder resolves only against tree drops: dragging one into the right-hand list is a no-op,
 * because the list shows one folder's contents and "into the list" is not a place to be moved to.
 */
export function resolveBookmarkDrop(
  rawActiveId: string,
  rawOverId: string,
  selectedFolderId: string | null,
  children: readonly BookmarkManagerNode[],
): BookmarkDropResult | null {
  if (selectedFolderId === null) return null;

  const stripTree = (id: string): string =>
    id.startsWith(TREE_PREFIX) ? id.slice(TREE_PREFIX.length) : id;

  const nodeId = stripTree(rawActiveId);
  const overNodeId = stripTree(rawOverId);
  if (nodeId === overNodeId) return null;

  if (rawOverId.startsWith(TREE_PREFIX)) {
    return { nodeId, parentId: overNodeId, index: END_INDEX };
  }

  if (rawActiveId.startsWith(TREE_PREFIX)) return null;

  if (children.find((c) => c.id === overNodeId)?.type === 'folder') {
    return { nodeId, parentId: overNodeId, index: END_INDEX };
  }

  const ids = children.map((c) => c.id);
  const from = ids.indexOf(nodeId);
  const to = ids.indexOf(overNodeId);
  if (from === -1 || to === -1 || from === to) return null;
  return {
    nodeId,
    parentId: selectedFolderId,
    index: arrayMove([...ids], from, to).indexOf(nodeId),
  };
}
