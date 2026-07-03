import { arrayMove } from '@dnd-kit/sortable';

/** Prefix distinguishing a group-header sortable id from a tab id in the flat item list. */
export const GROUP_PREFIX = 'group:';

/** The action a drag-end resolves to — one of the host callbacks, or null when it's a no-op. */
export type DropResult =
  | { kind: 'move-group'; groupId: string; toIndex: number }
  | { kind: 'assign'; tabId: string; groupId: string }
  | { kind: 'move-tab'; id: string; toIndex: number }
  | null;

/**
 * Pure drag-end resolution — kept out of the React component so it's unit-testable without simulating
 * dnd-kit pointer drags. `items` is the flat, ordered sortable id list (tab ids + `group:<id>` headers)
 * exactly as rendered; `tabGroupOf` returns a tab's current group id (or null). The strip only captures
 * intent here — the host's model (ADR-0020 `normalize()`) remains the source of truth for the result.
 *
 * - Dragging a group header → reorder the whole run (`toIndex` = non-member tabs preceding it).
 * - Dropping a tab onto a group header → join that group explicitly (covers collapsed groups).
 * - Dragging a tab → reorder; `toIndex` is its position in the tab-only projection (grouping inferred
 *   by the host from the new neighbors).
 */
export function resolveDrop(
  items: readonly string[],
  activeId: string,
  overId: string,
  tabGroupOf: (tabId: string) => string | null,
): DropResult {
  if (activeId === overId) return null;
  const from = items.indexOf(activeId);
  const to = items.indexOf(overId);
  if (from === -1 || to === -1) return null;

  if (activeId.startsWith(GROUP_PREFIX)) {
    const groupId = activeId.slice(GROUP_PREFIX.length);
    const reordered = arrayMove([...items], from, to);
    let toIndex = 0;
    for (const id of reordered) {
      if (id === activeId) break;
      if (!id.startsWith(GROUP_PREFIX) && tabGroupOf(id) !== groupId) toIndex++;
    }
    return { kind: 'move-group', groupId, toIndex };
  }

  if (overId.startsWith(GROUP_PREFIX)) {
    return { kind: 'assign', tabId: activeId, groupId: overId.slice(GROUP_PREFIX.length) };
  }

  const reordered = arrayMove([...items], from, to);
  const tabOrder = reordered.filter((id) => !id.startsWith(GROUP_PREFIX));
  return { kind: 'move-tab', id: activeId, toIndex: tabOrder.indexOf(activeId) };
}
