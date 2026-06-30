import type { Resources } from '@tepegoz/i18n';
import type { TabInfo } from '../../../shared/ipc-contract';
import { TabStrip } from './TabStrip';
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
}

export function TitleBar({ t, tabs, activeId }: TitleBarProps) {
  return (
    <header className="app-drag flex h-9 shrink-0 select-none items-stretch gap-2 border-b border-border bg-surface-raised pl-3">
      <div className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full bg-primary" aria-hidden="true" />
        <h1 className="text-xs font-semibold text-text-primary">{t.common.appName}</h1>
      </div>
      <div className="flex items-end pt-1.5">
        <TabStrip t={t} tabs={tabs} activeId={activeId} />
      </div>
      <div className="h-full flex-1" />
      <WindowControls t={t} />
    </header>
  );
}
