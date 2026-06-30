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

export function TabStrip({ t, tabs, activeId, onSelect, onNew }: TabStripProps) {
  return (
    <div
      role="tablist"
      aria-orientation="horizontal"
      aria-label={t.browser.tabs}
      className="app-no-drag flex h-full items-end gap-1 overflow-x-auto"
    >
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        return (
          <div
            key={tab.id}
            role="tab"
            aria-selected={active}
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
            className={cn(
              'group flex h-7 w-44 shrink-0 cursor-default items-center gap-2 rounded-t-md px-3 text-xs',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-focus',
              active
                ? 'bg-surface-base text-text-primary'
                : 'bg-surface-overlay text-text-secondary hover:bg-surface-sunken',
            )}
          >
            <span className="flex-1 truncate">
              {tab.isLoading && !tab.title ? '…' : tab.title || t.browser.untitled}
            </span>
            <button
              type="button"
              aria-label={t.browser.closeTab}
              onClick={(e) => {
                e.stopPropagation();
                window.tepegoz.closeTab(tab.id);
              }}
              className="rounded p-0.5 text-text-disabled opacity-0 transition-opacity hover:bg-surface-sunken hover:text-text-primary focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus group-hover:opacity-100"
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
        className="ml-1 flex h-7 w-7 shrink-0 items-center justify-center rounded text-text-secondary hover:bg-surface-overlay hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
      >
        <svg className="h-3 w-3" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M6 1 V11 M1 6 H11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
