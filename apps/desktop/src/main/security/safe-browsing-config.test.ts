import { afterEach, describe, expect, it } from 'vitest';
import { safeBrowsingApiKey } from './safe-browsing-config';

const KEY = 'TEPEGOZ_SAFE_BROWSING_KEY';

describe('safeBrowsingApiKey', () => {
  afterEach(() => {
    delete process.env[KEY];
  });

  it('is empty by default (no env, no build constant under vitest)', () => {
    expect(safeBrowsingApiKey()).toBe('');
  });

  it('reads the process environment and trims it', () => {
    process.env[KEY] = '  abc123  ';
    expect(safeBrowsingApiKey()).toBe('abc123');
  });

  it('treats a whitespace-only env value as unset', () => {
    process.env[KEY] = '   ';
    expect(safeBrowsingApiKey()).toBe('');
  });

  it('falls back to the build-time constant when it is set and there is no env override', () => {
    const g = globalThis as Record<string, unknown>;
    g.__TEPEGOZ_SAFE_BROWSING_KEY__ = 'build-key-xyz';
    try {
      expect(safeBrowsingApiKey()).toBe('build-key-xyz');
    } finally {
      delete g.__TEPEGOZ_SAFE_BROWSING_KEY__;
    }
  });
});
