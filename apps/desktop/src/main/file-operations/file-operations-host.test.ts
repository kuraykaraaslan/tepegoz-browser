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

  it('returns the normalized input unchanged when nothing on the whole path exists', async () => {
    realpath.mockRejectedValue(new Error('ENOENT'));
    const abs = path.join(path.sep, 'nothing', 'here', 'at', 'all.txt');
    expect(await Host.canonicalize(abs)).toBe(path.normalize(abs));
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

describe('the grants store handed to registerFileOperations', () => {
  it('forwards list/add/remove/update to the FileOperationsHost static methods', async () => {
    vi.resetModules();
    prefs.getAll.mockReturnValue({
      fileOperationsEnabled: true,
      fileAccessGrants: [{ path: '/g1', mode: 'read', recursive: true }],
      fileAccessSeeded: true,
    });
    const m = await import('./file-operations-host');
    m.default.init();
    const grants = registerFileOperations.mock.calls.at(-1)![0] as {
      grants: {
        list: () => unknown;
        add: (g: unknown) => Promise<void>;
        remove: (p: string) => Promise<void>;
        update: (p: string, patch: unknown) => Promise<void>;
      };
    };

    expect(grants.grants.list()).toEqual([{ path: '/g1', mode: 'read', recursive: true }]);

    await grants.grants.add({ path: '/g2', mode: 'read', recursive: false });
    expect(prefs.update).toHaveBeenLastCalledWith({
      fileAccessGrants: [
        { path: '/g1', mode: 'read', recursive: true },
        { path: '/g2', mode: 'read', recursive: false },
      ],
    });

    await grants.grants.remove('/g1');
    expect(prefs.update).toHaveBeenLastCalledWith({ fileAccessGrants: [] });

    prefs.getAll.mockReturnValue({
      fileOperationsEnabled: true,
      fileAccessGrants: [
        { path: '/g2', mode: 'read', recursive: false },
        { path: '/g3', mode: 'read', recursive: false },
      ],
      fileAccessSeeded: true,
    });
    await grants.grants.update('/g2', { mode: 'full' });
    expect(prefs.update).toHaveBeenLastCalledWith({
      fileAccessGrants: [
        { path: '/g2', mode: 'full', recursive: false },
        { path: '/g3', mode: 'read', recursive: false }, // untouched: a non-matching entry passes through
      ],
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
    expect(await Host.consentDecision(req({ args: undefined }))).toEqual({ type: 'fallthrough' });
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

  it('assertReadableFile returns the real path for an allowed regular file', async () => {
    realpath.mockResolvedValue('/g1/doc.txt');
    expect(await Host.assertReadableFile('/g1/doc.txt')).toBe('/g1/doc.txt');
    expect(policy.assertMembership).toHaveBeenCalledWith('/g1/doc.txt');
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

  it('writeAttachment writes bytes into ~/tepegoz/attachments and rejects an escaping name', async () => {
    const dir = path.join(path.sep, 'home', 'u', 'tepegoz', 'attachments');
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const target = await Host.writeAttachment('m1.png', bytes);
    expect(target).toBe(path.join(dir, 'm1.png'));
    expect(fsp.writeFile).toHaveBeenCalledWith(path.join(dir, 'm1.png'), Buffer.from(bytes));

    realpath.mockImplementation((p: string) => Promise.resolve(p === dir ? dir : '/elsewhere/x'));
    await expect(Host.writeAttachment('../escape', bytes)).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('writeExportBundle rejects a bundle name that escapes the folder', async () => {
    const root = path.join(path.sep, 'home', 'u', 'tepegoz');
    realpath.mockImplementation((p: string) =>
      Promise.resolve(p === root ? root : '/somewhere/else'),
    );
    await expect(Host.writeExportBundle('..', [])).rejects.toMatchObject({ statusCode: 400 });
  });

  it('writeExportBundle rejects a per-file relPath that resolves outside the bundle folder', async () => {
    const root = path.join(path.sep, 'home', 'u', 'tepegoz');
    // Only `root` itself "exists"; the bundle dir and the file target are both resolved by
    // canonicalize's ancestor-walk fallback, which re-appends the missing tail onto `root`.
    realpath.mockImplementation((p: string) =>
      p === root ? Promise.resolve(root) : Promise.reject(new Error('ENOENT')),
    );
    await expect(
      Host.writeExportBundle('diag', [{ relPath: path.join('..', 'escape.txt'), content: 'x' }]),
    ).rejects.toMatchObject({ statusCode: 400 });
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
