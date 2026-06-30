import { BrowserWindow, shell } from 'electron';
import { join } from 'node:path';

/**
 * The SINGLE secure window factory (internal-ai-rules BLOCKING): every BrowserWindow is created here
 * with contextIsolation + sandbox + nodeIntegration:false + webSecurity:true. New-window requests are
 * denied by default; external https is handed to the OS browser.
 */
export function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    backgroundColor: '#0b0b0c',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false,
      // App-chrome gets its own persistent partition. Browsed (untrusted) pages will later run in
      // SEPARATE isolated partitions/WebContentsView, never sharing this session.
      partition: 'persist:tepegoz-app',
    },
  });

  // Reveal the window robustly: prefer 'ready-to-show' (no white flash), but NEVER leave it stuck
  // hidden if that event is delayed or missed (e.g. a renderer load hiccup in dev). did-finish-load
  // and a timed fallback guarantee the window always appears. show() is idempotent.
  let shown = false;
  const reveal = (): void => {
    if (shown || win.isDestroyed()) return;
    shown = true;
    win.show();
    win.focus();
  };
  win.once('ready-to-show', reveal);
  win.webContents.once('did-finish-load', reveal);
  setTimeout(reveal, 4000);

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  return win;
}
