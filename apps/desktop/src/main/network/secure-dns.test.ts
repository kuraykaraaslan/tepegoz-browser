import { describe, expect, it } from 'vitest';
import { resolveSecureDns, SECURE_DNS_PROVIDER_URLS } from './secure-dns';

describe('resolveSecureDns', () => {
  it('is the system resolver when off, or when nothing is set at all', () => {
    expect(resolveSecureDns({ secureDnsMode: 'off' })).toEqual({
      mode: 'off',
      servers: [],
      degraded: false,
    });
    expect(resolveSecureDns({})).toEqual({ mode: 'off', servers: [], degraded: false });
    // An off mode ignores a stale provider and a stale custom URL.
    expect(
      resolveSecureDns({
        secureDnsMode: 'off',
        secureDnsProvider: 'custom',
        secureDnsCustomUrl: 'x',
      }),
    ).toEqual({ mode: 'off', servers: [], degraded: false });
  });

  it.each(['cloudflare', 'google', 'quad9'] as const)(
    'maps the %s preset to its RFC 8484 endpoint',
    (p) => {
      for (const mode of ['automatic', 'secure'] as const) {
        expect(resolveSecureDns({ secureDnsMode: mode, secureDnsProvider: p })).toEqual({
          mode,
          servers: [SECURE_DNS_PROVIDER_URLS[p]],
          degraded: false,
        });
      }
      expect(SECURE_DNS_PROVIDER_URLS[p].startsWith('https://')).toBe(true);
    },
  );

  it('defaults the provider to Cloudflare when the mode is on but none was chosen', () => {
    expect(resolveSecureDns({ secureDnsMode: 'automatic' }).servers).toEqual([
      SECURE_DNS_PROVIDER_URLS.cloudflare,
    ]);
  });

  it('uses a valid custom address, trimmed', () => {
    expect(
      resolveSecureDns({
        secureDnsMode: 'secure',
        secureDnsProvider: 'custom',
        secureDnsCustomUrl: '  https://dns.example/dns-query  ',
      }),
    ).toEqual({ mode: 'secure', servers: ['https://dns.example/dns-query'], degraded: false });
  });

  it.each(['', '   ', 'http://dns.example/q', 'https://u:p@dns.example/q', 'garbage'])(
    'falls back to the SYSTEM resolver — not to secure mode with no server — for an unusable custom address %j',
    (url) => {
      const cfg = resolveSecureDns({
        secureDnsMode: 'secure',
        secureDnsProvider: 'custom',
        secureDnsCustomUrl: url,
      });
      expect(cfg).toEqual({ mode: 'off', servers: [], degraded: true });
    },
  );
});
