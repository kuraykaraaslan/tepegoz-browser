import { isWebUrl } from './lib/navigation-url';
import ActionInterceptorService from './extensions/action-interceptors.electron';
import { WindowTabsBase } from './tabs-window-base';
import { closedUrls, internalBaseUrl, internalTitleFor } from './tabs-shared';
import { unwireView, type ViewWiringHost } from './tabs-view-wiring';
import { askBeforeClose } from './navigation/unload-broker';

/**
 * Tab-removal and single-tab lifecycle layer of the per-window model, split out of `tabs.ts` (ADR-0010
 * 250-line cap): closing tabs (and the shared post-removal bookkeeping), the bulk close-others /
 * close-to-right variants, opening/duplicating internal-page tabs and the small id/reload queries.
 */
export class WindowTabsClosing extends WindowTabsBase {
  /** Hand the real `closeTab` to a wired view, so Ctrl+W closes a tab while the PAGE has focus. */
  protected override viewWiringHost(): ViewWiringHost {
    return {
      ...super.viewWiringHost(),
      closeTab: (id) => {
        this.closeTab(id);
      },
    };
  }

  closeTab(id: string): void {
    if (!this.store.has(id)) return;
    const url = this.store.get(id)?.url ?? '';
    if (ActionInterceptorService.shouldBlock('tab:close', { tabId: id, url })) return;
    const view = this.views.get(id);
    if (view !== undefined) {
      // Ask the PAGE first, before anything is torn down: a plain `webContents.close()` never fires
      // `beforeunload`, so Ctrl+W used to discard unsaved work with the page's own warning unrun. When
      // this takes the close over, the tab deliberately stays visible until the user answers — the same
      // thing Chrome does, and the reason the store is not touched above this line.
      if (
        askBeforeClose(view.webContents, () => {
          this.closeTab(id);
        })
      )
        return;
      // Remember the URL so Ctrl+Shift+T can reopen it (most-recent first, capped). Read from the store
      // rather than the contents when the retry path got here: by then the contents are already gone.
      const closedUrl = view.webContents.isDestroyed()
        ? (this.store.get(id)?.url ?? '')
        : view.webContents.getURL() || this.store.get(id)?.url || '';
      if (isWebUrl(closedUrl)) {
        closedUrls.push(closedUrl);
        if (closedUrls.length > 25) closedUrls.shift();
      }
      this.win.contentView.removeChildView(view);
      if (!view.webContents.isDestroyed()) {
        unwireView(view);
        view.webContents.close();
      }
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
      // Reselect the last VISIBLE tab (never surface a hidden one). If only hidden tabs remain, unhide
      // the last of them so the strip is never empty and there is always a visible active tab.
      const next = this.lastVisibleId() ?? this.store.ids().at(-1);
      if (next !== undefined) {
        if (this.store.get(next)?.hidden === true) this.store.setHidden(next, false);
        this.activate(next);
      } else {
        this.emitState();
      }
    } else {
      this.emitState();
    }
  }

  /** The last non-hidden tab id in strip order, or undefined when every tab is hidden. */
  protected lastVisibleId(): string | undefined {
    const ids = this.store.ids();
    for (let i = ids.length - 1; i >= 0; i--) {
      const id = ids[i]!;
      if (this.store.get(id)?.hidden !== true) return id;
    }
    return undefined;
  }

  /**
   * Hide a tab: remove it from the strip but keep its view ALIVE and continuously rendering so the agent
   * can keep driving it by id (the future background/task AI's substrate). The view stays ATTACHED to the
   * window, parked off-screen at a stable size — never detached, reloaded, or resized-to-reflow — so
   * hiding is uninterrupted. No-op if it would leave zero visible tabs (an empty strip is a dead end).
   */
  hideTab(id: string): void {
    const rec = this.store.get(id);
    if (rec === undefined || rec.hidden === true) return;
    const visibleCount = this.store.records().filter((r) => r.hidden !== true).length;
    if (visibleCount <= 1) return; // keep at least one visible tab
    const wasActive = this.store.activeId === id;
    this.store.setHidden(id, true);
    // Attach + park off-screen: the view keeps compositing but is invisible, at a stable size (no reflow).
    this.parkHiddenView(id);
    if (wasActive) {
      // Bring the last visible tab forward. activate() attaches + sizes it and, via its hidden guard,
      // leaves this now-parked view attached (still rendering).
      const next = this.lastVisibleId();
      if (next !== undefined) this.activate(next);
      else this.emitState();
    } else {
      this.emitState();
    }
  }

  /**
   * Unhide a tab: it reappears in the strip. The view has been rendering all along (attached, parked),
   * so this is a pure state flip — no reload, no reactivation. It returns to the content area only when
   * the user next activates it (the one lazy resize), keeping unhide uninterrupted too.
   */
  unhideTab(id: string): void {
    if (this.store.get(id)?.hidden !== true) return;
    this.store.setHidden(id, false);
    this.emitState();
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
    const existing = this.store
      .records()
      .find((rec) => rec.kind === 'internal' && internalBaseUrl(rec.url) === baseUrl)?.id;
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
