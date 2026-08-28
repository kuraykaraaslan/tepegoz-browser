import { BrowserWindow, webContents, type WebContents } from 'electron';
import { isTrustedAppUrl } from './trusted-origin';

/**
 * Every renderer that is one of OUR OWN surfaces — the thing a "tell the whole app that X changed"
 * broadcast actually means.
 *
 * Two kinds, and the second is the one that kept getting missed: the chrome documents (the main window
 * plus every native popup) are `BrowserWindow`s, but a `tepegoz://` page (settings, history, downloads,
 * …) is a `WebContentsView` inside a tab since Faz 2/3 of `protocol-tepegoz-pages.md`. It is NOT reached
 * by `BrowserWindow.getAllWindows()`, so a broadcast written that way silently stops at the chrome —
 * measured: changing the theme from any other window left `tepegoz://settings` painted in the previous
 * colour until a reload, even though it subscribes to the very signal that was being sent.
 *
 * Membership is decided by `isTrustedAppUrl`, the SAME allow-list that decides which senders may call
 * privileged IPC. That is the honest boundary: a surface we would take a privileged call FROM is a
 * surface we push app state TO, and a browsed page is neither.
 */
export function appSurfaceContents(): WebContents[] {
  const out: WebContents[] = [];
  const seen = new Set<number>();
  const add = (wc: WebContents): void => {
    if (wc.isDestroyed() || seen.has(wc.id)) return;
    seen.add(wc.id);
    out.push(wc);
  };
  // Chrome windows and popups first — including any that isTrustedAppUrl would not vouch for on URL
  // alone (an extension-hosted popup window), which used to receive these broadcasts and still does.
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) add(win.webContents);
  }
  for (const wc of webContents.getAllWebContents()) {
    if (isTrustedAppUrl(wc.getURL())) add(wc);
  }
  return out;
}

/** Send `channel` to every app surface (see `appSurfaceContents`) exactly once. */
export function broadcastToAppSurfaces(channel: string, ...args: unknown[]): void {
  for (const wc of appSurfaceContents()) wc.send(channel, ...args);
}
