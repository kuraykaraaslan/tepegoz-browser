import { useRef, useState } from 'react';
import { cn } from '@tepegoz/ui';
import type { Resources } from '@tepegoz/i18n';
import type { TabInfo } from '../../../shared/ipc-contract';

interface TabStripProps {
  t: Resources;
  tabs: TabInfo[];
  activeId: string | null;
  onSelect: (id: string) => void;
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
    <svg
      className={cn('h-4 w-4 shrink-0 text-text-disabled', loading && 'animate-pulse')}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M1.75 8 H14.25 M8 1.75 C5.7 4 5.7 12 8 14.25 M8 1.75 C10.3 4 10.3 12 8 14.25"
        stroke="currentColor"
        strokeWidth="1.1"
      />
    </svg>
  );
}

export function TabStrip({ t, tabs, activeId, onSelect, onNew }: TabStripProps) {
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
      aria-label={t.browser.tabs}
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
            aria-label={tab.title || t.browser.untitled}
            title={tab.title || t.browser.untitled}
            tabIndex={0}
            onClick={() => onSelect(tab.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect(tab.id);
              }
            }}
            onAuxClick={(e) => {
              if (e.button === 1) window.tepegoz.closeTab(tab.id); // middle-click closes
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              window.tepegoz.showTabContextMenu(tab.id);
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
              {tab.isLoading && !tab.title ? '…' : tab.title || t.browser.untitled}
            </span>
            <button
              type="button"
              aria-label={t.browser.closeTab}
              onClick={(e) => {
                e.stopPropagation();
                window.tepegoz.closeTab(tab.id);
              }}
              className="hidden shrink-0 rounded p-0.5 text-text-disabled opacity-0 transition-opacity hover:bg-surface-sunken hover:text-text-primary focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus group-hover:opacity-100 @min-[7rem]:block"
            >
              <svg className="h-2.5 w-2.5" viewBox="0 0 10 10" aria-hidden="true">
                <path d="M1 1 L9 9 M9 1 L1 9" stroke="currentColor" strokeWidth="1.2" />
              </svg>
            </button>
          </div>
        );
      })}
      <button
        type="button"
        aria-label={t.browser.newTab}
        onClick={onNew}
        className="app-no-drag ml-1 flex h-7 w-7 shrink-0 items-center justify-center rounded text-text-secondary hover:bg-surface-overlay hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
      >
        <svg className="h-3 w-3" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M6 1 V11 M1 6 H11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
