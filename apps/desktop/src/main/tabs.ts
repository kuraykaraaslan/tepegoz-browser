import {
  type PersistedGroup,
  type PersistedTab,
  type WindowSnapshot,
} from '@tepegoz/persistence';
import { isWebUrl } from './lib/navigation-url';
import { asGroupColor } from './tabs-popup-policy';
import { WindowTabsNav } from './tabs-window-nav';
import { closedUrls } from './tabs-shared';

export { BROWSING_PARTITION, type DetachedTab, type NavigationObserver } from './tabs-shared';
export { default } from './tabs-manager';

/**
 * L0 tab model. Each tab is an isolated `WebContentsView` in a SEPARATE browsing partition
 * (`persist:tepegoz-web`) from the app chrome (`persist:tepegoz-app`) — browsed pages are untrusted
 * and never share the chrome's session or get the contextBridge. The chrome (tab strip + omnibox)
 * lives in the window's own webContents; the active tab's view is laid into the content area below
 * the chrome using bounds reported by the renderer.
 *
 * The per-window tab state (which tabs exist, which is active, ordering, TabsState projection) lives in
 * a `WindowTabs` instance — one per browser window — and the pure record model in `@tepegoz/tab-engine`'s
 * `TabStore` (unit-tested). `TabManager` is the static registry + facade over those instances: it maps
 * windows↔instances, resolves the sender/focused window for IPC and agent code, and coordinates the
 * cross-window tear-off move primitives (`detachTab`/`adoptTab`).
 *
 * Per-site partition isolation, profiles, and checkpoint/resume are later phases; this is the minimal
 * real browser core.
 *
 * The class is assembled as a chain of cohesive layers (base state + creation → closing → groups →
 * moves → navigation) that live in sibling `tabs-window-*` modules (ADR-0010 250-line cap); this final
 * class adds session restore/snapshot on top.
 */
export class WindowTabs extends WindowTabsNav {
  // ── Session restore ────────────────────────────────────────────────────────────────────────────

  /** Reopen the most-recently-closed tab (Ctrl+Shift+T). No-op when the stack is empty. */
  reopenClosedTab(): void {
    const url = closedUrls.pop();
    if (url !== undefined) this.createTab(url);
  }

  /** This window's restorable snapshot: ordered web tabs (URL + pin + group membership), group metadata,
   *  active index, and window bounds. Internal (view-less) tabs and blank/unloaded tabs are skipped —
   *  only real web pages are restored (ADR-0020). Contributes one entry to the multi-window session. */
  snapshot(): WindowSnapshot {
    const tabs: PersistedTab[] = [];
    let activeIndex = -1;
    for (const rec of this.store.records()) {
      // Prefer the live URL, but on window close the webContents may already be gone — fall back to the
      // last synced record URL so the closing snapshot still captures every tab.
      const wc = this.views.get(rec.id)?.webContents;
      const url = (wc !== undefined && !wc.isDestroyed() ? wc.getURL() : '') || rec.url;
      if (rec.kind !== 'web' || !isWebUrl(url)) continue;
      if (rec.id === this.store.activeId) activeIndex = tabs.length;
      tabs.push({ url, pinned: rec.pinned, groupId: rec.groupId });
    }
    // Only persist groups that still own at least one persisted (web) tab.
    const liveGroups = new Set(
      tabs.map((t) => t.groupId).filter((g): g is string => g !== null),
    );
    const groups: PersistedGroup[] = this.store
      .groupsInOrder()
      .filter((g) => liveGroups.has(g.id))
      .map((g) => ({ id: g.id, name: g.name, color: g.color, collapsed: g.collapsed, settings: g.settings }));
    const snap: WindowSnapshot = { tabs, groups, activeIndex };
    if (!this.win.isDestroyed()) {
      const b = this.win.getBounds();
      snap.bounds = { x: b.x, y: b.y, width: b.width, height: b.height };
    }
    return snap;
  }

  /** Restore one window's persisted tabs into THIS window. Returns true if any tab was restored (so the
   *  caller can skip opening a default blank tab). */
  restoreWindow(snap: WindowSnapshot): boolean {
    if (snap.tabs.length === 0) return false;

    // 1. Recreate tabs in order, remembering the persisted-index → new-tab-id mapping.
    const createdIds = snap.tabs.map((t, i) =>
      // First tab takes focus; the rest open in the background so they don't each steal it.
      this.createTab(t.url, { background: i !== 0 }),
    );

    // 2. Re-create groups with their metadata, then restore membership + pins (order changes as the
    //    store normalizes, so we track the ACTIVE tab by id, not by the persisted index). A `null`
    //    entry means that tab's `tab:create` was blocked by an extension interceptor — skip it.
    for (const pg of snap.groups) {
      const memberIds = snap.tabs
        .map((t, i) => (t.groupId === pg.id ? createdIds[i] ?? null : null))
        .filter((id): id is string => id !== null);
      if (memberIds.length === 0) continue;
      // `id: pg.id` reuses the group's stable (pre-restart) UUID so `settings` stays keyed correctly.
      this.store.createGroup({
        id: pg.id,
        name: pg.name,
        color: asGroupColor(pg.color),
        collapsed: pg.collapsed,
        settings: pg.settings,
        memberIds,
      });
    }
    snap.tabs.forEach((t, i) => {
      const id = createdIds[i];
      if (t.pinned && id !== null && id !== undefined) this.store.setPinned(id, true);
    });

    // 3. Activate the persisted active tab by its new id (robust to the normalized reordering).
    const activeId =
      snap.activeIndex >= 0 && snap.activeIndex < createdIds.length
        ? createdIds[snap.activeIndex]
        : undefined;
    if (activeId !== undefined && activeId !== null) this.activate(activeId);
    else this.emitState();
    return true;
  }
}
