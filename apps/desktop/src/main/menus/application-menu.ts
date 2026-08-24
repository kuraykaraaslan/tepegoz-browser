import { app, Menu, type MenuItemConstructorOptions } from 'electron';
import { mainStrings } from '../lib/i18n-main';

/**
 * The application menu — which this app had never set, and therefore did not own.
 *
 * Electron installs a DEFAULT application menu when `Menu.setApplicationMenu` is never called, and it
 * was never called here. Measured in the running app rather than assumed: `Menu.getApplicationMenu()`
 * returned a live menu binding fifteen accelerators, among them
 *
 *   Toggle Developer Tools=Ctrl+Shift+I   Actual Size / Zoom In / Zoom Out
 *   Reload=CmdOrCtrl+R   Force Reload=Shift+CmdOrCtrl+R   Close=CommandOrControl+W
 *
 * Every one of those is a role: Electron acts on the focused window or webContents directly. Three of
 * them were wrong for this app, and one of those three was a security hole:
 *
 *  1. **`toggleDevTools` bypassed the sensitive-site gate.** `devtools-policy.ts` states the guarantee
 *     as "nothing that reaches the chrome can open it on a bank", and `openDevToolsActive` calls itself
 *     "the single place DevTools is opened, so the sensitive-site gate cannot be routed around by a new
 *     caller". Neither held: Ctrl+Shift+I went to Electron's role and consulted nothing. The app's own
 *     gated toggle (`TabManager.toggleDevTools`) had ZERO callers — its comment claimed "Phase 2b menu
 *     + F12" and neither of those existed. The gate was real, and unreachable, and stepped around by
 *     the one shortcut every developer types by reflex.
 *  2. **The zoom roles bypassed the app's own zoom.** `site-zoom.ts` implements a Chrome-style ladder
 *     with per-origin persistence; Electron's roles set a zoom level on the focused webContents and
 *     persist nothing. Two implementations of one key, and which one wins was chosen by nobody.
 *  3. **`close` closes the WINDOW.** In a browser Ctrl+W closes a tab. Closing a window full of tabs
 *     from muscle memory is not an undoable mistake.
 *
 * So the menu is now set explicitly, and the keys it used to answer are registered in
 * `@tepegoz/shortcuts` — the one place a global key may be bound — and dispatched through the app's own
 * gated paths.
 *
 * WINDOWS / LINUX: no menu at all. The windows are frameless, so no menu bar was ever drawn; the menu
 * existed purely as an invisible second binder of keys the app also binds. Removing it leaves exactly
 * one owner per key.
 *
 * macOS: a menu is NOT optional. The clipboard shortcuts (⌘X/⌘C/⌘V/⌘A) and ⌘Q come from menu roles
 * there, and an app with no menu genuinely loses copy and paste. So darwin keeps a minimal one — App
 * and Edit only, roles that act on the focused input and pass no gate of ours. Nothing that reaches
 * DevTools, zoom, or window lifecycle is in it.
 */
export function installApplicationMenu(): void {
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null);
    return;
  }
  Menu.setApplicationMenu(Menu.buildFromTemplate(macTemplate()));
}

/** Rebuild after a locale change (paired with `refreshTray`). No-op off macOS, where there is no menu. */
export function refreshApplicationMenu(): void {
  if (process.platform !== 'darwin') return;
  Menu.setApplicationMenu(Menu.buildFromTemplate(macTemplate()));
}

/**
 * The macOS-only minimum. Every item is a ROLE, deliberately: roles are what give macOS its native
 * editing behaviour, and a role that only cuts/copies/pastes inside the focused input cannot route
 * around a policy the app enforces elsewhere. `toggleDevTools`, the zoom roles and `close` are the ones
 * that could, and none of them is here.
 */
function macTemplate(): MenuItemConstructorOptions[] {
  const t = mainStrings();
  return [
    {
      label: app.getName(),
      submenu: [{ role: 'hide' }, { role: 'hideOthers' }, { type: 'separator' }, { role: 'quit' }],
    },
    {
      label: t.browser.menuEdit,
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
  ];
}
