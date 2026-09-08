import { describe, expect, it } from 'vitest';
import {
  LOCKED_WEB_CONTENT_KEYS,
  WEB_CONTENT_DEFAULTS,
} from './web-content-defaults';

describe('web content defaults table', () => {
  it('locks exactly the four page-isolation keys (ADR-0041)', () => {
    expect(LOCKED_WEB_CONTENT_KEYS).toEqual([
      'contextIsolation',
      'sandbox',
      'nodeIntegration',
      'webSecurity',
    ]);
  });

  it('keeps the isolation keys at their safe values', () => {
    const byKey = Object.fromEntries(WEB_CONTENT_DEFAULTS.map((d) => [d.key, d.value]));
    expect(byKey.contextIsolation).toBe(true);
    expect(byKey.sandbox).toBe(true);
    expect(byKey.nodeIntegration).toBe(false);
    expect(byKey.webSecurity).toBe(true);
  });

  it('has a boolean value and a locked flag for every row, and unique keys', () => {
    for (const d of WEB_CONTENT_DEFAULTS) {
      expect(typeof d.value).toBe('boolean');
      expect(typeof d.locked).toBe('boolean');
    }
    expect(new Set(WEB_CONTENT_DEFAULTS.map((d) => d.key)).size).toBe(WEB_CONTENT_DEFAULTS.length);
  });
});
