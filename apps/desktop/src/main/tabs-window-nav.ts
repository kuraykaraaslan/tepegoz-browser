import { type Rectangle, type WebContents } from 'electron';
import { Logger } from '@tepegoz/libs';
import { internalPageUrl, isWebUrl, toNavigationUrl } from './lib/navigation-url';
import ClipboardService from './clipboard/clipboard-service.electron';
import DownloadService from './downloads/download-service.electron';
import { WindowTabsMoves } from './tabs-window-moves';
import { homeUrl, searchUrlForQuery } from './tabs-shared';

/**
 * Navigation, page actions, content-area bounds/visibility and webContents accessors for the per-window
 * model, split out of `tabs.ts` (ADR-0010 250-line cap). Covers omnibox/history navigation, the page
 * context-menu commands (print / view-source / save / clipboard / inspect), the content bounds the
 * renderer measures, and the read-only webContents handles the agent perception layer consumes.
 */
export class WindowTabsNav extends WindowTabsMoves {
  navigateActive(rawUrl: string): void {
    // Internal pages (tepegoz://…) open as their own tab, rendered by the trusted chrome.
    const internal = internalPageUrl(rawUrl);
    if (internal !== null) {
      this.openInternalPage(internal);
      return;
    }
    const rec = this.store.active();
    if (rec === undefined) return;
    const url = toNavigationUrl(rawUrl, homeUrl(), searchUrlForQuery);
    const view = this.views.get(rec.id);
    if (view === undefined) {
      this.createTab(url); // typing a URL while on an internal page opens a new web tab
      return;
    }
    void view.webContents.loadURL(url).catch((err: unknown) => {
      Logger.warn('Navigation failed', { url, err: String(err) });
    });
  }

  /** Navigate a specific existing web tab. Returns false for missing/internal tabs. */
  navigateTab(id: string, rawUrl: string): boolean {
    if (!this.store.has(id)) return false;
    const view = this.views.get(id);
    if (view === undefined) return false;
    const url = toNavigationUrl(rawUrl, homeUrl(), searchUrlForQuery);
    void view.webContents.loadURL(url).catch((err: unknown) => {
      Logger.warn('Navigation failed', { url, err: String(err) });
    });
    return true;
  }

  goBack(): void {
    const wc = this.activeView()?.webContents;
    if (wc?.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
  }

  goForward(): void {
    const wc = this.activeView()?.webContents;
    if (wc?.navigationHistory.canGoForward()) wc.navigationHistory.goForward();
  }

  reloadActive(): void {
    this.activeView()?.webContents.reload();
  }

  /** Print the active web page (opens the system print dialog). Page context menu → Print. */
  printActive(): void {
    this.activeView()?.webContents.print();
  }

  /** Open the active page's HTML source in place (Chrome's `view-source:`). Web pages only. */
  viewSourceActive(): void {
    const wc = this.activeView()?.webContents;
    if (wc === undefined) return;
    const url = wc.getURL();
    if (isWebUrl(url)) void wc.loadURL(`view-source:${url}`).catch(() => undefined);
  }

  /** Save the active page through the central DownloadService (quarantine + audit). */
  saveActive(): void {
    const wc = this.activeView()?.webContents;
    if (wc !== undefined) DownloadService.downloadURL(wc, wc.getURL(), { actor: 'user' });
  }

  /** Download a specific URL through the active view (Save image/video/audio as → OS save dialog). */
  downloadUrlActive(url: string): void {
    const wc = this.activeView()?.webContents;
    if (wc !== undefined) DownloadService.downloadURL(wc, url, { actor: 'user' });
  }

  /** Editing commands on the active page (page context menu → Cut/Copy/Paste/Select all). */
  copyActive(): void {
    ClipboardService.copy(this.activeView()?.webContents);
  }
  cutActive(): void {
    ClipboardService.cut(this.activeView()?.webContents);
  }
  pasteActive(): void {
    ClipboardService.paste(this.activeView()?.webContents);
  }
  selectAllActive(): void {
    ClipboardService.selectAll(this.activeView()?.webContents);
  }

  /** Copy the image at the given view-relative coordinates (px) to the clipboard. */
  copyImageAtActive(x: number, y: number): void {
    ClipboardService.copyImageAt(this.activeView()?.webContents, x, y);
  }

  /** Open DevTools and inspect the element at the given view-relative coordinates (px). */
  inspectActiveAt(x: number, y: number): void {
    const wc = this.activeView()?.webContents;
    if (wc === undefined) return;
    const px = Math.round(x);
    const py = Math.round(y);
    if (wc.isDevToolsOpened()) {
      wc.inspectElement(px, py);
    } else {
      wc.once('devtools-opened', () => wc.inspectElement(px, py));
      wc.openDevTools();
    }
  }

  /** Navigate the active tab to the home / start page. */
  goHome(): void {
    this.navigateActive(homeUrl());
  }

  /** The current content-area bounds (DIP, shell-window-relative). Used to offset CDP coordinates
   *  (which are view-relative) to shell-window-relative coordinates for the cursor overlay. */
  getContentBounds(): Rectangle {
    return { ...this.bounds };
  }

  /** The content area (below the chrome), in DIP, as measured by the renderer. */
  setContentBounds(bounds: Rectangle): void {
    this.bounds = bounds;
    if (this.contentVisible) {
      this.activeView()?.setBounds(bounds);
    }
  }

  /** Hide the active web view so a chrome-rendered overlay (Agent Console) shows through. Internal
   *  tabs have no view, so this is a no-op for them. */
  setContentVisible(visible: boolean): void {
    this.contentVisible = visible;
    const view = this.activeView();
    if (view === undefined) return;
    if (visible) {
      this.win.contentView.addChildView(view);
      view.setBounds(this.bounds);
    } else {
      this.win.contentView.removeChildView(view);
    }
  }

  /** The active tab's webContents, for the agent perception layer (read DOM text). Null if none or
   *  destroyed. The agent reads through this; it never gets the chrome's webContents or contextBridge. */
  activeWebContents(): WebContents | null {
    const wc = this.activeView()?.webContents;
    return wc !== undefined && !wc.isDestroyed() ? wc : null;
  }

  /** A specific tab's WebContents, or null for missing/internal/destroyed tabs. */
  webContentsForTab(id: string): WebContents | null {
    const wc = this.views.get(id)?.webContents;
    return wc !== undefined && !wc.isDestroyed() ? wc : null;
  }

  /** Snapshot the active web view as a PNG data URL (null for internal/no-view tabs or on failure). */
  async captureActive(): Promise<string | null> {
    const wc = this.activeWebContents();
    if (wc === null) return null;
    try {
      const image = await wc.capturePage();
      return image.isEmpty() ? null : image.toDataURL();
    } catch {
      return null;
    }
  }

  /** Apply a resolved User-Agent to every open web tab in this window and reload it. */
  applyUserAgent(ua: string): void {
    for (const view of this.views.values()) {
      const wc = view.webContents;
      if (!wc.isDestroyed()) {
        wc.setUserAgent(ua);
        wc.reload();
      }
    }
  }
}
