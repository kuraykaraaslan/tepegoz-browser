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
}));
vi.mock('../tabs', () => ({ default: TabManager }));
vi.mock('../downloads/download-service.electron', () => ({ default: {} }));
vi.mock('../downloads/download-service-fs.electron', () => ({ originOf: () => '' }));
vi.mock('../print/pdf-filename', () => ({ pdfFileName: () => 'page.pdf' }));
vi.mock('../window-parked', () => ({ isParkedToTray: () => false }));
vi.mock('./cdp-driver.electron', () => ({ default: {} }));
vi.mock('./agent-tab-group.electron', () => ({ default: {} }));
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
