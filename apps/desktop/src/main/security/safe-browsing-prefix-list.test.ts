import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  applyHashListDelta,
  createHashListDeltaFetcher,
  createPrefixListFetcher,
  decodeRiceDeltas,
  fourBytePrefixChecksum,
  hashListUrl,
  MIRRORED_LISTS,
  parseHashListDelta,
  parseHashListResponse,
  type FetchLike,
  type HashListDelta,
} from './safe-browsing-v5-client';

function response(json: unknown, ok = true, status = 200) {
  return { ok, status, json: () => Promise.resolve(json) };
}

const TWO_PREFIXES = Buffer.from('deadbeeffeedface', 'hex').toString('base64');

/** Reference Rice-Golomb encoder (little-endian bit packing) — mirrors {@link decodeRiceDeltas}. */
function riceEncode(deltas: number[], k: number): Buffer {
  const bits: number[] = [];
  for (const d of deltas) {
    const q = Math.floor(d / 2 ** k);
    for (let i = 0; i < q; i++) bits.push(1);
    bits.push(0);
    for (let i = 0; i < k; i++) bits.push((d >>> i) & 1);
  }
  const bytes = Buffer.alloc(Math.ceil(bits.length / 8));
  bits.forEach((b, i) => {
    if (b) bytes[i >>> 3]! |= 1 << (i & 7);
  });
  return bytes;
}

describe('decodeRiceDeltas', () => {
  it('round-trips a known delta sequence', () => {
    const first = 1000;
    const deltas = [5, 300, 2, 70000, 1];
    const k = 4;
    const values = decodeRiceDeltas(first, k, deltas.length, riceEncode(deltas, k));
    expect(values).toEqual([1000, 1005, 1305, 1307, 71307, 71308]);
  });

  it('handles k = 0 (pure unary)', () => {
    expect(decodeRiceDeltas(0, 0, 3, riceEncode([1, 2, 3], 0))).toEqual([0, 1, 3, 6]);
  });

  it('returns null on a truncated buffer', () => {
    expect(decodeRiceDeltas(0, 4, 10, Buffer.alloc(1))).toBeNull();
  });
});

describe('parseHashListResponse', () => {
  it('splits uncompressed additionsFourBytes into 8-hex prefixes', () => {
    expect(
      parseHashListResponse({ additionsFourBytes: { rawHashes: TWO_PREFIXES } }),
    ).toEqual(['deadbeef', 'feedface']);
  });

  it('decodes a Rice-coded additionsFourBytes payload to ascending prefixes', () => {
    const k = 2;
    const deltas = [7, 1, 500];
    const body = {
      additionsFourBytes: {
        riceParameter: k,
        firstValue: 0x00_00_10_00,
        entriesCount: deltas.length,
        encodedData: riceEncode(deltas, k).toString('base64'),
      },
    };
    expect(parseHashListResponse(body)).toEqual(['00001000', '00001007', '00001008', '000011fc']);
  });

  it('returns [] for junk, a malformed Rice header, or a non-multiple-of-4 blob', () => {
    expect(parseHashListResponse(null)).toEqual([]);
    expect(parseHashListResponse({})).toEqual([]);
    expect(
      parseHashListResponse({ additionsFourBytes: { riceParameter: 99, firstValue: 0, entriesCount: 1, encodedData: '' } }),
    ).toEqual([]);
    expect(
      parseHashListResponse({
        additionsFourBytes: { rawHashes: Buffer.from('abc', 'utf8').toString('base64') },
      }),
    ).toEqual([]);
  });
});

describe('hashListUrl', () => {
  it('carries the key and list name, nothing else', () => {
    const url = new URL(hashListUrl('gc-4-byte-prefixes', 'KEY'));
    expect(url.origin + url.pathname).toBe('https://safebrowsing.googleapis.com/v5alpha1/hashList');
    expect(url.searchParams.get('key')).toBe('KEY');
    expect(url.searchParams.get('name')).toBe('gc-4-byte-prefixes');
    expect(url.searchParams.get('version')).toBeNull();
  });

  it('adds ?version= only when a non-empty token is given', () => {
    expect(new URL(hashListUrl('l', 'K', 'v-token')).searchParams.get('version')).toBe('v-token');
    expect(new URL(hashListUrl('l', 'K', null)).searchParams.get('version')).toBeNull();
    expect(new URL(hashListUrl('l', 'K', '')).searchParams.get('version')).toBeNull();
  });
});

describe('parseHashListDelta', () => {
  it('reads a full (non-partial) update: sorted additions, token, checksum', () => {
    const delta = parseHashListDelta({
      additionsFourBytes: { rawHashes: Buffer.from('feedfacedeadbeef', 'hex').toString('base64') },
      version: 'v-1',
      sha256Checksum: 'CHK',
    });
    expect(delta.partial).toBe(false);
    expect(delta.additions).toEqual(['deadbeef', 'feedface']);
    expect(delta.removalIndices).toEqual([]);
    expect(delta.versionToken).toBe('v-1');
    expect(delta.checksum).toBe('CHK');
  });

  it('reads a partial update with Rice-coded removal indices', () => {
    const k = 2;
    const idxDeltas = [3, 4]; // firstValue 1 → indices 1, 4, 8
    const delta = parseHashListDelta({
      partialUpdate: true,
      additionsFourBytes: { rawHashes: Buffer.from('00000002', 'hex').toString('base64') },
      compressedRemovals: {
        riceParameter: k,
        firstValue: 1,
        entriesCount: idxDeltas.length,
        encodedData: riceEncode(idxDeltas, k).toString('base64'),
      },
      version: 'v-2',
    });
    expect(delta.partial).toBe(true);
    expect(delta.additions).toEqual(['00000002']);
    expect(delta.removalIndices).toEqual([1, 4, 8]);
  });

  it('reads plain-array removalIndices and drops negatives / non-integers', () => {
    const delta = parseHashListDelta({
      partialUpdate: true,
      removalIndices: [5, 2, 2, -1, 3.5],
    });
    expect(delta.removalIndices).toEqual([2, 5]);
  });

  it('is an empty non-partial delta for junk', () => {
    for (const junk of [null, 42, {}, { additionsFourBytes: 'nope' }]) {
      expect(parseHashListDelta(junk)).toEqual({
        additions: [],
        removalIndices: [],
        partial: false,
        versionToken: null,
        checksum: null,
      });
    }
  });
});

describe('applyHashListDelta', () => {
  const base = ['00000001', '00000003', '00000005'];

  it('replaces the whole set for a non-partial delta', () => {
    const res = applyHashListDelta(base, {
      additions: ['00000009', '00000007'],
      removalIndices: [1],
      partial: false,
      versionToken: null,
      checksum: null,
    });
    expect(res).toEqual({ ok: true, prefixes: ['00000007', '00000009'] });
  });

  it('drops removal indices from the sorted base, then merges additions', () => {
    const res = applyHashListDelta(base, {
      additions: ['00000002'],
      removalIndices: [0, 2], // drops '00000001' and '00000005'
      partial: true,
      versionToken: null,
      checksum: null,
    });
    expect(res).toEqual({ ok: true, prefixes: ['00000002', '00000003'] });
  });

  it('rejects an out-of-range removal index so the caller does a full refresh', () => {
    expect(
      applyHashListDelta(base, {
        additions: [],
        removalIndices: [3],
        partial: true,
        versionToken: null,
        checksum: null,
      }),
    ).toEqual({ ok: false, reason: 'index-out-of-range' });
  });

  it('accepts a matching checksum and rejects a wrong one', () => {
    const expected = ['00000002', '00000003'];
    const good: HashListDelta = {
      additions: ['00000002'],
      removalIndices: [0, 2],
      partial: true,
      versionToken: null,
      checksum: fourBytePrefixChecksum(expected),
    };
    expect(applyHashListDelta(base, good)).toEqual({ ok: true, prefixes: expected });
    expect(applyHashListDelta(base, { ...good, checksum: 'wrong' })).toEqual({
      ok: false,
      reason: 'checksum-mismatch',
    });
  });
});

describe('fourBytePrefixChecksum', () => {
  it('is the base64 sha256 of the concatenated raw prefix bytes in order', () => {
    const prefixes = ['00000001', 'deadbeef'];
    const expected = createHash('sha256')
      .update(Buffer.concat(prefixes.map((p) => Buffer.from(p, 'hex'))))
      .digest('base64');
    expect(fourBytePrefixChecksum(prefixes)).toBe(expected);
  });
});

describe('createHashListDeltaFetcher', () => {
  it('is null with no API key', () => {
    expect(createHashListDeltaFetcher({ apiKey: '', fetchImpl: vi.fn() })).toBeNull();
  });

  it('sends the stored version token and parses the response', async () => {
    const fetchImpl = vi.fn<FetchLike>().mockResolvedValue(
      response({
        partialUpdate: true,
        additionsFourBytes: { rawHashes: Buffer.from('00000002', 'hex').toString('base64') },
        version: 'v-next',
      }),
    );
    const fetcher = createHashListDeltaFetcher({ apiKey: 'KEY', fetchImpl });
    const delta = await fetcher!('v-prev');
    const url = new URL(fetchImpl.mock.calls[0]![0]);
    expect(url.searchParams.get('version')).toBe('v-prev');
    expect(delta.additions).toEqual(['00000002']);
    expect(delta.versionToken).toBe('v-next');
    expect(JSON.stringify(fetchImpl.mock.calls)).not.toContain('Cookie');
  });

  it('omits ?version= when asked for a full copy, and throws on a non-ok status', async () => {
    const okFetch = vi
      .fn<FetchLike>()
      .mockResolvedValue(response({ additionsFourBytes: { rawHashes: '' } }));
    await createHashListDeltaFetcher({ apiKey: 'KEY', fetchImpl: okFetch })!(null);
    expect(new URL(okFetch.mock.calls[0]![0]).searchParams.get('version')).toBeNull();

    const badFetch = vi.fn<FetchLike>().mockResolvedValue(response({}, false, 503));
    await expect(
      createHashListDeltaFetcher({ apiKey: 'KEY', fetchImpl: badFetch })!(null),
    ).rejects.toThrow('503');
  });
});

describe('createPrefixListFetcher', () => {
  it('is null with no API key', () => {
    expect(createPrefixListFetcher({ apiKey: '', fetchImpl: vi.fn() })).toBeNull();
  });

  it('fetches every mirrored list and unions the prefixes', async () => {
    const fetchImpl = vi
      .fn<FetchLike>()
      .mockResolvedValue(response({ additionsFourBytes: { rawHashes: TWO_PREFIXES } }));
    const fetcher = createPrefixListFetcher({ apiKey: 'KEY', fetchImpl });
    const prefixes = await fetcher!();
    expect(fetchImpl).toHaveBeenCalledTimes(MIRRORED_LISTS.length);
    expect(prefixes.sort()).toEqual(['deadbeef', 'feedface']);
    const sent = JSON.stringify(fetchImpl.mock.calls);
    expect(sent).not.toContain('Cookie');
  });

  it('throws on a non-ok response so the scheduler keeps the previous set', async () => {
    const fetchImpl = vi.fn<FetchLike>().mockResolvedValue(response({}, false, 500));
    const fetcher = createPrefixListFetcher({ apiKey: 'KEY', fetchImpl });
    await expect(fetcher!()).rejects.toThrow('500');
  });
});
