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
  createWriteStream: vi.fn(),
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

const shell = vi.hoisted(() => ({ openPath: vi.fn(() => Promise.resolve('')) }));
vi.mock('electron', () => ({
  app: { getPath: () => '/userData', getAppPath: () => '/app' },
  shell,
}));

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
  return { AppError, Logger: { warn: vi.fn(), info: vi.fn() } };
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
