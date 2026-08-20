import { type TabGroupSettingValue } from '@tepegoz/desktop-ipc';
import { type TabGroupColor } from '@tepegoz/tab-engine';
import { Logger } from '@tepegoz/libs';
import { WindowTabsClosing } from './tabs-window-closing';
import { involuntaryGroupExitObservers } from './tabs-shared';

/**
 * Tab groups, ordering & pinning layer of the per-window model, split out of `tabs.ts` (ADR-0010
 * 250-line cap). Thin delegates to the pure `TabStore` (invariants + contiguity live there, ADR-0020):
 * each mutates the store then re-emits state so the strip re-renders. Also carries the cross-window
 * membership queries (`hasTab`, `groupMemberIds`) the tear-off primitives build on.
 */
export class WindowTabsGroups extends WindowTabsClosing {
  // ── Groups, ordering & pinning ───────────────────────────────────────────────────────────────

  /** Drag-reorder: move `id` to `toIndex`. `intoGroupId` resolves membership (see TabStore.moveTab). */
  moveTab(id: string, toIndex: number, intoGroupId?: string | null): void {
    if (!this.store.has(id)) return;
    this.store.moveTab(id, toIndex, intoGroupId);
    this.emitState();
  }

  /** Reorder a whole group's run to `toIndex` among the non-member tabs. */
  moveGroup(groupId: string, toIndex: number): void {
    this.store.moveGroup(groupId, toIndex);
    this.emitState();
  }

  /** Create a group from `memberIds` (defaults to the active tab) and return the new group id. */
  createGroup(memberIds?: string[]): string {
    const members =
      memberIds !== undefined && memberIds.length > 0
        ? memberIds.filter((id) => this.store.has(id))
        : this.activeGroupSeed();
    const id = this.store.createGroup({ memberIds: members });
    this.emitState();
    return id;
  }

  /** The default single-member seed for "new group" from a context menu (the clicked/active tab). */
  private activeGroupSeed(): string[] {
    const active = this.store.activeId;
    return active !== null ? [active] : [];
  }

  /** Whether a group with this id still exists (its members may all have been closed). Lets the agent's
   *  per-conversation grouping tell "reuse my group" from "the user closed it → open a fresh one". */
  hasGroup(groupId: string): boolean {
    return this.store.getGroup(groupId) !== undefined;
  }

  assignToGroup(tabId: string, groupId: string): void {
    this.store.assignToGroup(tabId, groupId);
    this.emitState();
  }

  removeFromGroup(tabId: string): void {
    this.store.removeFromGroup(tabId);
    this.emitState();
  }

  renameGroup(groupId: string, name: string): void {
    this.store.renameGroup(groupId, name);
    this.emitState();
  }

  recolorGroup(groupId: string, color: TabGroupColor): void {
    this.store.recolorGroup(groupId, color);
    this.emitState();
  }

  setGroupCollapsed(groupId: string, collapsed: boolean): void {
    this.store.setGroupCollapsed(groupId, collapsed);
    this.emitState();
  }

  /** Merge-patch a group's extensible settings bag (the per-tab-group settings standard). */
  updateGroupSettings(groupId: string, patch: Record<string, TabGroupSettingValue>): void {
    this.store.updateGroupSettings(groupId, patch);
    this.emitState();
  }

  ungroup(groupId: string): void {
    this.store.ungroup(groupId);
    this.emitState();
  }

  /** Open a new tab already assigned to `groupId` (group menu → "New tab in group"). */
  newTabInGroup(groupId: string): void {
    if (this.store.getGroup(groupId) === undefined) return;
    const id = this.createTab();
    if (id === null) return;
    this.store.assignToGroup(id, groupId);
    this.emitState();
  }

  /** Close every tab in a group (group menu → "Close group"). */
  closeGroup(groupId: string): void {
    const memberIds = this.store
      .records()
      .filter((r) => r.groupId === groupId)
      .map((r) => r.id);
    for (const id of memberIds) this.closeTab(id);
  }

  /** The colors + current color of a group, for building the native group menu (undefined if unknown). */
  groupMenuInfo(groupId: string): { color: TabGroupColor } | undefined {
    const g = this.store.getGroup(groupId);
    return g !== undefined ? { color: g.color } : undefined;
  }

  /** Pin / unpin a tab (moves to the pinned run; pinning clears group membership). */
  setPinned(id: string, pinned: boolean): void {
    if (!this.store.has(id)) return;
    // Pinning strips the group. Anything scoped to that group — today the VPN/Tor route — has to be
    // told BEFORE the membership is gone, while the group scope is still readable. An observer must
    // never be able to stop a pin, so a thrown callback is logged and swallowed.
    const losingGroupId = pinned ? (this.store.get(id)?.groupId ?? null) : null;
    if (losingGroupId !== null) {
      for (const observe of involuntaryGroupExitObservers) {
        try {
          observe(id, losingGroupId);
        } catch (err) {
          Logger.warn('involuntary group-exit observer failed', { err: String(err) });
        }
      }
    }
    this.store.setPinned(id, pinned);
    this.emitState();
  }

  // ── Cross-window move primitives (tear-off / merge) ────────────────────────────────────────────

  /** Whether a tab / group id currently lives in this window's store. */
  hasTab(id: string): boolean {
    return this.store.has(id);
  }

  /** The tab ids of a group's contiguous run in this window (strip order), or [] when unknown. */
  groupMemberIds(groupId: string): string[] {
    return this.store
      .records()
      .filter((r) => r.groupId === groupId)
      .map((r) => r.id);
  }
}
