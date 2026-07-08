import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { WebContents } from 'electron';

/**
 * Unit tests for the agent BrowserHost's navigation/activation logic — the fix that stops the agent
 * from forking the view-less newtab into an ungrouped tab (and then flailing on "No active page").
 * Every Electron/native seam (`../tabs`, the CDP driver, the page cursor, human-input) is mocked so the
 * host's pure control flow runs under the Node ABI without loading Electron or better-sqlite3.
 */

const h = vi.hoisted(() => {
  const wc = (url = 'https://e.com', title = 'E'): WebContents =>
    ({
      isDestroyed: () => false,
      getURL: () => url,
      getTitle: () => title,
      debugger: { sendCommand: vi.fn(() => Promise.resolve({})) },
    }) as unknown as WebContents;
  return {
    wc,
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
    },
    openTab: vi.fn<(group: string, url?: string) => string>(() => 'web-2'),
  };
});

vi.mock('../tabs', () => ({ default: h.tabs }));
vi.mock('./agent-tab-group.electron', () => ({
  default: { openTab: h.openTab, ownsTab: vi.fn(() => false), releaseTab: vi.fn() },
}));
vi.mock('./cdp-driver.electron', () => ({
  default: { waitForPageSettled: vi.fn(() => Promise.resolve()) },
}));
vi.mock('./page-cursor.electron', () => ({
  showPageCursor: vi.fn(),
  hidePageCursor: vi.fn(),
  isUserControlActive: vi.fn(() => false),
  resetForAgentAction: vi.fn(),
}));
vi.mock('@tepegoz/human-input', () => ({ HumanInputAdapter: class {} }));

// Imported AFTER the mocks so the module wires against them.
const { browserHost, setCurrentAgentRun } = await import('./browser-host.electron');

describe('browserHost.navigate — view-less newtab replace-in-place', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setCurrentAgentRun('run-1', 'G', () => undefined);
    h.tabs.viewlessActiveTabId.mockReturnValue('newtab-1');
    h.tabs.webContentsForTab.mockReturnValue(h.wc('https://e.com', 'E'));
    h.openTab.mockReturnValue('web-2');
  });

  it('opens the page as a grouped web tab and closes the orphan newtab', async () => {
    const res = await browserHost.navigate('https://e.com');

    // The page is opened through the group-aware/ownership path in THIS run's group…
    expect(h.openTab).toHaveBeenCalledWith('G', 'https://e.com');
    // …the orphan view-less newtab is closed (replace-in-place)…
    expect(h.tabs.closeTab).toHaveBeenCalledWith('newtab-1');
    // …and it never falls into the ungrouped navigateActive fork.
    expect(h.tabs.navigateActive).not.toHaveBeenCalled();
    // The returned page comes from the new tab, targeted explicitly.
    expect(h.tabs.webContentsForTab).toHaveBeenCalledWith('web-2');
    expect(res).toEqual({ url: 'https://e.com', title: 'E' });
  });

  it('preserves the orphan when tab creation is blocked (openTab throws before close)', async () => {
    h.openTab.mockImplementation(() => {
      throw new Error('Tab creation was blocked by an extension');
    });
    await expect(browserHost.navigate('https://e.com')).rejects.toThrow();
    expect(h.tabs.closeTab).not.toHaveBeenCalled();
  });

  it('navigates in place (no new tab) when the active tab already has a view', async () => {
    h.tabs.viewlessActiveTabId.mockReturnValue(null);
    h.tabs.activeWebContents.mockReturnValue(h.wc());

    await browserHost.navigate('https://e.com');

    expect(h.tabs.navigateActive).toHaveBeenCalledWith('https://e.com');
    expect(h.openTab).not.toHaveBeenCalled();
    expect(h.tabs.closeTab).not.toHaveBeenCalled();
  });

  it('falls through to navigateActive when there is no active agent run', async () => {
    setCurrentAgentRun(null, null, null);
    h.tabs.viewlessActiveTabId.mockReturnValue('newtab-1'); // view-less, but no run → do not open/close
    h.tabs.activeWebContents.mockReturnValue(h.wc());

    await browserHost.navigate('https://e.com');

    expect(h.openTab).not.toHaveBeenCalled();
    expect(h.tabs.closeTab).not.toHaveBeenCalled();
    expect(h.tabs.navigateActive).toHaveBeenCalledWith('https://e.com');
  });
});

describe('browserHost.activateTab — truthful only for a drivable page', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns false for a view-less internal tab (activation yields no drivable page)', () => {
    h.tabs.getState.mockReturnValue({ tabs: [{ id: 't1' }], activeId: 't1' });
    h.tabs.activeWebContents.mockReturnValue(null);
    expect(browserHost.activateTab('t1')).toBe(false);
    expect(h.tabs.activate).toHaveBeenCalledWith('t1');
  });

  it('returns true when the activated tab has a live web view', () => {
    h.tabs.getState.mockReturnValue({ tabs: [{ id: 't1' }], activeId: 't1' });
    h.tabs.activeWebContents.mockReturnValue(h.wc());
    expect(browserHost.activateTab('t1')).toBe(true);
  });

  it('returns false for an unknown tab id', () => {
    h.tabs.getState.mockReturnValue({ tabs: [], activeId: null });
    expect(browserHost.activateTab('missing')).toBe(false);
    expect(h.tabs.activate).not.toHaveBeenCalled();
  });
});
