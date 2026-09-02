import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IpcChannels } from '@tepegoz/desktop-ipc';

/**
 * `ipc-uploads.ts` — two delegation handlers. Pinned: `uploads:list` returns UploadService.list(),
 * `uploads:command` schema-checks {id, action} (only `cancel` / `clear`) before touching the service,
 * and an untrusted sender frame reaches neither.
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
  list: vi.fn(() => [{ id: 'up-1' }]),
  command: vi.fn(() => Promise.resolve()),
}));
vi.mock('../uploads/upload-service.electron', () => ({ default: svc }));

const { registerUploadsIpc } = await import('./ipc-uploads');

const ev = { senderFrame: { url: TRUSTED }, sender: {} };
const evil = { senderFrame: { url: 'https://evil.example/' }, sender: {} };
const call = (channel: string, payload?: unknown, event: unknown = ev) =>
  h.handlers.get(channel)?.(event, payload);

beforeEach(() => {
  h.handlers.clear();
  svc.list.mockClear();
  svc.command.mockClear();
  registerUploadsIpc();
});

it('uploads:list returns the service list', () => {
  expect(call(IpcChannels.uploadsList)).toEqual([{ id: 'up-1' }]);
});

describe('uploads:command', () => {
  it('validates {id, action} then delegates', async () => {
    await call(IpcChannels.uploadsCommand, { id: 'up-1', action: 'cancel' });
    expect(svc.command).toHaveBeenCalledWith('up-1', 'cancel');
  });

  it('rejects an unknown action before touching the service', async () => {
    await expect(
      call(IpcChannels.uploadsCommand, { id: 'up-1', action: 'explode' }),
    ).rejects.toBeDefined();
    expect(svc.command).not.toHaveBeenCalled();
  });

  it('rejects an empty id', async () => {
    await expect(
      call(IpcChannels.uploadsCommand, { id: '', action: 'clear' }),
    ).rejects.toBeDefined();
  });
});

describe('untrusted sender', () => {
  it('reaches neither handler', async () => {
    expect(() => call(IpcChannels.uploadsList, undefined, evil)).toThrow();
    await expect(
      call(IpcChannels.uploadsCommand, { id: 'up-1', action: 'cancel' }, evil),
    ).rejects.toBeDefined();
    expect(svc.list).not.toHaveBeenCalled();
    expect(svc.command).not.toHaveBeenCalled();
  });
});
