import { isWebUrl } from './lib/navigation-url';
import ActionInterceptorService from './extensions/action-interceptors.electron';
import { WindowTabsBase } from './tabs-window-base';
import { closedUrls, internalBaseUrl, internalTitleFor } from './tabs-shared';
import { unwireView } from './tabs-view-wiring';

/**
 * Tab-removal and single-tab lifecycle layer of the per-window model, split out of `tabs.ts` (ADR-0010
 * 250-line cap): closing tabs (and the shared post-removal bookkeeping), the bulk close-others /
 * close-to-right variants, opening/duplicating internal-page tabs and the small id/reload queries.
 */
export class WindowTabsClosing extends WindowTabsBase {
  closeTab(id: string): void {
    if (!this.store.has(id)) return;
    const url = this.store.get(id)?.url ?? '';
    if (ActionInterceptorService.shouldBlock('tab:close', { tabId: id, url })) return;
    const view = this.views.get(id);
    if (view !== undefined) {
      // Remember the URL so Ctrl+Shift+T can reopen it (most-recent first, capped).
      const closedUrl = view.webContents.getURL() || this.store.get(id)?.url || '';
      if (isWebUrl(closedUrl)) {
        closedUrls.push(closedUrl);
        if (closedUrls.length > 25) closedUrls.shift();
      }
      this.win.contentView.removeChildView(view);
      unwireView(view);
      view.webContents.close();
      this.views.delete(id);
    }
    const wasActive = this.store.activeId === id;
    this.store.delete(id);
    this.afterRemove(wasActive);
  }

  /** Post-removal bookkeeping shared by `closeTab` and `detachTab`: reselect the active tab, or close
   *  the window when the last tab is gone (→ the app quits on non-macOS via `window-all-closed`). */
  protected afterRemove(wasActive: boolean): void {
    // Closing the final tab closes the window instead of leaving an empty chrome over a blank content
    // area — the app then quits (non-macOS) via the `window-all-closed` handler, or on macOS follows
    // the platform convention of an open-but-window-less app.
    if (this.store.ids().length === 0) {
      if (!this.win.isDestroyed()) this.win.close();
      return;
    }
    if (wasActive) {
      this.store.setActive(null);
      const next = this.store.ids().at(-1);
      if (next !== undefined) {
        this.activate(next);
      } else {
        this.emitState();
      }
    } else {
      this.emitState();
    }
  }

  /** Reload a specific tab (context menu) — distinct from reloadActive (omnibox/shortcut). */
  reloadTab(id: string): void {
    this.views.get(id)?.webContents.reload();
  }

  /** The active tab's id (null if none) — lets callers open a new tab as a child of the current tab. */
  activeTabId(): string | null {
    return this.store.activeId;
  }

  /** The active tab's id ONLY when it is a view-less (internal) tab — one that `navigateActive` would
   *  fork into a brand-new web tab rather than navigate in place. Else null. A web tab always owns a
   *  `WebContentsView` from creation (before its first load), so "no view entry" ⟺ internal. The agent
   *  host uses this to replace the newtab in place inside its group instead of orphaning it. */
  viewlessActiveTabId(): string | null {
    const id = this.store.activeId;
    return id !== null && this.views.get(id) === undefined ? id : null;
  }

  /** Open (or focus) an internal page tab (tepegoz://settings, tepegoz://extensions) — rendered by
   *  the chrome, no web view. A new-tab experience for internal pages, mirroring Chrome's chrome://. */
  openInternalPage(url: string): void {
    const baseUrl = internalBaseUrl(url);
    const existing = this.store.records().find((rec) => rec.kind === 'internal' && internalBaseUrl(rec.url) === baseUrl)?.id;
    if (existing !== undefined) {
      this.store.update(existing, { url, title: internalTitleFor(url) });
      this.activate(existing);
      return;
    }
    const id = this.store.add({
      kind: 'internal',
      title: internalTitleFor(url),
      url,
      isLoading: false,
      faviconUrl: null,
    });
    this.activate(id);
  }

  /** Open a fresh tab immediately to the right of `refId` and focus it (Chrome's "New tab to the right"). */
  createTabRight(refId: string): void {
    if (!this.store.has(refId)) return;
    // openerId → inherits refId's group (if any); placeAfter fixes the position for the ungrouped case.
    const newId = this.createTab(undefined, { openerId: refId });
    if (newId === null) return;
    this.store.placeAfter(newId, refId);
    this.emitState();
  }

  /** Duplicate a tab's current URL into a new tab placed right after it, and focus it. */
  duplicateTab(id: string): void {
    const rec = this.store.get(id);
    if (rec === undefined) return;
    const view = this.views.get(id);
    if (view === undefined) {
      this.openInternalPage(rec.url); // internal page → just focus it (nothing to duplicate)
      return;
    }
    const url = view.webContents.getURL() || rec.url;
    const newId = this.createTab(url.length > 0 ? url : undefined, { openerId: id });
    if (newId === null) return;
    this.store.placeAfter(newId, id);
    this.emitState();
  }

  /** Close every tab except `id`, keeping `id` active. */
  closeOtherTabs(id: string): void {
    if (!this.store.has(id)) return;
    if (this.store.activeId !== id) this.activate(id);
    for (const other of this.store.ids().filter((k) => k !== id)) {
      this.closeTab(other);
    }
  }

  /** Close all tabs ordered after `id`. */
  closeTabsToRight(id: string): void {
    const ids = this.store.ids();
    const idx = ids.indexOf(id);
    if (idx === -1) return;
    const toClose = ids.slice(idx + 1);
    // If the active tab is being closed, fall back to the reference tab first.
    const activeId = this.store.activeId;
    if (activeId !== null && toClose.includes(activeId)) {
      this.activate(id);
    }
    for (const k of toClose) this.closeTab(k);
  }
}
