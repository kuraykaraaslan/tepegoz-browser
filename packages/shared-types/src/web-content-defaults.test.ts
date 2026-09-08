import { describe, expect, it } from 'vitest';
import {
  applyWebContentDefaults,
  EDITABLE_WEB_CONTENT_KEYS,
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

  it('the editable keys are exactly the non-locked ones', () => {
    expect(EDITABLE_WEB_CONTENT_KEYS).toEqual(['plugins', 'backgroundThrottling']);
  });
});

describe('applyWebContentDefaults', () => {
  const hardened = () => ({
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false,
    webSecurity: true,
    plugins: true,
    backgroundThrottling: false,
  });

  it('overlays the editable keys', () => {
    const out = applyWebContentDefaults(hardened(), {
      plugins: false,
      backgroundThrottling: true,
    });
    expect(out.plugins).toBe(false);
    expect(out.backgroundThrottling).toBe(true);
  });

  it('ignores a locked key even when the overrides object carries one', () => {
    // A hand-edited preferences.json is untyped — model it as one.
    const hostile = {
      contextIsolation: false,
      sandbox: false,
      webSecurity: false,
      nodeIntegration: true,
    } as unknown as Parameters<typeof applyWebContentDefaults>[1];
    const out = applyWebContentDefaults(hardened(), hostile);
    expect(out.contextIsolation).toBe(true);
    expect(out.sandbox).toBe(true);
    expect(out.webSecurity).toBe(true);
    expect(out.nodeIntegration).toBe(false);
  });

  it('is a no-op for undefined overrides and for a non-boolean value', () => {
    expect(applyWebContentDefaults(hardened(), undefined).plugins).toBe(true);
    const wrongType = { plugins: 'yes' } as unknown as Parameters<typeof applyWebContentDefaults>[1];
    expect(applyWebContentDefaults(hardened(), wrongType).plugins).toBe(true);
  });
});
