import { describe, expect, it, vi } from 'vitest';
import { fullHash } from '@tepegoz/security-policy';
import {
  createFullHashFetcher,
  hashesSearchUrl,
  parseHashesSearchResponse,
  type FetchLike,
} from './safe-browsing-v5-client';

const REAL_HASH = fullHash('malware.example/'); // 64 hex chars
const REAL_HASH_B64 = Buffer.from(REAL_HASH, 'hex').toString('base64');

function response(json: unknown, ok = true, status = 200) {
  return { ok, status, json: () => Promise.resolve(json) };
}

describe('parseHashesSearchResponse', () => {
  it('returns [] for junk, empty, or non-blocking threat types', () => {
    expect(parseHashesSearchResponse(null)).toEqual([]);
    expect(parseHashesSearchResponse({})).toEqual([]);
    expect(parseHashesSearchResponse({ fullHashes: [] })).toEqual([]);
    expect(
      parseHashesSearchResponse({
        fullHashes: [{ fullHash: REAL_HASH_B64, fullHashDetails: [{ threatType: 'API_ABUSE' }] }],
      }),
    ).toEqual([]);
  });

  it('extracts a blocking full hash as 64-hex, de-duplicated', () => {
    const out = parseHashesSearchResponse({
      fullHashes: [
        { fullHash: REAL_HASH_B64, fullHashDetails: [{ threatType: 'MALWARE' }] },
        { fullHash: REAL_HASH_B64, fullHashDetails: [{ threatType: 'SOCIAL_ENGINEERING' }] },
      ],
    });
    expect(out).toEqual([REAL_HASH]);
  });

  it('skips an entry whose base64 does not decode to 32 bytes', () => {
    expect(
      parseHashesSearchResponse({
        fullHashes: [{ fullHash: 'c2hvcnQ=', fullHashDetails: [{ threatType: 'MALWARE' }] }],
      }),
    ).toEqual([]);
  });
});

describe('hashesSearchUrl', () => {
  it('carries the key and one hashPrefixes param per prefix, and nothing else', () => {
    const url = new URL(hashesSearchUrl(['deadbeef', 'feedface'], 'KEY123'));
    expect(url.origin + url.pathname).toBe(
      'https://safebrowsing.googleapis.com/v5alpha1/hashes:search',
    );
    expect(url.searchParams.get('key')).toBe('KEY123');
    expect(url.searchParams.getAll('hashPrefixes')).toHaveLength(2);
    expect([...url.searchParams.keys()].sort()).toEqual(['hashPrefixes', 'hashPrefixes', 'key']);
  });
});

describe('createFullHashFetcher', () => {
  it('returns null with no API key — the provider then treats every hit as unknown', () => {
    expect(createFullHashFetcher({ apiKey: undefined, fetchImpl: vi.fn() })).toBeNull();
    expect(createFullHashFetcher({ apiKey: '   ', fetchImpl: vi.fn() })).toBeNull();
  });

  it('sends prefixes only — no cookies, no URL, fixed UA', async () => {
    const fetchImpl = vi.fn<FetchLike>().mockResolvedValue(response({ fullHashes: [] }));
    const fetcher = createFullHashFetcher({ apiKey: 'KEY', fetchImpl });
    await fetcher!(['deadbeef']);

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toContain('hashPrefixes=');
    expect(init.headers).not.toHaveProperty('Cookie');
    expect(init.headers['User-Agent']).toBe('tepegoz-browser SafeBrowsing/1');
    const serialized = JSON.stringify(fetchImpl.mock.calls);
    expect(serialized).not.toContain('malware.example');
  });

  it('resolves a confirmed malware hash', async () => {
    const fetchImpl = vi.fn<FetchLike>().mockResolvedValue(
      response({
        fullHashes: [{ fullHash: REAL_HASH_B64, fullHashDetails: [{ threatType: 'MALWARE' }] }],
      }),
    );
    const fetcher = createFullHashFetcher({ apiKey: 'KEY', fetchImpl });
    expect(await fetcher!(['deadbeef'])).toEqual([REAL_HASH]);
  });

  it('throws on a non-ok response so resolveVerdict falls to unknown, never safe', async () => {
    const fetchImpl = vi.fn<FetchLike>().mockResolvedValue(response({}, false, 429));
    const fetcher = createFullHashFetcher({ apiKey: 'KEY', fetchImpl });
    await expect(fetcher!(['deadbeef'])).rejects.toThrow('429');
  });

  it('makes no request for an empty prefix list', async () => {
    const fetchImpl = vi.fn<FetchLike>();
    const fetcher = createFullHashFetcher({ apiKey: 'KEY', fetchImpl });
    expect(await fetcher!([])).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
