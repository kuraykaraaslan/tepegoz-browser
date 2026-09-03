import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `UploadService` — the main-process staged-upload registry. Pinned: `init` wires the web-request
 * observers once; `create` rejects when no live page can receive the upload (404), otherwise resolves
 * each path through the file-operations sandbox, stat+classifies the files, binds them to the target's
 * file input via CDP (staged → bound, audited each step) and returns the id — a CDP failure marks it
 * failed + rethrows; `list` / `state` project the public record sorted newest-first; and `command`
 * routes cancel (clear the input + mark canceled) / clear (remove) and 404s an unknown id / 400s an
 * unknown action.
 */

vi.mock('node:fs/promises', () => ({ stat: vi.fn(() => Promise.resolve({ size: 100 })) }));

class AppError extends Error {
  statusCode: number;
  code?: string | undefined;
  constructor(m: string, s: number, code?: string) {
    super(m);
    this.statusCode = s;
    this.code = code;
  }
}
vi.mock('@tepegoz/libs', () => ({ AppError, Logger: { warn: vi.fn() } }));

vi.mock('@tepegoz/uploads', () => ({
  classifyUploadRisk: () => 'low',
  aggregateUploadRisk: () => 'low',
}));

const journal = vi.hoisted(() => ({ append: vi.fn() }));
vi.mock('@tepegoz/persistence', () => ({ EventJournal: journal }));
vi.mock('@tepegoz/desktop-ipc', () => ({ IpcChannels: { uploadsState: 'uploads:state' } }));
vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] } }));

const db = vi.hoisted((): { value: unknown } => ({ value: { __db: true } }));
vi.mock('../db/database.electron', () => ({ getDb: () => db.value }));

const fsHost = vi.hoisted(() => ({
  assertReadableFile: vi.fn((p: string) => Promise.resolve(`/real/${p}`)),
}));
vi.mock('../file-operations/file-operations-host', () => ({ default: fsHost }));

const cdp = vi.hoisted(() => ({ setFileInputFiles: vi.fn(() => Promise.resolve()) }));
vi.mock('../agent/cdp-driver.electron', () => ({ default: cdp }));

const tm = vi.hoisted(() => ({
  webContentsForTab: vi.fn((): unknown => null),
  activeWebContents: vi.fn((): unknown => null),
}));
vi.mock('../tabs', () => ({ default: tm }));

const webRequest = vi.hoisted(() => ({
  onBeforeRequest: vi.fn(),
  onCompleted: vi.fn(),
  onErrorOccurred: vi.fn(),
}));
vi.mock('../web-request/browsing-web-request-service.electron', () => ({ default: webRequest }));

type Svc = typeof import('./upload-service.electron').default;
async function load(): Promise<Svc> {
  vi.resetModules();
  return (await import('./upload-service.electron')).default;
}

const wc = () => ({ isDestroyed: () => false, getURL: () => 'https://form.test/submit' });
const input = (over: Record<string, unknown> = {}) =>
  ({ paths: ['doc.pdf'], ref: 'form#f input[type=file]', ...over }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  db.value = { __db: true };
  cdp.setFileInputFiles.mockResolvedValue(undefined);
  fsHost.assertReadableFile.mockImplementation((p: string) => Promise.resolve(`/real/${p}`));
});

describe('init', () => {
  it('wires the web-request observers exactly once', async () => {
    const Svc = await load();
    Svc.init();
    Svc.init();
    expect(webRequest.onBeforeRequest).toHaveBeenCalledTimes(1);
    expect(webRequest.onCompleted).toHaveBeenCalledTimes(1);
    expect(webRequest.onErrorOccurred).toHaveBeenCalledTimes(1);
  });
});

describe('create', () => {
  it('404s when no live page can receive the upload', async () => {
    const Svc = await load();
    await expect(Svc.create(input(), null)).rejects.toMatchObject({
      statusCode: 404,
      code: 'uploadNoActivePage',
    });
    await expect(
      Svc.create(input(), { isDestroyed: () => true, getURL: () => '' } as never),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('resolves the paths, binds them via CDP, and records a bound + audited upload', async () => {
    const Svc = await load();
    const { id } = await Svc.create(input(), wc() as never);
    expect(fsHost.assertReadableFile).toHaveBeenCalledWith('doc.pdf');
    expect(cdp.setFileInputFiles).toHaveBeenCalledWith(
      expect.anything(),
      'form#f input[type=file]',
      ['/real/doc.pdf'],
    );
    const [rec] = Svc.list();
    expect(rec).toMatchObject({
      id,
      status: 'bound',
      risk: 'low',
      files: [{ filename: 'doc.pdf', sizeBytes: 100, mimeType: 'application/pdf', risk: 'low' }],
      targetUrl: 'https://form.test/submit',
    });
    expect(journal.append.mock.calls.map((c) => (c[1] as { type: string }).type)).toEqual([
      'UploadStaged',
      'UploadBound',
    ]);
  });

  it('marks the upload failed and rethrows when the CDP bind throws', async () => {
    const Svc = await load();
    cdp.setFileInputFiles.mockRejectedValue(new Error('no such input'));
    await expect(Svc.create(input(), wc() as never)).rejects.toThrow('no such input');
    expect(Svc.list()[0]).toMatchObject({
      status: 'failed',
      error: expect.stringContaining('no such input') as string,
    });
    expect(journal.append.mock.calls.map((c) => (c[1] as { type: string }).type)).toContain(
      'UploadFailed',
    );
  });
});

describe('list / state', () => {
  it('are empty before any upload and sorted newest-first after', async () => {
    const Svc = await load();
    expect(Svc.list()).toEqual([]);
    expect(Svc.state()).toEqual({ items: [] });

    const nowSpy = vi.spyOn(Date, 'now');
    nowSpy.mockReturnValue(1_000);
    const a = await Svc.create(input({ paths: ['a.txt'] }), wc() as never);
    nowSpy.mockReturnValue(2_000);
    const b = await Svc.create(input({ paths: ['b.txt'] }), wc() as never);
    nowSpy.mockRestore();
    expect(Svc.list().map((r) => r.id)).toEqual([b.id, a.id]);
    expect(Svc.state()).toEqual({ items: Svc.list() });
  });
});

describe('command', () => {
  it('cancel clears the file input and marks the upload canceled', async () => {
    const Svc = await load();
    const target = { isDestroyed: () => false, getURL: () => 'https://form.test/' };
    tm.activeWebContents.mockReturnValue(target);
    const { id } = await Svc.create(input(), target as never);
    cdp.setFileInputFiles.mockClear();

    await Svc.command(id, 'cancel');
    expect(cdp.setFileInputFiles).toHaveBeenCalledWith(target, 'form#f input[type=file]', []);
    expect(Svc.list()[0]).toMatchObject({ status: 'canceled' });
  });

  it('clear removes the upload from the list', async () => {
    const Svc = await load();
    const { id } = await Svc.create(input(), wc() as never);
    await Svc.command(id, 'clear');
    expect(Svc.list()).toEqual([]);
  });

  it('404s an unknown id and 400s an unsupported action', async () => {
    const Svc = await load();
    await expect(Svc.command('ghost', 'cancel')).rejects.toMatchObject({
      statusCode: 404,
      code: 'uploadNotFound',
    });
    const { id } = await Svc.create(input(), wc() as never);
    await expect(Svc.command(id, 'explode' as never)).rejects.toMatchObject({
      statusCode: 400,
      code: 'unsupportedCommand',
    });
  });
});
