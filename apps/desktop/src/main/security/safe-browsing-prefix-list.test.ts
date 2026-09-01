import { describe, expect, it, vi } from 'vitest';
import {
  createPrefixListFetcher,
  hashListUrl,
  MIRRORED_LISTS,
  parseHashListResponse,
  type FetchLike,
} from './safe-browsing-v5-client';

function response(json: unknown, ok = true, status = 200) {
  return { ok, status, json: () => Promise.resolve(json) };
}

const TWO_PREFIXES = Buffer.from('deadbeeffeedface', 'hex').toString('base64');

describe('parseHashListResponse', () => {
  it('splits uncompressed additionsFourBytes into 8-hex prefixes', () => {
    expect(
      parseHashListResponse({ additionsFourBytes: { rawHashes: TWO_PREFIXES } }),
    ).toEqual(['deadbeef', 'feedface']);
  });

  it('returns [] for junk, a Rice-coded payload, or a non-multiple-of-4 blob', () => {
    expect(parseHashListResponse(null)).toEqual([]);
    expect(parseHashListResponse({})).toEqual([]);
    expect(
      parseHashListResponse({ additionsFourBytes: { rawHashes: TWO_PREFIXES, riceParameter: 28 } }),
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
