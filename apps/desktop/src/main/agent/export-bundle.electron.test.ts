import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { WebContents } from 'electron';

/**
 * Unit tests for the agent diagnostic-bundle collector. Every Electron/native/persistence seam is mocked
 * so the pure gathering logic runs under the Node ABI: tab selection (group + drivable only), best-effort
 * per-tab capture with skip-on-error (never a silent gap), and the manifest outcome record.
 */

interface FakeTab {
  id: string;
  title: string;
  url: string;
  groupId: string | null;
}

const h = vi.hoisted(() => {
  const wc = { isDestroyed: () => false } as unknown as WebContents;
  return {
    wc,
    tabs: {
      getState: vi.fn<() => { tabs: FakeTab[]; activeId: string | null }>(() => ({
        tabs: [],
        activeId: null,
      })),
      // Internal (tepegoz://) tabs have no view → null; web tabs resolve to a wc.
      webContentsForTab: vi.fn<(id: string) => WebContents | null>((id) =>
        id.startsWith('web-') ? wc : null,
      ),
    },
    snapshotElements: vi.fn<(id: string) => Promise<unknown>>((id) => {
      if (id === 'web-2') return Promise.reject(new Error('boom'));
      return Promise.resolve({ url: `https://a/${id}`, title: `T ${id}`, elements: [{}] });
    }),
    captureScreenshot: vi.fn<() => Promise<{ dataUrl: string }>>(() =>
      Promise.resolve({ dataUrl: 'data:image/png;base64,QUJD' }),
    ),
    buildElementsSnapshot: vi.fn((elements: unknown[]) => ({
      elements,
      content: 'RENDERED',
      flags: [],
    })),
    conversationMemory: vi.fn<() => unknown[]>(() => [{ role: 'user', content: 'hi' }]),
    currentConversation: vi.fn<() => unknown>(() => null),
    readRecent: vi.fn<() => unknown[]>(() => [{ id: 'e1' }]),
    hasActiveAgentRun: vi.fn<() => boolean>(() => false),
  };
});

vi.mock('electron', () => ({ app: { getVersion: () => '9.9.9' } }));
vi.mock('@tepegoz/browser-tools', () => ({ buildElementsSnapshot: h.buildElementsSnapshot }));
vi.mock('@tepegoz/persistence', () => ({ EventJournal: { readRecent: h.readRecent } }));
vi.mock('../tabs', () => ({ default: h.tabs }));
vi.mock('../db/database.electron', () => ({ getDb: () => ({}) }));
vi.mock('./browser-host.electron', () => ({
  browserHost: { snapshotElements: h.snapshotElements, captureScreenshot: h.captureScreenshot },
}));
vi.mock('./agent-service.electron', () => ({
  default: { conversationMemory: h.conversationMemory, currentConversation: h.currentConversation },
}));
vi.mock('./agent-run-lock.electron', () => ({ hasActiveAgentRun: h.hasActiveAgentRun }));

const { collectAgentExportBundleFiles } = await import('./export-bundle.electron');

const paths = (files: { relPath: string }[]): string[] => files.map((f) => f.relPath);
const manifestOf = (files: { relPath: string; content: string }[]): Record<string, unknown> =>
  JSON.parse(files.find((f) => f.relPath === 'manifest.json')?.content ?? '{}') as Record<
    string,
    unknown
  >;

const INPUT = { chatContent: '# chat', groupId: 'G', meta: { provider: 'claude' } };

describe('collectAgentExportBundleFiles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.hasActiveAgentRun.mockReturnValue(false);
    h.tabs.getState.mockReturnValue({
      tabs: [
        { id: 'web-1', title: 'One', url: 'https://a/1', groupId: 'G' },
        { id: 'web-2', title: 'Two', url: 'https://a/2', groupId: 'G' },
        { id: 'int-3', title: 'New tab', url: 'tepegoz://newtab', groupId: 'G' }, // internal → excluded
        { id: 'web-9', title: 'Other', url: 'https://a/9', groupId: 'OTHER' }, // other group → excluded
      ],
      activeId: 'web-1',
    });
  });

  it('always writes the chat + memory + journal + manifest top-level files', async () => {
    const files = await collectAgentExportBundleFiles(INPUT, 0);
    for (const p of ['chat.md', 'memory.json', 'journal.json', 'manifest.json']) {
      expect(paths(files)).toContain(p);
    }
    expect(files.find((f) => f.relPath === 'chat.md')?.content).toBe('# chat');
    const mem = JSON.parse(files.find((f) => f.relPath === 'memory.json')?.content ?? '{}') as {
      modelVisibleHistory: unknown[];
    };
    expect(mem.modelVisibleHistory).toHaveLength(1);
  });

  it('includes only this group’s drivable tabs (internal + other-group excluded)', async () => {
    const files = await collectAgentExportBundleFiles(INPUT, 0);
    const manifest = manifestOf(files);
    const tabs = manifest.tabs as { id: string }[];
    expect(tabs.map((t) => t.id)).toEqual(['web-1', 'web-2']);
  });

  it('captures DOM + PNG for a healthy tab', async () => {
    const files = await collectAgentExportBundleFiles(INPUT, 0);
    expect(paths(files)).toEqual(
      expect.arrayContaining(['tabs/tab-1.md', 'tabs/tab-1.dom.json', 'tabs/tab-1.png']),
    );
    const png = files.find((f) => f.relPath === 'tabs/tab-1.png');
    expect(png?.encoding).toBe('base64');
    expect(png?.content).toBe('QUJD');
    const tabs = manifestOf(files).tabs as { dom: { status: string }; screenshot: { status: string } }[];
    expect(tabs[0]?.dom.status).toBe('ok');
    expect(tabs[0]?.screenshot.status).toBe('ok');
  });

  it('skips a tab’s DOM on snapshot failure but keeps its screenshot and the rest of the bundle', async () => {
    const files = await collectAgentExportBundleFiles(INPUT, 0);
    // web-2 (tab-2) DOM failed → no md/json, but the PNG still written.
    expect(paths(files)).not.toContain('tabs/tab-2.md');
    expect(paths(files)).not.toContain('tabs/tab-2.dom.json');
    expect(paths(files)).toContain('tabs/tab-2.png');
    const tabs = manifestOf(files).tabs as { dom: { status: string; reason?: string } }[];
    expect(tabs[1]?.dom.status).toBe('skipped');
    expect(tabs[1]?.dom.reason).toContain('boom');
  });

  it('skips DOM perception entirely while an agent run is active (shared debugger)', async () => {
    h.hasActiveAgentRun.mockReturnValue(true);
    const files = await collectAgentExportBundleFiles(INPUT, 0);
    expect(h.snapshotElements).not.toHaveBeenCalled();
    expect(paths(files)).not.toContain('tabs/tab-1.md');
    const tabs = manifestOf(files).tabs as { dom: { status: string; reason?: string } }[];
    expect(tabs[0]?.dom.status).toBe('skipped');
    expect(tabs[0]?.dom.reason).toContain('agent run active');
    // Screenshots don't use the debugger → still captured.
    expect(paths(files)).toContain('tabs/tab-1.png');
  });

  it('records environment diagnostics in the manifest', async () => {
    const files = await collectAgentExportBundleFiles(INPUT, 0);
    const manifest = manifestOf(files);
    expect((manifest.app as { version: string }).version).toBe('9.9.9');
    expect(manifest.perceptionMode).toBe('render-dom');
    expect(manifest.provider).toBe('claude');
    expect(manifest.memoryMessages).toBe(1);
    expect(manifest.journalEvents).toBe(1);
  });
});
