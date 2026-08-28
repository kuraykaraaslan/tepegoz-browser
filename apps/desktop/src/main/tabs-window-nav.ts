import { type Rectangle, type WebContents } from 'electron';
import { Logger } from '@tepegoz/libs';
import type { ZoomDirection } from '@tepegoz/desktop-ipc';
import { applyZoomCommand } from './site-zoom';
import { mayOpenDevTools, type DevToolsVerdict } from '@tepegoz/security-policy';
import { internalPageUrl, toNavigationUrl } from './lib/navigation-url';
import { hideInternalPageView, showInternalPageView } from './tabs-internal-page-view';
// The bodies live in `page-commands.ts` because the KEYBOARD route cannot reach into this graph
// without closing a dependency cycle; these three stay as the menu's entry points.
import { printPage, savePage, viewSourcePage } from './page-commands';
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
    printPage(this.activeView()?.webContents ?? null);
  }

  /** Open the active page's HTML source in place (Chrome's `view-source:`). Web pages only. */
  viewSourceActive(): void {
    viewSourcePage(this.activeView()?.webContents ?? null);
  }

  /** Save the active page through the central DownloadService (quarantine + audit). */
  saveActive(): void {
    savePage(this.activeView()?.webContents ?? null);
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

  /**
   * Open DevTools on the active tab (Phase 2b). The single place DevTools is opened, so the
   * sensitive-site gate cannot be routed around by a new caller.
   *
   * Returns the verdict rather than swallowing it: a shortcut that silently does nothing reads as a
   * broken browser, and the caller needs to be able to say why.
   */
  openDevToolsActive(): DevToolsVerdict {
    const wc = this.activeView()?.webContents;
    if (wc === undefined) return { allowed: false, reason: 'no_page' };
    const verdict = mayOpenDevTools(wc.getURL());
    if (!verdict.allowed) {
      Logger.info('Refused to open DevTools', { reason: verdict.reason });
      return verdict;
    }
    if (wc.isDevToolsOpened()) wc.closeDevTools();
    else wc.openDevTools();
    return verdict;
  }

  /** Open DevTools and inspect the element at the given view-relative coordinates (px). */
  inspectActiveAt(x: number, y: number): DevToolsVerdict {
    const wc = this.activeView()?.webContents;
    if (wc === undefined) return { allowed: false, reason: 'no_page' };
    // Same gate as the shortcut. "Inspect element" is DevTools with a starting point, not a
    // different capability, and it was previously the one way onto a bank page with a live console.
    const verdict = mayOpenDevTools(wc.getURL());
    if (!verdict.allowed) {
      Logger.info('Refused to inspect element', { reason: verdict.reason });
      return verdict;
    }
    const px = Math.round(x);
    const py = Math.round(y);
    if (wc.isDevToolsOpened()) {
      wc.inspectElement(px, py);
    } else {
      wc.once('devtools-opened', () => wc.inspectElement(px, py));
      wc.openDevTools();
    }
    return verdict;
  }

  /** Navigate the active tab to the home / start page. */
  goHome(): void {
    this.navigateActive(homeUrl());
  }

  /**
   * Step / reset the active tab's zoom from the omnibox zoom indicator (renderer → `zoom:command`).
   * Applies through the same `site-zoom` ladder + per-origin store the Ctrl shortcuts use, then
   * re-emits so the indicator repaints — `activeZoomFactor` rides `TabsState`, there is no separate
   * push. A view-less internal tab has no webContents and this is a no-op.
   */
  zoomActive(direction: ZoomDirection): void {
    applyZoomCommand(this.activeWebContents(), direction);
    this.emitState();
  }

  /**
   * Re-push `TabsState` without a store mutation. Used when a property the state only mirrors — the
   * active tab's zoom, changed by a Ctrl shortcut handled outside this model — moved and the renderer
   * needs to catch up.
   */
  refreshState(): void {
    this.emitState();
  }

  /** The current content-area bounds (DIP, shell-window-relative). Used to offset CDP coordinates
   *  (which are view-relative) to shell-window-relative coordinates for the cursor overlay. */
  getContentBounds(): Rectangle {
    return { ...this.bounds };
  }

  /** The content area (below the chrome), in DIP, as measured by the renderer. */
  setContentBounds(bounds: Rectangle): void {
    // Ignore a zero-area report: the renderer momentarily measures 0×0 during layout thrash (or if the
    // content element is transiently collapsed), and storing it would blind perception until the next
    // report. The renderer stays the authority for any REAL (non-zero) region; a spurious 0 never wins.
    if (bounds.width <= 0 || bounds.height <= 0) return;
    this.bounds = bounds;
    if (this.contentVisible) {
      this.activeView()?.setBounds(bounds);
      // A `WebContentsView`-backed internal page (settings et al.) lives in a SEPARATE map, so
      // `activeView()` never returns it — resize it here too, or a window resize leaves the system
      // page frozen at its old width until the tab is re-activated.
      const activeId = this.store.activeId;
      const internalView = activeId !== null ? this.internalPageViews.get(activeId) : undefined;
      if (internalView !== undefined) showInternalPageView(this.win, internalView, bounds);
    }
  }

  /** Hide the active web view so a chrome-rendered overlay (Agent Console) shows through. Also hides an
   *  active internal tab's REAL page view (settings) when it has one — a `WebContentsView` always
   *  composites above the chrome's own DOM, so an overlay opened while Settings is active would
   *  otherwise be occluded by it. A plain viewless internal tab (no real page) stays a no-op. */
  setContentVisible(visible: boolean): void {
    this.contentVisible = visible;
    const view = this.activeView();
    const activeId = this.store.activeId;
    const internalView = activeId !== null ? this.internalPageViews.get(activeId) : undefined;
    if (view === undefined && internalView === undefined) return;
    if (visible) {
      if (view !== undefined) {
        this.win.contentView.addChildView(view);
        view.setBounds(this.effectiveBounds());
      }
      if (internalView !== undefined) showInternalPageView(this.win, internalView, this.effectiveBounds());
    } else {
      if (view !== undefined) this.win.contentView.removeChildView(view);
      if (internalView !== undefined) hideInternalPageView(this.win, internalView);
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
