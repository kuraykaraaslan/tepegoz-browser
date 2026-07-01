import type { Resources } from '@tepegoz/i18n';
import { TabStrip } from '@tepegoz/tab-strip';
import { BrandMark } from '@tepegoz/ui';
import type { TabInfo } from '../../../shared/ipc-contract';
import { WindowControls } from './WindowControls';

/**
 * Custom window title row for the frameless window (browser-style): brand, tab strip, a draggable
 * spacer, and the caption controls. `-webkit-app-region: drag` on the bar restores OS caption
 * behaviors (snap, double-click-to-maximize, system menu); interactive children opt out with
 * `.app-no-drag`.
 */
interface TitleBarProps {
  t: Resources;
  tabs: TabInfo[];
  activeId: string | null;
  onSelectTab: (id: string) => void;
  onNewTab: () => void;
}

export function TitleBar({ t, tabs, activeId, onSelectTab, onNewTab }: TitleBarProps) {
  return (
    <header className="app-drag flex h-9 shrink-0 select-none items-stretch gap-2 border-b border-border bg-surface-raised pl-3">
      <div className="flex items-center gap-1.5">
        <BrandMark className="h-5 w-5" />
        <h1 className="text-xs font-semibold text-text-primary">{t.common.appName}</h1>
      </div>
      {/* flex-1 + min-w-0: the strip fills the space between the brand and the caption controls so
          tabs have real width to grow into; its trailing empty track stays a window-drag region. */}
      <div className="flex min-w-0 flex-1 items-end pt-1.5">
        <TabStrip
          tabs={tabs}
          activeId={activeId}
          labels={{
            tablist: t.browser.tabs,
            untitled: t.browser.untitled,
            closeTab: t.browser.closeTab,
            newTab: t.browser.newTab,
          }}
          onSelect={onSelectTab}
          onClose={(id) => window.tepegoz.closeTab(id)}
          onContextMenu={(id) => window.tepegoz.showTabContextMenu(id)}
          onNew={onNewTab}
        />
      </div>
      <WindowControls t={t} />
    </header>
  );
}
