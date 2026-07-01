import { AppError } from '@tepegoz/libs';
import type { BrowserHost } from '@tepegoz/browser-tools';
import TabManager from '../tabs';

/**
 * Desktop `BrowserHost` for `@tepegoz/browser-tools`: the Electron/WebContentsView operations behind
 * the built-in agent tools (navigate + read active page via the isolated view, list/create tabs).
 * Keeping this here lets the tools package stay Electron-free.
 */
async function navigateActive(url: string): Promise<{ url: string; title: string }> {
  TabManager.navigateActive(url); // scheme allow-list enforced inside
  const wc = TabManager.activeWebContents();
  if (wc === null) throw new AppError('No active tab to navigate', 409);
  await new Promise<void>((resolve) => {
    const onDone = (): void => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      wc.removeListener('did-stop-loading', onDone);
      resolve();
    }, 15_000);
    wc.once('did-stop-loading', onDone);
  });
  // The tab may have been closed (webContents destroyed) during the up-to-15s wait — never call
  // methods on a destroyed WebContents (throws an opaque "Object has been destroyed").
  if (wc.isDestroyed()) throw new AppError('Active tab was closed during navigation', 409);
  return { url: wc.getURL(), title: wc.getTitle() };
}

async function readActivePage(): Promise<{ url: string; title: string; text: string }> {
  const wc = TabManager.activeWebContents();
  if (wc === null) throw new AppError('No active page to read', 409);
  const url = wc.getURL();
  const title = wc.getTitle();
  const result: unknown = await wc.executeJavaScript(
    'document.body ? document.body.innerText : ""',
    true,
  );
  return { url, title, text: typeof result === 'string' ? result : '' };
}

export const browserHost: BrowserHost = {
  navigateActive,
  readActivePage,
  listTabs: () => TabManager.getState().tabs.map((t) => ({ id: t.id, title: t.title, url: t.url })),
  createTab: (url) => TabManager.createTab(url),
};
