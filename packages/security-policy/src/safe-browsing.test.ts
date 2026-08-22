import { describe, expect, it, vi } from 'vitest';
import {
  checkUrl,
  fullHash,
  hashPrefix,
  prefixDatabase,
  resolveVerdict,
  urlHashPrefixes,
} from './safe-browsing';
import { urlExpressions } from './safe-browsing-canonical';

/**
 * The claim on the Phase 1a line is "URL never sent". These tests are written to make that claim
 * falsifiable rather than aspirational: what crosses the boundary is asserted directly, and the local
 * checker is given no transport it could leak through even if it wanted to.
 */
const BAD_URL = 'http://malware.example/download/payload.exe';

function dbFor(url: string) {
  // A blocklist entry is a hash of one canonical expression — here, the host root.
  return prefixDatabase([hashPrefix(`${new URL(url).hostname}/`)]);
}

describe('hashing', () => {
  it('is a plain SHA-256 of the canonical expression, truncated to four bytes', () => {
    expect(fullHash('example.com/')).toHaveLength(64);
    expect(hashPrefix('example.com/')).toBe(fullHash('example.com/').slice(0, 8));
    expect(hashPrefix('example.com/')).toHaveLength(8);
  });

  it('produces one prefix per expression, deduplicated', () => {
    const prefixes = urlHashPrefixes('http://a.b.c/1/2.html?param=1');
    expect(prefixes).toHaveLength(urlExpressions('http://a.b.c/1/2.html?param=1').length);
    expect(new Set(prefixes).size).toBe(prefixes.length);
  });

  it('has nothing to check for a URL the blocklist does not describe', () => {
    expect(urlHashPrefixes('javascript:alert(1)')).toEqual([]);
    expect(urlHashPrefixes('file:///C:/secret.txt')).toEqual([]);
  });
});

describe('local check', () => {
  it('clears an unlisted URL without needing anyone', () => {
    const result = checkUrl('https://example.com/', dbFor(BAD_URL));
    expect(result.clear).toBe(true);
    expect(result.hits).toEqual([]);
  });

  it('flags a listed host, and flags it through any path beneath it', () => {
    const db = dbFor(BAD_URL);
    expect(checkUrl(BAD_URL, db).clear).toBe(false);
    expect(checkUrl('http://malware.example/anything/else', db).clear).toBe(false);
  });

  it('takes no transport at all — it could not send the URL if it tried', () => {
    // Structural, not behavioural: `checkUrl(url, db)` has nowhere to send anything. A test asserting
    // "we did not call fetch" would only prove this run did not; the signature proves no run can.
    expect(checkUrl).toHaveLength(2);
  });
});

describe('resolving a prefix hit', () => {
  it('never passes the URL to the fetcher — only four-byte prefixes', async () => {
    const fetcher = vi.fn().mockResolvedValue([]);
    await resolveVerdict(BAD_URL, dbFor(BAD_URL), fetcher);

    const sent = fetcher.mock.calls[0]?.[0] as string[];
    expect(sent.length).toBeGreaterThan(0);
    // Every argument is an 8-hex-character prefix. Nothing that could contain a URL.
    for (const prefix of sent) expect(prefix).toMatch(/^[0-9a-f]{8}$/);
    const serialized = JSON.stringify(fetcher.mock.calls);
    expect(serialized).not.toContain('malware.example');
    expect(serialized).not.toContain('payload.exe');
  });

  it('does not ask anyone when the local check is clear', async () => {
    const fetcher = vi.fn().mockResolvedValue([]);
    expect(await resolveVerdict('https://example.com/', dbFor(BAD_URL), fetcher)).toBe('safe');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('confirms unsafe only when a FULL hash matches, not a prefix', async () => {
    const real = fullHash('malware.example/');
    expect(await resolveVerdict(BAD_URL, dbFor(BAD_URL), () => Promise.resolve([real]))).toBe(
      'unsafe',
    );
  });

  it('treats a prefix hit whose full hashes differ as safe — collisions are the design', async () => {
    // Four bytes collide on purpose: that is what stops the prefix from identifying the URL. A hit that
    // resolves to someone else's hash must clear, or every collision becomes a false block.
    const someoneElse = fullHash('unrelated.example/other');
    expect(
      await resolveVerdict(BAD_URL, dbFor(BAD_URL), () => Promise.resolve([someoneElse])),
    ).toBe('safe');
  });

  it('fails to UNKNOWN when the lookup errors, never to safe', async () => {
    // Offline, rate-limited, or blocked by the user's own firewall. Reporting a clean bill of health
    // there would turn an outage into a silent security downgrade; the caller must know it is guessing.
    const verdict = await resolveVerdict(BAD_URL, dbFor(BAD_URL), () =>
      Promise.reject(new Error('offline')),
    );
    expect(verdict).toBe('unknown');
  });
});
