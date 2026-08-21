import { Menu, type BrowserWindow, type MenuItemConstructorOptions } from 'electron';
import { mainStrings } from '../lib/i18n-main';
import TabManager from '../tabs';

/** Longest tab title shown in the menu before it is elided (native menus don't wrap). */
const MAX_LABEL = 60;

/**
 * Native "Hidden tabs" menu — the counterpart of the caption button. Lists this window's hidden tabs
 * (title, else url); clicking one unhides it (it returns to the strip), plus an "Unhide all". Built in
 * the main process against TabManager's authoritative state, mirroring the tab context-menu pattern.
 * Pops at the cursor (which sits on the button the user just clicked). No-op if nothing is hidden.
 */
export function showHiddenTabsMenu(win: BrowserWindow): void {
  const hidden = TabManager.getState().tabs.filter((tab) => tab.hidden === true);
  if (hidden.length === 0) return;

  const t = mainStrings();
  const items: MenuItemConstructorOptions[] = hidden.map((tab) => {
    const raw = tab.title.trim().length > 0 ? tab.title.trim() : tab.url;
    const label =
      raw.length > MAX_LABEL ? `${raw.slice(0, MAX_LABEL - 1)}…` : raw || t.browser.hiddenTabs;
    return {
      label,
      click: () => {
        TabManager.unhideTab(tab.id);
      },
    };
  });
  items.push(
    { type: 'separator' },
    {
      label: t.browser.unhideAll,
      click: () => {
        for (const tab of hidden) TabManager.unhideTab(tab.id);
      },
    },
  );

  Menu.buildFromTemplate(items).popup({ window: win });
}
