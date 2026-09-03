import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `FileOperationsHost` — the Electron/Node wiring for the agent's sandboxed file operations. Pinned:
 * `canonicalize` rejects a non-absolute path and resolves an absolute one through `realpath`;
 * `assertOpenablePath` gates on membership + regular-file + a blocked-executable extension list;
 * `writeExport` / `writeExportBundle` write only strictly inside `~/tepegoz` (traversal → 400);
 * `effectiveGrants` is empty while file ops are disabled; the grant mutators rewrite the pref list and
 * re-apply the policy; and `consentDecision` maps the policy verdict to auto-approve / auto-deny /
 * fall-through (non-file tools always fall through).
 */

vi.mock('node:os', () => ({ homedir: () => '/home/kuray' }));

const fsp = vi.hoisted(() => ({
  appendFile: vi.fn(() => Promise.resolve()),
  copyFile: vi.fn(() => Promise.resolve()),
  mkdir: vi.fn(() => Promise.resolve()),
  readdir: vi.fn(() => Promise.resolve([])),
  readFile: vi.fn(() => Promise.resolve('')),
  realpath: vi.fn((p: string) => Promise.resolve(p)),
  rename: vi.fn(() => Promise.resolve()),
  rm: vi.fn(() => Promise.resolve()),
  stat: vi.fn<
    () => Promise<{
      isFile: () => boolean;
      isDirectory: () => boolean;
      size: number;
      mtimeMs: number;
    }>
  >(() => Promise.resolve({ isFile: () => true, isDirectory: () => false, size: 3, mtimeMs: 1 })),
  writeFile: vi.fn(() => Promise.resolve()),
}));
vi.mock('node:fs/promises', () => fsp);

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
    fileAccessGrants: [{ path: '/home/kuray/tepegoz', mode: 'full', recursive: true }],
    fileAccessSeeded: true,
  })),
  update: vi.fn(),
}));
vi.mock('@tepegoz/preferences', () => ({ default: prefs }));

const pol = vi.hoisted(() => ({
  setGrants: vi.fn(),
  assertMembership: vi.fn(),
  decide: vi.fn((): string => 'allow'),
}));
const registerFileOperations = vi.hoisted(() => vi.fn());
vi.mock('@tepegoz/file-operations', () => ({
  FileAccessPolicy: class {
    setGrants = pol.setGrants;
    assertMembership = pol.assertMembership;
    decide = pol.decide;
  },
  FILE_OP_REQUIRED_MODE: { file_write: 'write' } as Record<string, string>,
  registerFileOperations,
}));

type Mod = typeof import('./file-operations-host');
async function load(): Promise<Mod['default']> {
  vi.resetModules();
  return (await import('./file-operations-host')).default;
}

const TEPEGOZ = path.join('/home/kuray', 'tepegoz');
let FOH: Mod['default'];
beforeEach(async () => {
  vi.clearAllMocks();
  fsp.realpath.mockImplementation((p: string) => Promise.resolve(p));
  fsp.stat.mockResolvedValue({ isFile: () => true, isDirectory: () => false, size: 3, mtimeMs: 1 });
  prefs.getAll.mockReturnValue({
    fileOperationsEnabled: true,
    fileAccessGrants: [{ path: TEPEGOZ, mode: 'full', recursive: true }],
    fileAccessSeeded: true,
  });
  pol.decide.mockReturnValue('allow');
  pol.assertMembership.mockImplementation(() => undefined);
  FOH = await load();
});

describe('canonicalize', () => {
  it('rejects a non-absolute path', async () => {
    await expect(FOH.canonicalize('relative/x')).rejects.toMatchObject({ statusCode: 400 });
  });

  it('resolves an absolute path through realpath', async () => {
    expect(await FOH.canonicalize('/abs/./dir/../file')).toBe(path.normalize('/abs/file'));
  });
});

describe('assertOpenablePath', () => {
  it('returns the real path for a member regular file with a safe extension', async () => {
    expect(await FOH.assertOpenablePath(path.join(TEPEGOZ, 'note.txt'))).toBe(
      path.join(TEPEGOZ, 'note.txt'),
    );
    expect(pol.assertMembership).toHaveBeenCalled();
  });

  it('403s an executable/script extension and 400s a non-file', async () => {
    await expect(FOH.assertOpenablePath(path.join(TEPEGOZ, 'run.exe'))).rejects.toMatchObject({
      statusCode: 403,
    });
    fsp.stat.mockResolvedValue({
      isFile: () => false,
      isDirectory: () => true,
      size: 0,
      mtimeMs: 1,
    });
    await expect(FOH.assertOpenablePath(path.join(TEPEGOZ, 'sub'))).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('propagates a membership rejection', async () => {
    pol.assertMembership.mockImplementation(() => {
      throw new AppError('outside a granted folder', 403);
    });
    await expect(FOH.assertOpenablePath('/etc/passwd')).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe('writeExport', () => {
  it('writes strictly inside ~/tepegoz and returns the path', async () => {
    const target = await FOH.writeExport('chat.md', 'hello');
    expect(target).toBe(path.join(TEPEGOZ, 'chat.md'));
    expect(fsp.writeFile).toHaveBeenCalled();
  });

  it('400s a filename that escapes ~/tepegoz', async () => {
    await expect(FOH.writeExport(path.join('..', 'evil'), 'x')).rejects.toMatchObject({
      statusCode: 400,
    });
  });
});

describe('writeExportBundle', () => {
  it('creates the bundle folder and writes each file under it', async () => {
    const dir = await FOH.writeExportBundle('diag', [
      { relPath: 'summary.txt', content: 'a' },
      { relPath: path.join('tabs', 'shot.png'), content: 'b64', encoding: 'base64' },
    ]);
    expect(dir).toBe(path.join(TEPEGOZ, 'diag'));
    expect(fsp.writeFile).toHaveBeenCalledTimes(2);
  });

  it('400s a bundle name or a file path that escapes the folder', async () => {
    await expect(FOH.writeExportBundle(path.join('..', 'x'), [])).rejects.toMatchObject({
      statusCode: 400,
    });
    await expect(
      FOH.writeExportBundle('diag', [{ relPath: path.join('..', '..', 'esc'), content: 'x' }]),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('grants', () => {
  it('effectiveGrants is empty while file operations are disabled', () => {
    expect(FOH.effectiveGrants()).toEqual([{ path: TEPEGOZ, mode: 'full', recursive: true }]);
    prefs.getAll.mockReturnValue({
      fileOperationsEnabled: false,
      fileAccessGrants: [{ path: TEPEGOZ, mode: 'full', recursive: true }],
      fileAccessSeeded: true,
    });
    expect(FOH.effectiveGrants()).toEqual([]);
  });

  it('addGrant / removeGrant / updateGrant rewrite the pref list and re-apply the policy', async () => {
    await FOH.addGrant({ path: '/new', mode: 'read', recursive: false });
    expect(prefs.update).toHaveBeenCalledWith({
      fileAccessGrants: [
        { path: TEPEGOZ, mode: 'full', recursive: true },
        { path: '/new', mode: 'read', recursive: false },
      ],
    });

    prefs.update.mockClear();
    await FOH.removeGrant(TEPEGOZ);
    expect(prefs.update).toHaveBeenCalledWith({ fileAccessGrants: [] });

    prefs.update.mockClear();
    await FOH.updateGrant(TEPEGOZ, { mode: 'read' });
    expect(prefs.update).toHaveBeenCalledWith({
      fileAccessGrants: [{ path: TEPEGOZ, mode: 'read', recursive: true }],
    });
    expect(pol.setGrants).toHaveBeenCalledTimes(3);
  });

  it('reconcile re-pushes the effective grants to the policy', () => {
    FOH.reconcile();
    expect(pol.setGrants).toHaveBeenCalledWith([{ path: TEPEGOZ, mode: 'full', recursive: true }]);
  });
});

describe('consentDecision', () => {
  const req = (over: Record<string, unknown> = {}): never =>
    ({ toolName: 'file_write', args: { path: path.join(TEPEGOZ, 'f.txt') }, ...over }) as never;

  it('falls through for a non-file tool and a missing target', async () => {
    expect(await FOH.consentDecision(req({ toolName: 'web_click' }))).toEqual({
      type: 'fallthrough',
    });
    expect(await FOH.consentDecision(req({ args: {} }))).toEqual({ type: 'fallthrough' });
  });

  it('maps the policy verdict to auto-approve / auto-deny / fall-through', async () => {
    pol.decide.mockReturnValue('allow');
    expect(await FOH.consentDecision(req())).toEqual({ type: 'auto', approved: true });
    pol.decide.mockReturnValue('deny');
    expect(await FOH.consentDecision(req())).toEqual({ type: 'auto', approved: false });
    pol.decide.mockReturnValue('ask');
    expect(await FOH.consentDecision(req())).toEqual({ type: 'fallthrough' });
  });
});

describe('init', () => {
  it('registers the file operations once and is idempotent', () => {
    FOH.init();
    FOH.init();
    expect(registerFileOperations).toHaveBeenCalledTimes(1);
  });
});
