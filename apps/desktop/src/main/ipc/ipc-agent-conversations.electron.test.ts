import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IpcChannels } from '@tepegoz/desktop-ipc';

/**
 * `ipc-agent-conversations.ts` — agent conversation-history + a few active-tab helpers. Pinned:
 *   - every history handler is behind `requireAgentEnabled` and returns the empty value (not a
 *     throw) when there is no database;
 *   - `agentNewConversation` silently no-ops when the agent is off (it is fire-and-forget);
 *   - `agentActiveTabUrl` is deliberately NOT gated — a converted task needs the URL even with the
 *     agent disabled — and returns null when the active tab has no committed URL;
 *   - `agentEnsureGroup` fails with a 409 when there is no active tab;
 *   - `agentCaptureSelection` returns '' when the active tab has no live WebContents;
 *   - `agentPickFiles` caps at 5 files / 5 MB, base64-encodes non-text, and returns [] on cancel.
 */

const h = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, payload: unknown) => unknown>(),
  listeners: new Map<string, (event: unknown, payload: unknown) => void>(),
}));
const showOpenDialog = vi.hoisted(() => vi.fn());
vi.mock('electron', () => ({
  ipcMain: {
    handle: (c: string, fn: (e: unknown, p: unknown) => unknown) => h.handlers.set(c, fn),
    on: (c: string, fn: (e: unknown, p: unknown) => void) => h.listeners.set(c, fn),
    removeHandler: () => undefined,
  },
  BrowserWindow: { fromWebContents: () => ({ id: 'win' }) },
  dialog: { showOpenDialog },
}));

const TRUSTED = 'app://tepegoz/chrome.html';
vi.mock('../lib/trusted-origin', () => ({ isTrustedAppUrl: (u: string) => u === TRUSTED }));
vi.mock('../lib/i18n-main', () => ({
  mainStrings: () => ({ errors: { forbidden: 'forbidden' } }),
}));

const store = vi.hoisted(() => ({
  list: vi.fn(() => [{ id: 'c1' }]),
  get: vi.fn((_: unknown, id: string) => ({ id })),
  delete: vi.fn(),
  clear: vi.fn(),
}));
vi.mock('@tepegoz/persistence', () => ({ AgentConversationStore: store }));

const svc = vi.hoisted(() => ({
  newConversation: vi.fn(),
  currentConversation: vi.fn(() => ({ id: 'cur' })),
  openConversation: vi.fn((_: unknown, id: string) => ({ id })),
}));
vi.mock('../agent/agent-service.electron', () => ({ default: svc }));

const db = vi.hoisted((): { value: unknown } => ({ value: {} }));
vi.mock('../db/database.electron', () => ({ getDb: () => db.value }));

const tm = vi.hoisted(
  (): {
    state: { activeId: string | null; tabs: { id: string; url: string }[] };
    wc: {
      isDestroyed: () => boolean;
      executeJavaScript: (s: string, b: boolean) => Promise<unknown>;
    } | null;
  } => ({
    state: { activeId: 't1', tabs: [{ id: 't1', url: 'https://example.com/page' }] },
    wc: null,
  }),
);
vi.mock('../tabs', () => ({
  default: {
    getState: () => tm.state,
    activeWebContents: () => tm.wc,
  },
}));

const shared = vi.hoisted(() => ({
  agentEnabled: vi.fn(() => true),
  requireAgentEnabled: vi.fn(),
  broadcastConversationsState: vi.fn(),
}));
vi.mock('./ipc-agent-shared', () => shared);

const ensureGroupForTab = vi.hoisted(() => vi.fn(() => 'grp-1'));
vi.mock('../agent/agent-tab-group.electron', () => ({ default: { ensureGroupForTab } }));

const fsStat = vi.hoisted(() => vi.fn());
const fsReadFile = vi.hoisted(() => vi.fn());
vi.mock('node:fs/promises', () => ({ stat: fsStat, readFile: fsReadFile }));

const { registerAgentConversationIpc } = await import('./ipc-agent-conversations');

const ev = { senderFrame: { url: TRUSTED }, sender: {} };
const call = (channel: string, payload?: unknown) => h.handlers.get(channel)?.(ev, payload);
const fire = (channel: string, payload?: unknown) => h.listeners.get(channel)?.(ev, payload);

beforeEach(() => {
  h.handlers.clear();
  h.listeners.clear();
  Object.values(store).forEach((f) => f.mockClear());
  Object.values(svc).forEach((f) => f.mockClear());
  shared.agentEnabled.mockReset().mockReturnValue(true);
  shared.requireAgentEnabled.mockReset();
  shared.broadcastConversationsState.mockClear();
  ensureGroupForTab.mockClear();
  showOpenDialog.mockReset();
  fsStat.mockReset();
  fsReadFile.mockReset();
  db.value = {};
  tm.state = { activeId: 't1', tabs: [{ id: 't1', url: 'https://example.com/page' }] };
  tm.wc = null;
  registerAgentConversationIpc();
});

describe('history handlers', () => {
  it('list is behind requireAgentEnabled and accepts an absent payload', () => {
    expect(call(IpcChannels.agentConversationsList, undefined)).toEqual([{ id: 'c1' }]);
    expect(shared.requireAgentEnabled).toHaveBeenCalled();
  });

  it('every history handler returns the empty value when there is no database', () => {
    db.value = null;
    expect(call(IpcChannels.agentConversationsList, {})).toEqual([]);
    expect(call(IpcChannels.agentConversationsGet, 'c1')).toBeNull();
    call(IpcChannels.agentConversationsDelete, 'c1');
    call(IpcChannels.agentConversationsClear, undefined);
    expect(store.delete).not.toHaveBeenCalled();
    expect(store.clear).not.toHaveBeenCalled();
  });

  it('delete + clear broadcast the new state', () => {
    call(IpcChannels.agentConversationsDelete, 'c1');
    call(IpcChannels.agentConversationsClear, undefined);
    expect(store.delete).toHaveBeenCalledWith(db.value, 'c1');
    expect(store.clear).toHaveBeenCalledWith(db.value);
    expect(shared.broadcastConversationsState).toHaveBeenCalledTimes(2);
  });

  it('get validates the id and delegates to AgentConversationStore', () => {
    expect(call(IpcChannels.agentConversationsGet, 'c9')).toEqual({ id: 'c9' });
    expect(shared.requireAgentEnabled).toHaveBeenCalled();
    expect(store.get).toHaveBeenCalledWith(db.value, 'c9');
  });

  it('current resolves via AgentService for a live DB, and is null without one', () => {
    expect(call(IpcChannels.agentConversationsCurrent, 'g1')).toEqual({ id: 'cur' });
    expect(svc.currentConversation).toHaveBeenCalledWith(db.value, 'g1');

    db.value = null;
    expect(call(IpcChannels.agentConversationsCurrent, 'g1')).toBeNull();
  });

  it('open validates {id, groupId} and delegates to AgentService', () => {
    call(IpcChannels.agentConversationsOpen, { id: 'c9', groupId: 'g1' });
    expect(svc.openConversation).toHaveBeenCalledWith(db.value, 'c9', 'g1');
  });

  it('open rejects a payload missing groupId', () => {
    expect(() => call(IpcChannels.agentConversationsOpen, { id: 'c9' })).toThrow();
  });
});

describe('agentNewConversation (fire-and-forget)', () => {
  it('starts a new conversation when the agent is enabled', () => {
    fire(IpcChannels.agentNewConversation, 'g1');
    expect(svc.newConversation).toHaveBeenCalledWith('g1');
  });

  it('silently does nothing when the agent is off', () => {
    shared.agentEnabled.mockReturnValue(false);
    fire(IpcChannels.agentNewConversation, 'g1');
    expect(svc.newConversation).not.toHaveBeenCalled();
  });
});

describe('agentActiveTabUrl (ungated on purpose)', () => {
  it('returns the active tab URL without calling requireAgentEnabled', () => {
    expect(call(IpcChannels.agentActiveTabUrl)).toBe('https://example.com/page');
    expect(shared.requireAgentEnabled).not.toHaveBeenCalled();
  });

  it('returns null when the active tab has no committed URL', () => {
    tm.state = { activeId: 't1', tabs: [{ id: 't1', url: '' }] };
    expect(call(IpcChannels.agentActiveTabUrl)).toBeNull();
  });
});

describe('agentEnsureGroup', () => {
  it('fails with a 409 when there is no active tab', async () => {
    tm.state = { activeId: null, tabs: [] };
    await expect(call(IpcChannels.agentEnsureGroup, undefined)).rejects.toThrow(
      /409.*No active tab/,
    );
  });

  it('returns the ensured group id for the active tab', async () => {
    expect(await call(IpcChannels.agentEnsureGroup, undefined)).toEqual({ groupId: 'grp-1' });
    expect(ensureGroupForTab).toHaveBeenCalledWith('t1');
  });
});

describe('agentCaptureSelection', () => {
  it("returns '' when there is no live WebContents", async () => {
    tm.wc = null;
    expect(await call(IpcChannels.agentCaptureSelection, undefined)).toBe('');
  });

  it('returns the page selection string', async () => {
    tm.wc = { isDestroyed: () => false, executeJavaScript: vi.fn(() => Promise.resolve('picked')) };
    expect(await call(IpcChannels.agentCaptureSelection, undefined)).toBe('picked');
  });
});

describe('agentPickFiles', () => {
  it('returns [] when the dialog is cancelled', async () => {
    showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });
    expect(await call(IpcChannels.agentPickFiles, undefined)).toEqual([]);
  });

  it('reads text as utf8, binary as base64, and drops a file over 5 MB', async () => {
    showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: ['C:/x/notes.md', 'C:/x/pic.bin', 'C:/x/huge.txt'],
    });
    fsStat.mockImplementation((fp: string) =>
      Promise.resolve({ size: fp.endsWith('huge.txt') ? 6 * 1024 * 1024 : 10 }),
    );
    fsReadFile.mockImplementation((fp: string) =>
      Promise.resolve(Buffer.from(fp.endsWith('.md') ? 'hello' : [1, 2, 3])),
    );

    const out = (await call(IpcChannels.agentPickFiles, undefined)) as {
      name: string;
      content: string;
      mimeType: string;
    }[];

    expect(out).toHaveLength(2); // huge.txt dropped
    const md = out.find((f) => f.name === 'notes.md')!;
    expect(md).toMatchObject({ mimeType: 'text/markdown', content: 'hello' });
    const bin = out.find((f) => f.name === 'pic.bin')!;
    expect(bin.mimeType).toBe('application/octet-stream');
    expect(bin.content).toBe(Buffer.from([1, 2, 3]).toString('base64'));
  });

  it('never reads more than the first 5 selected files', async () => {
    showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: Array.from({ length: 8 }, (_, i) => `C:/x/f${String(i)}.txt`),
    });
    fsStat.mockResolvedValue({ size: 5 });
    fsReadFile.mockResolvedValue(Buffer.from('x'));
    await call(IpcChannels.agentPickFiles, undefined);
    expect(fsStat.mock.calls.length).toBe(5);
  });
});
