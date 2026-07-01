import { app, Menu, type BrowserWindow, type MenuItemConstructorOptions } from 'electron';
import { IpcChannels } from '../../shared/ipc-contract';
import { mainResources } from '../lib/i18n-main';
import TabManager from '../tabs';

/**
 * Native main (hamburger) menu — a real OS popup so it renders ABOVE the tab's WebContentsView (a DOM
 * dropdown would be hidden behind that native view). Phase 1a lists ONLY wired actions; History /
 * Downloads / Bookmarks / Extensions / Zoom / Print arrive in later phases. Tab actions (incl. opening
 * the internal Settings tab) run against TabManager; the Agent Console is chrome UI state, so it
 * signals the renderer.
 */
export function showMainMenu(win: BrowserWindow): void {
  const t = mainResources();
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
        TabManager.openSettings();
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
