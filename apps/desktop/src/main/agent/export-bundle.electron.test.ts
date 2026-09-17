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
    readRecent: vi.fn<(db: unknown, limit: number, runId?: string) => unknown[]>(() => [
      { id: 'e1' },
    ]),
    hasActiveAgentRun: vi.fn<() => boolean>(() => false),
    deviceId: vi.fn<() => string>(() => 'device-1'),
    buildRunReport: vi.fn((input: { runId: string; goal: string }) => ({ ...input })),
    renderRunReportMarkdown: vi.fn<() => string>(() => '# report'),
    buildRunReceipt: vi.fn<() => { ok: true; receipt: unknown } | { ok: false; reason: string }>(
      () => ({
        ok: true,
        receipt: { correlationId: 'run-1' },
      }),
    ),
    getOrCreateKey: vi.fn<() => { privateKeyPem: string; publicKeyPem: string }>(() => ({
      privateKeyPem: 'P',
      publicKeyPem: 'Q',
    })),
  };
});

vi.mock('electron', () => ({ app: { getVersion: () => '9.9.9' } }));
vi.mock('@tepegoz/browser-tools', () => ({ buildElementsSnapshot: h.buildElementsSnapshot }));
vi.mock('@tepegoz/persistence', () => ({
  EventJournal: { readRecent: h.readRecent },
  MetaStore: { deviceId: h.deviceId },
}));
vi.mock('@tepegoz/notary', () => ({
  buildRunReport: h.buildRunReport,
  renderRunReportMarkdown: h.renderRunReportMarkdown,
}));
vi.mock('../notary/build-run-receipt', () => ({ buildRunReceipt: h.buildRunReceipt }));
vi.mock('../notary/notary-signing-key.electron', () => ({
  default: { getOrCreate: h.getOrCreateKey },
}));
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
    h.deviceId.mockReturnValue('device-1');
    h.buildRunReport.mockImplementation((input: { runId: string; goal: string }) => ({ ...input }));
    h.renderRunReportMarkdown.mockReturnValue('# report');
    h.buildRunReceipt.mockReturnValue({ ok: true, receipt: { correlationId: 'run-1' } });
    h.getOrCreateKey.mockReturnValue({ privateKeyPem: 'P', publicKeyPem: 'Q' });
    h.readRecent.mockImplementation(() => [{ id: 'e1' }]);
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
    const tabs = manifestOf(files).tabs as {
      dom: { status: string };
      screenshot: { status: string };
    }[];
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

  it('marks a tab screenshot skipped (no PNG) when the capture throws', async () => {
    h.captureScreenshot.mockRejectedValue(new Error('cdp gone'));
    const files = await collectAgentExportBundleFiles(INPUT, 0);
    expect(paths(files).filter((p) => p.endsWith('.png'))).toEqual([]);
    const tabs = manifestOf(files).tabs as { screenshot: { status: string; reason?: string } }[];
    expect(tabs[0]?.screenshot.status).toBe('skipped');
    expect(tabs[0]?.screenshot.reason).toContain('cdp gone');
  });

  it('memory.json falls back to a null conversation when the store read throws', async () => {
    h.currentConversation.mockImplementation(() => {
      throw new Error('db locked');
    });
    const files = await collectAgentExportBundleFiles(INPUT, 0);
    const mem = JSON.parse(files.find((f) => f.relPath === 'memory.json')?.content ?? '{}') as {
      conversation: unknown;
    };
    expect(mem.conversation).toBeNull();
  });

  it('journal.json falls back to [] when the Event Journal read throws', async () => {
    h.readRecent.mockImplementation(() => {
      throw new Error('journal corrupt');
    });
    const files = await collectAgentExportBundleFiles(INPUT, 0);
    const journal = JSON.parse(
      files.find((f) => f.relPath === 'journal.json')?.content ?? 'null',
    ) as unknown[];
    expect(journal).toEqual([]);
  });

  describe('per-run Notary artifacts (Phase 7)', () => {
    const TURNS = [
      { runId: 'run-1', prompt: 'book a table' },
      { runId: 'run-2', prompt: 'find a flight' },
    ];

    it('gathers nothing when no turns are supplied — same bundle as before this field existed', async () => {
      const files = await collectAgentExportBundleFiles(INPUT, 0);
      expect(paths(files).some((p) => p.startsWith('runs/'))).toBe(false);
      expect(manifestOf(files).runs).toEqual([]);
      expect(h.getOrCreateKey).not.toHaveBeenCalled();
    });

    it('writes a report + receipt per turn, fetching the signing key only ONCE for the whole bundle', async () => {
      const files = await collectAgentExportBundleFiles({ ...INPUT, turns: TURNS }, 0);
      expect(paths(files)).toEqual(
        expect.arrayContaining([
          'runs/run-1.report.md',
          'runs/run-1.receipt.json',
          'runs/run-2.report.md',
          'runs/run-2.receipt.json',
        ]),
      );
      expect(h.getOrCreateKey).toHaveBeenCalledTimes(1);
      const runs = manifestOf(files).runs as RunEntry[];
      expect(runs.map((r) => r.runId)).toEqual(['run-1', 'run-2']);
      expect(runs.every((r) => r.report.status === 'ok' && r.receipt.status === 'ok')).toBe(true);
    });

    it('still writes the report, but skips (never fabricates) the receipt, when the signing key is unavailable', async () => {
      h.getOrCreateKey.mockImplementation(() => {
        throw new Error('keychain locked');
      });
      const files = await collectAgentExportBundleFiles({ ...INPUT, turns: TURNS }, 0);
      expect(paths(files)).toContain('runs/run-1.report.md');
      expect(paths(files)).not.toContain('runs/run-1.receipt.json');
      const runs = manifestOf(files).runs as RunEntry[];
      expect(runs[0]?.report.status).toBe('ok');
      expect(runs[0]?.receipt).toEqual({
        status: 'skipped',
        reason: expect.stringContaining('keychain locked') as string,
      });
    });

    it('skips just the receipt, keeping the report, when buildRunReceipt itself refuses', async () => {
      h.buildRunReceipt.mockReturnValue({ ok: false, reason: 'not_chained' });
      const files = await collectAgentExportBundleFiles({ ...INPUT, turns: [TURNS[0]!] }, 0);
      expect(paths(files)).toContain('runs/run-1.report.md');
      expect(paths(files)).not.toContain('runs/run-1.receipt.json');
      const runs = manifestOf(files).runs as RunEntry[];
      expect(runs[0]?.receipt).toEqual({ status: 'skipped', reason: 'not_chained' });
    });

    it('a failure gathering ONE run does not take the rest of the bundle down (best-effort, per run)', async () => {
      h.readRecent.mockImplementation((_db: unknown, _limit: number, runId?: string) => {
        if (runId === 'run-1') throw new Error('journal read exploded');
        return runId === undefined ? [{ id: 'e1' }] : [{ id: 'e1', correlationId: runId }];
      });
      const files = await collectAgentExportBundleFiles({ ...INPUT, turns: TURNS }, 0);
      // run-1 failed entirely; run-2 still produced both files.
      expect(paths(files)).not.toContain('runs/run-1.report.md');
      expect(paths(files)).toContain('runs/run-2.report.md');
      expect(paths(files)).toContain('runs/run-2.receipt.json');
      const runs = manifestOf(files).runs as RunEntry[];
      expect(runs[0]).toMatchObject({
        runId: 'run-1',
        report: { status: 'skipped' },
        receipt: { status: 'skipped' },
      });
      expect(runs[1]).toMatchObject({ runId: 'run-2', report: { status: 'ok' } });
    });
  });
});

interface RunEntry {
  runId: string;
  report: { status: string; file?: string; reason?: string };
  receipt: { status: string; file?: string; reason?: string };
}
