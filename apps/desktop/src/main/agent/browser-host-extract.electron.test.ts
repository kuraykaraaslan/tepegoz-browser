import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `browser-host.electron` side-effecting page operations — extraction sandbox hand-off, PDF save into
 * quarantine, screenshot capture, content-addressed scroll and the credential broker closures. Pinned:
 * the sandbox gets a COPY of the page HTML; the PDF is ingested with agent provenance; an empty capture
 * is a 502; `scrollToText` narrates and degrades a malformed reply; `fillCredential` fills through the
 * same CDP path as any other fill.
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
const resetForAgentAction = vi.hoisted(() => vi.fn());
const brokerCap = vi.hoisted(
  (): {
    opts?: {
      pageUrl: (id?: string) => string;
      fill: (t: number, x: string, id?: string) => Promise<unknown>;
    };
  } => ({}),
);
const brokerFill = vi.hoisted(() =>
  vi.fn((_ref: number, _field: string, _tabId: string | undefined, opts: unknown) => {
    brokerCap.opts = opts as NonNullable<typeof brokerCap.opts>;
    return Promise.resolve({ filled: true });
  }),
);
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
  resetForAgentAction,
}));
vi.mock('../extensions/translate-page-injector-controller.electron', () => ({
  default: { ensureUntranslatedForAgent: () => Promise.resolve() },
}));
vi.mock('./article-text-script.js', () => ({ buildArticleTextExpression: () => '' }));
vi.mock('./extraction-sandbox.electron.js', () => ({ runExtraction }));
vi.mock('./credential-broker.electron.js', () => ({ fillCredential: brokerFill }));
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

describe('scrollToText + fillCredential', () => {
  const wc = (over: Record<string, unknown> = {}) => ({
    isDestroyed: () => false,
    getURL: () => 'https://p.test/x',
    getTitle: () => 'P',
    executeJavaScript: vi.fn(() => Promise.resolve({ found: true, count: 2 })),
    ...over,
  });

  it('scrollToText returns the match result and narrates an input_action', async () => {
    const mod = await load();
    TabManager.webContentsForTab.mockReturnValue(wc());
    const send = vi.fn();
    mod.setCurrentAgentRun('r1', 'g1', send);
    const res = await mod.withAgentRunScope('r1', () =>
      mod.browserHost.scrollToText('Terms of Service', 2, 't1'),
    );
    expect(res).toEqual({ found: true, count: 2 });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ kind: 'input_action' }));
  });

  it('scrollToText degrades a malformed eval result to not-found', async () => {
    const { browserHost } = await load();
    TabManager.webContentsForTab.mockReturnValue(
      wc({ executeJavaScript: () => Promise.resolve(null) }),
    );
    expect(await browserHost.scrollToText('x', undefined, 't1')).toEqual({
      found: false,
      count: 0,
    });
  });

  it('fillCredential hands the broker a page-url + fill closure that goes through the CDP driver', async () => {
    const { browserHost } = await load();
    const w = wc();
    TabManager.webContentsForTab.mockReturnValue(w);
    expect(await browserHost.fillCredential!(3, 'password', 't1')).toEqual({ filled: true });
    expect(brokerFill).toHaveBeenCalledWith(3, 'password', 't1', expect.anything());

    // exercise the closures the broker was handed
    expect(brokerCap.opts!.pageUrl('t1')).toBe('https://p.test/x');
    await brokerCap.opts!.fill(5, 'sekret', 't1');
    expect(resetForAgentAction).toHaveBeenCalled();
    expect(CdpDriver.fillElement).toHaveBeenCalledWith(w, 5, 'sekret', expect.anything());
  });
});
