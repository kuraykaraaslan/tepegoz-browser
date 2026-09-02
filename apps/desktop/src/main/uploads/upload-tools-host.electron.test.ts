import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `uploadToolsHost` — the Electron host for the `upload_*` agent tools. Pinned: `listUploads`
 * forwards; `getUpload` finds by id or returns null; `createUpload` stamps `actor: 'agent'` and
 * resolves the target WebContents from `tabId` (else the active tab); `commandUpload` runs the
 * command then returns `{ ok: true }`.
 */

const svc = vi.hoisted(() => ({
  list: vi.fn(() => [{ id: 'u1' }, { id: 'u2' }]),
  create: vi.fn(() => ({ id: 'u3' })),
  command: vi.fn(() => Promise.resolve()),
}));
vi.mock('./upload-service.electron', () => ({ default: svc }));

const tm = vi.hoisted(() => ({
  webContentsForTab: vi.fn(() => ({ __wc: 'named' })),
  activeWebContents: vi.fn(() => ({ __wc: 'active' })),
}));
vi.mock('../tabs', () => ({ default: tm }));

const { uploadToolsHost } = await import('./upload-tools-host.electron');

beforeEach(() => {
  vi.clearAllMocks();
});

it('listUploads forwards to the service', () => {
  expect(uploadToolsHost.listUploads()).toEqual([{ id: 'u1' }, { id: 'u2' }]);
});

describe('getUpload', () => {
  it('finds the record by id', () => {
    expect(uploadToolsHost.getUpload('u2')).toEqual({ id: 'u2' });
  });

  it('returns null for an unknown id', () => {
    expect(uploadToolsHost.getUpload('nope')).toBeNull();
  });
});

describe('createUpload', () => {
  it('resolves the WebContents from tabId when given', () => {
    uploadToolsHost.createUpload({ tabId: 't9', name: 'f' } as never);
    expect(tm.webContentsForTab).toHaveBeenCalledWith('t9');
    expect(svc.create).toHaveBeenCalledWith(
      { tabId: 't9', name: 'f', actor: 'agent' },
      { __wc: 'named' },
    );
  });

  it('falls back to the active tab when no tabId is given', () => {
    uploadToolsHost.createUpload({ name: 'f' } as never);
    expect(tm.activeWebContents).toHaveBeenCalled();
    expect(svc.create).toHaveBeenCalledWith({ name: 'f', actor: 'agent' }, { __wc: 'active' });
  });
});

describe('commandUpload', () => {
  it('runs the command then acknowledges', async () => {
    expect(await uploadToolsHost.commandUpload({ id: 'u1', action: 'cancel' } as never)).toEqual({
      ok: true,
    });
    expect(svc.command).toHaveBeenCalledWith('u1', 'cancel');
  });
});
