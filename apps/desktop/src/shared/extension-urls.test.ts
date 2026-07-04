import { describe, it, expect } from 'vitest';
import { extensionIdFromPageUrl, extensionLabel, extensionPageUrl } from './extension-urls';

const PAGE_IDS = ['com.tepegoz.user-agent', 'com.tepegoz.macros'];

describe('extensionPageUrl', () => {
  it('builds the tepegoz:// page URL for an id', () => {
    expect(extensionPageUrl('com.tepegoz.macros')).toBe('tepegoz://com.tepegoz.macros');
  });
});

describe('extensionIdFromPageUrl', () => {
  it('resolves a page id, tolerating case and a trailing slash', () => {
    expect(extensionIdFromPageUrl('tepegoz://com.tepegoz.macros', PAGE_IDS)).toBe(
      'com.tepegoz.macros',
    );
    expect(extensionIdFromPageUrl('  TEPEGOZ://com.tepegoz.macros/  ', PAGE_IDS)).toBe(
      'com.tepegoz.macros',
    );
  });

  it('returns null for a non-page id or a plain web URL', () => {
    expect(extensionIdFromPageUrl('tepegoz://com.tepegoz.agent', PAGE_IDS)).toBeNull(); // not a page id
    expect(extensionIdFromPageUrl('https://example.test', PAGE_IDS)).toBeNull();
  });
});

describe('extensionLabel', () => {
  const manifest = {
    name: 'Macros',
    description: 'Record and replay',
    labels: { tr: { name: 'Makrolar', description: 'Kaydet ve oynat' } },
  };

  it('returns the locale override when present', () => {
    expect(extensionLabel(manifest, 'tr')).toEqual({
      name: 'Makrolar',
      description: 'Kaydet ve oynat',
    });
  });

  it('falls back to the manifest defaults for an unknown locale or missing field', () => {
    expect(extensionLabel(manifest, 'de')).toEqual({
      name: 'Macros',
      description: 'Record and replay',
    });
    // A partial override (name only) falls back to the default description.
    expect(extensionLabel({ ...manifest, labels: { tr: { name: 'Makrolar' } } }, 'tr')).toEqual({
      name: 'Makrolar',
      description: 'Record and replay',
    });
  });
});
