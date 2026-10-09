/**
 * Most-recently-used tab order, for Ctrl+Tab in "recent" mode (Firefox / Windows Alt+Tab style).
 *
 * Pure bookkeeping — no Electron, no tab model. The model feeds it the ids that are switchable right now
 * (strip order, hidden tabs already removed) and asks which tab a step lands on.
 *
 * A *cycle* is one held-Ctrl run of Tab presses. It works on a snapshot taken at the first press, so the
 * walk goes deeper into history (A→B→C…) instead of bouncing between the two newest tabs, and nothing is
 * re-ordered until Ctrl is released — only then does the landed-on tab become the most recent.
 */
export class TabRecency {
  private recent: string[] = [];
  private snapshot: string[] | null = null;
  private cursor = 0;

  /** Mark `id` as the most recently used. Ignored mid-cycle: the walk must not reorder its own history. */
  touch(id: string): void {
    if (this.snapshot !== null) return;
    this.recent = [id, ...this.recent.filter((r) => r !== id)];
  }

  /** Drop a closed tab. */
  forget(id: string): void {
    this.recent = this.recent.filter((r) => r !== id);
    if (this.snapshot !== null) {
      const at = this.snapshot.indexOf(id);
      this.snapshot = this.snapshot.filter((r) => r !== id);
      if (at !== -1 && at < this.cursor) this.cursor -= 1;
      if (this.snapshot.length === 0) this.snapshot = null;
    }
  }

  /** `liveIds` most-recent first; tabs never touched follow in strip order. */
  order(liveIds: readonly string[]): string[] {
    const live = new Set(liveIds);
    const seen = this.recent.filter((id) => live.has(id));
    const seenSet = new Set(seen);
    return [...seen, ...liveIds.filter((id) => !seenSet.has(id))];
  }

  get cycling(): boolean {
    return this.snapshot !== null;
  }

  /**
   * One Tab press. The first press of a cycle snapshots the order and lands one step away from the
   * current tab; later presses keep walking (Shift+Tab walks back). `activeId` seeds the cursor so a
   * tab that was never touched still counts as "where we are". Wraps at both ends. `null` = nowhere to go.
   */
  step(liveIds: readonly string[], activeId: string | null, delta: 1 | -1): string | null {
    if (this.snapshot === null) {
      const order = this.order(liveIds);
      if (order.length < 2) return null;
      this.snapshot =
        activeId !== null && order.includes(activeId) ? moveToFront(order, activeId) : order;
      this.cursor = 0;
    }
    const n = this.snapshot.length;
    this.cursor = (this.cursor + delta + n) % n;
    return this.snapshot[this.cursor] ?? null;
  }

  /** Ctrl released: the tab the walk stopped on becomes the most recent. Returns it (null if no cycle). */
  endCycle(): string | null {
    if (this.snapshot === null) return null;
    const landed = this.snapshot[this.cursor] ?? null;
    this.snapshot = null;
    this.cursor = 0;
    if (landed !== null) this.touch(landed);
    return landed;
  }
}

function moveToFront(order: string[], id: string): string[] {
  return [id, ...order.filter((o) => o !== id)];
}
