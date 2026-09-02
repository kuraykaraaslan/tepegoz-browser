import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The built-in extension registry (MAIN-process identity source). It is populated ONCE at startup from
 * the validated on-disk catalog, and every consumer reads it at CALL time. Pinned:
 *   - reading before init throws (a startup-order bug, not a soft empty);
 *   - init rejects an empty set and a second call (both mean a broken startup sequence);
 *   - `extensionPageUrls` / `extensionIdFromPageUrl` only ever deal in ids that declare a `page` surface.
 */

type Manifest = { id: string; surfaces: string[] };
const mkMod = () => import('./extensions');

beforeEach(() => {
  vi.resetModules();
});

const PAGE: Manifest = { id: 'com.tepegoz.settings', surfaces: ['page'] };
const NOPAGE: Manifest = { id: 'com.tepegoz.background', surfaces: ['background'] };

describe('lifecycle', () => {
  it('throws when read before initialization', async () => {
    const { builtinManifests } = await mkMod();
    expect(() => builtinManifests()).toThrow(/before initialization/);
  });

  it('rejects an empty manifest set', async () => {
    const { initBuiltinManifests } = await mkMod();
    expect(() => initBuiltinManifests([])).toThrow(/empty/);
  });

  it('rejects a second initialization', async () => {
    const { initBuiltinManifests } = await mkMod();
    initBuiltinManifests([PAGE] as never);
    expect(() => initBuiltinManifests([NOPAGE] as never)).toThrow(/already initialized/);
  });

  it('returns the initialized entries at call time', async () => {
    const { initBuiltinManifests, builtinManifests } = await mkMod();
    initBuiltinManifests([PAGE, NOPAGE] as never);
    expect(builtinManifests().map((m) => m.id)).toEqual([PAGE.id, NOPAGE.id]);
  });
});

describe('lookups', () => {
  it('manifestById finds a known id and returns undefined for an unknown one', async () => {
    const { initBuiltinManifests, manifestById } = await mkMod();
    initBuiltinManifests([PAGE, NOPAGE] as never);
    expect(manifestById(PAGE.id)?.id).toBe(PAGE.id);
    expect(manifestById('com.tepegoz.nope')).toBeUndefined();
  });

  it('extensionPageUrls covers only manifests that declare a page surface', async () => {
    const { initBuiltinManifests, extensionPageUrls } = await mkMod();
    initBuiltinManifests([PAGE, NOPAGE] as never);
    const urls = extensionPageUrls();
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain(PAGE.id);
  });

  it('extensionIdFromPageUrl resolves a page-surface id and rejects the rest', async () => {
    const { initBuiltinManifests, extensionIdFromPageUrl, extensionPageUrl } = await mkMod();
    initBuiltinManifests([PAGE, NOPAGE] as never);
    expect(extensionIdFromPageUrl(extensionPageUrl(PAGE.id))).toBe(PAGE.id);
    expect(extensionIdFromPageUrl(`${extensionPageUrl(PAGE.id)}/`)).toBe(PAGE.id); // trailing slash
    expect(extensionIdFromPageUrl(extensionPageUrl(NOPAGE.id))).toBeNull(); // no page surface
    expect(extensionIdFromPageUrl('https://example.com/')).toBeNull();
  });
});
