import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { app, BrowserWindow, powerMonitor } from 'electron';
import { Logger } from '@tepegoz/libs';
import { createWindow } from './window';
import { installSecurity } from './security';
import { registerIpc } from './ipc';
import { initStores } from './stores.electron';
import TabManager from './tabs';
import UserAgentManager from './user-agent';

// App-specific identity → userData at %APPDATA%/Tepegöz instead of the shared default "Electron" dir.
// This avoids cross-instance GPU/disk-cache contention ("Unable to move the cache: Access is denied").
app.setName('Tepegöz');
// Windows: bind an explicit AppUserModelID so the taskbar groups windows under our brand icon
// (and notifications are attributed to Tepegöz) rather than the default Electron identity.
if (process.platform === 'win32') app.setAppUserModelId('com.tepegoz.browser');

// Single Chrome-like user-data directory named `tepegoz` (app.setName above is only the display /
// taskbar name). Pin it explicitly BEFORE whenReady so EVERY app.getPath('userData') — stores, the
// SQLite DB, and the browsing partitions — resolves here. One-time: carry the small settings files
// over from the pre-rename "Tepegöz" folder so existing preferences + encrypted API keys survive.
{
  const appDataDir = app.getPath('appData');
  const legacyDir = join(appDataDir, 'Tepegöz');
  const userDataDir = join(appDataDir, 'tepegoz');
  if (existsSync(legacyDir)) {
    mkdirSync(userDataDir, { recursive: true });
    for (const file of ['preferences.json', 'credentials.enc.json']) {
      const src = join(legacyDir, file);
      const dst = join(userDataDir, file);
      if (existsSync(src) && !existsSync(dst)) {
        try {
          copyFileSync(src, dst);
        } catch (err) {
          Logger.warn('Failed to carry over legacy user-data file', { file, err: String(err) });
        }
      }
    }
  }
  app.setPath('userData', userDataDir);
}

function bootstrap(): void {
  const win = createWindow();
  TabManager.attach(win);
  // Dev: electron-vite injects the renderer dev-server URL. Prod: load the built file.
  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (devUrl !== undefined && devUrl.length > 0) {
    void win.loadURL(devUrl);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }
  // Restore the last session's tabs; if there was none, open a single default tab. (State is also
  // fetched by the renderer via getTabsState on mount.)
  if (!TabManager.restoreSession()) {
    TabManager.createTab();
  }
  win.on('closed', () => {
    TabManager.persistNow(); // capture the final tab set BEFORE reset() clears the store
    TabManager.reset();
  });
}

// Single instance: a second launch focuses the existing window rather than fighting over the cache.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows();
    if (win) {
      if (win.isMinimized()) {
        win.restore();
      }
      win.focus();
    }
  });

  void app
    .whenReady()
    .then(() => {
      // macOS: the BrowserWindow `icon` is ignored (the dock uses the app bundle), so set it here
      // for dev/unpackaged runs. Windows/Linux get the brand icon via the window itself.
      if (process.platform === 'darwin') {
        app.dock?.setIcon(join(app.getAppPath(), 'resources', 'icon.png'));
      }
      installSecurity();
      initStores();
      // Apply the persisted User-Agent override to the browsing session BEFORE the first tab opens.
      UserAgentManager.init();
      registerIpc();
      bootstrap();

      // Sleep/resume hooks. Phase 1b: the Recovery Coordinator resumes durable tasks from their last
      // checkpoint on 'resume' (Opera Neon's "task drops on sleep" lesson).
      powerMonitor.on('suspend', () => {
        Logger.info('System suspending');
      });
      powerMonitor.on('resume', () => {
        Logger.info('System resumed');
      });

      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
          bootstrap();
        }
      });
    })
    .catch((err: unknown) => {
      Logger.error('Failed to start Tepegöz', { err: String(err) });
    });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}
