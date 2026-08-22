import { Menu, type BrowserWindow, type MenuItemConstructorOptions } from 'electron';
import { INTERNAL_HISTORY_URL } from '@tepegoz/desktop-ipc';
import {
  navHistoryMenuEntries,
  navHistoryMenuLabel,
  type NavHistoryDirection,
} from '@tepegoz/navigation';
import { mainStrings } from '../lib/i18n-main';
import TabManager from '../tabs';

/** Longest entry title shown before it is elided (native menus don't wrap). */
const MAX_LABEL = 60;

/**
 * Chrome's back/forward button dropdown: right-click (or long-press) a nav button and the ACTIVE
 * tab's history on that side is listed, nearest entry first, ending in "Show full history".
 *
 * Built in the main process against the tab's real `navigationHistory` — the renderer never sees a
 * page's history, it only reports which button was clicked. The list is a snapshot, so each click
 * re-resolves the tab and re-checks `canGoToOffset`: the page can navigate (or the tab can close)
 * while the menu is open, and a stale row must fail closed rather than jump somewhere else.
 */
export function showNavHistoryMenu(win: BrowserWindow, direction: NavHistoryDirection): void {
  const tabs = TabManager.forSenderWindow(win);
  if (tabs === undefined) return;
  // Pin the tab id now: the menu acts on the tab that was active at right-click, even if the user
  // switches tabs (or the agent does) before picking an entry.
  const tabId = tabs.getState().activeId;
  if (tabId === null) return;
  const wc = tabs.webContentsForTab(tabId);
  if (wc === null) return; // internal page (tepegoz://…) — no view, so no page history

  const rows = navHistoryMenuEntries(
    wc.navigationHistory.getAllEntries(),
    wc.navigationHistory.getActiveIndex(),
    direction,
  );
  if (rows.length === 0) return; // nothing on that side: pop no menu at all, as Chrome does

  const t = mainStrings();
  const template: MenuItemConstructorOptions[] = rows.map((row) => ({
    label: navHistoryMenuLabel(row, MAX_LABEL),
    toolTip: row.url,
    click: () => {
      const live = TabManager.forSenderWindow(win)?.webContentsForTab(tabId) ?? null;
      if (live !== null && live.navigationHistory.canGoToOffset(row.offset)) {
        live.navigationHistory.goToOffset(row.offset);
      }
    },
  }));
  template.push(
    { type: 'separator' },
    {
      label: t.browser.showFullHistory,
      click: () => {
        TabManager.forSenderWindow(win)?.openInternalPage(INTERNAL_HISTORY_URL);
      },
    },
  );

  Menu.buildFromTemplate(template).popup({ window: win });
}
