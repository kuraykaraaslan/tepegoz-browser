import type { TabInfo, TabsState } from '@tepegoz/desktop-ipc';

export type TabKind = 'web' | 'internal';

/**
 * Pure, Electron-free tab record. A `web` tab is backed by a WebContentsView in the desktop app; an
 * `internal` tab (tepegoz://…) has no view and is rendered by the chrome. The view itself lives in the
 * app's TabManager, NOT here.
 */
export interface TabRecord {
  id: string;
  kind: TabKind;
  title: string;
  url: string;
  isLoading: boolean;
  faviconUrl: string | null;
}

/**
 * `@tepegoz/tab-engine` — the pure tab-state model: the insertion-ordered set of tabs, which one is
 * active, id allocation, ordering, and the renderer-facing `TabsState` projection. The desktop
 * TabManager owns the WebContentsViews + all Electron I/O and delegates every record mutation here, so
 * this logic is unit-testable without an Electron runtime. Extracted from `apps/desktop` per
 * docs/package-map.md.
 */
export class TabStore {
  private readonly tabs = new Map<string, TabRecord>();
  private activeIdValue: string | null = null;
  private nextId = 1;

  /** Insert a new tab (id is allocated here) and return its id. */
  add(record: Omit<TabRecord, 'id'>): string {
    const id = String(this.nextId++);
    this.tabs.set(id, { id, ...record });
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

  /** Patch a record's mutable fields (title/url/isLoading/faviconUrl). No-op for an unknown id. */
  update(id: string, patch: Partial<Omit<TabRecord, 'id' | 'kind'>>): void {
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

  /** Reorder so `movedId` sits immediately after `refId` (insertion order). */
  placeAfter(movedId: string, refId: string): void {
    if (movedId === refId) return;
    const moved = this.tabs.get(movedId);
    if (moved === undefined) return;
    const entries = [...this.tabs.entries()].filter(([k]) => k !== movedId);
    const idx = entries.findIndex(([k]) => k === refId);
    entries.splice(idx === -1 ? entries.length : idx + 1, 0, [movedId, moved]);
    this.tabs.clear();
    for (const [k, v] of entries) this.tabs.set(k, v);
  }

  /** Drop all tabs + clear the active id (id allocation continues where it left off). */
  clear(): void {
    this.tabs.clear();
    this.activeIdValue = null;
  }

  /**
   * Build the renderer-facing state. The nav flags are read from the active tab's view by the caller
   * (Electron) and injected here, keeping the store pure.
   */
  toState(nav: { canGoBack: boolean; canGoForward: boolean }): TabsState {
    const tabs: TabInfo[] = this.records().map((t) => ({
      id: t.id,
      title: t.title,
      url: t.url,
      isLoading: t.isLoading,
      faviconUrl: t.faviconUrl,
    }));
    return {
      tabs,
      activeId: this.activeIdValue,
      canGoBack: nav.canGoBack,
      canGoForward: nav.canGoForward,
    };
  }
}
