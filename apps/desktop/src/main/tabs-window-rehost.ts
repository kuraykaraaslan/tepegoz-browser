import { WebContentsView, type Session } from 'electron';
import { Logger } from '@tepegoz/libs';
import { WindowTabsNav } from './tabs-window-nav';
import { unwireView } from './tabs-view-wiring';

/**
 * Re-hosting a live tab on a different browsing session — the "reload-on-switch" the phase documents as
 * the cost of per-tab tunnels (Phase 5, L0).
 *
 * Electron binds a `WebContents` to its session at CREATION and offers no way to move it, so changing a
 * tab's network path means destroying its view and building a replacement. That is a real, visible cost
 * (the page reloads, in-page state is lost) and the phase accepts it explicitly rather than pretending
 * otherwise. What must NOT be lost is the tab itself: its id, its position in the strip, its group
 * membership, its pinned/hidden state and its URL all survive, because from the user's point of view they
 * changed a route, not closed a tab.
 *
 * **The ordering is the safety property.** The old view is destroyed BEFORE the new one is created, and
 * the new one does not load until it exists on the target session. There is therefore no moment where two
 * views for one tab are alive on two different network paths, and no request can be in flight on the old
 * path once the switch is requested — which is the phase's "rebinding never leaks mid-transition", made
 * true by sequence rather than by hoping the old page went quiet.
 *
 * A tab that is already on the target session is left completely alone. Reloading a page to move it where
 * it already is would be pure damage, and this is the common case when a group re-resolves and only some
 * of its members actually change route.
 */
export class WindowTabsRehost extends WindowTabsNav {
  /**
   * Move one web tab onto `targetSession`, reloading it. Returns whether anything actually changed.
   *
   * Internal (view-less) tabs return `false`: they are rendered by the trusted chrome and have no
   * browsing session to move. That is not a silent skip — an internal tab has no page traffic at all, so
   * there is nothing for a tunnel to carry.
   */
  rehostTab(id: string, targetSession: Session): boolean {
    const record = this.store.get(id);
    if (record === undefined || record.kind !== 'web') return false;

    const old = this.views.get(id);
    if (old !== undefined && old.webContents.session === targetSession) return false;

    const url = record.url;
    const wasActive = this.store.activeId === id;
    const wasHidden = record.hidden === true;

    // ── Tear down first. Nothing may be in flight on the old path past this point. ──
    if (old !== undefined) {
      if (!this.win.isDestroyed()) this.win.contentView.removeChildView(old);
      unwireView(old);
      old.webContents.close();
      this.views.delete(id);
    }

    const view = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        webSecurity: true,
        session: targetSession,
        // Same as tab creation: a tab the AI drives must keep running at full rate off-screen.
        backgroundThrottling: false,
      },
    });
    this.views.set(id, view);
    this.wireView(id, view);
    view.setBounds(this.effectiveBounds());
    // The favicon belonged to the old session's fetch; drop it rather than show a stale icon while the
    // replacement loads.
    this.store.update(id, { isLoading: true, faviconUrl: null });

    if (url.length > 0) {
      void view.webContents.loadURL(url).catch((err: unknown) => {
        // A tunnel that is down makes this fail, and that is the CORRECT outcome: the tab shows a proxy
        // error instead of the page. Falling back to the clear path here would be the leak.
        Logger.warn('Re-hosted tab failed to load', { id, err: String(err) });
      });
    }

    if (wasHidden) {
      // Hidden tabs stay attached and parked off-screen so they keep compositing for the agent.
      this.parkHiddenView(id);
      this.emitState();
    } else if (wasActive) {
      this.activate(id);
    } else {
      this.emitState();
    }
    Logger.info('Tab re-hosted on a new browsing session', { id });
    return true;
  }

  /** The session a tab's page currently runs on, or `undefined` for a view-less internal tab. */
  sessionOfTab(id: string): Session | undefined {
    return this.views.get(id)?.webContents.session;
  }
}
