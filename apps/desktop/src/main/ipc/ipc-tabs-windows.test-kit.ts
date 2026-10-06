import { vi } from 'vitest';

/**
 * Shared test kit for the window/tabs/popup IPC suites (`ipc-tabs-windows*.electron.test.ts`).
 *
 * `registerTabsWindowsIpc` binds ~60 listeners against Electron's `ipcMain`, the per-window tab manager,
 * the popup manager, the native menus and the quit state. Each suite that drives it needs the same fakes;
 * they live here once. The `vi.mock(...)` registrations stay in each spec (they are hoisted per file) but
 * just hand back the module-shaped objects built here. Test-only (imports `vitest`), loaded via
 * `vi.hoisted`.
 */

export interface Anchor {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const TRUSTED = 'app://tepegoz/chrome.html';
export const UNTRUSTED = 'https://evil.example/pwn';
export const ANCHOR: Anchor = { x: 10, y: 20, width: 30, height: 40 };

interface Harness {
  listeners: Map<string, (event: unknown, payload: unknown) => void>;
  handlers: Map<string, (event: unknown, payload: unknown) => unknown>;
  window: unknown;
  quits: number;
  markQuittingAt: number[];
  quitAt: number[];
  clock: number;
}

export function createTabsWindowsHarness() {
  const h: Harness = {
    listeners: new Map(),
    handlers: new Map(),
    window: null,
    quits: 0,
    markQuittingAt: [],
    quitAt: [],
    clock: 0,
  };
  const relaunches = { count: 0 };

  /** The `electron` module as the handlers see it: `ipcMain` registrations land in `h`. */
  const electronMock = {
    app: {
      quit: () => {
        h.clock += 1;
        h.quitAt.push(h.clock);
        h.quits += 1;
      },
      relaunch: () => {
        relaunches.count += 1;
      },
      isPackaged: false,
      getLocale: () => 'en',
    },
    ipcMain: {
      handle: (channel: string, fn: (event: unknown, payload: unknown) => unknown) => {
        h.handlers.set(channel, fn);
      },
      on: (channel: string, fn: (event: unknown, payload: unknown) => void) => {
        h.listeners.set(channel, fn);
      },
      removeHandler: () => undefined,
    },
    BrowserWindow: { fromWebContents: () => h.window },
  };

  const libsLogger = {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    redact: (s: string) => s,
  };

  /** The tab manager the sender window resolves to, and the three lookup paths that can reach it. */
  const tabs = {
    api: {
      navigateActive: vi.fn(),
      setContentBounds: vi.fn(),
      setContentVisible: vi.fn(),
      captureActive: vi.fn(() => Promise.resolve('data:image/png;base64,AAA')),
      getState: vi.fn<() => Record<string, unknown>>(() => ({
        tabs: [{ id: 't-1' }],
        groups: [],
        activeId: 't-1',
        canGoBack: true,
        canGoForward: false,
      })),
      renameGroup: vi.fn(),
      recolorGroup: vi.fn(),
      setGroupCollapsed: vi.fn(),
      updateGroupSettings: vi.fn(),
      hideTab: vi.fn(),
      showTab: vi.fn(),
      unhideTab: vi.fn(),
      createTab: vi.fn(),
      closeTab: vi.fn(),
      activate: vi.fn(),
      moveTab: vi.fn(),
      setPinned: vi.fn(),
      createGroup: vi.fn(),
      moveGroup: vi.fn(),
      assignToGroup: vi.fn(),
      removeFromGroup: vi.fn(),
      ungroup: vi.fn(),
      goBack: vi.fn(),
      goForward: vi.fn(),
      reloadActive: vi.fn(),
      goHome: vi.fn(),
      reopenClosedTab: vi.fn(),
    },
    /** `undefined` models "this window has no tab manager" — the teardown case. All three lookups
     *  return `WindowTabs | undefined` (`tabs-manager-base.ts`), and the group-update path checks
     *  `=== undefined` explicitly rather than optional-chaining, so the distinction is load-bearing. */
    resolve: undefined as Record<string, unknown> | undefined,
    /** The three lookup paths, asserted on directly rather than through the imported class: which one a
     *  handler picks is the difference between routing to the SENDER window and to the focused one. */
    forWindow: vi.fn(),
    forSenderWindow: vi.fn(),
    forSender: vi.fn(),
  };

  const tabsModule = {
    default: {
      forWindow: (win: unknown) => {
        tabs.forWindow(win);
        return tabs.resolve;
      },
      forSenderWindow: (win: unknown) => {
        tabs.forSenderWindow(win);
        return tabs.resolve;
      },
      forSender: (wc: unknown) => {
        tabs.forSender(wc);
        return tabs.resolve;
      },
    },
  };

  const popups = {
    opened: [] as Record<string, unknown>[],
    submenus: [] as Record<string, unknown>[],
    resized: [] as number[],
    closed: 0,
    closedSub: 0,
  };

  const popupModule = {
    default: {
      open: (options: Record<string, unknown>) => popups.opened.push(options),
      openSubmenu: (options: Record<string, unknown>) => popups.submenus.push(options),
      resize: (_win: unknown, height: number) => popups.resized.push(height),
      close: () => {
        popups.closed += 1;
      },
      closeSub: () => {
        popups.closedSub += 1;
      },
    },
  };

  const recovery = { undo: vi.fn() };
  const extensions = {
    manifests: new Map<string, { id: string; surfaces: string[] }>(),
  };
  const quit = { marks: 0 };
  const quitStateModule = {
    markQuitting: () => {
      h.clock += 1;
      h.markQuittingAt.push(h.clock);
      quit.marks += 1;
    },
  };

  const menus = {
    tab: vi.fn(),
    hidden: vi.fn(),
    navHistory: vi.fn(),
    bookmark: vi.fn(),
    extension: vi.fn(),
    group: vi.fn(),
    pageAction: vi.fn(),
    pageContribAction: vi.fn(),
  };

  const senderWindow = {
    id: 1,
    minimize: vi.fn(),
    maximize: vi.fn(),
    unmaximize: vi.fn(),
    close: vi.fn(),
    isMaximized: vi.fn(() => false),
  };

  function event(url: string) {
    return { senderFrame: { url }, sender: { id: 99 } };
  }

  /** Fire an `ipcMain.on` listener as a frame at `url` would. */
  function fire(channel: string, url: string, payload?: unknown): void {
    h.listeners.get(channel)?.(event(url), payload);
  }

  /** Invoke an `ipcMain.handle` handler as a frame at `url` would. */
  async function call(channel: string, url: string, payload?: unknown): Promise<unknown> {
    const fn = h.handlers.get(channel);
    if (fn === undefined) throw new Error(`no handler for ${channel}`);
    return await fn(event(url), payload);
  }

  /** The most recent `PopupWindowManager.open` options, or undefined if it was never called. */
  function lastPopup(): Record<string, unknown> | undefined {
    return popups.opened.at(-1);
  }

  /** The shared `beforeEach` body: reset every fake, ahead of `registerTabsWindowsIpc()`. */
  const reset = (): void => {
    h.listeners.clear();
    h.handlers.clear();
    h.window = senderWindow;
    h.clock = 0;
    h.markQuittingAt.length = 0;
    h.quitAt.length = 0;
    h.quits = 0;
    quit.marks = 0;
    popups.opened.length = 0;
    popups.submenus.length = 0;
    popups.resized.length = 0;
    popups.closed = 0;
    popups.closedSub = 0;
    relaunches.count = 0;
    extensions.manifests.clear();
    tabs.resolve = tabs.api;
    vi.clearAllMocks();
  };

  return {
    h,
    relaunches,
    electronMock,
    libsLogger,
    tabs,
    tabsModule,
    popups,
    popupModule,
    recovery,
    extensions,
    quit,
    quitStateModule,
    menus,
    senderWindow,
    fire,
    call,
    lastPopup,
    reset,
  };
}
