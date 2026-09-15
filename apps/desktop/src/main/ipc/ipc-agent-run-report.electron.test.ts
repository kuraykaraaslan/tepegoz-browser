import { beforeEach, describe, expect, it } from 'vitest';
import { vi } from 'vitest';

/**
 * `registerAgentRunReportIpc` — `agent:export-run-report` (Phase 7, "shippable before the Notary
 * wiring"). Pinned: it requires the agent enabled, reads the run's Journal events + non-refunded token
 * totals SCOPED TO `runId` (never a wider read), renders the real `@tepegoz/notary` Markdown (this test
 * does not mock that module — a thin adapter is exactly the place a real integration check is cheap),
 * writes it via FileOperationsHost and reveals it; a closed database degrades to an empty report rather
 * than throwing; and a run with no token usage omits the Tokens line instead of printing zeroes.
 */

const helpers = vi.hoisted(() => ({
  handlers: new Map<string, (e: unknown, p: unknown) => unknown>(),
}));
vi.mock('./ipc-helpers', () => ({
  handleAsync: (c: string, fn: (e: unknown, p: unknown) => unknown) => helpers.handlers.set(c, fn),
}));

const shell = vi.hoisted(() => ({ showItemInFolder: vi.fn() }));
vi.mock('electron', () => ({ shell }));

vi.mock('@tepegoz/desktop-ipc', () => ({
  IpcChannels: { agentExportRunReport: 'agent:export-run-report' },
}));
vi.mock('@tepegoz/desktop-ipc/schemas', () => ({
  AgentExportRunReportSchema: { parse: (x: unknown) => x },
}));

const journal = vi.hoisted(() => ({ readRecent: vi.fn(() => [] as unknown[]) }));
const tokenStore = vi.hoisted(() => ({
  totalsForRun: vi.fn(() => ({ inputTokens: 0, outputTokens: 0, totalTokens: 0, calls: 0 })),
}));
vi.mock('@tepegoz/persistence', () => ({ EventJournal: journal, TokenStore: tokenStore }));

const getDb = vi.hoisted(() => vi.fn((): unknown => ({})));
vi.mock('../db/database.electron', () => ({ getDb }));

const fsHost = vi.hoisted(() => ({
  writeExport: vi.fn<(filename: string, content: string) => Promise<string>>(() =>
    Promise.resolve('/home/u/tepegoz/report.md'),
  ),
}));
vi.mock('../file-operations/file-operations-host', () => ({ default: fsHost }));

const shared = vi.hoisted(() => ({ requireAgentEnabled: vi.fn() }));
vi.mock('./ipc-agent-shared', () => shared);

const { registerAgentRunReportIpc } = await import('./ipc-agent-run-report');

const call = (payload: unknown) =>
  helpers.handlers.get('agent:export-run-report')!({}, payload) as Promise<string>;

beforeEach(() => {
  vi.clearAllMocks();
  helpers.handlers.clear();
  getDb.mockReturnValue({});
  journal.readRecent.mockReturnValue([]);
  tokenStore.totalsForRun.mockReturnValue({
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    calls: 0,
  });
  fsHost.writeExport.mockResolvedValue('/home/u/tepegoz/report.md');
  registerAgentRunReportIpc();
});

describe('registerAgentRunReportIpc', () => {
  it('requires the agent enabled before doing anything else', async () => {
    shared.requireAgentEnabled.mockImplementationOnce(() => {
      throw new Error('disabled');
    });
    await expect(call({ runId: 'run-1', goal: 'Book a table' })).rejects.toThrow('disabled');
    expect(journal.readRecent).not.toHaveBeenCalled();
  });

  it('reads events and token totals SCOPED TO the given runId, not a global read', async () => {
    await call({ runId: 'run-1', goal: 'Book a table' });
    expect(journal.readRecent).toHaveBeenCalledWith({}, 1000, 'run-1');
    expect(tokenStore.totalsForRun).toHaveBeenCalledWith({}, 'run-1');
  });

  it('writes a real rendered Markdown report containing the goal and run id, then reveals it', async () => {
    journal.readRecent.mockReturnValue([
      {
        lsn: 1,
        id: 'e1',
        type: 'AgentStepExecuted',
        ts: 1000,
        actor: 'agent',
        correlationId: 'run-1',
        payload: { kind: 'step_ok', message: 'Opened OpenTable' },
        redacted: true,
        deviceId: 'device-1',
      },
    ]);
    const full = await call({ runId: 'run-1', goal: 'Book a table for two' });
    expect(full).toBe('/home/u/tepegoz/report.md');
    expect(shell.showItemInFolder).toHaveBeenCalledWith('/home/u/tepegoz/report.md');
    expect(fsHost.writeExport).toHaveBeenCalledWith(
      expect.stringMatching(/^ai_agent_run_report_.*\.md$/),
      expect.any(String),
    );
    const markdown = fsHost.writeExport.mock.calls[0]![1];
    expect(markdown).toContain('Book a table for two');
    expect(markdown).toContain('run-1');
    expect(markdown).toContain('Opened OpenTable');
    expect(markdown).toContain('Not a proof');
  });

  it('degrades to an empty report rather than throwing when the database is closed', async () => {
    getDb.mockReturnValue(null);
    const full = await call({ runId: 'run-1', goal: 'x' });
    expect(full).toBe('/home/u/tepegoz/report.md');
    const markdown = fsHost.writeExport.mock.calls[0]![1];
    expect(markdown).toContain('No events were journaled for this run');
  });

  it('omits the Tokens line when the run spent nothing, rather than printing zeroes', async () => {
    await call({ runId: 'run-1', goal: 'x' });
    const markdown = fsHost.writeExport.mock.calls[0]![1];
    expect(markdown).not.toContain('Tokens:');
  });

  it('includes a Tokens line built from the non-refunded totals when the run spent something', async () => {
    tokenStore.totalsForRun.mockReturnValue({
      inputTokens: 100,
      outputTokens: 40,
      totalTokens: 140,
      calls: 3,
    });
    await call({ runId: 'run-1', goal: 'x' });
    const markdown = fsHost.writeExport.mock.calls[0]![1];
    expect(markdown).toContain('140 total (100 in / 40 out)');
  });
});
