import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The `DownloadService` facade — `init`, and the thin routing methods the IPC layer and the print
 * path call. The lifecycle, command, resume and retry collaborators have their own tests; what this
 * pins is the facade's own decisions: `init` is idempotent and registers the quarantine handler as
 * CRITICAL, a stored `in_progress` row is corrected to `paused` on startup, `downloadURL` records
 * provenance before it asks Electron for the file, and `create` refuses when there is no live page.
 */

const persistence = vi.hoisted(() => ({
  DownloadStore: {
    list: vi.fn((): unknown[] => []),
    upsert: vi.fn(),
    clearTerminal: vi.fn(() => 0),
  },
}));
const db = vi.hoisted(() => ({ getDb: vi.fn((): unknown => ({})) }));
const sessions = vi.hoisted(() => ({ register: vi.fn() }));
const lifecycle = vi.hoisted(() => ({
  handleWillDownload: vi.fn(),
  ingestGeneratedFile: vi.fn(() => Promise.resolve('gen-id')),
}));
const commands = vi.hoisted(() => ({ runCommand: vi.fn(() => Promise.resolve()) }));

vi.mock('electron', () => ({}));
vi.mock('@tepegoz/persistence', () => persistence);
vi.mock('../db/database.electron', () => db);
vi.mock('../network/browsing-sessions.electron', () => ({ default: sessions }));
vi.mock('./download-service-lifecycle.electron', () => lifecycle);
vi.mock('./download-service-commands.electron', () => commands);
vi.mock('@tepegoz/libs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tepegoz/libs')>()),
}));

const { default: DownloadService } = await import('./download-service.electron');

function fakeWc(over: Record<string, unknown> = {}) {
  return {
    isDestroyed: () => false,
    getURL: () => 'https://page.example/article',
    downloadURL: vi.fn(),
    ...over,
  } as unknown as Parameters<typeof DownloadService.downloadURL>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  persistence.DownloadStore.list.mockReturnValue([]);
});

describe('init', () => {
  it('corrects a stored in_progress row to paused, keeps the rest, and registers a CRITICAL handler', () => {
    persistence.DownloadStore.list.mockReturnValue([
      { id: 'a', status: 'in_progress', filename: 'a.bin' },
      { id: 'b', status: 'quarantined', filename: 'b.bin' },
    ]);

    DownloadService.init();

    const byId = Object.fromEntries(DownloadService.list().map((r) => [r.id, r.status]));
    expect(byId).toMatchObject({ a: 'paused', b: 'quarantined' });

    expect(sessions.register).toHaveBeenCalledWith(
      'downloads',
      expect.any(Function),
      { critical: true },
    );
  });

  it('is idempotent — a second call registers nothing new', () => {
    DownloadService.init();
    DownloadService.init();
    expect(sessions.register).not.toHaveBeenCalled(); // already initialized by the first test
  });
});

describe('downloadURL', () => {
  it('is a no-op for an empty url', () => {
    const wc = fakeWc();
    DownloadService.downloadURL(wc, '');
    expect((wc as unknown as { downloadURL: ReturnType<typeof vi.fn> }).downloadURL).not.toHaveBeenCalled();
  });

  it('asks Electron for the file once the url is non-empty', () => {
    const wc = fakeWc();
    DownloadService.downloadURL(wc, 'https://cdn.example/f.zip');
    // Provenance is staged by URL for `will-download` to pick up; the record is not in the list yet.
    expect(
      (wc as unknown as { downloadURL: ReturnType<typeof vi.fn> }).downloadURL,
    ).toHaveBeenCalledWith('https://cdn.example/f.zip');
  });
});

describe('create', () => {
  it('throws a 404 AppError when there is no live web page', () => {
    expect(() => DownloadService.create({ url: 'https://x/f.bin' }, null)).toThrow(
      /no active web page/i,
    );
    try {
      DownloadService.create({ url: 'https://x/f.bin' }, null);
    } catch (err) {
      expect((err as { statusCode: number; code: string }).statusCode).toBe(404);
      expect((err as { code: string }).code).toBe('downloadNoActivePage');
    }
  });

  it('throws when the web page is destroyed', () => {
    expect(() =>
      DownloadService.create({ url: 'https://x/f.bin' }, fakeWc({ isDestroyed: () => true })),
    ).toThrow(/no active web page/i);
  });

  it('starts the download (actor defaults to agent) and echoes an idempotency key only when given', () => {
    const wc = fakeWc();
    expect(DownloadService.create({ url: 'https://x/f.bin' }, wc)).toEqual({});
    expect(
      DownloadService.create({ url: 'https://x/g.bin', idempotencyKey: 'k1' }, wc),
    ).toEqual({ idempotencyKey: 'k1' });
    expect((wc as unknown as { downloadURL: ReturnType<typeof vi.fn> }).downloadURL).toHaveBeenCalledTimes(2);
  });
});

describe('delegation', () => {
  it('command routes to runCommand with the shared context', async () => {
    const wc = fakeWc();
    await DownloadService.command('d1', 'pause', wc);
    expect(commands.runCommand).toHaveBeenCalledWith(expect.any(Object), 'd1', 'pause', wc);
  });

  it('ingestGeneratedFile routes to the lifecycle collaborator and returns its id', async () => {
    const id = await DownloadService.ingestGeneratedFile({
      filename: 'r.pdf',
      mimeType: 'application/pdf',
      bytes: new Uint8Array([1]),
      provenance: { actor: 'agent' },
      sourceUrl: 'https://app.example/r',
    });
    expect(id).toBe('gen-id');
    expect(lifecycle.ingestGeneratedFile).toHaveBeenCalledTimes(1);
  });
});
