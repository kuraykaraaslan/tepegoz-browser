import { resolve, join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';

/**
 * The application menu must be the APP's, not Electron's default.
 *
 * This is the regression lock on a security fix, and it is asserted against the running app because
 * that is the only place the question has an answer. Electron installs a default application menu when
 * an app never calls `Menu.setApplicationMenu`, and this app never did. Measured before the fix,
 * `Menu.getApplicationMenu()` returned a live menu binding fifteen accelerators, including:
 *
 *     Toggle Developer Tools=Ctrl+Shift+I
 *     Actual Size / Zoom In / Zoom Out
 *     Close=CommandOrControl+W
 *
 * Those are roles: Electron acts on the focused window or webContents directly. `toggleDevTools` in
 * particular walked straight around the sensitive-site DevTools gate, whose own doc comment promises
 * "nothing that reaches the chrome can open it on a bank" — while the app's gated toggle had zero
 * callers. The zoom roles bypassed the per-origin zoom ladder, and `close` closed the WINDOW where a
 * browser closes a tab.
 *
 * A unit test cannot catch this coming back: the defect was the ABSENCE of a call, and Electron
 * supplies the default silently. Only the launched app can be asked.
 */

const appDir = resolve(process.cwd(), 'apps/desktop');

function guiEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && k !== 'ELECTRON_RUN_AS_NODE') env[k] = v;
  }
  return env;
}

/** Roles that reach past one of this app's gates. None of them may appear in the menu, on any OS. */
const FORBIDDEN_ROLES = [
  'toggledevtools',
  'zoomin',
  'zoomout',
  'resetzoom',
  'close',
  'reload',
  'forcereload',
];

test('the app owns its application menu — Electron’s default is gone', async () => {
  const profileDir = join(process.cwd(), '.appmenu-profile');
  mkdirSync(profileDir, { recursive: true });
  writeFileSync(join(profileDir, 'preferences.json'), '{}');

  const app: ElectronApplication = await electron.launch({
    args: [`--user-data-dir=${profileDir}`, appDir],
    env: guiEnv(),
  });
  try {
    await app.firstWindow();
    const menu = await app.evaluate(({ Menu }) => {
      const m = Menu.getApplicationMenu();
      if (m === null) return null;
      const roles: string[] = [];
      const accelerators: string[] = [];
      const walk = (items: Electron.MenuItem[]): void => {
        for (const i of items) {
          if (typeof i.role === 'string') roles.push(i.role.toLowerCase());
          if (typeof i.accelerator === 'string') accelerators.push(i.accelerator);
          if (i.submenu) walk(i.submenu.items);
        }
      };
      walk(m.items);
      return { roles, accelerators };
    });

    if (process.platform === 'darwin') {
      // macOS cannot go menu-less: ⌘X/⌘C/⌘V come from Edit-menu roles, and an app without them
      // genuinely loses copy and paste. So a minimal menu stays — but only editing roles.
      expect(menu).not.toBeNull();
      expect(menu?.roles.filter((r) => FORBIDDEN_ROLES.includes(r))).toEqual([]);
    } else {
      // Windows and Linux: the windows are frameless, so no menu bar was ever drawn. The menu existed
      // purely as an invisible second binder for keys the app also binds. There must be none.
      expect(menu).toBeNull();
    }
  } finally {
    await app.close();
  }
});
