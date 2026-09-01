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
});
