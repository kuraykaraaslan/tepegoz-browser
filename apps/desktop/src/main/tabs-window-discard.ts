import { WebContentsView, type Session } from 'electron';
import { Logger } from '@tepegoz/libs';
import { WindowTabsRehost } from './tabs-window-rehost';
import { unwireView } from './tabs-view-wiring';

/**
 * Tab discard/sleep, split out of `tabs.ts` (ADR-0010 250-line cap): free a background tab's memory by
 * destroying its `WebContentsView` while keeping the tab entry — title, favicon, URL — in the strip, and
 * rebuild that view the moment the tab is activated again. Distinct from `hideTab`: a hidden tab is kept
 * ALIVE on purpose (the agent may be driving it by id); a discarded tab is the opposite — memory is the
 * whole point, so nothing may stay running.
 *
 * Extends `WindowTabsRehost` (not a lower layer) specifically for `sessionOfTab`: a tab bound to a Phase
 * 5 VPN/Tor connection must come back on that SAME session, never the window's plain default — reviving
 * it onto the wrong route would be the exact clear-path leak `rehostTab`'s own docs warn against, just
 * triggered by sleep instead of a re-bind.
 */
export class WindowTabsDiscard extends WindowTabsRehost {
  /** The browsing session each currently-discarded tab was actually on, so reviving it lands back on the
   *  SAME route rather than silently falling onto the window's default. */
  private readonly discardedSessions = new Map<string, Session>();

  /** Rebuild a previously-discarded tab's view and reload its last known URL. Called from `activate`
   *  BEFORE the base class looks up `this.views`, so the freshly-built view is what gets attached. */
  override activate(id: string): void {
    if (this.store.get(id)?.discarded === true) this.reviveTab(id);
    super.activate(id);
  }

  /**
   * Discard (suspend) a background tab to cap memory. No-op when `id` cannot safely be discarded — see
   * {@link canDiscard} — so a caller (the auto-discard sweep, the tab context menu) never has to
   * duplicate the guard.
   */
  discardTab(id: string): void {
    if (!this.canDiscard(id)) return;
    const view = this.views.get(id);
    if (view !== undefined) {
      this.discardedSessions.set(id, view.webContents.session);
      if (this.isAttached(view)) this.win.contentView.removeChildView(view);
      if (!view.webContents.isDestroyed()) {
        unwireView(view);
        view.webContents.close();
      }
      this.views.delete(id);
    }
    this.store.update(id, { discarded: true, isLoading: false });
    this.emitState();
  }

  /**
   * Whether `id` is a safe discard candidate: it exists, is a `web` tab (internal pages have no view and
   * nothing to free), is not already discarded, is not the ACTIVE tab (discarding what the user is
   * looking at would just look like a crash), is not `hidden` (the agent may be driving it right now —
   * the same reason `hideTab` keeps a hidden view alive), and is not currently playing audio (a
   * background tab making sound is one the user is deliberately keeping around).
   */
  canDiscard(id: string): boolean {
    const rec = this.store.get(id);
    if (rec === undefined || rec.kind !== 'web') return false;
    if (rec.discarded === true) return false;
    if (this.store.activeId === id) return false;
    if (rec.hidden === true) return false;
    if (rec.audible === true) return false;
    return true;
  }

  /** Build a fresh `WebContentsView` for a discarded tab and reload it, on the SAME session it was
   *  discarded from (falling back to the window's default only if that session was somehow never
   *  recorded — defensive, not the expected path). */
  private reviveTab(id: string): void {
    const rec = this.store.get(id);
    if (rec === undefined || rec.kind !== 'web') return;
    const session = this.discardedSessions.get(id) ?? this.newTabSession();
    this.discardedSessions.delete(id);
    const view = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        webSecurity: true,
        session,
        backgroundThrottling: false,
      },
    });
    this.views.set(id, view);
    this.wireView(id, view);
    view.setBounds(this.effectiveBounds());
    this.store.update(id, { discarded: false, isLoading: true });
    const url = rec.url;
    void view.webContents.loadURL(url).catch((err: unknown) => {
      Logger.warn('Discarded tab failed to reload', { url, err: String(err) });
    });
  }
}
