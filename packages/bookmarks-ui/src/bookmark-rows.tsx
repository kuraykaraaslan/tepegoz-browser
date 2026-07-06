import { useCallback, useState, type CSSProperties } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBookmark,
  faChevronDown,
  faChevronRight,
  faFolder,
} from '@fortawesome/free-solid-svg-icons';
import type { BookmarkManagerNode, BookmarkNodeType } from './bookmarks-ui';

export const TREE_PREFIX = 'tree:';

/** Favicon with a bookmark-glyph fallback. */
export function Favicon({ src }: { src: string | null | undefined }) {
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
export function FolderRow({
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
export function ItemRow({
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
