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
}));
const CdpDriver = vi.hoisted(() => ({
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
vi.mock('../tabs', () => ({ default: TabManager }));
vi.mock('../downloads/download-service.electron', () => ({ default: {} }));
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
vi.mock('./extraction-sandbox.electron.js', () => ({ runExtraction: vi.fn() }));
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
