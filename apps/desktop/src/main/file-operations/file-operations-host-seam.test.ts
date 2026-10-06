import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `FileOperationsHost` — the `FileSystemHost` seam it hands `registerFileOperations` (every fs call
 * confined to the granted roots) and the first-run `~/tepegoz` default-grant seeding, each driven
 * through a freshly re-imported module so the one-shot `init` runs again.
 */

const realpath = vi.hoisted(() => vi.fn((p: string) => Promise.resolve(p)));
type FakeStat = {
  isFile: () => boolean;
  isDirectory: () => boolean;
  size: number;
  mtimeMs: number;
  birthtimeMs: number;
};
const fsStat = vi.hoisted(() =>
  vi.fn<() => Promise<FakeStat>>(() =>
    Promise.resolve({
      isFile: () => true,
      isDirectory: () => false,
      size: 1,
      mtimeMs: 2,
      birthtimeMs: 3,
    }),
  ),
);
const fsp = vi.hoisted(() => ({
  mkdir: vi.fn(() => Promise.resolve()),
  writeFile: vi.fn(() => Promise.resolve()),
  appendFile: vi.fn(() => Promise.resolve()),
  copyFile: vi.fn(() => Promise.resolve()),
  readdir: vi.fn<(...a: unknown[]) => Promise<unknown[]>>(() => Promise.resolve([])),
  readFile: vi.fn<(...a: unknown[]) => Promise<string | Buffer>>(() => Promise.resolve('')),
  rename: vi.fn(() => Promise.resolve()),
  rm: vi.fn(() => Promise.resolve()),
}));
vi.mock('node:fs/promises', () => ({ realpath, stat: fsStat, ...fsp }));
vi.mock('node:os', () => ({ homedir: () => path.join(path.sep, 'home', 'u') }));

class AppError extends Error {
  statusCode: number;
  constructor(m: string, s: number) {
    super(m);
    this.statusCode = s;
  }
}
const logger = vi.hoisted(() => ({ warn: vi.fn() }));
vi.mock('@tepegoz/libs', () => ({ AppError, Logger: logger }));

const prefs = vi.hoisted(() => ({
  getAll: vi.fn(() => ({
    fileOperationsEnabled: true,
    fileAccessGrants: [{ path: '/g1', mode: 'read', recursive: true }],
    fileAccessSeeded: true,
  })),
  update: vi.fn(),
}));
vi.mock('@tepegoz/preferences', () => ({ default: prefs }));

const policy = vi.hoisted(() => ({
  assertMembership: vi.fn(),
  setGrants: vi.fn(),
  decide: vi.fn((): string => 'allow'),
}));
const registerFileOperations = vi.hoisted(() => vi.fn());
vi.mock('@tepegoz/file-operations', () => ({
  FileAccessPolicy: class {
    assertMembership = policy.assertMembership;
    setGrants = policy.setGrants;
    decide = policy.decide;
  },
  FILE_OP_REQUIRED_MODE: { file_write: 'write', file_read: 'read' },
  registerFileOperations,
}));

beforeEach(() => {
  vi.clearAllMocks();
  realpath.mockImplementation((p: string) => Promise.resolve(p));
  fsStat.mockResolvedValue({
    isFile: () => true,
    isDirectory: () => false,
    size: 1,
    mtimeMs: 2,
    birthtimeMs: 3,
  });
  prefs.getAll.mockReturnValue({
    fileOperationsEnabled: true,
    fileAccessGrants: [{ path: '/g1', mode: 'read', recursive: true }],
    fileAccessSeeded: true,
  });
  policy.decide.mockReturnValue('allow');
  fsp.readdir.mockResolvedValue([]);
  fsp.readFile.mockResolvedValue('');
  fsp.mkdir.mockResolvedValue(undefined);
  fsp.writeFile.mockResolvedValue(undefined);
});

/** Re-import the module fresh (so its one-shot `init` runs) and capture the `FileSystemHost` seam it
 *  hands `registerFileOperations`. */
async function freshFsHost() {
  vi.resetModules();
  const m = await import('./file-operations-host');
  m.default.init();
  const arg = registerFileOperations.mock.calls.at(-1)![0] as {
    host: {
      readFile: (p: string, enc?: string) => Promise<string>;
      writeFile: (p: string, c: string, enc?: string) => Promise<void>;
      appendFile: (p: string, c: string, enc?: string) => Promise<void>;
      mkdir: (p: string) => Promise<void>;
      readdir: (p: string) => Promise<{ name: string; kind: string }[]>;
      stat: (p: string) => Promise<{ kind: string; size: number }>;
      exists: (p: string) => Promise<boolean>;
      rename: (a: string, b: string) => Promise<void>;
      copyFile: (a: string, b: string) => Promise<void>;
      remove: (p: string, r: boolean) => Promise<void>;
      search: (root: string, pattern: string, limit: number) => Promise<string[]>;
    };
  };
  return arg.host;
}

describe('the FileSystemHost seam', () => {
  it('readFile / writeFile / appendFile honour the base64 vs utf8 encoding', async () => {
    const host = await freshFsHost();

    fsp.readFile.mockResolvedValueOnce('plain text');
    expect(await host.readFile('/g1/a.txt', 'utf8')).toBe('plain text');
    expect(fsp.readFile).toHaveBeenLastCalledWith('/g1/a.txt', 'utf8');

    fsp.readFile.mockResolvedValueOnce(Buffer.from('bin'));
    expect(await host.readFile('/g1/a.bin', 'base64')).toBe(Buffer.from('bin').toString('base64'));
    expect(fsp.readFile).toHaveBeenLastCalledWith('/g1/a.bin');

    await host.writeFile('/g1/o.bin', Buffer.from('xy').toString('base64'), 'base64');
    expect(fsp.writeFile).toHaveBeenLastCalledWith('/g1/o.bin', Buffer.from('xy'));

    await host.writeFile('/g1/o.txt', 'hi', 'utf8');
    expect(fsp.writeFile).toHaveBeenLastCalledWith('/g1/o.txt', 'hi');

    await host.appendFile('/g1/log', Buffer.from('z').toString('base64'), 'base64');
    expect(fsp.appendFile).toHaveBeenLastCalledWith('/g1/log', Buffer.from('z'));

    await host.appendFile('/g1/log.txt', 'more text', 'utf8');
    expect(fsp.appendFile).toHaveBeenLastCalledWith('/g1/log.txt', 'more text');
  });

  it('mkdir is recursive; rename / copyFile / remove delegate straight through', async () => {
    const host = await freshFsHost();
    await host.mkdir('/g1/deep');
    expect(fsp.mkdir).toHaveBeenCalledWith('/g1/deep', { recursive: true });

    await host.rename('/g1/a', '/g1/b');
    expect(fsp.rename).toHaveBeenCalledWith('/g1/a', '/g1/b');
    await host.copyFile('/g1/a', '/g1/c');
    expect(fsp.copyFile).toHaveBeenCalledWith('/g1/a', '/g1/c');
    await host.remove('/g1/d', true);
    expect(fsp.rm).toHaveBeenCalledWith('/g1/d', { recursive: true, force: false });
  });

  it('readdir maps dirents to the compact {name, kind}; stat projects a FileStat', async () => {
    const host = await freshFsHost();
    fsp.readdir.mockResolvedValueOnce([
      { name: 'f', isFile: () => true, isDirectory: () => false },
      { name: 'sub', isFile: () => false, isDirectory: () => true },
      { name: 'sock', isFile: () => false, isDirectory: () => false },
    ]);
    expect(await host.readdir('/g1')).toEqual([
      { name: 'f', kind: 'file' },
      { name: 'sub', kind: 'directory' },
      { name: 'sock', kind: 'other' },
    ]);

    fsStat.mockResolvedValueOnce({
      isFile: () => true,
      isDirectory: () => false,
      size: 42,
      mtimeMs: 7,
      birthtimeMs: 9,
    });
    expect(await host.stat('/g1/f')).toEqual({
      kind: 'file',
      size: 42,
      modifiedMs: 7,
      createdMs: 9,
    });
  });

  it('exists reflects whether stat resolves', async () => {
    const host = await freshFsHost();
    expect(await host.exists('/g1/there')).toBe(true);
    fsStat.mockRejectedValueOnce(new Error('ENOENT'));
    expect(await host.exists('/g1/gone')).toBe(false);
  });

  it('search walks the tree and returns paths whose relative form matches the glob', async () => {
    const host = await freshFsHost();
    fsp.readdir.mockImplementation((dir: unknown) => {
      if (String(dir).endsWith('root')) {
        return Promise.resolve([
          { name: 'keep.log', isFile: () => true, isDirectory: () => false },
          { name: 'nested', isFile: () => false, isDirectory: () => true },
          { name: 'skip.txt', isFile: () => true, isDirectory: () => false },
        ]);
      }
      return Promise.resolve([{ name: 'deep.log', isFile: () => true, isDirectory: () => false }]);
    });
    const root = path.join(path.sep, 'root');
    const hits = await host.search(root, '**/*.log', 10);
    expect(hits).toEqual([path.join(root, 'keep.log'), path.join(root, 'nested', 'deep.log')]);
  });

  it('search stops at the result limit', async () => {
    const host = await freshFsHost();
    fsp.readdir.mockResolvedValue([
      { name: 'a.log', isFile: () => true, isDirectory: () => false },
      { name: 'b.log', isFile: () => true, isDirectory: () => false },
      { name: 'c.log', isFile: () => true, isDirectory: () => false },
    ]);
    const hits = await host.search(path.join(path.sep, 'r'), '*.log', 2);
    expect(hits).toHaveLength(2);
  });

  it('search stops at the entry-visit cap, not just the result limit', async () => {
    const host = await freshFsHost();
    const entries = Array.from({ length: 20_001 }, (_, i) => ({
      name: `f${String(i)}.txt`, // never matches the pattern below, so only the visited cap can stop it
      isFile: () => true,
      isDirectory: () => false,
    }));
    fsp.readdir.mockResolvedValue(entries);
    const hits = await host.search(path.join(path.sep, 'r'), '*.log', 1_000_000);
    expect(hits).toEqual([]);
  });

  it('search matches a single-char "?" glob wildcard', async () => {
    const host = await freshFsHost();
    fsp.readdir.mockResolvedValue([
      { name: 'a1.log', isFile: () => true, isDirectory: () => false },
      { name: 'a12.log', isFile: () => true, isDirectory: () => false },
    ]);
    const root = path.join(path.sep, 'r');
    const hits = await host.search(root, 'a?.log', 10);
    expect(hits).toEqual([path.join(root, 'a1.log')]);
  });

  it('search skips a directory it cannot read rather than failing the whole walk', async () => {
    const host = await freshFsHost();
    fsp.readdir.mockImplementation((dir: unknown) =>
      String(dir).endsWith('root')
        ? Promise.resolve([
            { name: 'ok.log', isFile: () => true, isDirectory: () => false },
            { name: 'locked', isFile: () => false, isDirectory: () => true },
          ])
        : Promise.reject(new Error('EACCES')),
    );
    const root = path.join(path.sep, 'root');
    const hits = await host.search(root, '**/*.log', 10);
    expect(hits).toEqual([path.join(root, 'ok.log')]); // the locked subtree contributed nothing
  });
});

describe('seedDefaultGrant (via a fresh init)', () => {
  it('creates ~/tepegoz and writes the full-access grant when not yet seeded', async () => {
    prefs.getAll.mockReturnValue({
      fileOperationsEnabled: true,
      fileAccessGrants: [],
      fileAccessSeeded: false,
    });
    await freshFsHost();
    expect(prefs.update).toHaveBeenCalledWith({
      fileAccessSeeded: true,
      fileAccessGrants: [
        { path: path.join(path.sep, 'home', 'u', 'tepegoz'), mode: 'full', recursive: true },
      ],
    });
  });

  it('logs, but still writes the grant, when the default-folder mkdir fails', async () => {
    prefs.getAll.mockReturnValue({
      fileOperationsEnabled: true,
      fileAccessGrants: [],
      fileAccessSeeded: false,
    });
    fsp.mkdir.mockRejectedValueOnce(new Error('EACCES'));
    await freshFsHost();
    await new Promise((r) => setTimeout(r, 0)); // let the void mkdir().catch(...) run
    expect(logger.warn).toHaveBeenCalledWith(
      'Could not create default file-operations folder',
      expect.objectContaining({ err: expect.stringContaining('EACCES') as string }),
    );
    expect(prefs.update).toHaveBeenCalled();
  });
});
