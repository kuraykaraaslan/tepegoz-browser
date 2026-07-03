import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faGlobe, faPlus, faXmark, faChevronRight } from '@fortawesome/free-solid-svg-icons';
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
import { SortableContext, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@tepegoz/ui';
import { GROUP_PREFIX, resolveDrop } from './drop-resolver';

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
}

/** Tailwind classes per group color: the header pill (solid) and the member-run container (tint + ring). */
/** The group-color styling a grouped tab uses: header pill, edge border color, and a soft background tint. */
interface GroupChipStyle {
  pill: string;
  border: string;
  tint: string;
}

const GROUP_COLORS: Record<string, GroupChipStyle> = {
  grey: { pill: 'bg-slate-500 text-white', border: 'border-slate-400', tint: 'bg-slate-400/15' },
  blue: { pill: 'bg-blue-500 text-white', border: 'border-blue-400', tint: 'bg-blue-400/15' },
  red: { pill: 'bg-red-500 text-white', border: 'border-red-400', tint: 'bg-red-400/15' },
  yellow: { pill: 'bg-yellow-400 text-black', border: 'border-yellow-400', tint: 'bg-yellow-400/15' },
  green: { pill: 'bg-green-500 text-white', border: 'border-green-400', tint: 'bg-green-400/15' },
  pink: { pill: 'bg-pink-500 text-white', border: 'border-pink-400', tint: 'bg-pink-400/15' },
  purple: { pill: 'bg-purple-500 text-white', border: 'border-purple-400', tint: 'bg-purple-400/15' },
  cyan: { pill: 'bg-cyan-500 text-white', border: 'border-cyan-400', tint: 'bg-cyan-400/15' },
  orange: { pill: 'bg-orange-500 text-white', border: 'border-orange-400', tint: 'bg-orange-400/15' },
};

function groupColor(color: string): GroupChipStyle {
  return GROUP_COLORS[color] ?? GROUP_COLORS.grey!;
}

/** Page favicon with a globe fallback when the page declares none or the image fails to load. */
function TabFavicon({ src, loading }: Readonly<{ src: string | null; loading: boolean }>) {
  const [failed, setFailed] = useState(false);
  if (src && !failed) {
    return (
      <img
        src={src}
        alt=""
        aria-hidden="true"
        className="h-4 w-4 shrink-0 rounded-sm object-contain"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <FontAwesomeIcon
      icon={faGlobe}
      className={cn('h-4 w-4 shrink-0 text-text-disabled', loading && 'animate-pulse')}
      aria-hidden
    />
  );
}

/** The favicon + (unless pinned) the title of a tab — shared by the live chip and the drag overlay. */
function TabInner({
  tab,
  labels,
}: Readonly<{ tab: TabDescriptor; labels: TabStripLabels }>): ReactNode {
  const pinned = tab.pinned === true;
  return (
    <>
      <TabFavicon src={tab.faviconUrl} loading={tab.isLoading} />
      {!pinned && (
        <span className="hidden min-w-0 flex-1 truncate @min-[7rem]:block">
          {tab.isLoading && !tab.title ? '…' : tab.title || labels.untitled}
        </span>
      )}
    </>
  );
}

/**
 * Shared chip layout classes (used by the live sortable chip and the drag overlay preview). Group
 * membership is shown Chrome-style with the group color on the tab edges: the ACTIVE tab wears it on the
 * top/left/right (bottom open, merging into the content), inactive tabs show only a colored bottom line
 * plus a soft color tint so the run reads as one cohesive group.
 */
function chipClasses(tab: TabDescriptor, active: boolean, group: GroupChipStyle | null): string {
  const pinned = tab.pinned === true;
  // Resolve the color/edge classes without nesting ternaries (readability + lint).
  let color: string;
  if (group === null) {
    color = active
      ? 'bg-surface-base text-text-primary'
      : 'bg-surface-overlay text-text-secondary hover:bg-surface-sunken';
  } else if (active) {
    // Active grouped tab: group color on top/left/right, bottom open (merges into the content).
    color = cn('bg-surface-base text-text-primary border-2 border-b-0', group.border);
  } else {
    // Inactive grouped tab: soft tint + only a colored bottom line.
    color = cn(group.tint, 'text-text-secondary hover:bg-surface-sunken border-b-2', group.border);
  }
  return cn(
    'app-no-drag @container group flex h-7 min-w-8 flex-1 shrink cursor-default items-center justify-center gap-1.5 rounded-t-md px-2 text-xs @min-[7rem]:px-3',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-focus',
    pinned ? 'max-w-10 grow-0' : 'max-w-44',
    color,
  );
}

interface TabChipProps {
  tab: TabDescriptor;
  active: boolean;
  /** The group-color styling for a grouped tab, or null for pinned/ungrouped tabs. */
  group: GroupChipStyle | null;
  labels: TabStripLabels;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onContextMenu: (id: string) => void;
}

/** One tab in the strip — a sortable dnd-kit item. Pinned tabs render favicon-only, no close button. */
function TabChip({ tab, active, group, labels, onSelect, onClose, onContextMenu }: Readonly<TabChipProps>) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: tab.id,
  });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : undefined,
  };
  const pinned = tab.pinned === true;
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      // Semantic tablist attributes come AFTER the dnd-kit spread so they win (dnd sets role=button).
      role="tab"
      aria-selected={active}
      aria-label={tab.title || labels.untitled}
      title={tab.title || labels.untitled}
      tabIndex={0}
      onClick={() => onSelect(tab.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(tab.id);
        }
      }}
      onAuxClick={(e) => {
        if (e.button === 1 && !pinned) onClose(tab.id); // middle-click closes (not pinned tabs)
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu(tab.id);
      }}
      className={chipClasses(tab, active, group)}
    >
      <TabInner tab={tab} labels={labels} />
      {!pinned && (
        <button
          type="button"
          aria-label={labels.closeTab}
          onClick={(e) => {
            e.stopPropagation();
            onClose(tab.id);
          }}
          className="hidden shrink-0 rounded p-0.5 text-text-disabled opacity-0 transition-opacity hover:bg-surface-sunken hover:text-text-primary focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus group-hover:opacity-100 @min-[7rem]:block"
        >
          <FontAwesomeIcon icon={faXmark} className="h-2.5 w-2.5" aria-hidden />
        </button>
      )}
    </div>
  );
}

interface GroupHeaderProps {
  group: TabGroupDescriptor;
  count: number;
  labels: TabStripLabels;
  editing: boolean;
  onStartEdit: () => void;
  onCommit: (name: string) => void;
  onCancel: () => void;
  onToggle?: ((groupId: string, collapsed: boolean) => void) | undefined;
  onContextMenu?: ((groupId: string) => void) | undefined;
}

/** A group's header pill — a sortable dnd-kit item; click toggles collapse, double-click / menu renames,
 *  right-click opens the group context menu. */
function GroupHeader({
  group,
  count,
  labels,
  editing,
  onStartEdit,
  onCommit,
  onCancel,
  onToggle,
  onContextMenu,
}: Readonly<GroupHeaderProps>) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `${GROUP_PREFIX}${group.id}`,
  });
  const [draft, setDraft] = useState(group.name);
  useEffect(() => {
    if (editing) setDraft(group.name);
  }, [editing, group.name]);

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : undefined,
  };
  const colors = groupColor(group.color);
  const name = group.name.trim().length > 0 ? group.name : (labels.unnamedGroup ?? 'Group');

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu?.(group.id);
      }}
      className={cn(
        'app-no-drag flex h-7 shrink-0 items-center gap-1 self-end rounded-md px-2 text-xs font-medium',
        colors.pill,
      )}
    >
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => onCommit(draft.trim())}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onCommit(draft.trim());
            if (e.key === 'Escape') onCancel();
          }}
          onClick={(e) => e.stopPropagation()}
          className="w-24 rounded bg-black/20 px-1 text-inherit outline-none placeholder:text-inherit"
        />
      ) : (
        <button
          type="button"
          aria-label={labels.toggleGroup ?? 'Toggle group'}
          onClick={() => onToggle?.(group.id, !group.collapsed)}
          onDoubleClick={onStartEdit}
          className="flex items-center gap-1"
        >
          <FontAwesomeIcon
            icon={faChevronRight}
            className={cn('h-2.5 w-2.5 transition-transform', !group.collapsed && 'rotate-90')}
            aria-hidden
          />
          <span className="max-w-32 truncate">{name}</span>
          {group.collapsed && count > 0 && <span className="tabular-nums opacity-80">{count}</span>}
        </button>
      )}
    </div>
  );
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
}: Readonly<TabStripProps>) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const [dragId, setDragId] = useState<string | null>(null);
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

  const onDragStart = (event: DragStartEvent): void => {
    setDragId(String(event.active.id));
  };

  const onDragEnd = (event: DragEndEvent): void => {
    setDragId(null);
    const { active, over } = event;
    if (over === null) return;
    const tabGroupOf = (id: string): string | null => tabById.get(id)?.groupId ?? null;
    const result = resolveDrop(items, String(active.id), String(over.id), tabGroupOf);
    if (result === null) return;
    if (result.kind === 'move-group') onMoveGroup?.(result.groupId, result.toIndex);
    else if (result.kind === 'assign') onAssignToGroup?.(result.tabId, result.groupId);
    else onMove?.(result.id, result.toIndex);
  };

  // Mouse wheels only emit vertical deltas; translate them to horizontal scroll so an overflowing
  // strip is reachable without a trackpad (and without a visible scrollbar).
  const onWheel = (e: React.WheelEvent<HTMLDivElement>): void => {
    const el = scrollerRef.current;
    if (!el || e.deltaY === 0 || e.shiftKey) return;
    el.scrollLeft += e.deltaY;
  };

  // What follows the cursor while dragging (keeps the group-header drag from looking detached).
  const dragOverlay = ((): ReactNode => {
    if (dragId === null) return null;
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
      onDragCancel={() => setDragId(null)}
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
