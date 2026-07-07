import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faChevronRight } from '@fortawesome/free-solid-svg-icons';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { restrictToHorizontalAxis } from '@dnd-kit/modifiers';
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { cn } from '@tepegoz/ui';
import { GROUP_PREFIX, resolveDrop } from './drop-resolver';
import { TabChip, TabInner, chipClasses, groupColor, type GroupChipStyle } from './tab-chip';
import { GroupHeader } from './group-header';

/** The minimal tab shape the strip renders. Hosts pass their own richer tab objects (structural). */
export interface TabDescriptor {
  id: string;
  title: string;
  /** Page favicon URL (http(s)/data:), or null when the page has none yet. */
  faviconUrl: string | null;
  isLoading: boolean;
  /** Pinned tabs render favicon-only at the front and have no close button (ADR-0020). */
  pinned?: boolean;
  /** Owning group id, or null/undefined when ungrouped. */
  groupId?: string | null;
}

/** A tab group the strip renders as a colored container wrapping its contiguous member run. */
export interface TabGroupDescriptor {
  id: string;
  name: string;
  /** One of the fixed palette keys (see GROUP_COLORS); unknown values fall back to grey. */
  color: string;
  collapsed: boolean;
}

/** A tab or group being torn out of the strip (structural — matches the host's IPC drag item). */
export interface TabTearItem {
  kind: 'tab' | 'group';
  id: string;
}

/** Payload emitted when a tab/group is torn out of the strip. Structural match for the desktop IPC. */
export interface TabTearBegin {
  item: TabTearItem;
  title: string;
  faviconUrl: string | null;
  grabOffset: { x: number; y: number };
  width: number;
  height: number;
  active: boolean;
  pinned: boolean;
  groupColor: string | null;
}

/** Cursor position in desktop-global screen coords (DIP), streamed during a torn drag. */
export interface TabTearPoint {
  screenX: number;
  screenY: number;
}

/** This strip's geometry (client/page coords) so the host can hit-test cross-window drops. */
export interface TabStripGeometryReport {
  strip: { x: number; y: number; width: number; height: number };
  slots: { id: string; left: number; width: number }[];
}

/** Pointer distance below the strip (or outside the window) before a drag counts as "torn out". */
const TEAR_THRESHOLD_PX = 40;

/** Localized strings, supplied by the host so the package stays i18n-agnostic. */
export interface TabStripLabels {
  /** aria-label for the whole tablist. */
  tablist: string;
  /** Shown for a tab that has no title yet. */
  untitled: string;
  /** aria-label for a tab's close button. */
  closeTab: string;
  /** aria-label for the new-tab button. */
  newTab: string;
  /** Fallback name for an unnamed group. */
  unnamedGroup?: string;
  /** aria-label for the group collapse/expand toggle. */
  toggleGroup?: string;
}

export interface TabStripProps {
  tabs: readonly TabDescriptor[];
  /** Groups whose member tabs appear (in strip order); omit when the host has no grouping. */
  groups?: readonly TabGroupDescriptor[] | undefined;
  activeId: string | null;
  labels: TabStripLabels;
  /** A group whose inline name editor should open (e.g. from the native "Rename" menu item). */
  renamingGroupId?: string | null | undefined;
  onSelect: (id: string) => void;
  /** Close a tab (close button + middle-click). */
  onClose: (id: string) => void;
  /** Open the native tab context menu (right-click a tab). */
  onContextMenu: (id: string) => void;
  /** Open the native group context menu (right-click a group header). */
  onGroupContextMenu?: ((groupId: string) => void) | undefined;
  onNew: () => void;
  /** Drag-reorder a tab to `toIndex` (group membership is inferred by the host from neighbors). */
  onMove?: ((id: string, toIndex: number) => void) | undefined;
  /** Drag-reorder a whole group's run to `toIndex` among the non-member tabs. */
  onMoveGroup?: ((groupId: string, toIndex: number) => void) | undefined;
  /** Add a tab to a group (drag a tab onto the group's header). */
  onAssignToGroup?: ((tabId: string, groupId: string) => void) | undefined;
  /** Collapse/expand a group. */
  onToggleGroupCollapsed?: ((groupId: string, collapsed: boolean) => void) | undefined;
  /** Rename a group (inline edit committed on Enter/blur). */
  onRenameGroup?: ((groupId: string, name: string) => void) | undefined;
  /** Called once the external rename trigger (`renamingGroupId`) has been consumed. */
  onRenameHandled?: (() => void) | undefined;
  // ── Tab tear-off (drag a tab/group out of the strip into a new/another window) ──────────────────
  /** A drag left the strip (torn out): the host shows a floating preview chip seeded by title/favicon.
   *  `grabOffset` is where within the tab the pointer grabbed, so the chip stays held under the cursor. */
  onTearBegin?: ((payload: TabTearBegin) => void) | undefined;
  /** Cursor moved during a torn drag (screen coords) — reposition the floating preview. */
  onTearMove?: ((point: TabTearPoint) => void) | undefined;
  /** Torn drag released (screen coords) — the host performs the merge / new-window move. */
  onTearEnd?: ((point: TabTearPoint) => void) | undefined;
  /** Torn drag cancelled (Esc / invalid drop). */
  onTearCancel?: (() => void) | undefined;
  /** Report this strip's geometry (client coords) so the host can hit-test cross-window drops. */
  onReportGeometry?: ((geometry: TabStripGeometryReport) => void) | undefined;
}

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
  const scrollerRef = useRef<HTMLDivElement>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const [dragId, setDragId] = useState<string | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  // Tear-off drag state. The dragged item + its preview seed are captured on drag start; `beganTearRef`
  // latches once the pointer first leaves the strip (from then on the whole drag is "torn": the floating
  // preview follows the cursor and the in-strip overlay is hidden). `lastPointRef` feeds the drop point.
  const [torn, setTorn] = useState(false);
  const dragBeginRef = useRef<{
    payload: TabTearBegin;
  } | null>(null);
  const beganTearRef = useRef(false);
  const tornRef = useRef(false);
  const lastPointRef = useRef<TabTearPoint | null>(null);

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

  // Report this strip's geometry (rect + per-tab slots, in client coords) so the host/main can hit-test
  // a cross-window drop. Re-measured on mount, on any tab/group change, and on window resize.
  const reportGeometry = useCallback((): void => {
    const el = scrollerRef.current;
    if (el === null || onReportGeometry === undefined) return;
    const stripRect = el.getBoundingClientRect();
    const slots: { id: string; left: number; width: number }[] = [];
    el.querySelectorAll<HTMLElement>('[data-tab-id]').forEach((node) => {
      const id = node.dataset.tabId;
      if (id === undefined) return;
      const r = node.getBoundingClientRect();
      slots.push({ id, left: r.left, width: r.width });
    });
    onReportGeometry({
      strip: { x: stripRect.left, y: stripRect.top, width: stripRect.width, height: stripRect.height },
      slots,
    });
  }, [onReportGeometry]);

  useEffect(() => {
    reportGeometry();
    window.addEventListener('resize', reportGeometry);
    return () => window.removeEventListener('resize', reportGeometry);
  }, [reportGeometry, tabs, groups]);

  // Whether the pointer has been dragged out of the strip (below it, or off the window edge) → torn.
  const isTorn = (clientX: number, clientY: number, rect: DOMRect): boolean => {
    const belowStrip = clientY > rect.bottom + TEAR_THRESHOLD_PX;
    const outsideWindow =
      clientX < 0 || clientY < 0 || clientX > window.innerWidth || clientY > window.innerHeight;
    return belowStrip || outsideWindow;
  };

  // While a drag is active, track the pointer at the window level (dnd-kit's pointer capture still lets
  // window listeners fire). Once the pointer first leaves the strip we latch "torn" — from then on every
  // move streams to the host (which drives the floating preview across the desktop), even if the pointer
  // returns over a strip. `screenX/screenY` are desktop-global (DIP), exactly what main needs.
  useEffect(() => {
    if (dragId === null) return undefined;
    const onPointerMove = (ev: PointerEvent): void => {
      lastPointRef.current = { screenX: ev.screenX, screenY: ev.screenY };
      if (beganTearRef.current) {
        onTearMove?.({ screenX: ev.screenX, screenY: ev.screenY });
        return;
      }
      const rect = scrollerRef.current?.getBoundingClientRect();
      if (rect === undefined || !isTorn(ev.clientX, ev.clientY, rect)) return;
      beganTearRef.current = true;
      tornRef.current = true;
      setTorn(true);
      const begin = dragBeginRef.current;
      if (begin !== null) onTearBegin?.(begin.payload);
      onTearMove?.({ screenX: ev.screenX, screenY: ev.screenY });
    };
    window.addEventListener('pointermove', onPointerMove);
    return () => window.removeEventListener('pointermove', onPointerMove);
  }, [dragId, onTearBegin, onTearMove]);

  /** Where the pointer grabbed within the dragged item (client px), from dnd-kit's activator event and
   *  the item's initial rect. Falls back to a sensible chip anchor when unavailable. */
  const grabOffsetOf = (event: DragStartEvent): { x: number; y: number } => {
    const activator = event.activatorEvent;
    const rect = event.active.rect.current.initial;
    if (rect !== null && activator !== null && 'clientX' in activator && 'clientY' in activator) {
      const ev = activator as { clientX: number; clientY: number };
      return { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
    }
    return { x: 16, y: 18 };
  };

  /** Clear all per-drag tear state (both the render flag and the handler refs). */
  const resetTear = (): void => {
    setTorn(false);
    beganTearRef.current = false;
    tornRef.current = false;
    dragBeginRef.current = null;
    lastPointRef.current = null;
  };

  const onDragStart = (event: DragStartEvent): void => {
    const id = String(event.active.id);
    setDragId(id);
    resetTear();
    // Where within the dragged item the pointer grabbed (client px), so the floating preview stays held
    // under the cursor at that same point rather than jumping to a fixed corner offset.
    const grabOffset = grabOffsetOf(event);
    const rect = event.active.rect.current.initial;
    const width = Math.ceil(rect?.width ?? 160);
    const height = Math.ceil(rect?.height ?? 28);
    // Capture the dragged item + the floating-preview chip seed now (from the current render's maps).
    if (id.startsWith(GROUP_PREFIX)) {
      const gid = id.slice(GROUP_PREFIX.length);
      const g = groupById.get(gid);
      const name = g !== undefined && g.name.trim().length > 0 ? g.name : (labels.unnamedGroup ?? 'Group');
      dragBeginRef.current = {
        payload: {
          item: { kind: 'group', id: gid },
          title: name,
          faviconUrl: null,
          grabOffset,
          width,
          height,
          active: tabs.some((tab) => tab.groupId === gid && tab.id === activeId),
          pinned: false,
          groupColor: g?.color ?? null,
        },
      };
    } else {
      const t = tabById.get(id);
      const group = t?.groupId != null ? groupById.get(t.groupId) : undefined;
      dragBeginRef.current = {
        payload: {
          item: { kind: 'tab', id },
          title: t !== undefined && t.title.length > 0 ? t.title : labels.untitled,
          faviconUrl: t?.faviconUrl ?? null,
          grabOffset,
          width,
          height,
          active: id === activeId,
          pinned: t?.pinned === true,
          groupColor: group?.color ?? null,
        },
      };
    }
  };

  const onDragEnd = (event: DragEndEvent): void => {
    setDragId(null);
    // A torn drop is owned by the host (merge into another window / new window) — discard the in-strip
    // reorder entirely.
    if (tornRef.current) {
      const pt = lastPointRef.current;
      resetTear();
      if (pt !== null) onTearEnd?.(pt);
      return;
    }
    resetTear();
    const { active, over } = event;
    if (over === null) return;
    const tabGroupOf = (id: string): string | null => tabById.get(id)?.groupId ?? null;
    const result = resolveDrop(items, String(active.id), String(over.id), tabGroupOf);
    if (result === null) return;
    if (result.kind === 'move-group') onMoveGroup?.(result.groupId, result.toIndex);
    else if (result.kind === 'assign') onAssignToGroup?.(result.tabId, result.groupId);
    else onMove?.(result.id, result.toIndex);
  };

  const onDragCancel = (): void => {
    setDragId(null);
    const wasTorn = tornRef.current;
    resetTear();
    if (wasTorn) onTearCancel?.();
  };

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
        <div className={cn('flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium', colors.pill)}>
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
