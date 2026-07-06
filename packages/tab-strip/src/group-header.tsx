import { useEffect, useState, type CSSProperties } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronRight } from '@fortawesome/free-solid-svg-icons';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@tepegoz/ui';
import { GROUP_PREFIX } from './drop-resolver';
import { groupColor } from './tab-chip';
import type { TabGroupDescriptor, TabStripLabels } from './tab-strip';

export interface GroupHeaderProps {
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
export function GroupHeader({
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
