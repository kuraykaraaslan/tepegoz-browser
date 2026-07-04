import { arrayMove } from '@dnd-kit/sortable';

/** The move a bar drag resolves to (pure — the host maps it to a `moveBookmark` IPC call). */
export type BarDropResult =
  | { kind: 'move-into'; id: string; folderId: string }
  | { kind: 'reorder'; id: string; toIndex: number }
  | null;

/**
 * Resolve a bar drag-end. `items` is the ordered list of the bar's top-level node ids. Dropping a node
 * ONTO a folder moves it into that folder (Chrome behavior — folders are drop targets); dropping between
 * chips reorders within the bar. Pure + unit-testable; mirrors `@tepegoz/tab-strip`'s drop-resolver.
 */
export function resolveBarDrop(
  items: readonly string[],
  activeId: string,
  overId: string,
  isFolder: (id: string) => boolean,
): BarDropResult {
  if (activeId === overId) return null;
  // Dropped onto a folder → move inside it.
  if (isFolder(overId)) return { kind: 'move-into', id: activeId, folderId: overId };
  // Otherwise reorder within the bar's top level.
  const from = items.indexOf(activeId);
  const to = items.indexOf(overId);
  if (from === -1 || to === -1) return null;
  const toIndex = arrayMove([...items], from, to).indexOf(activeId);
  return { kind: 'reorder', id: activeId, toIndex };
}
