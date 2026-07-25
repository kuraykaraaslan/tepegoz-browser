import { randomUUID } from 'node:crypto';
import type { TabGroupInfo, TabGroupSettingValue, TabInfo, TabsState } from '@tepegoz/desktop-ipc';
import { DEFAULT_GROUP_COLOR } from './types';
import type { TabGroup, TabGroupColor, TabRecord } from './types';

export type { TabGroup, TabGroupColor, TabKind, TabRecord } from './types';

/**
 * `@tepegoz/tab-engine` — the pure tab-state model: the insertion-ordered set of tabs, tab groups,
 * which tab is active, id allocation, ordering, and the renderer-facing `TabsState` projection. The
 * desktop TabManager owns the WebContentsViews + all Electron I/O and delegates every record mutation
 * here, so this logic is unit-testable without an Electron runtime.
 *
 * Ordering & grouping invariants (ADR-0020) are enforced centrally by {@link normalize}, called at the
 * end of every structural mutation rather than hand-maintained per method:
 *  1. pinned tabs form a run that precedes all unpinned tabs (relative order preserved);
 *  2. each group's members occupy a contiguous run, anchored at the group's first member;
 *  3. pinned tabs cannot belong to a group (pinning clears membership, grouping clears the pin);
 *  4. empty groups are pruned.
 * The canonical order is the `Map` insertion order — there is no per-tab index field.
 */
export class TabStore {
  private readonly tabs = new Map<string, TabRecord>();
  private readonly groups = new Map<string, TabGroup>();
  private activeIdValue: string | null = null;
  private nextId = 1;

  /** Insert a new tab (id is allocated here) and return its id. Appended at the end of the strip. */
  add(
    record: Omit<TabRecord, 'id' | 'pinned' | 'groupId'> &
      Partial<Pick<TabRecord, 'pinned' | 'groupId'>>,
  ): string {
    const id = String(this.nextId++);
    this.tabs.set(id, { id, pinned: false, groupId: null, ...record });
    return id;
  }

  get(id: string): TabRecord | undefined {
    return this.tabs.get(id);
  }

  has(id: string): boolean {
    return this.tabs.has(id);
  }

  delete(id: string): void {
    this.tabs.delete(id);
    this.normalize(); // prunes a group that just lost its last member
  }

  get activeId(): string | null {
    return this.activeIdValue;
  }

  setActive(id: string | null): void {
    this.activeIdValue = id;
  }

  active(): TabRecord | undefined {
    return this.activeIdValue !== null ? this.tabs.get(this.activeIdValue) : undefined;
  }

  /** Insertion-ordered tab ids. */
  ids(): string[] {
    return [...this.tabs.keys()];
  }

  records(): TabRecord[] {
    return [...this.tabs.values()];
  }

  /**
   * Patch a record's mutable view-driven fields (title/url/isLoading/faviconUrl/audible/muted/
   * discarded). Membership (`pinned`/`groupId`) is deliberately excluded — use the dedicated methods so
   * the invariants hold. No-op for an unknown id.
   */
  update(id: string, patch: Partial<Omit<TabRecord, 'id' | 'kind' | 'pinned' | 'groupId'>>): void {
    const rec = this.tabs.get(id);
    if (rec === undefined) return;
    Object.assign(rec, patch);
  }

  /** The id of an existing internal-page tab for `url`, or undefined. */
  findInternal(url: string): string | undefined {
    for (const [id, rec] of this.tabs) {
      if (rec.kind === 'internal' && rec.url === url) return id;
    }
    return undefined;
  }

  /** Reorder so `movedId` sits immediately after `refId` (insertion order), then normalize. */
  placeAfter(movedId: string, refId: string): void {
    if (movedId === refId) return;
    const moved = this.tabs.get(movedId);
    if (moved === undefined) return;
    const entries = [...this.tabs.entries()].filter(([k]) => k !== movedId);
    const idx = entries.findIndex(([k]) => k === refId);
    entries.splice(idx === -1 ? entries.length : idx + 1, 0, [movedId, moved]);
    this.tabs.clear();
    for (const [k, v] of entries) this.tabs.set(k, v);
    this.normalize();
  }

  // ---- Groups & ordering ----------------------------------------------------------------------

  getGroup(id: string): TabGroup | undefined {
    return this.groups.get(id);
  }

  /** Groups in strip order (anchored at each group's first member); empty groups are never present. */
  groupsInOrder(): TabGroup[] {
    const order: TabGroup[] = [];
    const seen = new Set<string>();
    for (const rec of this.tabs.values()) {
      if (rec.groupId !== null && !seen.has(rec.groupId)) {
        seen.add(rec.groupId);
        const g = this.groups.get(rec.groupId);
        if (g !== undefined) order.push(g);
      }
    }
    return order;
  }

  /**
   * Move `id` to `toIndex` in the strip. `intoGroupId` resolves membership: a group id joins that
   * group (and unpins); `null` forces ungrouped; `undefined` infers — the tab joins a group only when
   * it lands strictly inside that group's run (both neighbors share the same group).
   */
  moveTab(id: string, toIndex: number, intoGroupId?: string | null): void {
    const rec = this.tabs.get(id);
    if (rec === undefined) return;
    const order = this.ids().filter((k) => k !== id);
    const clamped = Math.max(0, Math.min(toIndex, order.length));
    order.splice(clamped, 0, id);

    let group: string | null;
    if (intoGroupId === undefined) {
      const prev = clamped > 0 ? this.tabs.get(order[clamped - 1]!) : undefined;
      const next = clamped < order.length - 1 ? this.tabs.get(order[clamped + 1]!) : undefined;
      group =
        prev !== undefined &&
        next !== undefined &&
        prev.groupId !== null &&
        prev.groupId === next.groupId
          ? prev.groupId
          : null;
    } else {
      group = intoGroupId;
    }
    if (group !== null && this.groups.has(group)) {
      rec.pinned = false;
      rec.groupId = group;
    } else {
      rec.groupId = null;
    }
    this.reorderByIds(order);
    this.normalize();
  }

  /** Create a group from `memberIds` (unpinning them). Returns the new group id. `opts.id` lets a
   *  restore pass in the group's previously-persisted (stable) id instead of minting a new one. */
  createGroup(
    opts: {
      id?: string;
      name?: string;
      color?: TabGroupColor;
      collapsed?: boolean;
      settings?: Record<string, TabGroupSettingValue>;
      memberIds?: string[];
    } = {},
  ): string {
    const id = opts.id ?? randomUUID();
    this.groups.set(id, {
      id,
      name: opts.name ?? '',
      color: opts.color ?? DEFAULT_GROUP_COLOR,
      collapsed: opts.collapsed ?? false,
      settings: opts.settings ?? {},
    });
    for (const m of opts.memberIds ?? []) {
      const rec = this.tabs.get(m);
      if (rec !== undefined) {
        rec.pinned = false;
        rec.groupId = id;
      }
    }
    this.normalize();
    return id;
  }

  /** Add `id` to an existing group (unpinning it), appended after the group's current last member. */
  assignToGroup(id: string, groupId: string): void {
    const rec = this.tabs.get(id);
    if (rec === undefined || !this.groups.has(groupId)) return;
    rec.pinned = false;
    rec.groupId = groupId;
    // Reposition to just after the group's last existing member so it joins at the end, leaving the
    // group's anchor (first member) — and thus the group's strip position — unchanged.
    const order = this.ids().filter((k) => k !== id);
    let lastMemberIdx = -1;
    for (let i = 0; i < order.length; i++) {
      if (this.tabs.get(order[i]!)?.groupId === groupId) lastMemberIdx = i;
    }
    order.splice(lastMemberIdx + 1, 0, id);
    this.reorderByIds(order);
    this.normalize();
  }

  /** Remove `id` from its group; it stays ungrouped just after the group's run. */
  removeFromGroup(id: string): void {
    const rec = this.tabs.get(id);
    if (rec === undefined) return;
    rec.groupId = null;
    this.normalize();
  }

  renameGroup(id: string, name: string): void {
    const g = this.groups.get(id);
    if (g !== undefined) g.name = name;
  }

  recolorGroup(id: string, color: TabGroupColor): void {
    const g = this.groups.get(id);
    if (g !== undefined) g.color = color;
  }

  setGroupCollapsed(id: string, collapsed: boolean): void {
    const g = this.groups.get(id);
    if (g !== undefined) g.collapsed = collapsed;
  }

  /** Merge-patch a group's extensible settings bag (`TabGroupSettingKey` → value); only the provided
   *  keys change. This is the per-tab-group settings standard (agent enabled, later VPN/Tor bindings). */
  updateGroupSettings(id: string, patch: Record<string, TabGroupSettingValue>): void {
    const g = this.groups.get(id);
    if (g !== undefined) g.settings = { ...g.settings, ...patch };
  }

  /** Dissolve a group: its members become ungrouped in place, then the group is removed. */
  ungroup(groupId: string): void {
    if (!this.groups.has(groupId)) return;
    for (const rec of this.tabs.values()) if (rec.groupId === groupId) rec.groupId = null;
    this.groups.delete(groupId);
    this.normalize();
  }

  /** Move a whole group's contiguous run so it starts at `toIndex` among the non-member tabs. */
  moveGroup(groupId: string, toIndex: number): void {
    if (!this.groups.has(groupId)) return;
    const order = this.ids();
    const members = order.filter((k) => this.tabs.get(k)?.groupId === groupId);
    if (members.length === 0) return;
    const rest = order.filter((k) => this.tabs.get(k)?.groupId !== groupId);
    const clamped = Math.max(0, Math.min(toIndex, rest.length));
    rest.splice(clamped, 0, ...members);
    this.reorderByIds(rest);
    this.normalize();
  }

  /** Pin a tab (moves to the pinned run; clears any group membership). */
  setPinned(id: string, pinned: boolean): void {
    const rec = this.tabs.get(id);
    if (rec === undefined) return;
    rec.pinned = pinned;
    if (pinned) rec.groupId = null;
    this.normalize();
  }

  /**
   * Mark a tab hidden (removed from the strip but kept alive & rendering) or visible again. Orthogonal
   * to pin/group ordering — a hidden tab may still be pinned or grouped — so this deliberately does NOT
   * `normalize()`: strip order and every pin/group invariant stay exactly as they were.
   */
  setHidden(id: string, hidden: boolean): void {
    const rec = this.tabs.get(id);
    if (rec === undefined) return;
    rec.hidden = hidden;
  }

  /**
   * Re-establish the ordering & grouping invariants (ADR-0020). Idempotent; a no-op when there are no
   * pins or groups (so plain reorders keep their exact result).
   */
  normalize(): void {
    this.enforceMembership(); // (3) pin ⊥ group + drop dangling membership
    this.pruneEmptyGroups(); // (4)
    // (1)+(2) pinned run first, then unpinned with each group clustered at its anchor.
    const pinned = this.records().filter((r) => r.pinned);
    const clustered = this.clusterUnpinned();
    this.reorderByIds([...pinned, ...clustered].map((r) => r.id));
  }

  /** (3) A pinned tab is never grouped, and membership in a vanished group is dropped. */
  private enforceMembership(): void {
    for (const rec of this.tabs.values()) {
      if (rec.groupId === null) continue;
      if (rec.pinned || !this.groups.has(rec.groupId)) rec.groupId = null;
    }
  }

  /** (4) Drop groups that no longer have any member tab. */
  private pruneEmptyGroups(): void {
    const live = new Set<string>();
    for (const rec of this.tabs.values()) if (rec.groupId !== null) live.add(rec.groupId);
    for (const id of this.groups.keys()) if (!live.has(id)) this.groups.delete(id);
  }

  /** (2) The unpinned tabs, each group's members pulled contiguous at the group's first member. */
  private clusterUnpinned(): TabRecord[] {
    const unpinned = this.records().filter((r) => !r.pinned);
    const clustered: TabRecord[] = [];
    const seen = new Set<string>();
    for (const rec of unpinned) {
      if (rec.groupId === null) {
        clustered.push(rec);
        continue;
      }
      if (seen.has(rec.groupId)) continue;
      seen.add(rec.groupId);
      for (const m of unpinned) if (m.groupId === rec.groupId) clustered.push(m);
    }
    return clustered;
  }

  private reorderByIds(order: string[]): void {
    const next = new Map<string, TabRecord>();
    for (const id of order) {
      const rec = this.tabs.get(id);
      if (rec !== undefined) next.set(id, rec);
    }
    for (const [id, rec] of this.tabs) if (!next.has(id)) next.set(id, rec); // safety: keep any omitted
    this.tabs.clear();
    for (const [id, rec] of next) this.tabs.set(id, rec);
  }

  /** Drop all tabs + groups + the active id (id allocation continues where it left off). */
  clear(): void {
    this.tabs.clear();
    this.groups.clear();
    this.activeIdValue = null;
  }

  /**
   * Build the renderer-facing state. The nav flags are read from the active tab's view by the caller
   * (Electron) and injected here, keeping the store pure.
   */
  toState(nav: { canGoBack: boolean; canGoForward: boolean }): TabsState {
    const tabs: TabInfo[] = this.records().map((t) => {
      const info: TabInfo = {
        id: t.id,
        title: t.title,
        url: t.url,
        isLoading: t.isLoading,
        faviconUrl: t.faviconUrl,
        pinned: t.pinned,
        groupId: t.groupId,
      };
      if (t.audible !== undefined) info.audible = t.audible;
      if (t.muted !== undefined) info.muted = t.muted;
      if (t.discarded !== undefined) info.discarded = t.discarded;
      // Keep hidden tabs IN the state (do not filter): the agent's listTabs/webContentsForTab must still
      // see them; the renderer filters them out of the visible strip.
      if (t.hidden !== undefined) info.hidden = t.hidden;
      return info;
    });
    const groups: TabGroupInfo[] = this.groupsInOrder().map((g) => ({
      id: g.id,
      name: g.name,
      color: g.color,
      collapsed: g.collapsed,
      settings: g.settings,
    }));
    return {
      tabs,
      groups,
      activeId: this.activeIdValue,
      canGoBack: nav.canGoBack,
      canGoForward: nav.canGoForward,
    };
  }
}
