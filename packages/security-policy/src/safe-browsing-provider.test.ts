import { describe, expect, it, vi } from 'vitest';
import { fullHash, hashPrefix, prefixDatabase, type FullHashFetcher } from './safe-browsing';
import { SafeBrowsingProvider, type SafeBrowsingProviderPorts } from './safe-browsing-provider';

const BAD = 'http://malware.example/download/payload.exe';

function dbFor(url: string) {
  return prefixDatabase([hashPrefix(`${new URL(url).hostname}/`)]);
}

/** A fetcher that confirms the host root as listed — i.e. the URL really is unsafe. */
const confirms: FullHashFetcher = () => Promise.resolve([fullHash('malware.example/')]);
/** A fetcher whose candidates never match — every prefix hit was a collision. */
const collisionOnly: FullHashFetcher = () => Promise.resolve([fullHash('unrelated.example/x')]);

function ports(overrides: Partial<SafeBrowsingProviderPorts> = {}): SafeBrowsingProviderPorts {
  return {
    enabled: () => true,
    database: () => dbFor(BAD),
    fetchFullHashes: () => confirms,
    ...overrides,
  };
}

describe('SafeBrowsingProvider — navigation gate (fails open)', () => {
  it('blocks only a confirmed unsafe URL', async () => {
    const p = new SafeBrowsingProvider(ports());
    expect(await p.checkNavigation(BAD)).toBe('block');
  });

  it('allows a URL that is clear of the local set without asking anyone', async () => {
    const fetcher = vi.fn<FullHashFetcher>();
    const p = new SafeBrowsingProvider(ports({ fetchFullHashes: () => fetcher }));
    expect(await p.checkNavigation('https://example.com/')).toBe('allow');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('allows a prefix hit that resolves to someone else’s hash — a collision is not a block', async () => {
    const p = new SafeBrowsingProvider(ports({ fetchFullHashes: () => collisionOnly }));
    expect(await p.checkNavigation(BAD)).toBe('allow');
  });

  it('returns unknown (never block) when the feature is off — and never touches the database', async () => {
    const database = vi.fn<() => null>(() => null);
    const p = new SafeBrowsingProvider(ports({ enabled: () => false, database }));
    expect(await p.checkNavigation(BAD)).toBe('unknown');
    expect(database).not.toHaveBeenCalled();
  });

  it('returns unknown when no prefix database has been downloaded yet', async () => {
    const p = new SafeBrowsingProvider(ports({ database: () => null }));
    expect(await p.checkNavigation(BAD)).toBe('unknown');
  });

  it('returns unknown on a prefix hit when no transport is configured — a guess is not a block', async () => {
    const p = new SafeBrowsingProvider(ports({ fetchFullHashes: () => null }));
    expect(await p.checkNavigation(BAD)).toBe('unknown');
  });

  it('still answers a definitive allow with no transport, when the local check is clear', async () => {
    const p = new SafeBrowsingProvider(ports({ fetchFullHashes: () => null }));
    expect(await p.checkNavigation('https://example.com/')).toBe('allow');
  });

  it('returns unknown (never block) when the lookup throws', async () => {
    const p = new SafeBrowsingProvider(
      ports({ fetchFullHashes: () => () => Promise.reject(new Error('offline')) }),
    );
    expect(await p.checkNavigation(BAD)).toBe('unknown');
  });
});

describe('SafeBrowsingProvider — download-origin gate (fails closed)', () => {
  it('blocks a download whose source origin is confirmed unsafe', async () => {
    const p = new SafeBrowsingProvider(ports());
    expect(await p.checkDownloadOrigin(BAD)).toBe('blocked');
  });

  it('returns unknown — not blocked — for a clean origin', async () => {
    const p = new SafeBrowsingProvider(ports());
    expect(await p.checkDownloadOrigin('https://example.com/')).toBe('unknown');
  });

  it('returns unknown for a missing or empty origin', async () => {
    const p = new SafeBrowsingProvider(ports());
    expect(await p.checkDownloadOrigin(undefined)).toBe('unknown');
    expect(await p.checkDownloadOrigin('')).toBe('unknown');
  });

  it('returns unknown — not blocked — when the feature is off', async () => {
    const p = new SafeBrowsingProvider(ports({ enabled: () => false }));
    expect(await p.checkDownloadOrigin(BAD)).toBe('unknown');
  });

  it('returns unknown — not blocked — when the lookup throws', async () => {
    const p = new SafeBrowsingProvider(
      ports({ fetchFullHashes: () => () => Promise.reject(new Error('offline')) }),
    );
    expect(await p.checkDownloadOrigin(BAD)).toBe('unknown');
  });
});

describe('SafeBrowsingProvider — what crosses the boundary', () => {
  it('hands the fetcher four-byte prefixes only, never the URL', async () => {
    const fetcher = vi.fn<FullHashFetcher>().mockResolvedValue([]);
    const p = new SafeBrowsingProvider(ports({ fetchFullHashes: () => fetcher }));
    await p.checkNavigation(BAD);

    const sent = fetcher.mock.calls[0]?.[0] ?? [];
    expect(sent.length).toBeGreaterThan(0);
    for (const prefix of sent) expect(prefix).toMatch(/^[0-9a-f]{8}$/);
    const serialized = JSON.stringify(fetcher.mock.calls);
    expect(serialized).not.toContain('malware.example');
    expect(serialized).not.toContain('payload.exe');
  });

  it('reads the enabled switch on every call, not once at construction', async () => {
    let on = true;
    const p = new SafeBrowsingProvider(ports({ enabled: () => on }));
    expect(await p.checkNavigation(BAD)).toBe('block');
    on = false;
    expect(await p.checkNavigation(BAD)).toBe('unknown');
  });
});
