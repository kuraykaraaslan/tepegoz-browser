import { WindowTabsGroups } from './tabs-window-groups';
import { type DetachedTab } from './tabs-shared';
import { unwireView } from './tabs-view-wiring';

/**
 * Cross-window tear-off / merge layer of the per-window model, split out of `tabs.ts` (ADR-0010
 * 250-line cap). `detachTab` removes a tab from this window while keeping its live `WebContentsView`
 * (and webContents) ALIVE; `adoptTab` re-homes that view into another window bound to its instance —
 * never a reload. `TabManager` coordinates the pair for a tear-off/merge gesture.
 */
export class WindowTabsMoves extends WindowTabsGroups {
  /**
   * Remove a tab from THIS window WITHOUT destroying its view, returning everything needed to re-home it
   * in another window (`adoptTab`). The `WebContentsView` + its live webContents survive — the caller
   * must adopt it or the view leaks. Reselects the active tab / closes an emptied window, exactly like
   * `closeTab`. Returns `null` for an unknown id.
   */
  detachTab(id: string): DetachedTab | null {
    const rec = this.store.get(id);
    if (rec === undefined) return null;
    const group = rec.groupId !== null ? (this.store.getGroup(rec.groupId) ?? null) : null;
    const view = this.views.get(id) ?? null;
    if (view !== null) {
      this.win.contentView.removeChildView(view);
      unwireView(view); // drop OUR handlers; the destination re-wires bound to itself
      this.views.delete(id);
    }
    const detached: DetachedTab = {
      record: { ...rec },
      view,
      group: group !== null ? { ...group } : null,
    };
    const wasActive = this.store.activeId === id;
    this.store.delete(id);
    this.afterRemove(wasActive);
    return detached;
  }

  /**
   * Adopt a tab detached from another window into THIS window. Mints a FRESH id (ids are per-store),
   * re-creates the source group (reusing its stable UUID) when the tab was grouped, re-wires the live
   * view bound to this instance (no reload), and focuses it at `atIndex` (appended when omitted).
   */
  adoptTab(detached: DetachedTab, atIndex?: number): string {
    const { record, view, group } = detached;
    const newId = this.store.add({
      kind: record.kind,
      title: record.title,
      url: record.url,
      isLoading: record.isLoading,
      faviconUrl: record.faviconUrl,
      pinned: record.pinned,
    });
    if (view !== null) {
      this.views.set(newId, view);
      this.wireView(newId, view);
    }
    if (group !== null) {
      if (this.store.getGroup(group.id) === undefined) {
        this.store.createGroup({
          id: group.id,
          name: group.name,
          color: group.color,
          collapsed: group.collapsed,
          settings: group.settings,
        });
      }
      this.store.assignToGroup(newId, group.id);
    }
    if (atIndex !== undefined) {
      this.store.moveTab(newId, atIndex, group !== null ? group.id : null);
    }
    this.activate(newId); // a merged/torn tab takes focus in its new window (Chrome parity)
    return newId;
  }
}
