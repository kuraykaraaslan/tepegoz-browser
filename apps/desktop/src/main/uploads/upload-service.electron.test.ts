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
const logger = vi.hoisted(() => ({ warn: vi.fn() }));
vi.mock('@tepegoz/libs', () => ({ AppError, Logger: logger }));

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

describe('the web-request lifecycle observers', () => {
  async function wired() {
    const Svc = await load();
    Svc.init();
    const onBefore = webRequest.onBeforeRequest.mock.calls[0]![1] as (d: unknown) => void;
    const onDone = webRequest.onCompleted.mock.calls[0]![1] as (d: { id: number }) => void;
    const onErr = webRequest.onErrorOccurred.mock.calls[0]![1] as (d: {
      id: number;
      error: string;
    }) => void;
    return { Svc, onBefore, onDone, onErr };
  }
  const auditTypes = () => journal.append.mock.calls.map((c) => (c[1] as { type: string }).type);

  it('moves an upload staged → submitting → completed as its request flows through', async () => {
    const { Svc, onBefore, onDone } = await wired();
    await Svc.create(input(), wc() as never);

    onBefore({
      method: 'POST',
      id: 100,
      url: 'https://form.test/submit?x=1',
      uploadData: [{ file: '/real/doc.pdf' }],
    });
    expect(Svc.list()[0]).toMatchObject({
      status: 'submitting',
      targetUrl: 'https://form.test/submit?x=1',
      targetOrigin: 'https://form.test',
    });

    onDone({ id: 100 });
    expect(Svc.list()[0]).toMatchObject({ status: 'completed' });
    expect(auditTypes()).toEqual([
      'UploadStaged',
      'UploadBound',
      'UploadSubmitting',
      'UploadCompleted',
    ]);
  });

  it('marks the upload failed when its request errors out', async () => {
    const { Svc, onBefore, onErr } = await wired();
    await Svc.create(input(), wc() as never);

    onBefore({
      method: 'POST',
      id: 101,
      url: 'https://form.test/',
      uploadData: [{ file: '/real/doc.pdf' }],
    });
    onErr({ id: 101, error: 'net::ERR_ABORTED' });
    expect(Svc.list()[0]).toMatchObject({ status: 'failed', error: 'net::ERR_ABORTED' });
    expect(auditTypes()).toContain('UploadFailed');
  });

  it('ignores non-upload methods, unknown files, and an unparseable target URL', async () => {
    const { Svc, onBefore } = await wired();
    await Svc.create(input(), wc() as never);

    onBefore({ method: 'GET', id: 1, url: 'https://x/', uploadData: [{ file: '/real/doc.pdf' }] });
    onBefore({ method: 'POST', id: 2, url: 'https://x/', uploadData: [{ file: '/not/staged' }] });
    onBefore({ method: 'POST', id: 3, url: 'https://x/' }); // no uploadData at all
    expect(Svc.list()[0]).toMatchObject({ status: 'bound' }); // untouched

    onBefore({
      method: 'POST',
      id: 4,
      url: 'not a url',
      uploadData: [{ file: '/real/doc.pdf' }],
    });
    // The unparseable URL leaves `targetOrigin` unset rather than crashing.
    expect(Svc.list()[0]).toMatchObject({ status: 'submitting' });
    expect(Svc.list()[0]).not.toHaveProperty('targetOrigin');
  });

  it('a completed/failed callback for an unknown request id is a no-op', async () => {
    const { Svc, onDone, onErr } = await wired();
    await Svc.create(input(), wc() as never);
    expect(() => {
      onDone({ id: 999 });
      onErr({ id: 999, error: 'x' });
    }).not.toThrow();
    expect(Svc.list()[0]).toMatchObject({ status: 'bound' });
  });
});

describe('audit resilience', () => {
  it('a throwing journal append is logged, not fatal to create', async () => {
    const Svc = await load();
    journal.append.mockImplementationOnce(() => {
      throw new Error('journal offline');
    });
    await expect(Svc.create(input(), wc() as never)).resolves.toMatchObject({
      id: expect.any(String) as string,
    });
    expect(logger.warn).toHaveBeenCalledWith('Upload audit append failed', expect.any(Object));
  });
});
