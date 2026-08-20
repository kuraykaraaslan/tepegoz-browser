import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { WebContents } from 'electron';

/**
 * Unit tests for the agent BrowserHost's navigation/activation logic — the fix that stops the agent
 * from forking the view-less newtab into an ungrouped tab (and then flailing on "No active page").
 * Every Electron/native seam (`../tabs`, the CDP driver, the page cursor, human-input) is mocked so the
 * host's pure control flow runs under the Node ABI without loading Electron or better-sqlite3.
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
      fillElement: vi.fn<(wc: WebContents, ref: number, t: string, a?: Adapter) => Promise<unknown>>(
        () => Promise.resolve({ ok: true }),
      ),
      scrollPage: vi.fn<(wc: WebContents, d: string, n?: number, a?: Adapter) => Promise<void>>(() =>
        Promise.resolve(),
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
    },
    openTab: vi.fn<(group: string, url?: string) => string>(() => 'web-2'),
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
  },
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
const { browserHost, emitRunEvent, releaseAgentRun, setCurrentAgentRun, withAgentRunScope } =
  await import('./browser-host.electron');

/** Everything the agent drives runs inside its run's scope — that is how the host learns whose run it is. */
const inRun = <T>(fn: () => Promise<T>): Promise<T> => withAgentRunScope('run-1', fn);

describe('browserHost.navigate — view-less newtab replace-in-place', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setCurrentAgentRun('run-1', 'G', () => undefined);
    h.tabs.viewlessActiveTabId.mockReturnValue('newtab-1');
    h.tabs.webContentsForTab.mockReturnValue(h.wc('https://e.com', 'E'));
    h.openTab.mockReturnValue('web-2');
  });

  it('opens the page as a grouped web tab and closes the orphan newtab', async () => {
    const res = await inRun(() => browserHost.navigate('https://e.com'));

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
    await expect(inRun(() => browserHost.navigate('https://e.com'))).rejects.toThrow();
    expect(h.tabs.closeTab).not.toHaveBeenCalled();
  });

  it('navigates in place (no new tab) when the active tab already has a view', async () => {
    h.tabs.viewlessActiveTabId.mockReturnValue(null);
    h.tabs.activeWebContents.mockReturnValue(h.wc());

    await inRun(() => browserHost.navigate('https://e.com'));

    expect(h.tabs.navigateActive).toHaveBeenCalledWith('https://e.com');
    expect(h.openTab).not.toHaveBeenCalled();
    expect(h.tabs.closeTab).not.toHaveBeenCalled();
  });

  it('falls through to navigateActive when there is no active agent run', async () => {
    releaseAgentRun('run-1');
    h.tabs.viewlessActiveTabId.mockReturnValue('newtab-1'); // view-less, but no run → do not open/close
    h.tabs.activeWebContents.mockReturnValue(h.wc());

    // Deliberately NOT wrapped in a run scope — this is the "no run is driving" path.
    await browserHost.navigate('https://e.com');

    expect(h.openTab).not.toHaveBeenCalled();
    expect(h.tabs.closeTab).not.toHaveBeenCalled();
    expect(h.tabs.navigateActive).toHaveBeenCalledWith('https://e.com');
  });

  it("delivers a run's narration to that run's channel, not the most recent run's", () => {
    const a: string[] = [];
    const b: string[] = [];
    setCurrentAgentRun('run-a', 'GA', (e) => a.push(`${e.groupId}:${e.message}`));
    setCurrentAgentRun('run-b', 'GB', (e) => b.push(`${e.groupId}:${e.message}`));

    // run-b registered LAST. Under the old single-pointer model this reached run-b's panel.
    emitRunEvent('run-a', 'paused', 'paused');

    expect(a).toEqual(['GA:paused']);
    expect(b).toEqual([]);
    releaseAgentRun('run-a');
    releaseAgentRun('run-b');
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

describe('per-tab HumanInputAdapter — every action gets real gestures', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.adapterArgs.length = 0;
  });

  it('passes an adapter even when a tabId is named (a background action must not teleport)', async () => {
    const target = h.wc('https://bg.com');
    h.tabs.webContentsForTab.mockReturnValue(target);

    await browserHost.clickElement(1, 'tab-bg');

    // The regression this locks: the adapter used to be passed ONLY when tabId was undefined, so a
    // tabId-targeted action silently lost humanization, cursor motion and its input_action narration.
    const adapter = h.cdp.clickElement.mock.calls[0]?.[2];
    expect(adapter).toBeDefined();
  });

  it('gives each tab its own adapter and reuses it for that same tab', async () => {
    const tabA = h.wc('https://a.com');
    const tabB = h.wc('https://b.com');

    h.tabs.webContentsForTab.mockReturnValue(tabA);
    await browserHost.clickElement(1, 'tab-a');
    await browserHost.fillElement(2, 'x', 'tab-a');
    h.tabs.webContentsForTab.mockReturnValue(tabB);
    await browserHost.clickElement(1, 'tab-b');

    const first = h.cdp.clickElement.mock.calls[0]?.[2];
    const reused = h.cdp.fillElement.mock.calls[0]?.[3];
    const other = h.cdp.clickElement.mock.calls[1]?.[2];

    expect(reused).toBe(first); // same tab ⇒ same adapter (cursor position accumulates per tab)
    expect(other).not.toBe(first); // different tab ⇒ its own adapter, no shared cursor state
  });

  it("binds each adapter's CDP transport to its OWN tab, not to whatever is active", async () => {
    const target = h.wc('https://bg.com');
    const activeElsewhere = h.wc('https://active.com');
    h.tabs.webContentsForTab.mockReturnValue(target);
    h.tabs.activeWebContents.mockReturnValue(activeElsewhere);

    await browserHost.clickElement(1, 'tab-bg');

    // Drive the transport the adapter was constructed with; it must reach the tab it was made for.
    const cdpSend = h.adapterArgs.at(-1)?.[0] as (m: string, p?: unknown) => Promise<unknown>;
    await cdpSend('Input.dispatchMouseEvent', { type: 'mouseMoved' });

    expect(h.sends.get(target.id)).toContain('Input.dispatchMouseEvent');
    expect(h.sends.get(activeElsewhere.id)).toEqual([]);
  });
});
