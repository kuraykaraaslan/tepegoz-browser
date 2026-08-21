import { useEffect, useState, type ReactNode } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faChevronRight } from '@fortawesome/free-solid-svg-icons';
import { DndContext, DragOverlay, closestCenter } from '@dnd-kit/core';
import { restrictToHorizontalAxis } from '@dnd-kit/modifiers';
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { cn } from '@tepegoz/ui';
import { GROUP_PREFIX } from './drop-resolver';
import { TabChip, TabInner, chipClasses, groupColor, type GroupChipStyle } from './tab-chip';
import { GroupHeader } from './group-header';
import { useTabStripDrag } from './tab-strip-drag';
import type { TabDescriptor, TabStripProps } from './tab-strip-types';

// Re-exported from their original home so external imports (`@tepegoz/tab-strip` barrel, tab-chip,
// group-header) keep resolving these types from `./tab-strip` unchanged.
export type {
  TabDescriptor,
  GroupRouteBadge,
  RouteLegStatus,
  TabGroupDescriptor,
  TabNetworkBadge,
  TabStripGeometryReport,
  TabStripLabels,
  TabStripProps,
  TabTearBegin,
  TabTearItem,
  TabTearPoint,
} from './tab-strip-types';

/**
 * `@tepegoz/tab-strip` — the horizontal browser tab strip. Presentational + self-contained: favicon
 * fallback, wheel→horizontal scroll, container-query title/close collapse, keyboard + middle-click, and
 * (ADR-0020) tab groups + pinning + dnd-kit drag-reorder with a drag overlay. All mutations are injected
 * via callbacks, so the package has no dependency on the Electron bridge. Ordering/grouping invariants
 * are enforced by the host's model — the strip only captures drag intent.
 */
export function TabStrip({
  tabs,
  groups = [],
  activeId,
  labels,
  renamingGroupId = null,
  onSelect,
  onClose,
  onContextMenu,
  onGroupContextMenu,
  onNew,
  onMove,
  onMoveGroup,
  onAssignToGroup,
  onToggleGroupCollapsed,
  onRenameGroup,
  onRenameHandled,
  onTearBegin,
  onTearMove,
  onTearEnd,
  onTearCancel,
  onReportGeometry,
}: Readonly<TabStripProps>) {
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);

  // An external "Rename" trigger (native menu) opens the inline editor, then is acknowledged so it fires once.
  useEffect(() => {
    if (renamingGroupId != null) {
      setEditingGroupId(renamingGroupId);
      onRenameHandled?.();
    }
  }, [renamingGroupId, onRenameHandled]);

  const groupById = new Map(groups.map((g) => [g.id, g]));
  const tabById = new Map(tabs.map((t) => [t.id, t]));
  const pinned = tabs.filter((t) => t.pinned === true);
  const unpinned = tabs.filter((t) => t.pinned !== true);

  // Build the flat sortable id list (dnd-kit) and the rendered segments in one walk so they stay in
  // lock-step. Group membership is shown per-tab by a colored ring (no wrapping container) so grouped
  // tabs keep the same equal-width flex sizing as ungrouped ones; a colored header pill marks each run.
  const items: string[] = [];
  const segments: ReactNode[] = [];

  const groupStyleForTab = (t: TabDescriptor): GroupChipStyle | null => {
    if (t.groupId == null) return null;
    const g = groupById.get(t.groupId);
    return g === undefined ? null : groupColor(g.color);
  };

  const renderChip = (t: TabDescriptor): ReactNode => {
    items.push(t.id);
    return (
      <TabChip
        key={t.id}
        tab={t}
        active={t.id === activeId}
        group={groupStyleForTab(t)}
        labels={labels}
        onSelect={onSelect}
        onClose={onClose}
        onContextMenu={onContextMenu}
      />
    );
  };

  for (const t of pinned) segments.push(renderChip(t));

  let i = 0;
  while (i < unpinned.length) {
    const t = unpinned[i]!;
    const gid = t.groupId ?? null;
    const group = gid !== null ? groupById.get(gid) : undefined;
    if (group === undefined) {
      segments.push(renderChip(t));
      i++;
      continue;
    }
    // Collect this group's contiguous run.
    const members: TabDescriptor[] = [];
    while (i < unpinned.length && (unpinned[i]!.groupId ?? null) === gid) {
      members.push(unpinned[i]!);
      i++;
    }
    items.push(`${GROUP_PREFIX}${group.id}`);
    segments.push(
      <GroupHeader
        key={`grp-${group.id}`}
        group={group}
        count={members.length}
        labels={labels}
        editing={editingGroupId === group.id}
        onStartEdit={() => setEditingGroupId(group.id)}
        onCommit={(name) => {
          if (name !== group.name) onRenameGroup?.(group.id, name);
          setEditingGroupId(null);
        }}
        onCancel={() => setEditingGroupId(null)}
        onToggle={onToggleGroupCollapsed}
        onContextMenu={onGroupContextMenu}
      />,
    );
    if (!group.collapsed) for (const m of members) segments.push(renderChip(m));
  }

  const { scrollerRef, sensors, dragId, torn, onDragStart, onDragEnd, onDragCancel } =
    useTabStripDrag({
      items,
      tabById,
      groupById,
      tabs,
      groups,
      activeId,
      labels,
      onMove,
      onMoveGroup,
      onAssignToGroup,
      onTearBegin,
      onTearMove,
      onTearEnd,
      onTearCancel,
      onReportGeometry,
    });

  // Mouse wheels only emit vertical deltas; translate them to horizontal scroll so an overflowing
  // strip is reachable without a trackpad (and without a visible scrollbar).
  const onWheel = (e: React.WheelEvent<HTMLDivElement>): void => {
    const el = scrollerRef.current;
    if (!el || e.deltaY === 0 || e.shiftKey) return;
    el.scrollLeft += e.deltaY;
  };

  // What follows the cursor while dragging (keeps the group-header drag from looking detached). Hidden
  // once torn out — the main-process floating preview window takes over across the desktop.
  const dragOverlay = ((): ReactNode => {
    if (dragId === null || torn) return null;
    if (dragId.startsWith(GROUP_PREFIX)) {
      const g = groupById.get(dragId.slice(GROUP_PREFIX.length));
      if (g === undefined) return null;
      const colors = groupColor(g.color);
      const name = g.name.trim().length > 0 ? g.name : (labels.unnamedGroup ?? 'Group');
      return (
        <div
          className={cn(
            'flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium',
            colors.pill,
          )}
        >
          <FontAwesomeIcon icon={faChevronRight} className="h-2.5 w-2.5 rotate-90" aria-hidden />
          <span className="max-w-32 truncate">{name}</span>
        </div>
      );
    }
    const t = tabById.get(dragId);
    if (t === undefined) return null;
    return (
      <div className={cn(chipClasses(t, t.id === activeId, groupStyleForTab(t)), 'shadow-lg')}>
        <TabInner tab={t} labels={labels} />
      </div>
    );
  })();

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToHorizontalAxis]}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      <div
        ref={scrollerRef}
        role="tablist"
        aria-orientation="horizontal"
        aria-label={labels.tablist}
        onWheel={onWheel}
        className="no-scrollbar flex h-full min-w-0 flex-1 items-end gap-1 overflow-x-auto"
      >
        <SortableContext items={items} strategy={horizontalListSortingStrategy}>
          {segments}
        </SortableContext>
        <button
          type="button"
          aria-label={labels.newTab}
          onClick={onNew}
          className="app-no-drag ml-1 flex h-7 w-7 shrink-0 items-center justify-center rounded text-text-secondary hover:bg-surface-overlay hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
        >
          <FontAwesomeIcon icon={faPlus} className="h-3 w-3" aria-hidden />
        </button>
      </div>
      <DragOverlay>{dragOverlay}</DragOverlay>
    </DndContext>
  );
}
