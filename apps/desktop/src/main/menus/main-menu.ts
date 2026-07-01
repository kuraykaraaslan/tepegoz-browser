import { app, Menu, type BrowserWindow, type MenuItemConstructorOptions } from 'electron';
import { resolveLocale, resources, type Locale } from '@tepegoz/i18n';
import { IpcChannels } from '../../shared/ipc-contract';
import PreferenceStore from '../preferences/preference-store';
import TabManager from '../tabs';

/** Localized strings for the active locale (pref override → OS locale → default), resolved per popup
 *  so the native menu follows a live locale change without a restart. */
function currentResources(): (typeof resources)[Locale] {
  const pref = PreferenceStore.getAll().locale;
  const locale: Locale = pref === 'en' || pref === 'tr' ? pref : resolveLocale(app.getLocale());
  return resources[locale];
}

/**
 * Native main (hamburger) menu — a real OS popup so it renders ABOVE the tab's WebContentsView (a DOM
 * dropdown would be hidden behind that native view). Phase 1a lists ONLY wired actions; History /
 * Downloads / Bookmarks / Extensions / Zoom / Print arrive in later phases. Tab actions run against
 * TabManager's authoritative state; Settings / Agent are UI state, so they signal the chrome renderer.
 */
export function showMainMenu(win: BrowserWindow): void {
  const t = currentResources();
  const template: MenuItemConstructorOptions[] = [
    {
      label: t.browser.newTab,
      accelerator: 'CmdOrCtrl+T',
      click: () => {
        TabManager.createTab();
      },
    },
    {
      label: t.browser.reload,
      accelerator: 'CmdOrCtrl+R',
      click: () => {
        TabManager.reloadActive();
      },
    },
    { type: 'separator' },
    {
      label: t.agentConsole.open,
      click: () => {
        win.webContents.send(IpcChannels.menuAction, 'open-agent');
      },
    },
    {
      label: t.browser.settings,
      accelerator: 'CmdOrCtrl+,',
      click: () => {
        win.webContents.send(IpcChannels.menuAction, 'open-settings');
      },
    },
    { type: 'separator' },
    {
      label: t.browser.exit,
      click: () => {
        app.quit();
      },
    },
  ];

  Menu.buildFromTemplate(template).popup({ window: win });
}
