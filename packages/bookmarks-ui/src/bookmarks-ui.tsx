import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBookmark,
  faChevronDown,
  faChevronRight,
  faFolder,
  faFolderPlus,
} from '@fortawesome/free-solid-svg-icons';
import { useT } from '@tepegoz/i18n/react';
import { bookmarksUiDict } from './i18n';

export type BookmarkNodeType = 'folder' | 'bookmark';

/** A tree node the manager renders (structurally the host's BookmarkTreeNode). */
export interface BookmarkManagerNode {
  id: string;
  type: BookmarkNodeType;
  title: string;
  url: string | null;
  favicon?: string | null;
  children: BookmarkManagerNode[];
}

export interface BookmarksManagerProps {
  /** Fetch the forest: [Bookmarks bar, Other bookmarks]. */
  getTree: () => Promise<BookmarkManagerNode[]>;
  /** Bumped by the host after any bookmark mutation → the manager refetches. */
  refreshKey: number;
  /** Reparent/reorder a node (drag-drop). `newParentId` = folder id. */
  onMove: (id: string, newParentId: string, index: number) => void;
  /** Ask the host to create a folder under `parentId` (the host opens its name dialog). */
  onNewFolder: (parentId: string) => void;
  /** Open a bookmark (navigate the active tab). */
  onOpen: (url: string) => void;
  /** Pop the native right-click menu for a node. */
  onContextMenu: (id: string, type: BookmarkNodeType) => void;
}

const TREE_PREFIX = 'tree:';
/** Move-into always drops at the folder's end; the store clamps this to the child count. */
const END_INDEX = 100000;

function findNode(nodes: readonly BookmarkManagerNode[], id: string): BookmarkManagerNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    const hit = findNode(n.children, id);
    if (hit !== null) return hit;
  }
  return null;
}

function collectBookmarks(node: BookmarkManagerNode, out: BookmarkManagerNode[]): void {
  if (node.type === 'bookmark') out.push(node);
  node.children.forEach((c) => collectBookmarks(c, out));
}

/** Favicon with a bookmark-glyph fallback. */
function Favicon({ src }: { src: string | null | undefined }) {
  const [failed, setFailed] = useState(false);
  if (src === null || src === undefined || src.length === 0 || failed) {
    return <FontAwesomeIcon icon={faBookmark} className="h-4 w-4 shrink-0 text-text-secondary" aria-hidden />;
  }
  return (
    <img src={src} alt="" aria-hidden className="h-4 w-4 shrink-0 rounded-sm object-contain" onError={() => setFailed(true)} />
  );
}

/** One folder row in the left tree — selectable, a drop target (move-into), and draggable itself (a
 *  non-root folder can be dragged onto another folder/root to move it). Roots are droppable only. */
function FolderRow({
  node,
  depth,
  draggable,
  selectedId,
  expanded,
  onToggle,
  onSelect,
  onContextMenu,
}: {
  node: BookmarkManagerNode;
  depth: number;
  draggable: boolean;
  selectedId: string;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
  onContextMenu: (id: string, type: BookmarkNodeType) => void;
}) {
  const dndId = `${TREE_PREFIX}${node.id}`;
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: dndId });
  const { setNodeRef: setDragRef, attributes, listeners, isDragging } = useDraggable({
    id: dndId,
    disabled: !draggable,
  });
  const setRef = useCallback(
    (el: HTMLElement | null) => {
      setDropRef(el);
      setDragRef(el);
    },
    [setDropRef, setDragRef],
  );
  const subfolders = node.children.filter((c) => c.type === 'folder');
  const isOpen = expanded.has(node.id);
  const isSelected = selectedId === node.id;
  return (
    <li>
      <div
        ref={setRef}
        className={`flex cursor-pointer select-none items-center gap-1.5 rounded-md py-1.5 pr-2 text-sm ${
          isSelected ? 'bg-surface-overlay text-text-primary' : 'text-text-secondary hover:bg-surface-overlay/60'
        } ${isOver ? 'ring-2 ring-border-focus' : ''}`}
        style={{ paddingLeft: 8 + depth * 14, opacity: isDragging ? 0.4 : 1 }}
        onClick={() => onSelect(node.id)}
        onContextMenu={(e) => {
          e.preventDefault();
          onContextMenu(node.id, 'folder');
        }}
        {...attributes}
        {...listeners}
      >
        {subfolders.length > 0 ? (
          <button
            type="button"
            aria-label="toggle"
            className="shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              onToggle(node.id);
            }}
          >
            <FontAwesomeIcon icon={isOpen ? faChevronDown : faChevronRight} className="h-2.5 w-2.5 opacity-70" aria-hidden />
          </button>
        ) : (
          <span className="w-2.5 shrink-0" />
        )}
        <FontAwesomeIcon icon={faFolder} className="h-4 w-4 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 truncate">{node.title}</span>
      </div>
      {isOpen && subfolders.length > 0 && (
        <ul>
          {subfolders.map((sf) => (
            <FolderRow
              key={sf.id}
              node={sf}
              depth={depth + 1}
              draggable
              selectedId={selectedId}
              expanded={expanded}
              onToggle={onToggle}
              onSelect={onSelect}
              onContextMenu={onContextMenu}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

/** One row in the right-pane list — a dnd-kit sortable. */
function ItemRow({
  node,
  onOpen,
  onSelectFolder,
  onContextMenu,
}: {
  node: BookmarkManagerNode;
  onOpen: (url: string) => void;
  onSelectFolder: (id: string) => void;
  onContextMenu: (id: string, type: BookmarkNodeType) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } = useSortable({
    id: node.id,
  });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  // Highlight a folder row when another item is dragged over it — it's about to be dropped inside.
  const dropInto = node.type === 'folder' && isOver && !isDragging;
  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex select-none items-center gap-3 rounded-md px-2 py-2 hover:bg-surface-overlay ${
        dropInto ? 'ring-2 ring-border-focus' : ''
      }`}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu(node.id, node.type);
      }}
      {...attributes}
      {...listeners}
    >
      {node.type === 'folder' ? (
        <FontAwesomeIcon icon={faFolder} className="h-4 w-4 shrink-0 text-text-secondary" aria-hidden />
      ) : (
        <Favicon src={node.favicon} />
      )}
      <button
        type="button"
        className="min-w-0 flex-1 text-left"
        onClick={() => (node.type === 'folder' ? onSelectFolder(node.id) : node.url !== null && onOpen(node.url))}
      >
        <p className="truncate text-sm text-text-primary">{node.title.length > 0 ? node.title : node.url}</p>
        {node.type === 'bookmark' && node.url !== null && (
          <p className="truncate text-xs text-text-secondary">{node.url}</p>
        )}
      </button>
    </li>
  );
}

/**
 * `@tepegoz/bookmarks-ui` — the Chrome-style bookmark manager (`tepegoz://bookmarks`): a folder tree on
 * the left and the selected folder's contents on the right. Drag a row onto a tree folder to move it in,
 * or reorder within the list; search filters across the whole tree; right-click uses the host's native
 * menu (open/rename/add-folder/delete). Presentational: the tree, actions and copy are injected.
 */
export function BookmarksManager({
  getTree,
  refreshKey,
  onMove,
  onNewFolder,
  onOpen,
  onContextMenu,
}: Readonly<BookmarksManagerProps>) {
  const t = useT(bookmarksUiDict);
  const [roots, setRoots] = useState<BookmarkManagerNode[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  useEffect(() => {
    let cancelled = false;
    void getTree().then(
      (tree) => {
        if (cancelled) return;
        setRoots(tree);
        setSelectedId((cur) => cur ?? tree[0]?.id ?? null);
        setExpanded((cur) => (cur.size === 0 ? new Set(tree.map((r) => r.id)) : cur));
      },
      () => {
        if (!cancelled) setRoots([]);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [getTree, refreshKey]);

  const selectedFolder = useMemo(
    () => (selectedId === null ? null : findNode(roots, selectedId)),
    [roots, selectedId],
  );
  const children = selectedFolder?.children ?? [];

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length === 0) return null;
    const all: BookmarkManagerNode[] = [];
    roots.forEach((r) => collectBookmarks(r, all));
    return all.filter(
      (b) => b.title.toLowerCase().includes(q) || (b.url ?? '').toLowerCase().includes(q),
    );
  }, [roots, query]);

  const toggle = useCallback((id: string) => {
    setExpanded((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const stripTree = (id: string): string => (id.startsWith(TREE_PREFIX) ? id.slice(TREE_PREFIX.length) : id);

  const handleDragStart = (e: DragStartEvent): void => setActiveId(String(e.active.id));
  const handleDragEnd = (e: DragEndEvent): void => {
    setActiveId(null);
    if (e.over === null || selectedId === null) return;
    const rawActive = String(e.active.id);
    const rawOver = String(e.over.id);
    const activeNodeId = stripTree(rawActive); // a dragged tree folder is prefixed; right-pane rows are not
    const overIsTree = rawOver.startsWith(TREE_PREFIX);
    const overNodeId = stripTree(rawOver);
    if (activeNodeId === overNodeId) return;
    // 1) Dropped onto a folder in the LEFT tree → move INTO it. Covers moving into a folder, OUT of the
    //    current folder (drop on a parent/root), or into another folder — for tree folders and list rows.
    if (overIsTree) {
      onMove(activeNodeId, overNodeId, END_INDEX);
      return;
    }
    // A tree-folder drag only resolves against tree drops; dropping it in the list is a no-op.
    if (rawActive.startsWith(TREE_PREFIX)) return;
    // 2) A right-pane row dropped onto a FOLDER row in the list → move INTO that folder (Chrome behavior).
    if (children.find((c) => c.id === overNodeId)?.type === 'folder') {
      onMove(activeNodeId, overNodeId, END_INDEX);
      return;
    }
    // 3) Otherwise reorder within the current folder.
    const ids = children.map((c) => c.id);
    const from = ids.indexOf(activeNodeId);
    const to = ids.indexOf(overNodeId);
    if (from === -1 || to === -1 || from === to) return;
    onMove(activeNodeId, selectedId, arrayMove(ids, from, to).indexOf(activeNodeId));
  };

  const activeNode = activeId === null ? null : findNode(roots, stripTree(activeId));

  return (
    <div className="flex h-full flex-col bg-surface-system text-text-primary">
      <div className="flex shrink-0 items-center gap-4 border-b border-border px-6 py-3">
        <h1 className="text-base font-semibold">{t.title}</h1>
        <input
          type="text"
          value={query}
          placeholder={t.search}
          spellCheck={false}
          onChange={(e) => setQuery(e.target.value)}
          className="ml-auto h-9 w-72 max-w-full rounded-full border border-border bg-surface-raised px-4 text-sm text-text-primary placeholder:text-text-disabled focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
        />
        <button
          type="button"
          onClick={() => selectedId !== null && onNewFolder(selectedId)}
          disabled={selectedId === null}
          className="flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-overlay hover:text-text-primary disabled:opacity-40"
        >
          <FontAwesomeIcon icon={faFolderPlus} className="h-3.5 w-3.5" aria-hidden />
          {t.newFolder}
        </button>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <div className="flex min-h-0 flex-1">
          <aside className="w-64 shrink-0 overflow-auto border-r border-border p-2">
            <ul>
              {roots.map((r) => (
                <FolderRow
                  key={r.id}
                  node={r}
                  depth={0}
                  draggable={false}
                  selectedId={selectedId ?? ''}
                  expanded={expanded}
                  onToggle={toggle}
                  onSelect={setSelectedId}
                  onContextMenu={onContextMenu}
                />
              ))}
            </ul>
          </aside>

          <section className="min-w-0 flex-1 overflow-auto p-4">
            {searchResults !== null ? (
              searchResults.length === 0 ? (
                <p className="py-8 text-center text-sm text-text-secondary">{t.noResults}</p>
              ) : (
                <ul className="mx-auto max-w-3xl">
                  {searchResults.map((b) => (
                    <ItemRow
                      key={b.id}
                      node={b}
                      onOpen={onOpen}
                      onSelectFolder={setSelectedId}
                      onContextMenu={onContextMenu}
                    />
                  ))}
                </ul>
              )
            ) : children.length === 0 ? (
              <p className="py-8 text-center text-sm text-text-secondary">{t.emptyFolder}</p>
            ) : (
              <SortableContext items={children.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                <ul className="mx-auto max-w-3xl">
                  {children.map((c) => (
                    <ItemRow
                      key={c.id}
                      node={c}
                      onOpen={onOpen}
                      onSelectFolder={setSelectedId}
                      onContextMenu={onContextMenu}
                    />
                  ))}
                </ul>
              </SortableContext>
            )}
          </section>
        </div>
        <DragOverlay>
          {activeNode !== null ? (
            <div className="flex items-center gap-3 rounded-md bg-surface-overlay px-2 py-2 shadow-lg">
              {activeNode.type === 'folder' ? (
                <FontAwesomeIcon icon={faFolder} className="h-4 w-4 text-text-secondary" aria-hidden />
              ) : (
                <Favicon src={activeNode.favicon} />
              )}
              <span className="truncate text-sm text-text-primary">{activeNode.title}</span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
