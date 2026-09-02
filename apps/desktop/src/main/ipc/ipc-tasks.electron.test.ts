import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IpcChannels } from '@tepegoz/desktop-ipc';

/**
 * `ipc-tasks.ts` — the saved-task IPC surface. Nine delegation handlers; the tests pin that every
 * payload is schema-checked before it reaches `TaskService` (a bad id / a save with no trigger / an
 * unknown action all throw with no service call), that run/cancel are lowered to a `TaskCommandInput`
 * with the right `action`, that set-enabled maps the boolean to enable/disable, and that an untrusted
 * frame reaches nothing.
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

const svc = vi.hoisted(() => ({
  list: vi.fn(() => []),
  get: vi.fn((id: string) => ({ id })),
  save: vi.fn((input: unknown) => ({ id: 'saved', ...(input as object) })),
  delete: vi.fn(),
  command: vi.fn(),
  listRuns: vi.fn(() => []),
  listArtifacts: vi.fn(() => []),
}));
vi.mock('../tasks/task-service.electron', () => ({ default: svc }));

const { registerTasksIpc } = await import('./ipc-tasks');

const ev = { senderFrame: { url: TRUSTED }, sender: {} };
const evil = { senderFrame: { url: 'https://evil.example/' }, sender: {} };
const call = (channel: string, payload?: unknown) => h.handlers.get(channel)?.(ev, payload);
const VALID_SAVE = { name: 'Weekly check', prompt: 'do the thing', triggers: [{ type: 'manual' }] };

beforeEach(() => {
  h.handlers.clear();
  Object.values(svc).forEach((f) => f.mockClear());
  registerTasksIpc();
});

it('registers the nine task channels as handlers', () => {
  expect(h.handlers.size).toBe(9);
});

describe('validation gates the service', () => {
  it('tasks:get rejects an empty id', () => {
    expect(() => call(IpcChannels.tasksGet, '')).toThrow();
    expect(svc.get).not.toHaveBeenCalled();
  });

  it('tasks:save rejects an input with no trigger', () => {
    expect(() => call(IpcChannels.tasksSave, { name: 'n', prompt: 'p', triggers: [] })).toThrow();
    expect(svc.save).not.toHaveBeenCalled();
  });

  it('tasks:save passes a valid input through', () => {
    call(IpcChannels.tasksSave, VALID_SAVE);
    expect(svc.save).toHaveBeenCalledWith(expect.objectContaining({ name: 'Weekly check' }));
  });

  it('tasks:set-enabled rejects a non-boolean enabled', () => {
    expect(() => call(IpcChannels.tasksSetEnabled, { id: 't1', enabled: 'yes' })).toThrow();
    expect(svc.command).not.toHaveBeenCalled();
  });
});

describe('command lowering', () => {
  it('tasks:run-now lowers to a run command carrying the idempotency key', () => {
    call(IpcChannels.tasksRunNow, { id: 't1', idempotencyKey: 'k1' });
    expect(svc.command).toHaveBeenCalledWith(
      expect.objectContaining({ id: 't1', action: 'run', idempotencyKey: 'k1' }),
    );
  });

  it('tasks:cancel-run lowers to a cancel command', () => {
    call(IpcChannels.tasksCancelRun, { id: 't1' });
    expect(svc.command).toHaveBeenCalledWith(
      expect.objectContaining({ id: 't1', action: 'cancel' }),
    );
  });

  it('tasks:set-enabled maps the boolean to enable / disable', () => {
    call(IpcChannels.tasksSetEnabled, { id: 't1', enabled: true });
    expect(svc.command).toHaveBeenCalledWith({ id: 't1', action: 'enable' });
    svc.command.mockClear();
    call(IpcChannels.tasksSetEnabled, { id: 't1', enabled: false });
    expect(svc.command).toHaveBeenCalledWith({ id: 't1', action: 'disable' });
  });
});

describe('list endpoints', () => {
  it('tasks:list-runs accepts an optional id filter (undefined = all)', () => {
    call(IpcChannels.tasksListRuns, undefined);
    expect(svc.listRuns).toHaveBeenCalledWith(undefined);
    call(IpcChannels.tasksListRuns, 't1');
    expect(svc.listRuns).toHaveBeenCalledWith('t1');
  });

  it('tasks:list-artifacts delegates the same way', () => {
    call(IpcChannels.tasksListArtifacts, 't1');
    expect(svc.listArtifacts).toHaveBeenCalledWith('t1');
  });
});

describe('untrusted sender', () => {
  it('reaches no TaskService method', () => {
    for (const channel of [
      IpcChannels.tasksList,
      IpcChannels.tasksSave,
      IpcChannels.tasksRunNow,
      IpcChannels.tasksDelete,
    ]) {
      expect(() => h.handlers.get(channel)?.(evil, VALID_SAVE)).toThrow();
    }
    expect(svc.list).not.toHaveBeenCalled();
    expect(svc.save).not.toHaveBeenCalled();
    expect(svc.command).not.toHaveBeenCalled();
    expect(svc.delete).not.toHaveBeenCalled();
  });
});
