import { describe, expect, it } from 'vitest';
import { cleanFilename, originOf } from './download-service-fs.electron';

/**
 * The pure, Electron-free helpers of the desktop DownloadService. `cleanFilename` is a security
 * surface: the string it returns becomes the quarantine name, the record's `filename`, and the
 * `finalPath` the manager reveals in the file browser.
 */
describe('cleanFilename', () => {
  it('replaces reserved characters and control characters with underscores', () => {
    expect(cleanFilename('in:voice*<2024>?.txt')).toBe('in_voice__2024__.txt');
    expect(cleanFilename('tab\there.txt')).toBe('tab_here.txt');
  });

  it('takes only the basename of a path', () => {
    expect(cleanFilename('/home/kuray/Downloads/report.pdf')).toBe('report.pdf');
  });

  it('strips a trailing dot or space that Windows would drop on write', () => {
    // `report.exe.` is created as `report.exe`; keeping the dot would make the record disagree with
    // what is on disk and would also read as risk `normal` in classifyDownloadRisk.
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
