import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const electron = vi.hoisted(() => ({
  app: { getPath: vi.fn(() => ''), setPath: vi.fn() },
  crashReporter: { start: vi.fn() },
}));
vi.mock('electron', () => electron);
const logger = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock('@tepegoz/libs', () => ({ Logger: logger }));

const { crashReportingEnabledFromPrefs, applyCrashReporterPreference } = await import(
  './crash-reporter-boot'
);

let dir = '';
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'tepegoz-crash-'));
  vi.clearAllMocks();
  electron.app.getPath.mockReturnValue(dir);
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function writePrefs(value: unknown): void {
  writeFileSync(join(dir, 'preferences.json'), JSON.stringify(value), 'utf8');
}

describe('crashReportingEnabledFromPrefs', () => {
  it('is false when the preferences file is missing', () => {
    expect(crashReportingEnabledFromPrefs(dir)).toBe(false);
  });

  it('is false for a corrupt file', () => {
    writeFileSync(join(dir, 'preferences.json'), '{ not json', 'utf8');
    expect(crashReportingEnabledFromPrefs(dir)).toBe(false);
  });

  it('is false when the key is absent', () => {
    writePrefs({ theme: 'dark' });
    expect(crashReportingEnabledFromPrefs(dir)).toBe(false);
  });

  it('is false when the key is explicitly false', () => {
    writePrefs({ crashReportingEnabled: false });
    expect(crashReportingEnabledFromPrefs(dir)).toBe(false);
  });

  it('opts in only for the literal boolean true, not a truthy string', () => {
    writePrefs({ crashReportingEnabled: 'true' });
    expect(crashReportingEnabledFromPrefs(dir)).toBe(false);
    writePrefs({ crashReportingEnabled: true });
    expect(crashReportingEnabledFromPrefs(dir)).toBe(true);
  });
});

describe('applyCrashReporterPreference', () => {
  it('does nothing when the preference is off (the default)', () => {
    applyCrashReporterPreference(electron.app as never);
    expect(electron.crashReporter.start).not.toHaveBeenCalled();
    expect(electron.app.setPath).not.toHaveBeenCalled();
  });

  it('starts a local-only reporter when opted in', () => {
    writePrefs({ crashReportingEnabled: true });
    applyCrashReporterPreference(electron.app as never);

    expect(electron.app.setPath).toHaveBeenCalledWith('crashDumps', join(dir, 'Crashes'));
    expect(electron.crashReporter.start).toHaveBeenCalledTimes(1);
    const opts = electron.crashReporter.start.mock.calls[0]![0] as {
      uploadToServer: boolean;
      submitURL: string;
    };
    // Nothing leaves the machine.
    expect(opts.uploadToServer).toBe(false);
    expect(opts.submitURL).toBe('');
  });

  it('logs but still starts the reporter when the crash-dump dir cannot be set', () => {
    writePrefs({ crashReportingEnabled: true });
    electron.app.setPath.mockImplementationOnce(() => {
      throw new Error('EACCES');
    });

    applyCrashReporterPreference(electron.app as never);

    expect(logger.warn).toHaveBeenCalledWith(
      'Could not set the crash-dump directory',
      expect.objectContaining({ err: expect.stringContaining('EACCES') as string }),
    );
    expect(electron.crashReporter.start).toHaveBeenCalledTimes(1);
  });
});
