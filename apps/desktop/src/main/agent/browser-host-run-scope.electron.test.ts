import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `browser-host.electron` run-scope wiring — the per-run event channels + `AsyncLocalStorage` ambient
 * run id. Pinned: `setCurrentAgentRun` binds / clears a run's channel; `registerHeadlessRun` binds one
 * with a no-op sender; `emitRunEvent` sends on a named run's channel (no-op for an unknown run);
 * `emitCurrentRunEvent` routes to whichever run owns the current async context and is a no-op outside
 * one; `releaseAgentRun` drops a channel; and `runActiveTabUrl` reports the working tab's URL, latching
 * the run onto the active tab.
 */

vi.mock('@tepegoz/libs', () => ({
  AppError: class AppError extends Error {
    statusCode: number;
    constructor(m: string, s: number) {
      super(m);
      this.statusCode = s;
    }
  },
}));
vi.mock('@tepegoz/human-input', () => ({ HumanInputAdapter: class {} }));
vi.mock('@tepegoz/desktop-ipc', () => ({ IpcChannels: { cursorPosition: 'cursor:position' } }));

const TabManager = vi.hoisted(() => ({
  webContentsForTab: vi.fn((): unknown => null),
  activeWebContents: vi.fn((): unknown => null),
  getState: vi.fn(() => ({ activeId: 'tab-1', tabs: [] as unknown[] })),
  focusedWindow: vi.fn((): unknown => null),
  getContentBounds: vi.fn(() => ({ x: 0, y: 0 })),
  activate: vi.fn(),
  closeTab: vi.fn(),
  navigateActive: vi.fn(),
  navigateTab: vi.fn(() => true),
  viewlessActiveTabId: vi.fn((): string | null => null),
}));
const CdpDriver = vi.hoisted(() => ({
  waitForPageSettled: vi.fn(() => Promise.resolve()),
  snapshotElements: vi.fn(() => Promise.resolve({ elements: [] })),
  readElementValue: vi.fn((): Promise<string | null> => Promise.resolve('the-value')),
  clickElement: vi.fn(() => Promise.resolve({ occludedBy: null })),
  hoverElement: vi.fn(() => Promise.resolve()),
  fillElement: vi.fn(() => Promise.resolve({ widget: null })),
  pressKey: vi.fn(() => Promise.resolve({ sent: 1, unsupported: [] })),
  sendKeys: vi.fn(() => Promise.resolve({ sent: 2, unsupported: [] })),
  scrollPage: vi.fn(() => Promise.resolve()),
  selectOption: vi.fn(() => Promise.resolve({ selected: 'A', options: ['A'] })),
  networkSince: vi.fn(() => ['obs']),
  interceptionsSince: vi.fn(() => ['dlg']),
}));
const AgentTabGroup = vi.hoisted(() => ({
  openTab: vi.fn(() => 'new-tab'),
  ownsTab: vi.fn(() => true),
  releaseTab: vi.fn(),
}));
const DownloadService = vi.hoisted(() => ({
  ingestGeneratedFile: vi.fn(() => Promise.resolve('dl-1')),
}));
const runExtraction = vi.hoisted(() => vi.fn((): unknown => ({ ok: 1 })));
vi.mock('../tabs', () => ({ default: TabManager }));
vi.mock('../downloads/download-service.electron', () => ({ default: DownloadService }));
vi.mock('../downloads/download-service-fs.electron', () => ({ originOf: () => '' }));
vi.mock('../print/pdf-filename', () => ({ pdfFileName: () => 'page.pdf' }));
vi.mock('../window-parked', () => ({ isParkedToTray: () => false }));
vi.mock('./cdp-driver.electron', () => ({ default: CdpDriver }));
vi.mock('./agent-tab-group.electron', () => ({ default: AgentTabGroup }));
vi.mock('./page-cursor.electron', () => ({
  showPageCursor: vi.fn(),
  hidePageCursor: vi.fn(),
  isUserControlActive: () => false,
  resetForAgentAction: vi.fn(),
}));
vi.mock('../extensions/translate-page-injector-controller.electron', () => ({
  default: { ensureUntranslatedForAgent: () => Promise.resolve() },
}));
vi.mock('./article-text-script.js', () => ({ buildArticleTextExpression: () => '' }));
vi.mock('./extraction-sandbox.electron.js', () => ({ runExtraction }));
vi.mock('./credential-broker.electron.js', () => ({ fillCredential: vi.fn() }));
vi.mock('./wait-condition-script.js', () => ({
  buildWaitConditionExpression: () => '',
  clampWaitMs: (n: number) => n,
}));

type Mod = typeof import('./browser-host.electron');
async function load(): Promise<Mod> {
  vi.resetModules();
  return import('./browser-host.electron');
}

beforeEach(() => {
  vi.clearAllMocks();
  TabManager.activeWebContents.mockReturnValue(null);
  TabManager.webContentsForTab.mockReturnValue(null);
  TabManager.getState.mockReturnValue({ activeId: 'tab-1', tabs: [] });
  AgentTabGroup.ownsTab.mockReturnValue(true);
  AgentTabGroup.openTab.mockReturnValue('new-tab');
  CdpDriver.readElementValue.mockResolvedValue('the-value');
});

describe('emitRunEvent', () => {
  it('sends a well-formed event on the named run channel', async () => {
    const mod = await load();
    const send = vi.fn();
    mod.setCurrentAgentRun('r1', 'g1', send);
    mod.emitRunEvent('r1', 'step_ok', 'clicked save', 'detail');
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 'r1',
        groupId: 'g1',
        kind: 'step_ok',
        message: 'clicked save',
        detail: 'detail',
        ts: expect.any(Number) as number,
      }),
    );
  });

  it('is a no-op for a run with no channel', async () => {
    const mod = await load();
    expect(() => {
      mod.emitRunEvent('ghost', 'step_ok', 'x');
    }).not.toThrow();
  });

  it('stops sending once the channel is cleared', async () => {
    const mod = await load();
    const send = vi.fn();
    mod.setCurrentAgentRun('r1', 'g1', send);
    mod.setCurrentAgentRun('r1', null, null);
    mod.emitRunEvent('r1', 'step_ok', 'x');
    expect(send).not.toHaveBeenCalled();
  });

  it('ignores a null runId entirely', async () => {
    const mod = await load();
    expect(() => {
      mod.setCurrentAgentRun(null, 'g1', vi.fn());
    }).not.toThrow();
  });
});

describe('registerHeadlessRun + releaseAgentRun', () => {
  it('a headless run has a channel that swallows events, and release drops it', async () => {
    const mod = await load();
    mod.registerHeadlessRun('r2', 'g2');
    expect(() => {
      mod.emitRunEvent('r2', 'step_ok', 'x');
    }).not.toThrow();
    mod.releaseAgentRun('r2');
    // still a no-op, just proving release doesn't throw either
    expect(() => {
      mod.emitRunEvent('r2', 'step_ok', 'x');
    }).not.toThrow();
  });
});

describe('withAgentRunScope + emitCurrentRunEvent', () => {
  it('routes an ambient event to the scoped run, and is a no-op outside any scope', async () => {
    const mod = await load();
    const send = vi.fn();
    mod.setCurrentAgentRun('r1', 'g1', send);

    mod.emitCurrentRunEvent('step_ok', 'outside');
    expect(send).not.toHaveBeenCalled();

    await mod.withAgentRunScope('r1', async () => {
      mod.emitCurrentRunEvent('step_ok', 'inside', 'd');
      return Promise.resolve();
    });
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ runId: 'r1', message: 'inside', detail: 'd' }),
    );
  });
});

describe('runActiveTabUrl', () => {
  it('is undefined when there is no active tab', async () => {
    const mod = await load();
    expect(mod.runActiveTabUrl()).toBeUndefined();
  });

  it('returns the active tab URL and latches the run onto that tab', async () => {
    const mod = await load();
    const wc = { isDestroyed: () => false, getURL: () => 'https://site.test/page' };
    TabManager.activeWebContents.mockReturnValue(wc);
    const send = vi.fn();
    mod.setCurrentAgentRun('r1', 'g1', send);

    const url = await mod.withAgentRunScope('r1', () => Promise.resolve(mod.runActiveTabUrl()));
    expect(url).toBe('https://site.test/page');
    // latched: a later tabId-less resolve reuses the held tab
    TabManager.activeWebContents.mockReturnValue(null);
    TabManager.webContentsForTab.mockReturnValue(wc);
    const again = await mod.withAgentRunScope('r1', () => Promise.resolve(mod.runActiveTabUrl()));
    expect(again).toBe('https://site.test/page');
    expect(TabManager.webContentsForTab).toHaveBeenCalledWith('tab-1');
  });

  it('is undefined when the active tab reports an empty URL', async () => {
    const mod = await load();
    TabManager.activeWebContents.mockReturnValue({
      isDestroyed: () => false,
      getURL: () => '',
    });
    expect(mod.runActiveTabUrl()).toBeUndefined();
  });
});

describe('the browserHost object', () => {
  const wc = () => ({
    isDestroyed: () => false,
    getURL: () => 'https://p.test/',
    getTitle: () => 'P',
  });

  it('listTabs / listOpenTabs project TabManager state', async () => {
    const { browserHost } = await load();
    TabManager.getState.mockReturnValue({
      activeId: 't1',
      tabs: [
        { id: 't1', url: 'https://a/', title: 'A' },
        { id: 't2', url: 'https://b/', title: 'B' },
      ],
    });
    expect(browserHost.listTabs().find((t) => t.id === 't1')).toMatchObject({ active: true });
    expect(browserHost.listOpenTabs!()).toEqual([
      { id: 't1', url: 'https://a/', title: 'A' },
      { id: 't2', url: 'https://b/', title: 'B' },
    ]);
  });

  it('createTab opens a grouped tab and returns its id', async () => {
    const { browserHost } = await load();
    expect(browserHost.createTab('https://x/', 'Work', false)).toBe('new-tab');
    expect(AgentTabGroup.openTab).toHaveBeenCalledWith('', 'https://x/', 'Work', false);
  });

  it('activateTab reports true only when the tab is active AND drivable', async () => {
    const { browserHost } = await load();
    expect(browserHost.activateTab('ghost')).toBe(false);

    TabManager.getState.mockReturnValue({ activeId: 'x', tabs: [{ id: 'x' }] });
    TabManager.activeWebContents.mockReturnValue(wc());
    expect(browserHost.activateTab('x')).toBe(true);
    expect(TabManager.activate).toHaveBeenCalledWith('x');
  });

  it('closeTab refuses a tab the run does not own, else closes + releases it', async () => {
    const mod = await load();
    mod.setCurrentAgentRun('r1', 'g1', vi.fn());
    await mod.withAgentRunScope('r1', async () => {
      TabManager.getState.mockReturnValue({ activeId: 'x', tabs: [{ id: 'x' }] });
      AgentTabGroup.ownsTab.mockReturnValue(false);
      expect(mod.browserHost.closeTab('x')).toBe(false);

      AgentTabGroup.ownsTab.mockReturnValue(true);
      TabManager.getState
        .mockReturnValueOnce({ activeId: 'x', tabs: [{ id: 'x' }] })
        .mockReturnValue({ activeId: 'x', tabs: [] });
      expect(mod.browserHost.closeTab('x')).toBe(true);
      expect(AgentTabGroup.releaseTab).toHaveBeenCalledWith('g1', 'x');
      return Promise.resolve();
    });
  });

  it('networkSince / interceptionsSince are tolerant of a missing tab', async () => {
    const { browserHost } = await load();
    expect(await browserHost.networkSince(0, 't1')).toEqual([]);

    TabManager.webContentsForTab.mockReturnValue(wc());
    expect(await browserHost.networkSince(0, 't1')).toEqual(['obs']);
    expect(await browserHost.interceptionsSince!(0, 't1')).toEqual(['dlg']);
  });

  it('readElementValue swallows a driver failure to null', async () => {
    const { browserHost } = await load();
    TabManager.webContentsForTab.mockReturnValue(wc());
    expect(await browserHost.readElementValue(3, 't1')).toBe('the-value');

    CdpDriver.readElementValue.mockRejectedValue(new Error('stale'));
    expect(await browserHost.readElementValue(3, 't1')).toBeNull();
  });

  it('the action delegators route through the CDP driver', async () => {
    const { browserHost } = await load();
    const w = wc();
    TabManager.webContentsForTab.mockReturnValue(w);

    expect(await browserHost.clickElement(1, 't1')).toEqual({ occludedBy: null });
    await browserHost.hoverElement(2, 't1');
    expect(await browserHost.fillElement(3, 'hi', 't1')).toEqual({ widget: null });
    expect(await browserHost.pressKey('Enter', 't1')).toEqual({ sent: 1, unsupported: [] });
    await browserHost.scrollPage('down', 100, 't1');
    expect(await browserHost.selectOption(4, 'A', 't1')).toEqual({ selected: 'A', options: ['A'] });

    expect(CdpDriver.clickElement).toHaveBeenCalledWith(w, 1, expect.anything());
    expect(CdpDriver.fillElement).toHaveBeenCalledWith(w, 3, 'hi', expect.anything());
    expect(CdpDriver.selectOption).toHaveBeenCalledWith(w, 4, 'A');
  });

  it('an action on a missing tab 409s', async () => {
    const { browserHost } = await load();
    TabManager.webContentsForTab.mockReturnValue(null);
    await expect(browserHost.clickElement(1, 'gone')).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe('navigation + reads', () => {
  const wc = (over: Record<string, unknown> = {}) => ({
    isDestroyed: () => false,
    getURL: () => 'https://p.test/x',
    getTitle: () => 'P',
    reload: vi.fn(),
    executeJavaScript: vi.fn(() => Promise.resolve({ text: 'hello', sig: 'sig1' })),
    navigationHistory: {
      canGoBack: () => true,
      goBack: vi.fn(),
      canGoForward: () => false,
      goForward: vi.fn(),
    },
    ...over,
  });

  it('navigate(url, tabId) navigates the named tab and returns its url/title', async () => {
    const { browserHost } = await load();
    const w = wc();
    TabManager.navigateTab.mockReturnValue(true);
    TabManager.webContentsForTab.mockReturnValue(w);
    expect(await browserHost.navigate('https://dst/', 't1')).toEqual({
      url: 'https://p.test/x',
      title: 'P',
    });
    expect(TabManager.navigateTab).toHaveBeenCalledWith('t1', 'https://dst/');
    expect(CdpDriver.waitForPageSettled).toHaveBeenCalled();
  });

  it('navigate(url, tabId) 409s when there is no web tab', async () => {
    const { browserHost } = await load();
    TabManager.navigateTab.mockReturnValue(false);
    await expect(browserHost.navigate('https://dst/', 'ghost')).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it('navigate() with no tabId drives the active view in place', async () => {
    const { browserHost } = await load();
    const w = wc();
    TabManager.activeWebContents.mockReturnValue(w);
    await browserHost.navigate('https://dst/');
    expect(TabManager.navigateActive).toHaveBeenCalledWith('https://dst/');
  });

  it('navigate 409s when the tab is destroyed during the load wait', async () => {
    const { browserHost } = await load();
    TabManager.navigateTab.mockReturnValue(true);
    TabManager.webContentsForTab.mockReturnValue(wc({ isDestroyed: () => true }));
    await expect(browserHost.navigate('https://dst/', 't1')).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it('readPage shapes the eval result, degrading a malformed one to empty strings', async () => {
    const { browserHost } = await load();
    TabManager.webContentsForTab.mockReturnValue(wc());
    expect(await browserHost.readPage('t1')).toEqual({
      url: 'https://p.test/x',
      title: 'P',
      text: 'hello',
      sig: 'sig1',
    });

    TabManager.webContentsForTab.mockReturnValue(
      wc({ executeJavaScript: () => Promise.resolve(null) }),
    );
    expect(await browserHost.readPage('t1')).toMatchObject({ text: '', sig: '' });
  });

  it('readArticleText labels a malformed result as source "body"', async () => {
    const { browserHost } = await load();
    TabManager.webContentsForTab.mockReturnValue(
      wc({ executeJavaScript: () => Promise.resolve({ text: 'Body', source: 'article' }) }),
    );
    expect(await browserHost.readArticleText!('t1')).toMatchObject({
      text: 'Body',
      source: 'article',
    });

    TabManager.webContentsForTab.mockReturnValue(
      wc({ executeJavaScript: () => Promise.resolve(1) }),
    );
    expect(await browserHost.readArticleText!('t1')).toMatchObject({ text: '', source: 'body' });
  });

  it('historyGo reloads, and reports moved from the navigation-history guards', async () => {
    const { browserHost } = await load();
    const w = wc();
    TabManager.webContentsForTab.mockReturnValue(w);
    expect(await browserHost.historyGo('reload', 't1')).toMatchObject({ moved: true });
    expect(w.reload).toHaveBeenCalled();

    const back = wc({
      navigationHistory: {
        canGoBack: () => false,
        goBack: vi.fn(),
        canGoForward: () => false,
        goForward: vi.fn(),
      },
    });
    TabManager.webContentsForTab.mockReturnValue(back);
    expect(await browserHost.historyGo('back', 't1')).toMatchObject({ moved: false });
  });

  it('waitForCondition: network_idle settles, an empty value is unsatisfied, text polls the page', async () => {
    const { browserHost } = await load();
    TabManager.webContentsForTab.mockReturnValue(wc());
    expect(
      await browserHost.waitForCondition({ kind: 'network_idle', timeoutMs: 5000 }, 't1'),
    ).toMatchObject({ satisfied: true });

    expect(
      await browserHost.waitForCondition({ kind: 'text', value: '', timeoutMs: 5000 }, 't1'),
    ).toEqual({ satisfied: false, waitedMs: 0 });

    TabManager.webContentsForTab.mockReturnValue(
      wc({ executeJavaScript: () => Promise.resolve({ satisfied: true, waitedMs: 120 }) }),
    );
    expect(
      await browserHost.waitForCondition({ kind: 'text', value: 'Done', timeoutMs: 5000 }, 't1'),
    ).toEqual({ satisfied: true, waitedMs: 120 });
  });

  it('waitForLoad settles the page and returns its url/title', async () => {
    const { browserHost } = await load();
    TabManager.webContentsForTab.mockReturnValue(wc());
    expect(await browserHost.waitForLoad('t1', 3000)).toEqual({
      url: 'https://p.test/x',
      title: 'P',
    });
    expect(CdpDriver.waitForPageSettled).toHaveBeenCalledWith(expect.anything(), 3000);
  });
});

describe('pdf / extraction / screenshot', () => {
  const img = (empty = false) => ({
    isEmpty: () => empty,
    getSize: () => ({ width: 800, height: 600 }),
    resize: vi.fn(function (this: unknown) {
      return this;
    }),
    toDataURL: () => 'data:image/png;base64,AAAA',
  });
  const wc = (over: Record<string, unknown> = {}) => ({
    isDestroyed: () => false,
    getURL: () => 'https://p.test/x',
    getTitle: () => 'Page Title',
    executeJavaScript: vi.fn(() => Promise.resolve('<html></html>')),
    printToPDF: vi.fn(() => Promise.resolve(new Uint8Array([1, 2, 3, 4]))),
    capturePage: vi.fn(() => Promise.resolve(img())),
    ...over,
  });

  it('runExtractionScript hands the outerHTML + script to the sandbox', async () => {
    const { browserHost } = await load();
    TabManager.webContentsForTab.mockReturnValue(wc());
    expect(await browserHost.runExtractionScript!('return 1', 't1')).toEqual({ ok: 1 });
    expect(runExtraction).toHaveBeenCalledWith({ html: '<html></html>', script: 'return 1' });
  });

  it('savePageAsPdf ingests the bytes as an agent-provenance quarantine record', async () => {
    const { browserHost } = await load();
    TabManager.webContentsForTab.mockReturnValue(wc());
    const res = await browserHost.savePageAsPdf!('t1');
    expect(DownloadService.ingestGeneratedFile).toHaveBeenCalledWith(
      expect.objectContaining({
        filename: 'page.pdf',
        mimeType: 'application/pdf',
        provenance: expect.objectContaining({ actor: 'agent' }) as object,
      }),
    );
    expect(res).toEqual({ downloadId: 'dl-1', filename: 'page.pdf', bytes: 4 });
  });

  it('captureScreenshot returns a data URL, and 502s an empty capture', async () => {
    const { browserHost } = await load();
    TabManager.webContentsForTab.mockReturnValue(
      wc({ executeJavaScript: () => Promise.resolve({ width: 800, height: 600 }) }),
    );
    const shot = await browserHost.captureScreenshot({ tabId: 't1' });
    expect(shot).toMatchObject({
      mimeType: 'image/png',
      dataUrl: 'data:image/png;base64,AAAA',
      mode: 'viewport',
      pageWidth: 800,
      pageHeight: 600,
    });

    TabManager.webContentsForTab.mockReturnValue(
      wc({
        executeJavaScript: () => Promise.resolve({ width: 800, height: 600 }),
        capturePage: () => Promise.resolve(img(true)),
      }),
    );
    await expect(browserHost.captureScreenshot({ tabId: 't1' })).rejects.toMatchObject({
      statusCode: 502,
    });
  });
});
