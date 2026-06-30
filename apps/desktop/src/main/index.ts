import { join } from 'node:path';
import { app, BrowserWindow, powerMonitor } from 'electron';
import { Logger } from '@tepegoz/libs';
import { createWindow } from './window';
import { installSecurity } from './security';
import { registerIpc } from './ipc';

// App-specific identity → userData at %APPDATA%/Tepegöz instead of the shared default "Electron" dir.
// This avoids cross-instance GPU/disk-cache contention ("Unable to move the cache: Access is denied").
app.setName('Tepegöz');

function bootstrap(): void {
  const win = createWindow();
  // Dev: electron-vite injects the renderer dev-server URL. Prod: load the built file.
  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (devUrl !== undefined && devUrl.length > 0) {
    void win.loadURL(devUrl);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }
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
      installSecurity();
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
