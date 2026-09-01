import { describe, expect, it, vi } from 'vitest';
import {
  createPrefixListFetcher,
  decodeRiceDeltas,
  hashListUrl,
  MIRRORED_LISTS,
  parseHashListResponse,
  type FetchLike,
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
