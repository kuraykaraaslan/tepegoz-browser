import { EventEmitter } from 'node:events';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The pure, Electron-free helpers of the desktop DownloadService. `cleanFilename` is a security
 * surface: the string it returns becomes the quarantine name, the record's `filename`, and the
 * `finalPath` the manager reveals in the file browser. The fs helpers (`sha256File`, `moveFile`,
 * `uniquePath`) sit over `node:fs` and are exercised here against fakes.
 */

const hash = vi.hoisted(() => ({ update: vi.fn(), digest: vi.fn(() => 'deadbeefhash') }));
vi.mock('node:crypto', () => ({ createHash: () => hash }));

const fs = vi.hoisted(() => ({
  createReadStream: vi.fn(),
  existsSync: vi.fn(() => false),
}));
vi.mock('node:fs', () => fs);

const fsp = vi.hoisted(() => ({
  mkdir: vi.fn(() => Promise.resolve()),
  rename: vi.fn(() => Promise.resolve()),
  copyFile: vi.fn(() => Promise.resolve()),
  unlink: vi.fn(() => Promise.resolve()),
}));
vi.mock('node:fs/promises', () => fsp);

const { cleanFilename, originOf, hasCode, sha256File, moveFile, uniquePath } =
  await import('./download-service-fs.electron');

/** A readable-stream stand-in that replays a fixed script of events on the next tick. */
function fakeStream(events: [string, unknown?][]): EventEmitter {
  const em = new EventEmitter();
  queueMicrotask(() => {
    for (const [name, arg] of events) em.emit(name, arg);
  });
  return em;
}

beforeEach(() => {
  vi.clearAllMocks();
  hash.digest.mockReturnValue('deadbeefhash');
  fs.existsSync.mockReturnValue(false);
  fsp.mkdir.mockResolvedValue(undefined);
  fsp.rename.mockResolvedValue(undefined);
});

describe('cleanFilename', () => {
  it('replaces reserved characters and control characters with underscores', () => {
    expect(cleanFilename('in:voice*<2024>?.txt')).toBe('in_voice__2024__.txt');
    expect(cleanFilename('tab\there.txt')).toBe('tab_here.txt');
  });

  it('takes only the basename of a path', () => {
    expect(cleanFilename('/home/kuray/Downloads/report.pdf')).toBe('report.pdf');
  });

  it('strips a trailing dot or space that Windows would drop on write', () => {
    expect(cleanFilename('report.exe.')).toBe('report.exe');
    expect(cleanFilename('report.exe ')).toBe('report.exe');
    expect(cleanFilename('setup.msi. . .')).toBe('setup.msi');
  });

  it('keeps a leading dot (dotfiles) intact', () => {
    expect(cleanFilename('.gitignore')).toBe('.gitignore');
  });

  it('falls back to a placeholder when nothing usable is left', () => {
    expect(cleanFilename('...')).toBe('download');
    expect(cleanFilename('   ')).toBe('download');
    expect(cleanFilename('')).toBe('download');
  });
});

describe('originOf', () => {
  it('returns the origin of a valid URL', () => {
    expect(originOf('https://example.com/a/b?c=d')).toBe('https://example.com');
  });

  it('returns undefined for a non-URL', () => {
    expect(originOf('not a url')).toBeUndefined();
  });
});

describe('hasCode', () => {
  it('is true only for an object carrying the exact error code', () => {
    expect(hasCode({ code: 'EXDEV' }, 'EXDEV')).toBe(true);
    expect(hasCode({ code: 'ENOENT' }, 'EXDEV')).toBe(false);
    expect(hasCode({}, 'EXDEV')).toBe(false);
    expect(hasCode(null, 'EXDEV')).toBe(false);
    expect(hasCode('EXDEV', 'EXDEV')).toBe(false);
  });
});

describe('sha256File', () => {
  it('streams the file through the hash and returns the hex digest', async () => {
    fs.createReadStream.mockReturnValue(
      fakeStream([['data', Buffer.from('abc')], ['data', Buffer.from('def')], ['end']]),
    );
    expect(await sha256File('/q/file.bin')).toBe('deadbeefhash');
    expect(hash.update).toHaveBeenCalledTimes(2);
    expect(fs.createReadStream).toHaveBeenCalledWith('/q/file.bin');
  });

  it('rejects when the read stream errors', async () => {
    fs.createReadStream.mockReturnValue(fakeStream([['error', new Error('EIO')]]));
    await expect(sha256File('/q/broken')).rejects.toThrow('EIO');
  });
});

describe('moveFile', () => {
  it('makes the parent dir then renames, on the same filesystem', async () => {
    await moveFile('/tmp/part', '/dl/nested/final.pdf');
    expect(fsp.mkdir).toHaveBeenCalledWith('/dl/nested', { recursive: true });
    expect(fsp.rename).toHaveBeenCalledWith('/tmp/part', '/dl/nested/final.pdf');
    expect(fsp.copyFile).not.toHaveBeenCalled();
  });

  it('falls back to copy + unlink across a device boundary (EXDEV)', async () => {
    fsp.rename.mockRejectedValueOnce(Object.assign(new Error('cross-device'), { code: 'EXDEV' }));
    await moveFile('/tmp/part', '/mnt/other/final.pdf');
    expect(fsp.copyFile).toHaveBeenCalledWith('/tmp/part', '/mnt/other/final.pdf');
    expect(fsp.unlink).toHaveBeenCalledWith('/tmp/part');
  });

  it('rethrows a rename failure that is not EXDEV', async () => {
    fsp.rename.mockRejectedValueOnce(Object.assign(new Error('nope'), { code: 'EACCES' }));
    await expect(moveFile('/tmp/part', '/dl/final.pdf')).rejects.toThrow('nope');
    expect(fsp.copyFile).not.toHaveBeenCalled();
  });
});

describe('uniquePath', () => {
  const DL = join('dl');

  it('returns the clean path unchanged when nothing collides', () => {
    fs.existsSync.mockReturnValue(false);
    expect(uniquePath(DL, 'report.pdf')).toBe(join(DL, 'report.pdf'));
  });

  it('appends " (n)" before the extension until the name is free', () => {
    fs.existsSync
      .mockReturnValueOnce(true) // report.pdf
      .mockReturnValueOnce(true) // report (1).pdf
      .mockReturnValueOnce(false); // report (2).pdf
    expect(uniquePath(DL, 'report.pdf')).toBe(join(DL, 'report (2).pdf'));
  });

  it('handles an extensionless name and a leading-dot dotfile', () => {
    fs.existsSync.mockReturnValueOnce(true).mockReturnValueOnce(false);
    expect(uniquePath(DL, 'README')).toBe(join(DL, 'README (1)'));

    fs.existsSync.mockReturnValueOnce(true).mockReturnValueOnce(false);
    expect(uniquePath(DL, '.env')).toBe(join(DL, '.env (1)'));
  });
});
