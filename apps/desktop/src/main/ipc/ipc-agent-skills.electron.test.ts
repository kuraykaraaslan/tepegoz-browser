import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IpcChannels } from '@tepegoz/desktop-ipc';
import { openDatabase, migrate, AgentMemoryStore, type Db } from '@tepegoz/persistence';

/**
 * `ipc-agent-skills.ts` — the S9 skills library. The properties that keep a skill from being an
 * autonomy channel are what's pinned:
 *   - every handler is behind `requireAgentEnabled`;
 *   - the main process MINTS the UUID for a new skill — a renderer choosing the primary key is a
 *     renderer choosing which row to overwrite;
 *   - delete is a soft-delete AND revokes every remembered grant scoped to that skill, because a
 *     skill is the only scope that can hold one and the user would otherwise have no surface to revoke;
 *   - and `agentContinueInBackground` parks the window (never `hide()`) so the agent keeps seeing.
 */

const h = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, payload: unknown) => unknown>(),
}));
vi.mock('electron', () => ({
  ipcMain: {
    handle: (c: string, fn: (e: unknown, p: unknown) => unknown) => h.handlers.set(c, fn),
    on: () => undefined,
    removeHandler: () => undefined,
  },
  BrowserWindow: { fromWebContents: () => ({ id: 'win' }) },
}));

const TRUSTED = 'app://tepegoz/chrome.html';
vi.mock('../lib/trusted-origin', () => ({ isTrustedAppUrl: (u: string) => u === TRUSTED }));
vi.mock('../lib/i18n-main', () => ({
  mainStrings: () => ({ errors: { forbidden: 'forbidden' } }),
}));

const db = vi.hoisted((): { value: unknown } => ({ value: null }));
vi.mock('../db/database.electron', () => ({ getDb: () => db.value }));

const requireAgentEnabled = vi.hoisted(() => vi.fn());
vi.mock('./ipc-agent-shared', () => ({ requireAgentEnabled }));

const win = vi.hoisted((): { focused: unknown } => ({ focused: null }));
vi.mock('../tabs', () => ({ default: { focusedWindow: () => win.focused } }));
const hideToTray = vi.hoisted(() => vi.fn());
vi.mock('../window', () => ({ hideToTray }));
const notifyHiddenToTrayOnce = vi.hoisted(() => vi.fn());
vi.mock('../tray', () => ({ notifyHiddenToTrayOnce }));

const { registerAgentSkillsIpc, registerAgentBackgroundIpc } = await import('./ipc-agent-skills');

const ev = { senderFrame: { url: TRUSTED }, sender: {} };
const call = (channel: string, payload?: unknown) => h.handlers.get(channel)?.(ev, payload);
const uuid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

let realDb: Db;
beforeEach(() => {
  h.handlers.clear();
  requireAgentEnabled.mockReset();
  hideToTray.mockClear();
  notifyHiddenToTrayOnce.mockClear();
  win.focused = null;
  realDb = openDatabase(':memory:');
  migrate(realDb);
  db.value = realDb;
  registerAgentSkillsIpc();
  registerAgentBackgroundIpc();
});

describe('agent-enabled gate', () => {
  it('every skills handler calls requireAgentEnabled first', () => {
    call(IpcChannels.agentSkillsList);
    expect(requireAgentEnabled).toHaveBeenCalledTimes(1);
  });

  it('a disabled agent stops the handler before it mutates the store', () => {
    requireAgentEnabled.mockImplementation(() => {
      throw new Error('agent disabled');
    });
    expect(() => call(IpcChannels.agentSkillsSave, { name: 'x', prompt: 'y' })).toThrow();
    expect(AgentMemoryStore.listSkills(realDb)).toEqual([]);
  });
});

describe('agentSkillsSave', () => {
  it('mints a UUID when the renderer supplies none', () => {
    const out = call(IpcChannels.agentSkillsSave, { name: 'Invoices', prompt: 'check them' }) as {
      id: string;
    }[];
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('honours a renderer-supplied id on the update path (overwrites that row)', () => {
    call(IpcChannels.agentSkillsSave, { id: uuid(1), name: 'v1', prompt: 'p' });
    const out = call(IpcChannels.agentSkillsSave, { id: uuid(1), name: 'v2', prompt: 'p' }) as {
      id: string;
      name: string;
    }[];
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: uuid(1), name: 'v2' });
  });

  it('rejects a nameless payload before touching the store', () => {
    expect(() => call(IpcChannels.agentSkillsSave, { prompt: 'p' })).toThrow();
    expect(AgentMemoryStore.listSkills(realDb)).toEqual([]);
  });

  it('returns [] and writes nothing when the database is unavailable', () => {
    db.value = null;
    expect(call(IpcChannels.agentSkillsSave, { name: 'n', prompt: 'p' })).toEqual([]);
  });
});

describe('agentSkillsDelete', () => {
  it('soft-deletes the skill AND revokes every remembered grant scoped to it', () => {
    call(IpcChannels.agentSkillsSave, { id: uuid(2), name: 'weekly', prompt: 'p' });
    AgentMemoryStore.putGrant(realDb, {
      id: uuid(9),
      scope: uuid(2),
      host: 'billing.test',
      tier: 'ui-write',
      expiresAt: Date.now() + 60_000,
    });
    expect(AgentMemoryStore.liveGrants(realDb, uuid(2), 'billing.test')).toHaveLength(1);

    const out = call(IpcChannels.agentSkillsDelete, uuid(2));
    expect(out).toEqual([]);
    expect(AgentMemoryStore.listSkills(realDb)).toEqual([]);
    expect(AgentMemoryStore.liveGrants(realDb, uuid(2), 'billing.test')).toEqual([]);
  });

  it('rejects a non-UUID id', () => {
    expect(() => call(IpcChannels.agentSkillsDelete, 'not-a-uuid')).toThrow();
  });
});

describe('agentContinueInBackground', () => {
  it('parks the focused window and shows the one-time tray hint', () => {
    win.focused = { isDestroyed: () => false };
    call(IpcChannels.agentContinueInBackground);
    expect(hideToTray).toHaveBeenCalledWith(win.focused);
    expect(notifyHiddenToTrayOnce).toHaveBeenCalledTimes(1);
  });

  it('is a no-op with no focused window, or a destroyed one', () => {
    win.focused = null;
    call(IpcChannels.agentContinueInBackground);
    win.focused = { isDestroyed: () => true };
    call(IpcChannels.agentContinueInBackground);
    expect(hideToTray).not.toHaveBeenCalled();
  });

  it('is behind the agent-enabled gate', () => {
    requireAgentEnabled.mockImplementation(() => {
      throw new Error('agent disabled');
    });
    win.focused = { isDestroyed: () => false };
    expect(() => call(IpcChannels.agentContinueInBackground)).toThrow();
    expect(hideToTray).not.toHaveBeenCalled();
  });
});
