import { useState, type CSSProperties, type ReactNode } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faGlobe, faXmark } from '@fortawesome/free-solid-svg-icons';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@tepegoz/ui';
import type { TabDescriptor, TabStripLabels } from './tab-strip';

/** Tailwind classes per group color: the header pill (solid) and the member-run container (tint + ring). */
/** The group-color styling a grouped tab uses: header pill, edge border color, and a soft background tint. */
export interface GroupChipStyle {
  pill: string;
  border: string;
  tint: string;
}

export const GROUP_COLORS: Record<string, GroupChipStyle> = {
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

export function groupColor(color: string): GroupChipStyle {
  return GROUP_COLORS[color] ?? GROUP_COLORS.grey!;
}

/** Page favicon with a globe fallback when the page declares none or the image fails to load. */
export function TabFavicon({ src, loading }: Readonly<{ src: string | null; loading: boolean }>) {
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
export function TabInner({
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
export function chipClasses(tab: TabDescriptor, active: boolean, group: GroupChipStyle | null): string {
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

export interface TabChipProps {
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
export function TabChip({ tab, active, group, labels, onSelect, onClose, onContextMenu }: Readonly<TabChipProps>) {
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
      // Queried by the strip to report per-tab slot geometry for cross-window drop hit-testing.
      data-tab-id={tab.id}
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
