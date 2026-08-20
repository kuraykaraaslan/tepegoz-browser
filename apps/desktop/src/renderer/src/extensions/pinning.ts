import { isExtensionEnabled, type ExtensionId, type ExtensionState } from '@tepegoz/desktop-ipc';
import type { ExtensionManifestWire } from '@tepegoz/desktop-ipc';

/**
 * Toolbar pinning — the Chrome model. Only PINNED extensions get a toolbar icon; everything else is
 * reached from the puzzle button's Extensions panel. The pinned list is an ORDERED array of ids
 * (`prefs.pinnedExtensions`), so its order is the icon order and a drag-reorder is just a rewrite.
 *
 * Pure functions, shared by the toolbar tray (main window) and the panel popup (its own window) — which
 * is why they take manifests/ids rather than React state.
 */

/** Permissions that let an extension see or change what is on the page — the panel's grouping rule. */
const PAGE_ACCESS_PERMISSIONS = ['read-page', 'write-page'];

/** Whether an extension declares page-content access (drives the panel's two group headings). */
export function hasPageAccess(manifest: Pick<ExtensionManifestWire, 'permissions'>): boolean {
  return manifest.permissions.some((p) => PAGE_ACCESS_PERMISSIONS.includes(p));
}

/** Keep only the ids that are pinned AND still enabled, in pinned order; drop ids no longer installed. */
export function pinnedOrder<T extends { id: ExtensionId }>(
  items: readonly T[],
  states: readonly ExtensionState[],
  pinnedIds: readonly ExtensionId[],
): T[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const seen = new Set<ExtensionId>();
  const out: T[] = [];
  for (const id of pinnedIds) {
    const item = byId.get(id);
    if (item === undefined || seen.has(id) || !isExtensionEnabled(states, id)) continue;
    seen.add(id);
    out.push(item);
  }
  return out;
}

/** Pin an unpinned id (appended, so it lands at the right end like Chrome) or unpin a pinned one. */
export function togglePinned(
  pinnedIds: readonly ExtensionId[],
  id: ExtensionId,
): ExtensionId[] {
  return pinnedIds.includes(id) ? pinnedIds.filter((p) => p !== id) : [...pinnedIds, id];
}

/** Move `dragId` to `targetId`'s slot (drag-reorder). Unknown ids or a self-drop leave the list alone. */
export function movePinned(
  pinnedIds: readonly ExtensionId[],
  dragId: ExtensionId,
  targetId: ExtensionId,
): ExtensionId[] {
  const from = pinnedIds.indexOf(dragId);
  const to = pinnedIds.indexOf(targetId);
  if (from === -1 || to === -1 || from === to) return [...pinnedIds];
  const next = pinnedIds.filter((id) => id !== dragId);
  next.splice(to, 0, dragId);
  return next;
}
