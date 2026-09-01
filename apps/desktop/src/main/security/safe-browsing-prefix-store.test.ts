import { describe, expect, it } from 'vitest';
import { checkUrl, hashPrefix } from '@tepegoz/security-policy';
import {
  parsePrefixFile,
  PrefixStore,
  type PrefixStoreIo,
} from './safe-browsing-prefix-store';

function memIo(initial: string | null = null): PrefixStoreIo & { contents: string | null } {
  const box = {
    contents: initial,
    read: () => Promise.resolve(box.contents),
    write: (c: string) => {
      box.contents = c;
      return Promise.resolve();
    },
  };
  return box;
}

const LISTED = hashPrefix('malware.example/');

describe('parsePrefixFile', () => {
  it('returns null for absent, non-JSON, unknown version, or bad updatedAt', () => {
    expect(parsePrefixFile(null)).toBeNull();
    expect(parsePrefixFile('not json')).toBeNull();
    expect(parsePrefixFile(JSON.stringify({ version: 3, updatedAt: 1, prefixes: [] }))).toBeNull();
    expect(parsePrefixFile(JSON.stringify({ version: 1, prefixes: [] }))).toBeNull();
    expect(
      parsePrefixFile(JSON.stringify({ version: 1, updatedAt: 'soon', prefixes: [] })),
    ).toBeNull();
    expect(parsePrefixFile(JSON.stringify({ version: 1, updatedAt: 1, prefixes: 'x' }))).toBeNull();
  });

  it('reads a pre-delta version:1 file (no token) and rewrites it as version:2', () => {
    const parsed = parsePrefixFile(
      JSON.stringify({ version: 1, updatedAt: 7, prefixes: ['deadbeef'] }),
    );
    expect(parsed).toEqual({ version: 2, updatedAt: 7, prefixes: ['deadbeef'] });
    expect(parsed?.versionToken).toBeUndefined();
  });

  it('keeps a version:2 token and returns prefixes lexically sorted', () => {
    const parsed = parsePrefixFile(
      JSON.stringify({
        version: 2,
        updatedAt: 9,
        versionToken: 'v-abc',
        prefixes: ['feedface', 'deadbeef', '00001000'],
      }),
    );
    expect(parsed?.versionToken).toBe('v-abc');
    expect(parsed?.prefixes).toEqual(['00001000', 'deadbeef', 'feedface']);
  });

  it('keeps the valid prefixes and drops the junk', () => {
    const parsed = parsePrefixFile(
      JSON.stringify({
        version: 1,
        updatedAt: 5,
        prefixes: [LISTED.toUpperCase(), 'zzzz', 123, 'deadbeef', 'deadbeef'],
      }),
    );
    expect(parsed?.prefixes.sort()).toEqual([LISTED, 'deadbeef'].sort());
  });
});

describe('PrefixStore', () => {
  it('has no database before load, and none for an empty/corrupt file', async () => {
    const store = new PrefixStore(memIo());
    expect(store.database()).toBeNull();
    await store.load();
    expect(store.database()).toBeNull();
    expect(store.count()).toBe(0);
    expect(store.updatedAt()).toBeNull();
  });

  it('round-trips a written set through the io and answers checkUrl against it', async () => {
    const io = memIo();
    const a = new PrefixStore(io);
    await a.replaceAll([LISTED], 1_000);
    expect(a.count()).toBe(1);
    expect(a.updatedAt()).toBe(1_000);

    const db = a.database();
    expect(db).not.toBeNull();
    expect(checkUrl('http://malware.example/x', db!).clear).toBe(false);
    expect(checkUrl('https://example.com/', db!).clear).toBe(true);

    // A fresh store reading the same io sees the persisted set.
    const b = new PrefixStore(io);
    await b.load();
    expect(b.count()).toBe(1);
    expect(checkUrl('http://malware.example/x', b.database()!).clear).toBe(false);
  });

  it('isStale is true when nothing is stored, and after the max age elapses', async () => {
    const store = new PrefixStore(memIo());
    await store.load();
    expect(store.isStale(1_000, 42)).toBe(true);

    await store.replaceAll([LISTED], 10_000);
    expect(store.isStale(1_000, 10_500)).toBe(false);
    expect(store.isStale(1_000, 11_000)).toBe(true);
  });

  it('replaceAll normalizes case and de-duplicates', async () => {
    const store = new PrefixStore(memIo());
    await store.replaceAll([LISTED.toUpperCase(), LISTED, 'DEADBEEF', 'not-a-prefix'], 1);
    expect(store.count()).toBe(2);
  });

  it('replaceAll stores an optional version token; a later replace without one clears it', async () => {
    const io = memIo();
    const store = new PrefixStore(io);
    await store.replaceAll(['deadbeef'], 1, 'v1');
    expect(store.versionToken()).toBe('v1');

    const reloaded = new PrefixStore(io);
    await reloaded.load();
    expect(reloaded.versionToken()).toBe('v1');

    await store.replaceAll(['deadbeef'], 2);
    expect(store.versionToken()).toBeNull();
  });

  it('applyDelta merges additions, drops removal indices, and stamps the new token', async () => {
    const store = new PrefixStore(memIo());
    await store.replaceAll(['00000001', '00000003', '00000005'], 100, 'v1');

    const outcome = await store.applyDelta(
      {
        additions: ['00000002', '00000009'],
        removalIndices: [1], // drops '00000003' from the sorted base
        partial: true,
        versionToken: 'v2',
        checksum: null,
      },
      200,
    );

    expect(outcome).toBe('applied');
    expect(store.sortedPrefixes()).toEqual(['00000001', '00000002', '00000005', '00000009']);
    expect(store.versionToken()).toBe('v2');
    expect(store.updatedAt()).toBe(200);
  });

  it('applyDelta leaves the stored set untouched when the delta cannot be trusted', async () => {
    const io = memIo();
    const store = new PrefixStore(io);
    await store.replaceAll(['00000001', '00000003'], 100, 'v1');
    const before = io.contents;

    const outcome = await store.applyDelta(
      { additions: [], removalIndices: [9], partial: true, versionToken: 'v2', checksum: null },
      200,
    );

    expect(outcome).toBe('need-full');
    expect(store.sortedPrefixes()).toEqual(['00000001', '00000003']);
    expect(store.versionToken()).toBe('v1');
    expect(io.contents).toBe(before);
  });
});
