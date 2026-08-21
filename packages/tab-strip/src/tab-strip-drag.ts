import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import {
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { GROUP_PREFIX, resolveDrop } from './drop-resolver';
import type {
  TabDescriptor,
  TabGroupDescriptor,
  TabStripLabels,
  TabTearBegin,
  TabTearPoint,
  TabStripGeometryReport,
} from './tab-strip-types';

/** Pointer distance below the strip (or outside the window) before a drag counts as "torn out". */
const TEAR_THRESHOLD_PX = 40;

/** Inputs the drag/tear state machine reads from the current render (maps rebuilt each render). */
export interface UseTabStripDragArgs {
  /** The flat sortable id list (dnd-kit order), rebuilt each render alongside the segments. */
  items: string[];
  tabById: Map<string, TabDescriptor>;
  groupById: Map<string, TabGroupDescriptor>;
  tabs: readonly TabDescriptor[];
  groups: readonly TabGroupDescriptor[];
  activeId: string | null;
  labels: TabStripLabels;
  onMove?: ((id: string, toIndex: number) => void) | undefined;
  onMoveGroup?: ((groupId: string, toIndex: number) => void) | undefined;
  onAssignToGroup?: ((tabId: string, groupId: string) => void) | undefined;
  onTearBegin?: ((payload: TabTearBegin) => void) | undefined;
  onTearMove?: ((point: TabTearPoint) => void) | undefined;
  onTearEnd?: ((point: TabTearPoint) => void) | undefined;
  onTearCancel?: (() => void) | undefined;
  onReportGeometry?: ((geometry: TabStripGeometryReport) => void) | undefined;
}

export interface TabStripDragState {
  scrollerRef: RefObject<HTMLDivElement>;
  sensors: ReturnType<typeof useSensors>;
  /** The id currently being dragged (tab id or `${GROUP_PREFIX}<id>`), or null when idle. */
  dragId: string | null;
  /** True once the pointer has left the strip — the in-strip overlay hides, the host preview takes over. */
  torn: boolean;
  onDragStart: (event: DragStartEvent) => void;
  onDragEnd: (event: DragEndEvent) => void;
  onDragCancel: () => void;
}

/**
 * The strip's drag-reorder + tear-off state machine. Owns the dnd-kit sensors, the scroller ref (also
 * used for wheel scroll + the drag overlay), geometry reporting, and the window-level pointer tracking
 * that latches "torn" once the pointer first leaves the strip. Behavior is identical to the inline
 * version this was extracted from — the component just wires the returned handlers into `<DndContext>`.
 */
export function useTabStripDrag({
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
}: UseTabStripDragArgs): TabStripDragState {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const [dragId, setDragId] = useState<string | null>(null);
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
      strip: {
        x: stripRect.left,
        y: stripRect.top,
        width: stripRect.width,
        height: stripRect.height,
      },
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
      const name =
        g !== undefined && g.name.trim().length > 0 ? g.name : (labels.unnamedGroup ?? 'Group');
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

  return { scrollerRef, sensors, dragId, torn, onDragStart, onDragEnd, onDragCancel };
}
