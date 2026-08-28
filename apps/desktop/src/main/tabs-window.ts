import { type PersistedGroup, type PersistedTab, type WindowSnapshot } from '@tepegoz/persistence';
import { isWebUrl } from './lib/navigation-url';
import { asGroupColor } from './tabs-popup-policy';
import { WindowTabsDiscard } from './tabs-window-discard';
import { takeClosedTab } from './tabs-shared';

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
 * moves → navigation → rehost → discard) that live in sibling `tabs-window-*` modules (ADR-0010
 * 250-line cap); this final class adds session restore/snapshot on top.
 */
export class WindowTabs extends WindowTabsDiscard {
  // ── Session restore ────────────────────────────────────────────────────────────────────────────

  /** Reopen a closed tab: the most recent one (Ctrl+Shift+T), or the entry `id` names (the History
   *  menu's "Recently closed" section). No-op when the list is empty or the id is already gone. */
  reopenClosedTab(id?: string): void {
    const closed = takeClosedTab(id);
    if (closed !== undefined) this.createTab(closed.url);
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
      const tab: PersistedTab = { url, pinned: rec.pinned, groupId: rec.groupId };
      if (rec.hidden === true) tab.hidden = true; // survive restart as a hidden (kept-alive) tab
      tabs.push(tab);
    }
    // Only persist groups that still own at least one persisted (web) tab.
    const liveGroups = new Set(tabs.map((t) => t.groupId).filter((g): g is string => g !== null));
    const groups: PersistedGroup[] = this.store
      .groupsInOrder()
      .filter((g) => liveGroups.has(g.id))
      .map((g) => ({
        id: g.id,
        name: g.name,
        color: g.color,
        collapsed: g.collapsed,
        settings: g.settings,
      }));
    const snap: WindowSnapshot = { tabs, groups, activeIndex };
    if (!this.win.isDestroyed()) {
      const b = this.win.getBounds();
      snap.bounds = { x: b.x, y: b.y, width: b.width, height: b.height };
    }
    return snap;
  }

  /**
   * Restore one window's persisted tabs into THIS window. Returns the ids of the tabs it actually
   * created — empty when nothing was restored (the caller then opens a default blank tab).
   *
   * Ids rather than a bare boolean because the restore has to be undoable: the toast raised after an
   * unclean shutdown closes exactly these tabs and nothing the user opened afterwards, which is only
   * expressible if the restore says which tabs were its own.
   */
  restoreWindow(snap: WindowSnapshot): string[] {
    if (snap.tabs.length === 0) return [];

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
        .map((t, i) => (t.groupId === pg.id ? (createdIds[i] ?? null) : null))
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

    // 3. Restore hidden state, then park each hidden tab's view (attached, off-screen, stable size) so it
    //    keeps rendering exactly like a live hidden tab — never detached, never reloaded.
    snap.tabs.forEach((t, i) => {
      const id = createdIds[i];
      if (t.hidden === true && id !== null && id !== undefined) this.store.setHidden(id, true);
    });
    for (const rec of this.store.records()) {
      if (rec.hidden === true) this.parkHiddenView(rec.id);
    }

    // 4. Activate the persisted active tab by id (robust to the normalized reordering). If it — or the tab
    //    createTab left active — is hidden, fall back to the last visible tab so a hidden tab is never
    //    surfaced (a real snapshot always keeps ≥1 visible tab).
    let activeId =
      snap.activeIndex >= 0 && snap.activeIndex < createdIds.length
        ? createdIds[snap.activeIndex]
        : undefined;
    if (activeId !== undefined && activeId !== null && this.store.get(activeId)?.hidden === true) {
      activeId = this.lastVisibleId() ?? undefined;
    }
    if ((activeId === undefined || activeId === null) && this.store.active()?.hidden === true) {
      activeId = this.lastVisibleId() ?? undefined;
    }
    if (activeId !== undefined && activeId !== null) this.activate(activeId);
    else this.emitState();
    // A `null` entry is a tab whose `tab:create` an extension interceptor blocked — it was never
    // created, so it is not ours to undo.
    return createdIds.filter((id): id is string => id !== null && id !== undefined);
  }
}
