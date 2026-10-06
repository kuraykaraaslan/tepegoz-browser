import { vi } from 'vitest';

/**
 * Shared fixtures for the `tabs-window` suites: a fake `BrowserWindow` and a `WindowTabs` harness
 * exposing the protected surface the tests drive. The `vi.mock` preamble stays in each spec file (Vitest
 * hoists it per file); this module is imported by those specs, so its `./tabs-window` import resolves
 * against their mocks.
 */

const { WindowTabs } = await import('./tabs-window');

export function fakeWindow() {
  const children: unknown[] = [];
  return {
    isDestroyed: () => false,
    close: vi.fn(),
    setTitle: vi.fn(),
    getContentSize: () => [1200, 800],
    getBounds: () => ({ x: 10, y: 20, width: 800, height: 600 }),
    webContents: { send: vi.fn() },
    contentView: {
      children,
      addChildView: (v: unknown) => children.push(v),
      removeChildView: vi.fn(),
    },
  };
}

export class Harness extends WindowTabs {
  addWeb(url = 'https://x.test/', over: Record<string, unknown> = {}): string {
    return this.store.add({
      kind: 'web',
      title: 't',
      url,
      isLoading: false,
      faviconUrl: null,
      ...over,
    });
  }
  addInternal(): string {
    return this.store.add({
      kind: 'internal',
      title: 's',
      url: 'tepegoz://settings',
      isLoading: false,
      faviconUrl: null,
    });
  }
  setActive(id: string): void {
    this.store.setActive(id);
  }
  activeId(): string | null {
    return this.store.activeId;
  }
  group(id: string): { name: string; collapsed: boolean } | undefined {
    return this.store.groupsInOrder().find((g) => g.id === id);
  }
  makeGroup(name: string, memberIds: string[]): string {
    return this.store.createGroup({ name, color: 'blue', collapsed: false, memberIds });
  }
  fakeView(id: string, url: string | null): void {
    this.views.set(id, {
      webContents: { isDestroyed: () => url === null, getURL: () => url ?? '' },
    } as never);
  }
  count(): number {
    return this.store.records().length;
  }
  record(id: string): { kind: string } | undefined {
    return this.store.get(id);
  }
  viewSetBounds(id: string): ReturnType<typeof vi.fn> {
    return (this.views.get(id) as unknown as { setBounds: ReturnType<typeof vi.fn> }).setBounds;
  }
  park(id: string): void {
    this.parkHiddenView(id);
  }
  /** Directly seed a backing internal-page view for `id` (the real path needs `hasRealPage`). */
  seedIpv(id: string, view: unknown): void {
    this.internalPageViews.set(id, view as never);
  }
  /** The view-wiring host the base builds for `wireView` — its `createTab`/`emitState` arrows. */
  wiringHost(): {
    createTab: (u?: string, o?: unknown) => void;
    emitState: () => void;
    getBounds: () => unknown;
    closeTab: () => void;
  } {
    return this.viewWiringHost() as never;
  }
  /** The size-a-view rectangle decision (exercises the destroyed-window branch). */
  effBounds(): unknown {
    return this.effectiveBounds();
  }
}
