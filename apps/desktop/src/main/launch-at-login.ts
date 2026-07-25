import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { app } from 'electron';
import { Logger } from '@tepegoz/libs';

/**
 * Cross-platform "launch at system login". Windows + macOS use Electron's native login-item API; Linux
 * (where that API is a no-op) writes/removes an XDG autostart `.desktop` entry under
 * `~/.config/autostart`. The launcher only STARTS the app — HOW it presents (window / background / kiosk)
 * is the `startupMode` pref, read on every launch. So enabling auto-launch + choosing `background`/`kiosk`
 * yields a boot-time background/kiosk browser, with no launcher args needed.
 */

/** The XDG autostart entry path for the current user (Linux only). */
function linuxAutostartPath(): string {
  return join(app.getPath('home'), '.config', 'autostart', 'tepegoz.desktop');
}

function quoteIfNeeded(p: string): string {
  return p.includes(' ') ? `"${p}"` : p;
}

/** The `Exec=` command that relaunches THIS app (packaged: the app binary / AppImage; dev: electron +
 *  the app dir). Exported for the unit test. */
export function linuxAutostartExec(): string {
  const bin = process.env.APPIMAGE ?? process.execPath;
  const parts = app.isPackaged ? [bin] : [bin, app.getAppPath()];
  return parts.map(quoteIfNeeded).join(' ');
}

/** The full XDG `.desktop` autostart file body. Pure — unit-tested. */
export function buildAutostartEntry(exec: string): string {
  return (
    [
      '[Desktop Entry]',
      'Type=Application',
      'Name=Tepegöz',
      `Exec=${exec}`,
      'Terminal=false',
      'X-GNOME-Autostart-enabled=true',
    ].join('\n') + '\n'
  );
}

function setLinuxAutostart(enabled: boolean): void {
  const path = linuxAutostartPath();
  if (!enabled) {
    rmSync(path, { force: true });
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, buildAutostartEntry(linuxAutostartExec()));
}

/**
 * Enable/disable launching this app at system login. Idempotent; called from the prefs reconcile. HOW it
 * presents at boot is the `startupMode` pref (read on launch), so the launcher needs no special args.
 */
export function setLaunchAtLogin(enabled: boolean): void {
  try {
    if (process.platform === 'linux') {
      setLinuxAutostart(enabled);
      return;
    }
    // Windows: an unpackaged process.execPath is electron, so the Run-key command also needs the app dir.
    const args = enabled && !app.isPackaged ? [app.getAppPath()] : [];
    app.setLoginItemSettings({ openAtLogin: enabled, args });
  } catch (err) {
    Logger.warn('Failed to set launch-at-login', { enabled, err: String(err) });
  }
}
