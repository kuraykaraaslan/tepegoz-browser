import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { WebContents } from 'electron';

/**
 * Unit tests for the agent BrowserHost's page-facing operations (`browser-host-page.electron`): history
 * navigation, waits, perception passthroughs, article text and the tolerant diagnostic reads. Every
 * Electron/native seam is mocked so the host's pure control flow runs without loading Electron.
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

describe('historyGo', () => {
  beforeEach(() => vi.clearAllMocks());

  it('steps forward and reports moved when the page can go forward', async () => {
    const goForward = vi.fn();
    const wc = richWc({
      navigationHistory: {
        canGoBack: () => false,
        canGoForward: () => true,
        goBack: vi.fn(),
        goForward,
      },
    });
    h.tabs.webContentsForTab.mockReturnValue(wc);

    const res = await browserHost.historyGo('forward', 'tab-1');

    expect(goForward).toHaveBeenCalled();
    expect(res).toEqual({ url: 'https://rich.test/', title: 'Rich', moved: true });
  });

  it('reports moved:false and does not step when there is no forward entry', async () => {
    const goForward = vi.fn();
    const wc = richWc({
      navigationHistory: {
        canGoBack: () => false,
        canGoForward: () => false,
        goBack: vi.fn(),
        goForward,
      },
    });
    h.tabs.webContentsForTab.mockReturnValue(wc);

    const res = await browserHost.historyGo('forward', 'tab-1');

    expect(goForward).not.toHaveBeenCalled();
    expect(res.moved).toBe(false);
  });

  it('does not step back when there is no back entry', async () => {
    const goBack = vi.fn();
    const wc = richWc({
      navigationHistory: {
        canGoBack: () => false,
        canGoForward: () => false,
        goBack,
        goForward: vi.fn(),
      },
    });
    h.tabs.webContentsForTab.mockReturnValue(wc);

    const res = await browserHost.historyGo('back', 'tab-1');

    expect(goBack).not.toHaveBeenCalled();
    expect(res.moved).toBe(false);
  });

  it('reload always counts as moved', async () => {
    const reload = vi.fn();
    h.tabs.webContentsForTab.mockReturnValue(richWc({ reload }));

    const res = await browserHost.historyGo('reload', 'tab-1');

    expect(reload).toHaveBeenCalled();
    expect(res.moved).toBe(true);
  });
});

describe('keyboard + perception passthroughs', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sendKeys drives CdpDriver.sendKeys with the tab adapter', async () => {
    const wc = richWc();
    h.tabs.webContentsForTab.mockReturnValue(wc);

    const res = await browserHost.sendKeys('hello world', 'tab-1');

    expect(h.cdp.sendKeys).toHaveBeenCalledWith(wc, 'hello world', expect.anything());
    expect(res).toEqual({ ok: true });
  });

  it('snapshotElements forwards the given opts through the untranslated read', async () => {
    const wc = richWc();
    h.tabs.webContentsForTab.mockReturnValue(wc);

    await browserHost.snapshotElements('tab-1', { viewportOnly: true } as never);

    expect(h.cdp.snapshotElements).toHaveBeenCalledWith(wc, { viewportOnly: true });
  });

  it('snapshotElements passes {} when no opts are given', async () => {
    const wc = richWc();
    h.tabs.webContentsForTab.mockReturnValue(wc);

    await browserHost.snapshotElements('tab-1');

    expect(h.cdp.snapshotElements).toHaveBeenCalledWith(wc, {});
  });
});

describe('waitForCondition', () => {
  beforeEach(() => vi.clearAllMocks());

  it('network_idle reuses the driver settle and reports satisfied', async () => {
    h.tabs.webContentsForTab.mockReturnValue(richWc());

    const res = await browserHost.waitForCondition(
      { kind: 'network_idle', timeoutMs: 1000 },
      'tab-1',
    );

    expect(res.satisfied).toBe(true);
  });

  it('a text wait reads the untranslated source (ADR-0042 §3); a structural wait does not', async () => {
    h.tabs.webContentsForTab.mockReturnValue(
      richWc({ executeJavaScript: () => Promise.resolve({ satisfied: true, waitedMs: 1 }) }),
    );

    await browserHost.waitForCondition(
      { kind: 'text', value: 'Merhaba', timeoutMs: 1000 },
      'tab-1',
    );
    expect(h.ensureUntranslatedForAgent).toHaveBeenCalledTimes(1);

    h.ensureUntranslatedForAgent.mockClear();
    await browserHost.waitForCondition(
      { kind: 'selector', value: '#ok', timeoutMs: 1000 },
      'tab-1',
    );
    await browserHost.waitForCondition({ kind: 'network_idle', timeoutMs: 1000 }, 'tab-1');
    expect(h.ensureUntranslatedForAgent).not.toHaveBeenCalled();
  });

  it('an empty target value is unsatisfiable without polling the page', async () => {
    const evaluate = vi.fn();
    h.tabs.webContentsForTab.mockReturnValue(richWc({ executeJavaScript: evaluate }));

    const res = await browserHost.waitForCondition(
      { kind: 'text', value: '', timeoutMs: 1000 },
      'tab-1',
    );

    expect(res).toEqual({ satisfied: false, waitedMs: 0 });
    expect(evaluate).not.toHaveBeenCalled();
  });

  it('a text wait shapes the in-page poll result', async () => {
    h.tabs.webContentsForTab.mockReturnValue(
      richWc({ executeJavaScript: () => Promise.resolve({ satisfied: true, waitedMs: 42 }) }),
    );

    const res = await browserHost.waitForCondition(
      { kind: 'text', value: 'Done', timeoutMs: 1000 },
      'tab-1',
    );

    expect(res).toEqual({ satisfied: true, waitedMs: 42 });
  });

  it('a malformed poll result degrades to not-satisfied with a measured wait', async () => {
    h.tabs.webContentsForTab.mockReturnValue(
      richWc({ executeJavaScript: () => Promise.resolve(null) }),
    );

    const res = await browserHost.waitForCondition(
      { kind: 'selector', value: '#x', timeoutMs: 1000 },
      'tab-1',
    );

    expect(res.satisfied).toBe(false);
    expect(typeof res.waitedMs).toBe('number');
  });
});

describe('readArticleText', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the extractor text + source when well-formed', async () => {
    h.tabs.webContentsForTab.mockReturnValue(
      richWc({
        executeJavaScript: () => Promise.resolve({ text: 'Body copy', source: 'article' }),
      }),
    );

    const res = await browserHost.readArticleText!('tab-1');

    expect(res).toMatchObject({ text: 'Body copy', source: 'article', url: 'https://rich.test/' });
  });

  it('degrades a malformed extractor result to empty body text', async () => {
    h.tabs.webContentsForTab.mockReturnValue(
      richWc({ executeJavaScript: () => Promise.resolve(null) }),
    );

    const res = await browserHost.readArticleText!('tab-1');

    expect(res).toMatchObject({ text: '', source: 'body' });
  });
});

describe('networkSince / interceptionsSince / consoleSince / networkRequestsSince tolerance', () => {
  beforeEach(() => vi.clearAllMocks());

  it('a destroyed target tab yields nothing observed, never an error', async () => {
    h.tabs.webContentsForTab.mockReturnValue(richWc({ isDestroyed: () => true }));

    await expect(browserHost.networkSince(0, 'gone')).resolves.toEqual([]);
    await expect(browserHost.interceptionsSince!(0, 'gone')).resolves.toEqual([]);
    await expect(browserHost.consoleSince!(0, 'gone')).resolves.toEqual([]);
    await expect(browserHost.networkRequestsSince!(0, 'gone')).resolves.toEqual([]);
    await expect(browserHost.styleOfRef!(3, 'gone')).resolves.toBeNull();
    await expect(browserHost.queryElements!('div', 'css', 'gone')).resolves.toMatchObject({
      ok: false,
    });
  });

  it('an undefined tabId reads the active tab', async () => {
    h.tabs.activeWebContents.mockReturnValue(richWc());
    h.cdp.networkSince.mockReturnValue([{ url: 'x' }]);
    h.cdp.consoleSince.mockReturnValue([{ level: 'error', text: 'boom' }]);
    h.cdp.networkRequestsSince.mockReturnValue([{ url: 'y', status: 200 }]);

    await expect(browserHost.networkSince(0)).resolves.toEqual([{ url: 'x' }]);
    await expect(browserHost.consoleSince!(0)).resolves.toEqual([{ level: 'error', text: 'boom' }]);
    await expect(browserHost.networkRequestsSince!(0)).resolves.toEqual([
      { url: 'y', status: 200 },
    ]);
  });

  it('styleOfRef threads the ref + tabId to CdpDriver.styleOfRef', async () => {
    const wc = richWc();
    h.tabs.webContentsForTab.mockReturnValue(wc);
    h.cdp.styleOfRef.mockResolvedValue({ display: 'block', visible: true });

    await expect(browserHost.styleOfRef!(5, 't1')).resolves.toEqual({
      display: 'block',
      visible: true,
    });
    expect(h.cdp.styleOfRef).toHaveBeenCalledWith(wc, 5);
  });

  it('queryElements threads the query/queryType/tabId to CdpDriver.queryElements', async () => {
    const wc = richWc();
    h.tabs.webContentsForTab.mockReturnValue(wc);
    h.cdp.queryElements.mockResolvedValue({
      ok: true,
      total: 1,
      matches: [{ tag: 'div', ref: 1, attributes: {} }],
    });

    await expect(browserHost.queryElements!('#x', 'css', 't1')).resolves.toEqual({
      ok: true,
      total: 1,
      matches: [{ tag: 'div', ref: 1, attributes: {} }],
    });
    expect(h.cdp.queryElements).toHaveBeenCalledWith(wc, '#x', 'css');
  });
});
