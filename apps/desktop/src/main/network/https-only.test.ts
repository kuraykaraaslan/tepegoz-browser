import { describe, expect, it } from 'vitest';
import {
  classifyLoadFailure,
  decide,
  isExemptHost,
  isLocalNetworkHost,
  upgradeUrl,
  UpgradeTracker,
  type HttpsOnlyInput,
  type TunnelKind,
} from './https-only';

const base: HttpsOnlyInput = {
  url: 'http://example.com/a',
  method: 'GET',
  resourceType: 'mainFrame',
  tunnelKind: 'vpn',
  enabled: true,
  bypassed: false,
  recentlyUpgraded: false,
};
const d = (o: Partial<HttpsOnlyInput>) => decide({ ...base, ...o });

describe('decide: schemes', () => {
  it.each([
    ['https://example.com/', 'allow'],
    ['wss://example.com/', 'allow'],
    ['file:///etc/passwd', 'allow'],
    ['data:text/html,hi', 'allow'],
    ['not a url', 'allow'],
  ])('%s -> %s', (url, action) => {
    expect(d({ url }).action).toBe(action);
  });

  it('treats uppercase HTTP:// as http', () => {
    expect(d({ url: 'HTTP://Example.com/x' })).toEqual({
      action: 'upgrade',
      url: 'https://example.com/x',
    });
  });

  it('cancels ws: for any resource type or method', () => {
    expect(d({ url: 'ws://example.com/s', resourceType: 'webSocket' })).toEqual({
      action: 'cancel',
      reason: 'ws',
    });
    expect(d({ url: 'ws://example.com/s', method: 'POST' })).toEqual({
      action: 'cancel',
      reason: 'ws',
    });
  });

  it('lets ws: through only to loopback', () => {
    expect(d({ url: 'ws://localhost:3000/s' }).action).toBe('allow');
  });
});

describe('decide: switches', () => {
  it('allows everything when the pref is off, including ws', () => {
    expect(d({ enabled: false }).action).toBe('allow');
    expect(d({ enabled: false, url: 'ws://example.com/' }).action).toBe('allow');
  });
  it('allows a bypassed host', () => {
    expect(d({ bypassed: true }).action).toBe('allow');
  });
});

describe('decide: methods and frames', () => {
  it.each(['POST', 'PUT', 'DELETE', 'PATCH', 'post'])(
    'cancels mainFrame %s as non-get',
    (method) => {
      expect(d({ method })).toEqual({ action: 'cancel', reason: 'non-get' });
    },
  );
  it('upgrades lowercase get', () => {
    expect(d({ method: 'get' }).action).toBe('upgrade');
  });
  it.each(['mainFrame', 'subFrame', 'script', 'image', 'xhr', 'stylesheet'])(
    'upgrades GET %s',
    (resourceType) => {
      expect(d({ resourceType }).action).toBe('upgrade');
    },
  );
  it('cancels non-GET subresources', () => {
    expect(d({ resourceType: 'xhr', method: 'POST' })).toEqual({
      action: 'cancel',
      reason: 'non-get',
    });
  });
  it('cancels a repeated mainFrame upgrade as loop', () => {
    expect(d({ recentlyUpgraded: true })).toEqual({ action: 'cancel', reason: 'loop' });
  });
  it('does not apply the loop guard to subresources', () => {
    expect(d({ resourceType: 'script', recentlyUpgraded: true }).action).toBe('upgrade');
  });
});

describe('decide: exempt hosts', () => {
  it.each([
    'http://localhost/',
    'http://localhost./',
    'http://LOCALHOST:8080/',
    'http://foo.localhost/',
    'http://127.0.0.1/',
    'http://127.1.2.3:3000/',
    'http://[::1]/',
  ])('allows loopback %s', (url) => {
    expect(d({ url }).action).toBe('allow');
  });

  it.each([
    'http://192.168.1.10/',
    'http://10.0.0.5/',
    'http://172.16.0.1/',
    'http://intranet/',
    'http://128.0.0.1/',
    'http://[fe80::1]/',
  ])('upgrades, never exempts, private/LAN/dotless %s', (url) => {
    expect(d({ url }).action).toBe('upgrade');
  });

  it('does not treat lookalike names as loopback', () => {
    expect(d({ url: 'http://127.0.0.1.evil.test/' }).action).toBe('upgrade');
    expect(d({ url: 'http://localhost.evil.test/' }).action).toBe('upgrade');
  });

  it.each<[TunnelKind, string]>([
    ['tor', 'allow'],
    ['vpn', 'upgrade'],
    ['socks', 'upgrade'],
    ['unknown', 'upgrade'],
  ])('.onion on %s -> %s', (tunnelKind, action) => {
    expect(d({ url: 'http://abcdef.onion/', tunnelKind }).action).toBe(action);
    expect(d({ url: 'http://ABCDEF.onion./', tunnelKind }).action).toBe(action);
  });

  it('judges the real host, not the userinfo', () => {
    expect(d({ url: 'http://example.com@evil.test/' })).toEqual({
      action: 'upgrade',
      url: 'https://example.com@evil.test/',
    });
    expect(d({ url: 'http://localhost@evil.test/' }).action).toBe('upgrade');
    expect(d({ url: 'http://evil.test@localhost/' }).action).toBe('allow');
  });

  it('isExemptHost normalises case, trailing dot and brackets', () => {
    expect(isExemptHost('LocalHost.', 'vpn')).toBe(true);
    expect(isExemptHost('[::1]', 'vpn')).toBe(true);
    expect(isExemptHost('x.onion', 'tor')).toBe(true);
    expect(isExemptHost('example.com', 'tor')).toBe(false);
  });

  it('upgrades punycode hosts', () => {
    const r = d({ url: 'http://xn--bcher-kva.example/' });
    expect(r).toEqual({ action: 'upgrade', url: 'https://xn--bcher-kva.example/' });
    const idn = d({ url: 'http://bücher.example/' });
    expect(idn).toEqual({ action: 'upgrade', url: 'https://xn--bcher-kva.example/' });
  });
});

describe('upgradeUrl', () => {
  it('normalises explicit :80 to the default https port', () => {
    expect(upgradeUrl('http://example.com:80/p')).toBe('https://example.com/p');
  });
  it('keeps a non-default port and never guesses 8443', () => {
    expect(upgradeUrl('http://example.com:8080/p')).toBe('https://example.com:8080/p');
  });
  it('keeps :443 as the default (dropped)', () => {
    expect(upgradeUrl('http://example.com:443/')).toBe('https://example.com/');
  });
  it('preserves userinfo, path, query and fragment', () => {
    expect(upgradeUrl('http://u:p@example.com:8080/a/b?x=1&y=2#frag')).toBe(
      'https://u:p@example.com:8080/a/b?x=1&y=2#frag',
    );
  });
  it('round-trips IPv6 literals', () => {
    expect(upgradeUrl('http://[2001:db8::1]:80/')).toBe('https://[2001:db8::1]/');
  });
  it('throws on garbage rather than returning a cleartext URL', () => {
    expect(() => upgradeUrl('nope')).toThrow();
  });
});

describe('UpgradeTracker', () => {
  const mk = (cap = 500) => {
    let t = 1000;
    const tr = new UpgradeTracker(10_000, cap, () => t);
    return { tr, advance: (ms: number) => (t += ms) };
  };

  it('remembers an exact URL within the TTL', () => {
    const { tr, advance } = mk();
    tr.record('p', 'http://a.test/x');
    advance(9_999);
    expect(tr.has('p', 'http://a.test/x')).toBe(true);
  });
  it('expires after the TTL', () => {
    const { tr, advance } = mk();
    tr.record('p', 'http://a.test/x');
    advance(10_000);
    expect(tr.has('p', 'http://a.test/x')).toBe(false);
    expect(tr.size).toBe(0);
  });
  it('does not trip on a different URL on the same host', () => {
    const { tr } = mk();
    tr.record('p', 'http://a.test/x');
    expect(tr.has('p', 'http://a.test/y')).toBe(false);
    expect(tr.has('p', 'http://a.test/x?q=1')).toBe(false);
  });
  it('is scoped per partition', () => {
    const { tr } = mk();
    tr.record('p1', 'http://a.test/x');
    expect(tr.has('p2', 'http://a.test/x')).toBe(false);
  });
  it('ignores the fragment', () => {
    const { tr } = mk();
    tr.record('p', 'http://a.test/x#one');
    expect(tr.has('p', 'http://a.test/x#two')).toBe(true);
  });
  it('caps entries and evicts the oldest', () => {
    const { tr, advance } = mk(3);
    for (const n of [1, 2, 3, 4]) {
      tr.record('p', `http://a.test/${n}`);
      advance(1);
    }
    expect(tr.size).toBe(3);
    expect(tr.has('p', 'http://a.test/1')).toBe(false);
    expect(tr.has('p', 'http://a.test/4')).toBe(true);
  });
  it('re-recording refreshes age (survives past original TTL) and does not grow', () => {
    const { tr, advance } = mk(2);
    tr.record('p', 'http://a.test/1');
    advance(5_000);
    tr.record('p', 'http://a.test/2');
    advance(1);
    tr.record('p', 'http://a.test/1');
    expect(tr.size).toBe(2);
    advance(6_000);
    expect(tr.has('p', 'http://a.test/1')).toBe(true);
    expect(tr.has('p', 'http://a.test/2')).toBe(true);
  });
});

describe('classifyLoadFailure', () => {
  it.each([-100, -102, -101, -107, -118, -120, -121, -324])('offers bypass for %i', (c) => {
    expect(classifyLoadFailure(c)).toBe('offer-bypass');
  });
  it('ignores -3 (aborted)', () => {
    expect(classifyLoadFailure(-3)).toBe('ignore');
  });
  it.each([-200, -201, -202, -207, -213, -299, -105, -109, -115, -130, -6, -2, 0, 5, -9999])(
    'offers no bypass for %i (cert, DNS, tunnel, unknown)',
    (c) => {
      expect(classifyLoadFailure(c)).toBe('no-bypass');
    },
  );
});

describe('direct mode (HTTPS-first on an ordinary tab)', () => {
  const base = {
    method: 'GET',
    resourceType: 'mainFrame',
    tunnelKind: 'direct' as const,
    enabled: true,
    bypassed: false,
    recentlyUpgraded: false,
  };

  it('upgrades only a top-level GET, and allows everything else', () => {
    expect(decide({ ...base, url: 'http://example.test/a' })).toEqual({
      action: 'upgrade',
      url: 'https://example.test/a',
    });
    expect(decide({ ...base, url: 'http://example.test/a', resourceType: 'script' })).toEqual({
      action: 'allow',
    });
    expect(decide({ ...base, url: 'http://example.test/a', method: 'POST' })).toEqual({
      action: 'allow',
    });
    expect(decide({ ...base, url: 'ws://example.test/a' })).toEqual({ action: 'allow' });
  });

  it('exempts the local network but not a tunnel-style .onion', () => {
    expect(decide({ ...base, url: 'http://printer/' })).toEqual({ action: 'allow' });
    expect(decide({ ...base, url: 'http://abcd.onion/' })).toMatchObject({ action: 'upgrade' });
  });

  it('still cancels a repeated upgrade as a loop', () => {
    expect(decide({ ...base, url: 'http://example.test/', recentlyUpgraded: true })).toEqual({
      action: 'cancel',
      reason: 'loop',
    });
  });

  it('keeps the strict tunnel rules for a tunnel kind (POST and ws are cancelled there)', () => {
    const tunnel = { ...base, tunnelKind: 'tor' as const };
    expect(decide({ ...tunnel, url: 'http://example.test/', method: 'POST' })).toEqual({
      action: 'cancel',
      reason: 'non-get',
    });
    expect(decide({ ...tunnel, url: 'ws://example.test/' })).toEqual({
      action: 'cancel',
      reason: 'ws',
    });
  });
});

describe('isLocalNetworkHost', () => {
  it.each([
    'printer',
    'nas.local',
    'x.internal',
    'a.lan',
    'host.home.arpa',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.1',
    '192.168.0.9',
    '169.254.0.1',
    'fd00::1',
    'fe80::1',
  ])('%s is local', (h) => expect(isLocalNetworkHost(h)).toBe(true));
  it.each([
    'example.com',
    '8.8.8.8',
    '172.15.0.1',
    '172.32.0.1',
    '192.169.0.1',
    '2001:db8::1',
    'local.example.com',
  ])('%s is not local', (h) => expect(isLocalNetworkHost(h)).toBe(false));
});
