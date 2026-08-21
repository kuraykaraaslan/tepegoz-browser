import { useRef, useState, type CSSProperties } from 'react';
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
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBookmark, faChevronDown, faFolder } from '@fortawesome/free-solid-svg-icons';
import { resolveBarDrop } from './bar-drop-resolver';

export type BookmarkBarNodeType = 'folder' | 'bookmark';

/** A node the bar renders — a bookmark (`url` set) or a folder (with `children`). */
export interface BookmarkBarNode {
  id: string;
  type: BookmarkBarNodeType;
  title: string;
  url: string | null;
  favicon?: string | null;
  children: BookmarkBarNode[];
}

/** A rect (window-content DIP) used to anchor the folder-dropdown popup under a folder chip. */
export interface AnchorRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Localized copy, supplied by the host so the package stays i18n-agnostic. */
export interface BookmarksBarLabels {
  bar: string;
  empty: string;
}

export interface BookmarksBarProps {
  /** The Bookmarks-bar root's direct children, in order. */
  nodes: readonly BookmarkBarNode[];
  /** The Bookmarks-bar root id — used as the parent when reordering at the top level. */
  barRootId: string;
  /** Open a bookmark (navigate the active tab). */
  onOpen: (url: string) => void;
  /** Open a folder's dropdown (the host shows it as a native popup floating over the page). */
  onOpenFolder: (folderId: string, anchor: AnchorRect) => void;
  /** Reparent/reorder a node: `newParentId` = bar root (reorder) or a folder id (move-into). */
  onMove: (id: string, newParentId: string, index: number) => void;
  /** Pop the native right-click menu for a node. */
  onContextMenu: (id: string, type: BookmarkBarNodeType) => void;
  labels: BookmarksBarLabels;
}

const CHIP =
  'flex h-7 max-w-[12rem] shrink-0 items-center gap-1.5 rounded-md px-2 text-sm text-text-secondary ' +
  'hover:bg-surface-overlay hover:text-text-primary transition-colors ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus';

/** The saved favicon, falling back to a bookmark glyph when there is none or the image fails to load. */
function BarFavicon({ src }: { src: string | null | undefined }) {
  const [failed, setFailed] = useState(false);
  if (src === null || src === undefined || src.length === 0 || failed) {
    return <FontAwesomeIcon icon={faBookmark} className="h-3.5 w-3.5 shrink-0" aria-hidden />;
  }
  return (
    <img
      src={src}
      alt=""
      aria-hidden
      className="h-3.5 w-3.5 shrink-0 rounded-sm object-contain"
      onError={() => setFailed(true)}
    />
  );
}

/** The visual content of a bar item (shared by the live sortable chip and the drag overlay). */
function ItemInner({ node }: { node: BookmarkBarNode }) {
  const label = node.title.length > 0 ? node.title : (node.url ?? '');
  return (
    <>
      {node.type === 'folder' ? (
        <FontAwesomeIcon icon={faFolder} className="h-3.5 w-3.5 shrink-0" aria-hidden />
      ) : (
        <BarFavicon src={node.favicon} />
      )}
      <span className="min-w-0 truncate">{label}</span>
      {node.type === 'folder' && (
        <FontAwesomeIcon
          icon={faChevronDown}
          className="h-2.5 w-2.5 shrink-0 opacity-60"
          aria-hidden
        />
      )}
    </>
  );
}

/** One top-level bar item — a dnd-kit sortable. A folder click opens its dropdown; a bookmark opens. */
function SortableBarItem({
  node,
  onActivate,
  onContextMenu,
}: {
  node: BookmarkBarNode;
  onActivate: (node: BookmarkBarNode, anchor: HTMLElement) => void;
  onContextMenu: (id: string, type: BookmarkBarNodeType) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } =
    useSortable({
      id: node.id,
    });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  // Highlight a folder when another item is dragged over it — it's about to be dropped INSIDE.
  const dropInto = node.type === 'folder' && isOver && !isDragging;
  return (
    <button
      ref={setNodeRef}
      style={style}
      type="button"
      className={`${CHIP} ${dropInto ? 'bg-primary-subtle ring-2 ring-border-focus' : ''}`}
      title={node.title.length > 0 ? node.title : (node.url ?? '')}
      onClick={(e) => onActivate(node, e.currentTarget)}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu(node.id, node.type);
      }}
      {...attributes}
      {...listeners}
    >
      <ItemInner node={node} />
    </button>
  );
}

/**
 * `@tepegoz/bookmarks-bar` — the Chrome-style bookmarks strip under the nav toolbar. Renders the bar
 * root's children as draggable chips (bookmarks) and folder buttons (click → the host opens a native
 * dropdown popup). Drag reorders within the bar or, dropped onto a folder, moves the item inside it.
 * Right-click pops the host's native menu. Presentational: the tree, actions, and copy are injected.
 */
export function BookmarksBar({
  nodes,
  barRootId,
  onOpen,
  onOpenFolder,
  onMove,
  onContextMenu,
  labels,
}: BookmarksBarProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const ids = nodes.map((n) => n.id);
  const isFolder = (id: string): boolean => nodes.find((n) => n.id === id)?.type === 'folder';
  const activeNode = activeId === null ? null : (nodes.find((n) => n.id === activeId) ?? null);

  const onActivate = (node: BookmarkBarNode, anchor: HTMLElement): void => {
    if (node.type === 'bookmark') {
      if (node.url !== null) onOpen(node.url);
      return;
    }
    const r = anchor.getBoundingClientRect();
    onOpenFolder(node.id, {
      x: Math.round(r.left),
      y: Math.round(r.top),
      width: Math.round(r.width),
      height: Math.round(r.height),
    });
  };

  const handleDragStart = (e: DragStartEvent): void => setActiveId(String(e.active.id));
  const handleDragEnd = (e: DragEndEvent): void => {
    setActiveId(null);
    if (e.over === null) return;
    const result = resolveBarDrop(ids, String(e.active.id), String(e.over.id), isFolder);
    if (result === null) return;
    if (result.kind === 'move-into') {
      const folder = nodes.find((n) => n.id === result.folderId);
      onMove(result.id, result.folderId, folder?.children.length ?? 0);
    } else {
      onMove(result.id, barRootId, result.toIndex);
    }
  };

  return (
    <div
      ref={barRef}
      role="toolbar"
      aria-label={labels.bar}
      className="chrome-surface flex h-9 shrink-0 items-center gap-1 overflow-x-auto border-b border-border bg-surface-raised px-2"
      onWheel={(e) => {
        if (barRef.current !== null && e.deltaY !== 0) barRef.current.scrollLeft += e.deltaY;
      }}
      onContextMenu={(e) => {
        // Right-click on the bar's empty area (not a chip) → the bar-root menu (Add folder / manager).
        if (e.target === e.currentTarget) {
          e.preventDefault();
          onContextMenu(barRootId, 'folder');
        }
      }}
    >
      {nodes.length === 0 ? (
        <span className="px-1 text-sm text-text-tertiary">{labels.empty}</span>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToHorizontalAxis]}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setActiveId(null)}
        >
          <SortableContext items={ids} strategy={horizontalListSortingStrategy}>
            {nodes.map((n) => (
              <SortableBarItem
                key={n.id}
                node={n}
                onActivate={onActivate}
                onContextMenu={onContextMenu}
              />
            ))}
          </SortableContext>
          <DragOverlay>
            {activeNode !== null ? (
              <div className={`${CHIP} bg-surface-overlay text-text-primary`}>
                <ItemInner node={activeNode} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}
