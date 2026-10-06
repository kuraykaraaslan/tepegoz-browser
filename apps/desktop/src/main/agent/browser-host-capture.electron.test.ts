import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { WebContents } from 'electron';

/**
 * Unit tests for the agent BrowserHost's screenshot capture (`browser-host-capture.electron`): resize to
 * the max edge, full-page pixel-budget truncation, empty-capture 502 and malformed page-size probes.
 * Every Electron/native seam is mocked so the host's pure control flow runs without loading Electron.
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

function fakeImage(w: number, ht: number): Electron.NativeImage {
  return {
    isEmpty: () => false,
    getSize: () => ({ width: w, height: ht }),
    resize: ({ width, height }: { width: number; height: number }) => fakeImage(width, height),
    toDataURL: () => 'data:image/png;base64,AAAA',
  } as unknown as Electron.NativeImage;
}

describe('captureScreenshot', () => {
  beforeEach(() => vi.clearAllMocks());

  it('viewport capture resizes down to the max edge and shapes the result', async () => {
    h.tabs.webContentsForTab.mockReturnValue(
      richWc({
        executeJavaScript: () => Promise.resolve({ width: 2000, height: 1000 }),
        capturePage: () => Promise.resolve(fakeImage(2000, 1000)),
      }),
    );

    const res = await browserHost.captureScreenshot({ tabId: 'tab-1', maxEdge: 1400 });

    expect(res.mode).toBe('viewport');
    expect(res.width).toBe(1400); // 2000 * (1400 / 2000)
    expect(res.height).toBe(700);
    expect(res.mimeType).toBe('image/png');
    expect(res.truncated).toBeUndefined();
  });

  it('a huge full-page capture is truncated to the pixel budget and flagged', async () => {
    let captured: unknown;
    h.tabs.webContentsForTab.mockReturnValue(
      richWc({
        executeJavaScript: () => Promise.resolve({ width: 6000, height: 6000 }),
        capturePage: (rect: unknown) => {
          captured = rect;
          return Promise.resolve(fakeImage(6000, 5000));
        },
      }),
    );

    const res = await browserHost.captureScreenshot({
      tabId: 'tab-1',
      mode: 'fullPage',
      maxEdge: 10000,
    });

    expect(res.truncated).toBe(true);
    expect(captured).toMatchObject({ x: 0, y: 0, width: 6000, height: 5000 });
  });

  it('an empty capture is a 502', async () => {
    h.tabs.webContentsForTab.mockReturnValue(
      richWc({
        executeJavaScript: () => Promise.resolve({ width: 100, height: 100 }),
        capturePage: () =>
          Promise.resolve({ isEmpty: () => true } as unknown as Electron.NativeImage),
      }),
    );

    await expect(browserHost.captureScreenshot({ tabId: 'tab-1' })).rejects.toMatchObject({
      statusCode: 502,
    });
  });

  it('falls back to 1x1 page dimensions for a malformed probe result', async () => {
    h.tabs.webContentsForTab.mockReturnValue(
      richWc({
        executeJavaScript: () => Promise.resolve('not an object'),
        capturePage: () => Promise.resolve(fakeImage(50, 50)),
      }),
    );

    const res = await browserHost.captureScreenshot({ tabId: 'tab-1' });

    expect(res.pageWidth).toBe(1);
    expect(res.pageHeight).toBe(1);
  });

  it('coerces non-finite probe numbers to 1', async () => {
    h.tabs.webContentsForTab.mockReturnValue(
      richWc({
        executeJavaScript: () => Promise.resolve({ width: Number.POSITIVE_INFINITY, height: 'x' }),
        capturePage: () => Promise.resolve(fakeImage(10, 10)),
      }),
    );

    const res = await browserHost.captureScreenshot({ tabId: 'tab-1' });

    expect(res.pageWidth).toBe(1);
    expect(res.pageHeight).toBe(1);
  });
});
