import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `FileOperationsHost` — the Electron/Node wiring for the agent's sandboxed file operations. Pinned:
 * `canonicalize` (400 for a relative path, realpath for an existing target, nearest-ancestor +
 * re-appended suffix for a not-yet-existing one); `effectiveGrants` gated on the master switch; the
 * grant mutations rewriting `fileAccessGrants` and re-syncing the policy; `consentDecision` mapping
 * the policy verdict to auto-approve / auto-deny / fall-through (and falling through for a non-file or
 * targetless tool); `assertOpenablePath` refusing an executable extension (403) and a non-file (400);
 * and `init` being a one-shot that seeds, applies and registers.
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
vi.mock('@tepegoz/libs', () => ({ AppError, Logger: { warn: vi.fn() } }));

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

const { default: Host } = await import('./file-operations-host');

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

describe('canonicalize', () => {
  it('throws a 400 for a non-absolute path', async () => {
    await expect(Host.canonicalize('relative/x')).rejects.toMatchObject({ statusCode: 400 });
  });

  it('returns the realpath of an existing absolute target', async () => {
    realpath.mockResolvedValue('/real/target');
    expect(await Host.canonicalize('/some/target')).toBe('/real/target');
  });

  it('canonicalizes the nearest existing ancestor and re-appends the missing tail', async () => {
    const abs = path.join(path.sep, 'exists', 'new', 'file.txt');
    realpath.mockImplementation((p: string) =>
      p === path.join(path.sep, 'exists')
        ? Promise.resolve(path.join(path.sep, 'real'))
        : Promise.reject(new Error('ENOENT')),
    );
    expect(await Host.canonicalize(abs)).toBe(path.join(path.sep, 'real', 'new', 'file.txt'));
  });
});

describe('effectiveGrants', () => {
  it('returns the persisted grants only when file operations are enabled', () => {
    expect(Host.effectiveGrants()).toEqual([{ path: '/g1', mode: 'read', recursive: true }]);
    prefs.getAll.mockReturnValue({
      fileOperationsEnabled: false,
      fileAccessGrants: [{ path: '/g1', mode: 'read', recursive: true }],
      fileAccessSeeded: true,
    });
    expect(Host.effectiveGrants()).toEqual([]);
  });
});

describe('grant mutations re-sync the policy', () => {
  it('addGrant replaces any same-path grant then appends', async () => {
    prefs.getAll.mockReturnValue({
      fileOperationsEnabled: true,
      fileAccessGrants: [
        { path: '/g1', mode: 'read', recursive: true },
        { path: '/g2', mode: 'read', recursive: true },
      ],
      fileAccessSeeded: true,
    });
    await Host.addGrant({ path: '/g1', mode: 'full', recursive: false });
    expect(prefs.update).toHaveBeenCalledWith({
      fileAccessGrants: [
        { path: '/g2', mode: 'read', recursive: true },
        { path: '/g1', mode: 'full', recursive: false },
      ],
    });
    expect(policy.setGrants).toHaveBeenCalled();
  });

  it('removeGrant drops the folder; updateGrant merges the patch', async () => {
    prefs.getAll.mockReturnValue({
      fileOperationsEnabled: true,
      fileAccessGrants: [{ path: '/g1', mode: 'read', recursive: true }],
      fileAccessSeeded: true,
    });
    await Host.removeGrant('/g1');
    expect(prefs.update).toHaveBeenCalledWith({ fileAccessGrants: [] });

    prefs.update.mockClear();
    await Host.updateGrant('/g1', { mode: 'read-write' });
    expect(prefs.update).toHaveBeenCalledWith({
      fileAccessGrants: [{ path: '/g1', mode: 'read-write', recursive: true }],
    });
  });
});

describe('consentDecision', () => {
  const req = (over: Record<string, unknown> = {}) =>
    ({ toolName: 'file_write', args: { path: '/g1/f.txt' }, ...over }) as never;

  it('falls through for a non-file tool or a targetless call', async () => {
    expect(await Host.consentDecision(req({ toolName: 'search_web' }))).toEqual({
      type: 'fallthrough',
    });
    expect(await Host.consentDecision(req({ args: {} }))).toEqual({ type: 'fallthrough' });
  });

  it('maps the policy verdict: allow → auto-approve, deny → auto-deny, ask → fall-through', async () => {
    policy.decide.mockReturnValue('allow');
    expect(await Host.consentDecision(req())).toEqual({ type: 'auto', approved: true });
    policy.decide.mockReturnValue('deny');
    expect(await Host.consentDecision(req())).toEqual({ type: 'auto', approved: false });
    policy.decide.mockReturnValue('ask');
    expect(await Host.consentDecision(req())).toEqual({ type: 'fallthrough' });
  });

  it('prefers the `to` argument over `path` (rename/copy)', async () => {
    await Host.consentDecision(req({ args: { path: '/from', to: '/g1/dest' } }));
    expect(policy.decide).toHaveBeenCalledWith(path.normalize('/g1/dest'), 'write');
  });
});

describe('assertOpenablePath / assertReadableFile', () => {
  it('refuses an executable extension (403) and a non-file target (400)', async () => {
    await expect(Host.assertOpenablePath('/g1/evil.exe')).rejects.toMatchObject({
      statusCode: 403,
    });
    fsStat.mockResolvedValue({
      isFile: () => false,
      isDirectory: () => true,
      size: 0,
      mtimeMs: 0,
      birthtimeMs: 0,
    });
    await expect(Host.assertOpenablePath('/g1/folder')).rejects.toMatchObject({ statusCode: 400 });
    await expect(Host.assertReadableFile('/g1/folder')).rejects.toMatchObject({ statusCode: 400 });
  });

  it('returns the real path for an allowed regular file, after a membership check', async () => {
    realpath.mockResolvedValue('/g1/doc.txt');
    expect(await Host.assertOpenablePath('/g1/doc.txt')).toBe('/g1/doc.txt');
    expect(policy.assertMembership).toHaveBeenCalledWith('/g1/doc.txt');
  });
});

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
});

describe('writeExport / writeExportBundle', () => {
  it('writeExport canonicalizes into ~/tepegoz and rejects a name that escapes it', async () => {
    const dir = path.join(path.sep, 'home', 'u', 'tepegoz');
    const target = await Host.writeExport('chat.md', 'hello');
    expect(target).toBe(path.join(dir, 'chat.md'));
    expect(fsp.mkdir).toHaveBeenCalledWith(dir, { recursive: true });
    expect(fsp.writeFile).toHaveBeenCalledWith(path.join(dir, 'chat.md'), 'hello');

    realpath.mockImplementation((p: string) => Promise.resolve(p === dir ? dir : '/elsewhere/x'));
    await expect(Host.writeExport('../escape', 'x')).rejects.toMatchObject({ statusCode: 400 });
  });

  it('writeExportBundle creates the folder tree and writes each file, base64 where asked', async () => {
    const root = path.join(path.sep, 'home', 'u', 'tepegoz');
    const bundle = path.join(root, 'diag');
    const out = await Host.writeExportBundle('diag', [
      { relPath: 'notes.txt', content: 'n' },
      {
        relPath: path.join('img', 'a.png'),
        content: Buffer.from('p').toString('base64'),
        encoding: 'base64',
      },
    ]);
    expect(out).toBe(bundle);
    expect(fsp.writeFile).toHaveBeenCalledWith(path.join(bundle, 'notes.txt'), 'n');
    expect(fsp.writeFile).toHaveBeenCalledWith(path.join(bundle, 'img', 'a.png'), Buffer.from('p'));
  });

  it('writeExportBundle rejects a bundle name or a file path that escapes the folder', async () => {
    const root = path.join(path.sep, 'home', 'u', 'tepegoz');
    realpath.mockImplementation((p: string) =>
      Promise.resolve(p === root ? root : '/somewhere/else'),
    );
    await expect(Host.writeExportBundle('..', [])).rejects.toMatchObject({ statusCode: 400 });
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
});

describe('init', () => {
  it('is a one-shot that applies grants and registers the file operations', () => {
    Host.init();
    Host.init();
    expect(registerFileOperations).toHaveBeenCalledTimes(1);
    expect(policy.setGrants).toHaveBeenCalled();
  });

  it('reconcile re-applies the effective grants to the policy', () => {
    Host.reconcile();
    expect(policy.setGrants).toHaveBeenCalledWith([{ path: '/g1', mode: 'read', recursive: true }]);
  });
});
