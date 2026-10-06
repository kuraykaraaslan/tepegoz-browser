import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { WebContents } from 'electron';

/**
 * Unit tests for the agent BrowserHost's cursor-overlay and on-screen wiring
 * (`browser-host-input.electron`): the per-tab adapter's cursor-move push to the focused window and its
 * on-screen predicate. Every Electron/native seam is mocked so the host runs without loading Electron.
 */

const h = vi.hoisted(() => {
  let nextWcId = 1;
  /** Every CDP command each fake tab received, keyed by its WebContents id. */
  const sends = new Map<number, string[]>();
  const wc = (url = 'https://e.com', title = 'E'): WebContents => {
    const id = nextWcId++;
    sends.set(id, []);
    return {
      id,
      isDestroyed: () => false,
      getURL: () => url,
      getTitle: () => title,
      // readPage evaluates a text+signature probe in the page; the shape is all these tests need.
      executeJavaScript: () => Promise.resolve({ text: '', sig: '' }),
      debugger: {
        sendCommand: (method: string) => {
          sends.get(id)?.push(method);
          return Promise.resolve({});
        },
      },
    } as unknown as WebContents;
  };
  type Adapter = unknown;
  return {
    wc,
    sends,
    /** Constructor args of every HumanInputAdapter the host built (one per tab). */
    adapterArgs: [] as unknown[][],
    cdp: {
      clickElement: vi.fn<(wc: WebContents, ref: number, a?: Adapter) => Promise<unknown>>(() =>
        Promise.resolve({ ok: true }),
      ),
      fillElement: vi.fn<
        (wc: WebContents, ref: number, t: string, a?: Adapter) => Promise<unknown>
      >(() => Promise.resolve({ ok: true })),
      scrollPage: vi.fn<(wc: WebContents, d: string, n?: number, a?: Adapter) => Promise<void>>(
        () => Promise.resolve(),
      ),
      sendKeys: vi.fn<(wc: WebContents, keys: string, a?: Adapter) => Promise<unknown>>(() =>
        Promise.resolve({ ok: true }),
      ),
      pressKey: vi.fn<(wc: WebContents, key: string, a?: Adapter) => Promise<unknown>>(() =>
        Promise.resolve({ ok: true }),
      ),
      hoverElement: vi.fn<(wc: WebContents, ref: number, a?: Adapter) => Promise<void>>(() =>
        Promise.resolve(),
      ),
      snapshotElements: vi.fn<(wc: WebContents, opts: unknown) => Promise<unknown>>(() =>
        Promise.resolve({ elements: [] }),
      ),
      readElementValue: vi.fn<(wc: WebContents, ref: number) => Promise<unknown>>(() =>
        Promise.resolve('v'),
      ),
      networkSince: vi.fn<(wc: WebContents, since: number) => unknown[]>(() => []),
      networkRequestsSince: vi.fn<(wc: WebContents, since: number) => unknown[]>(() => []),
      interceptionsSince: vi.fn<(wc: WebContents, since: number) => unknown[]>(() => []),
      consoleSince: vi.fn<(wc: WebContents, since: number) => unknown[]>(() => []),
      styleOfRef: vi.fn<(wc: WebContents, ref: number) => Promise<unknown>>(() =>
        Promise.resolve(null),
      ),
      queryElements: vi.fn<(wc: WebContents, query: string, queryType: string) => Promise<unknown>>(
        () => Promise.resolve({ ok: true, total: 0, matches: [] }),
      ),
      selectOption: vi.fn<(wc: WebContents, ref: number, value: string) => Promise<unknown>>(() =>
        Promise.resolve({ ok: true }),
      ),
    },
    tabs: {
      viewlessActiveTabId: vi.fn<() => string | null>(() => null),
      activeTabId: vi.fn<() => string | null>(() => null),
      closeTab: vi.fn<(id: string) => void>(),
      webContentsForTab: vi.fn<(id: string) => WebContents | null>(() => null),
      activeWebContents: vi.fn<() => WebContents | null>(() => null),
      navigateActive: vi.fn<(url: string) => void>(),
      navigateTab: vi.fn<(id: string, url: string) => boolean>(() => true),
      activate: vi.fn<(id: string) => void>(),
      getState: vi.fn<() => { tabs: { id: string }[]; activeId: string | null }>(() => ({
        tabs: [],
        activeId: null,
      })),
      focusedWindow: vi.fn<() => unknown>(() => null),
      getContentBounds: vi.fn<() => { x: number; y: number }>(() => ({ x: 0, y: 0 })),
    },
    openTab: vi.fn<(group: string, url?: string) => string>(() => 'web-2'),
    ensureUntranslatedForAgent: vi.fn<(wc: WebContents) => Promise<void>>(() => Promise.resolve()),
  };
});

vi.mock('../tabs', () => ({ default: h.tabs }));
vi.mock('./agent-tab-group.electron', () => ({
  default: { openTab: h.openTab, ownsTab: vi.fn(() => false), releaseTab: vi.fn() },
}));
vi.mock('./cdp-driver.electron', () => ({
  default: {
    waitForPageSettled: vi.fn(() => Promise.resolve()),
    clickElement: h.cdp.clickElement,
    fillElement: h.cdp.fillElement,
    scrollPage: h.cdp.scrollPage,
    sendKeys: h.cdp.sendKeys,
    pressKey: h.cdp.pressKey,
    hoverElement: h.cdp.hoverElement,
    snapshotElements: h.cdp.snapshotElements,
    readElementValue: h.cdp.readElementValue,
    networkSince: h.cdp.networkSince,
    networkRequestsSince: h.cdp.networkRequestsSince,
    interceptionsSince: h.cdp.interceptionsSince,
    consoleSince: h.cdp.consoleSince,
    styleOfRef: h.cdp.styleOfRef,
    queryElements: h.cdp.queryElements,
    selectOption: h.cdp.selectOption,
  },
}));
vi.mock('../extensions/translate-page-injector-controller.electron', () => ({
  default: { ensureUntranslatedForAgent: h.ensureUntranslatedForAgent },
}));
vi.mock('./page-cursor.electron', () => ({
  showPageCursor: vi.fn(),
  hidePageCursor: vi.fn(),
  isUserControlActive: vi.fn(() => false),
  resetForAgentAction: vi.fn(),
}));
vi.mock('@tepegoz/human-input', () => ({
  HumanInputAdapter: class {
    constructor(...args: unknown[]) {
      h.adapterArgs.push(args);
    }
  },
}));

// Imported AFTER the mocks so the module wires against them.
const { browserHost } = await import('./browser-host.electron');

let rwid = 5000;
/** A WebContents rich enough for historyGo / captureScreenshot / waitForCondition (h.wc is text-only). */
function richWc(over: Record<string, unknown> = {}): WebContents {
  return {
    id: rwid++,
    isDestroyed: () => false,
    getURL: () => 'https://rich.test/',
    getTitle: () => 'Rich',
    executeJavaScript: () => Promise.resolve({}),
    reload: vi.fn(),
    navigationHistory: {
      canGoBack: () => true,
      canGoForward: () => true,
      goBack: vi.fn(),
      goForward: vi.fn(),
    },
    debugger: { sendCommand: () => Promise.resolve({}) },
    ...over,
  } as unknown as WebContents;
}

describe('cursor overlay wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.adapterArgs.length = 0;
  });

  it("a tab adapter's cursor-move pushes the overlay to the focused window when that tab is visible", async () => {
    const wc = richWc();
    h.tabs.webContentsForTab.mockReturnValue(wc);
    h.tabs.activeWebContents.mockReturnValue(wc); // isVisibleTab → true
    const send = vi.fn();
    h.tabs.focusedWindow.mockReturnValue({ isDestroyed: () => false, webContents: { send } });
    h.tabs.getContentBounds.mockReturnValue({ x: 100, y: 40 });

    await browserHost.clickElement(1, 'tab-vis'); // builds the adapter for wc
    const cursorMove = h.adapterArgs.at(-1)?.[1] as (x: number, y: number) => void;
    cursorMove(10, 20);

    expect(send).toHaveBeenCalledWith(expect.anything(), { x: 110, y: 60, visible: true });
  });

  it('the overlay push is a no-op when there is no focused window', async () => {
    const wc = richWc();
    h.tabs.webContentsForTab.mockReturnValue(wc);
    h.tabs.activeWebContents.mockReturnValue(wc);
    h.tabs.focusedWindow.mockReturnValue(null);

    await browserHost.clickElement(1, 'tab-vis');
    const cursorMove = h.adapterArgs.at(-1)?.[1] as (x: number, y: number) => void;

    expect(() => {
      cursorMove(5, 5);
    }).not.toThrow();
  });

  it("the adapter's on-screen predicate walks the visible-tab / window-state checks", async () => {
    const wc = richWc();
    h.tabs.webContentsForTab.mockReturnValue(wc);
    h.tabs.activeWebContents.mockReturnValue(wc); // isVisibleTab → true
    h.tabs.focusedWindow.mockReturnValue({
      isDestroyed: () => false,
      isMinimized: () => false,
      isVisible: () => true,
      webContents: { send: vi.fn() },
    });
    h.tabs.getState.mockReturnValue({ tabs: [{ id: 't1' }], activeId: 't1' });

    await browserHost.clickElement(1, 't1');
    const onScreen = h.adapterArgs.at(-1)?.[4] as () => boolean;

    expect(onScreen()).toBe(true);
  });

  it('the on-screen predicate is false for a minimized window', async () => {
    const wc = richWc();
    h.tabs.webContentsForTab.mockReturnValue(wc);
    h.tabs.activeWebContents.mockReturnValue(wc);
    h.tabs.focusedWindow.mockReturnValue({
      isDestroyed: () => false,
      isMinimized: () => true,
      isVisible: () => true,
      webContents: { send: vi.fn() },
    });
    h.tabs.getState.mockReturnValue({ tabs: [{ id: 't1' }], activeId: 't1' });

    await browserHost.clickElement(1, 't1');
    const onScreen = h.adapterArgs.at(-1)?.[4] as () => boolean;

    expect(onScreen()).toBe(false);
  });
});
