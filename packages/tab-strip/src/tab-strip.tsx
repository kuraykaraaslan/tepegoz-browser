import { useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faGlobe, faPlus, faXmark } from '@fortawesome/free-solid-svg-icons';
import { cn } from '@tepegoz/ui';

/** The minimal tab shape the strip renders. Hosts pass their own richer tab objects (structural). */
export interface TabDescriptor {
  id: string;
  title: string;
  /** Page favicon URL (http(s)/data:), or null when the page has none yet. */
  faviconUrl: string | null;
  isLoading: boolean;
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
}

export interface TabStripProps {
  tabs: readonly TabDescriptor[];
  activeId: string | null;
  labels: TabStripLabels;
  onSelect: (id: string) => void;
  /** Close a tab (close button + middle-click). */
  onClose: (id: string) => void;
  /** Open the native tab context menu (right-click). */
  onContextMenu: (id: string) => void;
  onNew: () => void;
}

/** Page favicon with a globe fallback when the page declares none or the image fails to load. */
function TabFavicon({ src, loading }: { src: string | null; loading: boolean }) {
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

/**
 * `@tepegoz/tab-strip` — the horizontal browser tab strip. Presentational + self-contained: favicon
 * fallback, wheel→horizontal scroll, container-query title/close collapse, keyboard + middle-click.
 * Selection, close, context menu and new-tab are injected via callbacks, so the package has no
 * dependency on the Electron bridge. Extracted from `apps/desktop` per docs/package-map.md.
 */
export function TabStrip({
  tabs,
  activeId,
  labels,
  onSelect,
  onClose,
  onContextMenu,
  onNew,
}: TabStripProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  // Mouse wheels only emit vertical deltas; translate them to horizontal scroll so an overflowing
  // strip is reachable without a trackpad (and without a visible scrollbar).
  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const el = scrollerRef.current;
    if (!el || e.deltaY === 0 || e.shiftKey) return;
    el.scrollLeft += e.deltaY;
  };

  return (
    <div
      ref={scrollerRef}
      role="tablist"
      aria-orientation="horizontal"
      aria-label={labels.tablist}
      onWheel={onWheel}
      className="no-scrollbar flex h-full min-w-0 flex-1 items-end gap-1 overflow-x-auto"
    >
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        return (
          <div
            key={tab.id}
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
              if (e.button === 1) onClose(tab.id); // middle-click closes
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              onContextMenu(tab.id);
            }}
            className={cn(
              // @container: each tab measures its own width so the title/close collapse independently.
              // Tabs flex-shrink to a favicon-sized square (min-w-8 + px-2) before the strip scrolls;
              // padding widens once the title shows (Chrome's collapse behavior).
              'app-no-drag @container group flex h-7 min-w-8 max-w-44 flex-1 shrink cursor-default items-center justify-center gap-1.5 rounded-t-md px-2 text-xs @min-[7rem]:px-3',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-focus',
              active
                ? 'bg-surface-base text-text-primary'
                : 'bg-surface-overlay text-text-secondary hover:bg-surface-sunken',
            )}
          >
            <TabFavicon src={tab.faviconUrl} loading={tab.isLoading} />
            {/* Hidden below ~7rem of tab width: when names no longer fit, only favicons remain. */}
            <span className="hidden min-w-0 flex-1 truncate @min-[7rem]:block">
              {tab.isLoading && !tab.title ? '…' : tab.title || labels.untitled}
            </span>
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
          </div>
        );
      })}
      <button
        type="button"
        aria-label={labels.newTab}
        onClick={onNew}
        className="app-no-drag ml-1 flex h-7 w-7 shrink-0 items-center justify-center rounded text-text-secondary hover:bg-surface-overlay hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
      >
        <FontAwesomeIcon icon={faPlus} className="h-3 w-3" aria-hidden />
      </button>
    </div>
  );
}
