import { describe, expect, it, vi } from 'vitest';
import {
  INTERNAL_DEVELOPER_URL,
  INTERNAL_SETTINGS_URL,
} from '@tepegoz/desktop-ipc';

/**
 * The desktop adapter over `@tepegoz/navigation`'s pure `internalPageUrl` (which owns its own suite).
 * What this pins is the wiring the adapter adds: every built-in `tepegoz://` page resolves, the
 * extension page list is consulted at CALL time (not frozen at module load, which would break
 * `tepegoz://<ext-id>` routing since the catalog loads after this module), a valid `#fragment`
 * survives canonicalisation, and a non-internal input is null.
 */

const extensions = vi.hoisted(() => ({ urls: [] as string[] }));
vi.mock('../../shared/extensions', () => ({
  extensionPageUrls: () => [...extensions.urls],
}));

const { internalPageUrl } = await import('./navigation-url');

describe('internalPageUrl', () => {
  it('resolves a built-in internal page to its canonical URL', () => {
    expect(internalPageUrl(INTERNAL_SETTINGS_URL)).toBe(INTERNAL_SETTINGS_URL);
    expect(internalPageUrl(`${INTERNAL_DEVELOPER_URL}/`)).toBe(INTERNAL_DEVELOPER_URL);
  });

  it('keeps a syntactically valid fragment and drops a bogus one', () => {
    expect(internalPageUrl(`${INTERNAL_SETTINGS_URL}#developer`)).toBe(
      `${INTERNAL_SETTINGS_URL}#developer`,
    );
    expect(internalPageUrl(`${INTERNAL_SETTINGS_URL}#not a fragment!`)).toBe(INTERNAL_SETTINGS_URL);
  });

  it('returns null for anything that is not one of our pages', () => {
    expect(internalPageUrl('https://example.test/')).toBeNull();
    expect(internalPageUrl('tepegoz://not-a-real-page')).toBeNull();
  });

  it('consults the extension page list at call time, not module-load time', () => {
    const extUrl = 'tepegoz://com.tepegoz.example';
    expect(internalPageUrl(extUrl)).toBeNull();

    // The built-in catalog finishes loading after this module is imported; a later call must see it.
    extensions.urls = [extUrl];
    expect(internalPageUrl(extUrl)).toBe(extUrl);
  });
});
