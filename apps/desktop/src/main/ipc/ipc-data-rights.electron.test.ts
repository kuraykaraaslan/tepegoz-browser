import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `registerDataRightsIpc` — `privacy:data-rights-export` (Phase 7 Data Rights, first slice). Pinned: it
 * is NOT gated behind the agent-enabled guard (past data stays exportable even with the extension off);
 * it 503s with no search attempted when there is no database; it searches the conversation store, the
 * full Event Journal, and browsing History (real `searchEventsForSubject`/`buildSubjectAccessReport`/
 * `renderSubjectAccessMarkdown`, not mocked — a thin adapter is exactly where a real check is cheap);
 * and it writes + reveals the Markdown, returning accurate match counts across all three dimensions.
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
  IpcChannels: { dataRightsExport: 'privacy:data-rights-export' },
}));

const conversationStore = vi.hoisted(() => ({
  searchTurnsForSubject: vi.fn(() => [] as unknown[]),
}));
const journal = vi.hoisted(() => ({ readFrom: vi.fn(() => [] as unknown[]) }));
const historyStore = vi.hoisted(() => ({ search: vi.fn(() => [] as unknown[]) }));
vi.mock('@tepegoz/persistence', () => ({
  AgentConversationStore: conversationStore,
  EventJournal: journal,
  HistoryStore: historyStore,
}));

const getDb = vi.hoisted(() => vi.fn((): unknown => ({})));
vi.mock('../db/database.electron', () => ({ getDb }));

const fsHost = vi.hoisted(() => ({
  writeExport: vi.fn<(filename: string, content: string) => Promise<string>>(() =>
    Promise.resolve('/home/u/tepegoz/export.md'),
  ),
}));
vi.mock('../file-operations/file-operations-host', () => ({ default: fsHost }));

const { registerDataRightsIpc } = await import('./ipc-data-rights');

const call = (payload: unknown) =>
  helpers.handlers.get('privacy:data-rights-export')!({}, payload) as Promise<{
    subject: string;
    matchedTurns: number;
    matchedEvents: number;
    matchedHistoryEntries: number;
    filePath: string;
  }>;

beforeEach(() => {
  vi.clearAllMocks();
  helpers.handlers.clear();
  getDb.mockReturnValue({});
  conversationStore.searchTurnsForSubject.mockReturnValue([]);
  journal.readFrom.mockReturnValue([]);
  historyStore.search.mockReturnValue([]);
  fsHost.writeExport.mockResolvedValue('/home/u/tepegoz/export.md');
  registerDataRightsIpc();
});

describe('registerDataRightsIpc', () => {
  it('503s with no search attempted when there is no database', async () => {
    getDb.mockReturnValue(null);
    await expect(call({ subject: 'kaya' })).rejects.toThrow('No database available');
    expect(conversationStore.searchTurnsForSubject).not.toHaveBeenCalled();
    expect(fsHost.writeExport).not.toHaveBeenCalled();
  });

  it('searches conversations + history SCOPED to the subject, and reads the FULL journal (no fold index to scope by)', async () => {
    await call({ subject: 'kaya@example.com' });
    expect(conversationStore.searchTurnsForSubject).toHaveBeenCalledWith({}, 'kaya@example.com');
    expect(historyStore.search).toHaveBeenCalledWith({}, 'kaya@example.com', 500, 0);
    expect(journal.readFrom).toHaveBeenCalledWith({}, 0);
  });

  it('writes a real rendered Markdown export and reveals it, with accurate match counts', async () => {
    conversationStore.searchTurnsForSubject.mockReturnValue([
      {
        id: 't1',
        conversationId: 'c1',
        prompt: 'Email kaya@example.com',
        status: 'completed',
        events: [],
        attachments: [],
        createdAt: 1000,
        updatedAt: 1000,
      },
    ]);
    journal.readFrom.mockReturnValue([
      {
        lsn: 1,
        id: 'e1',
        type: 'AgentStepExecuted',
        ts: 1000,
        actor: 'agent',
        correlationId: 'run-1',
        payload: { message: 'contacted kaya@example.com' },
        redacted: true,
        deviceId: 'device-1',
      },
      {
        lsn: 2,
        id: 'e2',
        type: 'AgentStepExecuted',
        ts: 2000,
        actor: 'agent',
        correlationId: 'run-1',
        payload: { message: 'unrelated' },
        redacted: true,
        deviceId: 'device-1',
      },
    ]);
    historyStore.search.mockReturnValue([
      { url: 'https://example.com/kaya', title: 'Kaya profile', ts: 1500, visitCount: 2, favicon: null },
    ]);

    const result = await call({ subject: 'kaya@example.com' });

    expect(result).toEqual({
      subject: 'kaya@example.com',
      matchedTurns: 1,
      matchedEvents: 1,
      matchedHistoryEntries: 1,
      filePath: '/home/u/tepegoz/export.md',
    });
    expect(shell.showItemInFolder).toHaveBeenCalledWith('/home/u/tepegoz/export.md');
    expect(fsHost.writeExport).toHaveBeenCalledWith(
      expect.stringMatching(/^data_rights_export_.*\.md$/),
      expect.any(String),
    );
    const markdown = fsHost.writeExport.mock.calls[0]![1];
    expect(markdown).toContain('Email kaya@example.com');
    expect(markdown).toContain('contacted kaya@example.com');
    expect(markdown).toContain('[Kaya profile](https://example.com/kaya)');
    expect(markdown).not.toContain('unrelated');
  });
});
