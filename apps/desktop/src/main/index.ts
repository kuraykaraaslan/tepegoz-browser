import { join } from 'node:path';
import { app, BrowserWindow } from 'electron';
import { Logger } from '@tepegoz/libs';
import { createWindow } from './window';
import { installSecurity } from './security';
import { registerIpc } from './ipc';

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

void app
  .whenReady()
  .then(() => {
    installSecurity();
    registerIpc();
    bootstrap();

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
