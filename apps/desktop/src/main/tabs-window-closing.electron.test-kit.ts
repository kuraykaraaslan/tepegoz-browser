import { EventEmitter } from 'node:events';
import { vi } from 'vitest';

const { WindowTabsClosing } = await import('./tabs-window-closing');

/**
 * Fakes shared by the `tabs-window-closing` suites: a `WebContents` / `WebContentsView` pair that
 * reproduces Electron nulling `view.webContents` on destroy, a fake window, and a harness over
 * `WindowTabsClosing`. The `vi.mock` preamble stays in each spec (hoisted per file); this module is
 * imported by them, so its `./tabs-window-closing` import resolves against those mocks.
 */

export class FakeContents extends EventEmitter {
  destroyed = false;
  closeCalls: unknown[] = [];
  navigationHistory = { canGoBack: () => false, canGoForward: () => false };
  getZoomFactor(): number {
    return 1;
  }
  constructor(private readonly view: FakeView) {
    super();
  }
  isDestroyed(): boolean {
    return this.destroyed;
  }
  getURL(): string {
    return 'https://github.com/anthropics/claude-code/releases';
  }
  close(opts?: unknown): void {
    this.closeCalls.push(opts);
  }
  reloadCalls = 0;
  reload(): void {
    this.reloadCalls++;
  }
  /** What Chromium does a tick later when the page had no `beforeunload` to run — including the part
   *  the old code did not survive: the view's `webContents` property is gone before we are told. */
  electronDestroys(): void {
    this.destroyed = true;
    this.view.webContents = undefined;
    this.emit('destroyed');
  }
}

export class FakeView {
  webContents: FakeContents | undefined;
  boundsCalls: unknown[] = [];
  constructor() {
    this.webContents = new FakeContents(this);
  }
  setBounds(b: unknown): void {
    this.boundsCalls.push(b);
  }
}

export const sent: unknown[] = [];
export function fakeWindow() {
  const children: unknown[] = [];
  return {
    isDestroyed: () => false,
    close: vi.fn(),
    setTitle: vi.fn(),
    getContentSize: () => [1200, 800],
    webContents: {
      send: (_channel: string, state: unknown) => {
        sent.push(state);
      },
    },
    contentView: {
      children,
      addChildView: (v: unknown) => children.push(v),
      removeChildView: (v: unknown) => {
        const i = children.indexOf(v);
        if (i !== -1) children.splice(i, 1);
      },
    },
  };
}

export const ipView = (): Electron.WebContentsView => ({}) as unknown as Electron.WebContentsView;

/** Reaches the protected store/views the real code owns, so a test can stage a wired web tab. */
export class Harness extends WindowTabsClosing {
  seedWebTab(view: FakeView): string {
    const id = this.store.add({
      kind: 'web',
      title: 'Releases',
      url: 'https://github.com/anthropics/claude-code/releases',
      isLoading: false,
      faviconUrl: null,
    });
    this.views.set(id, view as unknown as Electron.WebContentsView);
    return id;
  }
  /** Put `id` into a fresh named group. */
  seedGroup(id: string, name: string, color: 'blue' | 'green'): void {
    this.store.createGroup({ name, color, memberIds: [id] });
  }
  seedInternalTab(url: string): string {
    return this.store.add({
      kind: 'internal',
      title: 'Internal',
      url,
      isLoading: false,
      faviconUrl: null,
    });
  }
  /** An internal tab that opted into a real page view (settings et al.) — the view lives in the
   *  separate `internalPageViews` map, never in `views`. */
  seedInternalTabWithView(url: string, view: FakeView): string {
    const id = this.seedInternalTab(url);
    this.internalPageViews.set(id, view as unknown as Electron.WebContentsView);
    return id;
  }
  /** The real `createTab` builds a live `WebContentsView`; override it with a store-only stub so
   *  `createTabRight` / `duplicateTab` are exercisable without Electron. */
  override createTab(
    url?: string,
    opts?: { background?: boolean; openerId?: string | undefined },
  ): string | null {
    void opts;
    return this.store.add({
      kind: 'web',
      title: 'New',
      url: url ?? 'about:blank',
      isLoading: false,
      faviconUrl: null,
    });
  }
  /** The view-wiring host the base hands to `wireView` — its `closeTab` is the override under test. */
  wiringHost(): { closeTab: (id: string) => void } {
    return this.viewWiringHost();
  }
  tabIds(): string[] {
    return this.store.ids();
  }
  activeId(): string | null {
    return this.store.activeId;
  }
  isHidden(id: string): boolean {
    return this.store.get(id)?.hidden === true;
  }
  hasView(id: string): boolean {
    return this.views.has(id);
  }
}

export function harness(isPrivate = false): { tabs: Harness; win: ReturnType<typeof fakeWindow> } {
  const win = fakeWindow();
  const tabs = new Harness(win as unknown as Electron.BrowserWindow, isPrivate);
  return { tabs, win };
}
