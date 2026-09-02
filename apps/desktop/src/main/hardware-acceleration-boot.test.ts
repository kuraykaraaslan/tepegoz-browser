import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'electron';

/**
 * Startup application of the GPU-compositing preference — it must run before `whenReady`, so it reads
 * `preferences.json` directly and treats it as untrusted. The load-bearing guarantee: the default and
 * every failure path leave hardware acceleration ON. Only a file that parses AND carries the exact
 * `hardwareAccelerationEnabled: false` turns it off — a corrupt or half-written file must never be
 * able to silently drop a user into software rendering.
 */

const readFileSync = vi.hoisted(() => vi.fn());
vi.mock('node:fs', () => ({ readFileSync }));
const loggerInfo = vi.hoisted(() => vi.fn());
vi.mock('@tepegoz/libs', () => ({ Logger: { info: loggerInfo, warn: vi.fn(), error: vi.fn() } }));

const { applyHardwareAccelerationPreference } = await import('./hardware-acceleration-boot');

const disableHardwareAcceleration = vi.fn();
const app = {
  getPath: () => '/userData',
  disableHardwareAcceleration,
} as unknown as App;

beforeEach(() => {
  readFileSync.mockReset();
  disableHardwareAcceleration.mockReset();
  loggerInfo.mockReset();
});

it('disables hardware acceleration only for an explicit `false`, and logs it', () => {
  readFileSync.mockReturnValue(JSON.stringify({ hardwareAccelerationEnabled: false }));
  applyHardwareAccelerationPreference(app);
  expect(disableHardwareAcceleration).toHaveBeenCalledTimes(1);
  expect(loggerInfo).toHaveBeenCalled();
});

describe('leaves acceleration ON (the safe default)', () => {
  it('when the preference is explicitly true', () => {
    readFileSync.mockReturnValue(JSON.stringify({ hardwareAccelerationEnabled: true }));
    applyHardwareAccelerationPreference(app);
    expect(disableHardwareAcceleration).not.toHaveBeenCalled();
  });

  it('when the key is absent', () => {
    readFileSync.mockReturnValue(JSON.stringify({ theme: 'dark' }));
    applyHardwareAccelerationPreference(app);
    expect(disableHardwareAcceleration).not.toHaveBeenCalled();
  });

  it('when the value is a non-strict-false lookalike (0, "false", null)', () => {
    for (const v of [0, 'false', null]) {
      readFileSync.mockReturnValue(JSON.stringify({ hardwareAccelerationEnabled: v }));
      applyHardwareAccelerationPreference(app);
    }
    expect(disableHardwareAcceleration).not.toHaveBeenCalled();
  });

  it('when the file does not exist (readFileSync throws)', () => {
    readFileSync.mockImplementation(() => {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });
    expect(() => applyHardwareAccelerationPreference(app)).not.toThrow();
    expect(disableHardwareAcceleration).not.toHaveBeenCalled();
  });

  it('when the file is not valid JSON', () => {
    readFileSync.mockReturnValue('{ half a file');
    expect(() => applyHardwareAccelerationPreference(app)).not.toThrow();
    expect(disableHardwareAcceleration).not.toHaveBeenCalled();
  });
});
