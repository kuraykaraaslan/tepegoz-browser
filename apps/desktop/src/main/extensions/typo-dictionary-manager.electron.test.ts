import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `TypoDictionaryManager` — the main-process nspell-dictionary catalog / installer. Pinned: `list`
 * projects the bundled catalog through `toInfo` (schema-invalid catalog → empty list; state + on-disk
 * files matching the catalog → "installed"); `download` 404s an unknown id; `cancel` is a no-op with
 * no active download; `remove` deletes the folder, drops the install-state entry and notifies the
 * progress listener; `showFolder` creates + reveals the dir; and `loadInstalled` returns the aff/dic
 * text of the installed, recommendation-preferred dictionary for a language (else null).
 */

const cfg = vi.hoisted(
  (): {
    catalog: { version: number; dictionaries: unknown[] };
    install: { version: number; installed: Record<string, unknown> };
    fileSize: number;
    digest: string;
    exists: boolean;
  } => ({
    catalog: { version: 1, dictionaries: [] },
    install: { version: 1, installed: {} },
    fileSize: 10,
    digest: 'a'.repeat(64),
    exists: true,
  }),
);

const fs = vi.hoisted(() => ({
  createWriteStream: vi.fn(() => {
    const h: Record<string, ((...a: unknown[]) => unknown)[]> = {};
    return {
      on(ev: string, fn: (...a: unknown[]) => unknown) {
        (h[ev] ??= []).push(fn);
        return this;
      },
      fire(ev: string) {
        for (const fn of h[ev] ?? []) fn();
      },
    };
  }),
  existsSync: vi.fn(() => cfg.exists),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn((p: unknown): string | Buffer => {
    const s = String(p);
    if (s.includes('catalog')) return JSON.stringify(cfg.catalog);
    if (s.includes('install-state')) return JSON.stringify(cfg.install);
    if (s.includes('index.aff')) return 'AFF-CONTENT';
    if (s.includes('index.dic')) return 'DIC-CONTENT';
    return Buffer.from('x');
  }),
  renameSync: vi.fn(),
  rmSync: vi.fn(),
  statSync: vi.fn(() => ({ size: cfg.fileSize })),
  writeFileSync: vi.fn(),
}));
vi.mock('node:fs', () => fs);

vi.mock('node:crypto', () => ({
  createHash: () => ({ update: () => undefined, digest: () => cfg.digest }),
}));

type Fn = (...a: unknown[]) => unknown;
type Resp = { statusCode?: number; headers?: Record<string, string>; emitError?: boolean };

const net = vi.hoisted(
  (): { queue: Resp[]; defer: boolean; cb: ((res: unknown) => void) | null } => ({
    queue: [],
    defer: false,
    cb: null,
  }),
);

function fakeRes(d: Resp): unknown {
  const h: Record<string, Fn[]> = {};
  return {
    statusCode: d.statusCode ?? 200,
    headers: d.headers ?? {},
    resume: vi.fn(),
    on(ev: string, fn: Fn) {
      (h[ev] ??= []).push(fn);
      return this;
    },
    pipe(out: { fire: (e: string) => void }) {
      if (d.emitError === true) {
        for (const fn of h['error'] ?? []) fn(new Error('socket hang up'));
        return out;
      }
      for (const fn of h['data'] ?? []) fn(Buffer.from('chunk'));
      out.fire('finish');
      return out;
    },
  };
}

const request = vi.hoisted(
  () => () =>
    vi.fn((_url: unknown, _opts: unknown, cb: (res: unknown) => void) => {
      net.cb = cb;
      return {
        on: vi.fn(),
        end: vi.fn(() => {
          if (net.defer) return;
          cb(fakeRes(net.queue.shift() ?? {}));
        }),
      };
    }),
);
vi.mock('node:http', () => ({ request: request() }));
vi.mock('node:https', () => ({ request: request() }));

const shell = vi.hoisted(() => ({ openPath: vi.fn(() => Promise.resolve('')) }));
vi.mock('electron', () => ({
  app: { getPath: () => '/userData', getAppPath: () => '/app' },
  shell,
}));

const logger = vi.hoisted(() => ({ warn: vi.fn(), info: vi.fn() }));
vi.mock('@tepegoz/libs', () => {
  class AppError extends Error {
    statusCode: number;
    code?: string | undefined;
    constructor(m: string, s: number, code?: string) {
      super(m);
      this.statusCode = s;
      this.code = code;
    }
  }
  return { AppError, Logger: logger };
});

type Mgr = typeof import('./typo-dictionary-manager.electron').default;
async function load(): Promise<Mgr> {
  vi.resetModules();
  return (await import('./typo-dictionary-manager.electron')).default;
}

const D = 'a'.repeat(64);
const entry = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'en_US',
  language: 'en',
  name: 'English (US)',
  uri: 'https://example.com/en.zip',
  sizeBytes: 20,
  sha256: D,
  license: 'MIT',
  version: '1.0',
  recommended: true,
  aff: { uri: 'https://example.com/en.aff', sizeBytes: 10, sha256: D },
  dic: { uri: 'https://example.com/en.dic', sizeBytes: 10, sha256: D },
  ...over,
});
const installedRec = (): Record<string, unknown> => ({
  id: 'en_US',
  version: '1.0',
  installedAt: 1,
  files: { aff: { sha256: D, sizeBytes: 10 }, dic: { sha256: D, sizeBytes: 10 } },
});

beforeEach(() => {
  vi.clearAllMocks();
  cfg.catalog = { version: 1, dictionaries: [entry()] };
  cfg.install = { version: 1, installed: {} };
  cfg.fileSize = 10;
  cfg.digest = D;
  cfg.exists = true;
  net.queue = [];
  net.defer = false;
  net.cb = null;
});

describe('list', () => {
  it('maps catalog entries, reporting "available" for an uninstalled dictionary', async () => {
    const mgr = await load();
    const [info] = mgr.list();
    expect(info).toMatchObject({
      id: 'en_US',
      language: 'en',
      installed: false,
      downloading: false,
      status: 'available',
    });
  });

  it('is empty when the catalog file fails schema validation', async () => {
    cfg.catalog = { version: 2, dictionaries: [] };
    const mgr = await load();
    expect(mgr.list()).toEqual([]);
  });

  it('reports "installed" when the state entry and on-disk files match the catalog', async () => {
    cfg.install = { version: 1, installed: { en_US: installedRec() } };
    const mgr = await load();
    expect(mgr.list()[0]).toMatchObject({ installed: true, status: 'installed' });
  });
});

describe('download', () => {
  it('rejects an unknown id with a 404', async () => {
    const mgr = await load();
    await expect(mgr.download('nope')).rejects.toMatchObject({
      statusCode: 404,
      code: 'dictionaryNotFound',
    });
  });

  it('fetches both files, verifies the checksum, and records install state', async () => {
    const mgr = await load();
    await mgr.download('en_US');

    expect(fs.renameSync).toHaveBeenCalledTimes(2); // aff + dic .part → final
    const written = fs.writeFileSync.mock.calls.map((c) => String(c[1])).join('\n');
    expect(written).toContain('"en_US"');
    expect(mgr.list()[0]).toMatchObject({ downloading: false });
  });

  it('is a no-op when a download for that id is already active', async () => {
    const mgr = await load();
    net.defer = true;
    const first = mgr.download('en_US');
    await mgr.download('en_US'); // second call returns immediately (already active)
    net.defer = false;
    net.cb?.(fakeRes({})); // release the first file; the second fetch runs normally
    await first;
    // only the first download's two files were fetched
    expect(fs.renameSync).toHaveBeenCalledTimes(2);
  });

  it('follows an HTTP redirect to the real file', async () => {
    const mgr = await load();
    net.queue = [{ statusCode: 302, headers: { location: 'https://cdn.example/real.aff' } }];
    await mgr.download('en_US');
    expect(fs.renameSync).toHaveBeenCalled();
  });

  it('gives up after too many redirects', async () => {
    const mgr = await load();
    net.queue = Array.from({ length: 6 }, () => ({
      statusCode: 302 as const,
      headers: { location: 'https://cdn.example/loop.aff' },
    }));
    await expect(mgr.download('en_US')).rejects.toMatchObject({ statusCode: 502 });
    expect(mgr.list()[0]).toMatchObject({ status: 'error', error: 'Download failed' });
  });

  it('surfaces a non-2xx response as a 502 and records the error', async () => {
    const mgr = await load();
    net.queue = [{ statusCode: 500 }];
    await expect(mgr.download('en_US')).rejects.toMatchObject({ statusCode: 502 });
    expect(mgr.list()[0]).toMatchObject({ status: 'error' });
  });

  it('wraps a socket error in a generic download-failed AppError', async () => {
    const mgr = await load();
    net.queue = [{ emitError: true }];
    await expect(mgr.download('en_US')).rejects.toMatchObject({
      code: 'dictionaryDownloadFailed',
    });
  });

  it('rejects with a checksum-mismatch code when the downloaded bytes do not match', async () => {
    const mgr = await load();
    cfg.digest = 'b'.repeat(64); // sha256File() now disagrees with the catalog sha
    await expect(mgr.download('en_US')).rejects.toMatchObject({
      code: 'dictionaryChecksumMismatch',
    });
  });

  it('settles quietly (no rethrow) when the in-flight download is canceled', async () => {
    const mgr = await load();
    net.defer = true;
    const p = mgr.download('en_US');
    mgr.cancel('en_US'); // aborts the controller
    net.cb?.(fakeRes({ emitError: true })); // the socket then errors out
    await expect(p).resolves.toBeUndefined();

    expect(logger.info).toHaveBeenCalledWith('Typo dictionary download canceled', {
      id: 'en_US',
    });
  });
});

describe('cancel', () => {
  it('is a no-op for an id with no active download', async () => {
    const mgr = await load();
    expect(() => {
      mgr.cancel('en_US');
    }).not.toThrow();
  });
});

describe('remove', () => {
  it('deletes the folder, drops the install-state entry, and notifies the listener', async () => {
    cfg.install = { version: 1, installed: { en_US: installedRec() } };
    const mgr = await load();
    const seen = vi.fn();
    mgr.setProgressListener(seen);
    mgr.remove('en_US');
    expect(fs.rmSync).toHaveBeenCalledWith(expect.stringContaining('en_US'), {
      recursive: true,
      force: true,
    });
    const written = fs.writeFileSync.mock.calls.at(-1)?.[1] as string;
    expect(written).toContain('"installed": {}');
    expect(seen).toHaveBeenCalledWith(expect.any(Array));
  });
});

describe('showFolder', () => {
  it('creates the dictionaries dir and reveals it', async () => {
    const mgr = await load();
    await mgr.showFolder();
    expect(fs.mkdirSync).toHaveBeenCalledWith(expect.stringContaining('dictionaries'), {
      recursive: true,
    });
    expect(shell.openPath).toHaveBeenCalledWith(expect.stringContaining('dictionaries'));
  });
});

describe('loadInstalled', () => {
  it('returns null when no dictionary for the language is installed', async () => {
    const mgr = await load();
    expect(mgr.loadInstalled('en')).toBeNull();
  });

  it('returns the aff/dic text of the installed dictionary', async () => {
    cfg.install = { version: 1, installed: { en_US: installedRec() } };
    const mgr = await load();
    expect(mgr.loadInstalled('en')).toEqual({
      id: 'en_US',
      language: 'en',
      aff: 'AFF-CONTENT',
      dic: 'DIC-CONTENT',
    });
  });
});
