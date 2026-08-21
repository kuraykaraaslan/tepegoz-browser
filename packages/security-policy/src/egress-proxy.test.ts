import { describe, expect, it } from 'vitest';
import {
  assertFailClosed,
  BLACKHOLE_PROXY_CONFIG,
  isValidSocksPort,
  proxyResolutionIsTunneled,
  tunnelProxyConfig,
  TUNNEL_BYPASS_RULES,
  TUNNEL_WEBRTC_POLICY,
  UnsafeProxyConfigError,
  type TunnelProxyConfig,
} from './egress-proxy';

const reasonOf = (fn: () => unknown): string => {
  try {
    fn();
  } catch (err) {
    return err instanceof UnsafeProxyConfigError ? err.reason : `unexpected:${String(err)}`;
  }
  return 'no-throw';
};

describe('the generated config', () => {
  it('points at the connection’s own loopback SOCKS5 port', () => {
    expect(tunnelProxyConfig(1080)).toEqual({
      mode: 'fixed_servers',
      proxyRules: 'socks5://127.0.0.1:1080',
      proxyBypassRules: TUNNEL_BYPASS_RULES,
    });
  });

  it('NEVER contains a DIRECT fallback — that one token is the whole kill-switch', () => {
    expect(tunnelProxyConfig(1080).proxyRules.toUpperCase()).not.toContain('DIRECT');
  });

  it('bypasses loopback and NOTHING else — not even Chromium’s <local>', () => {
    // `<local>` would send `http://intranet/` out the clear path, handing a LAN host the real address.
    expect(TUNNEL_BYPASS_RULES).not.toContain('<local>');
    expect(TUNNEL_BYPASS_RULES.split(';').sort()).toEqual(['127.0.0.1', '[::1]', 'localhost']);
  });

  it('refuses to build a config for an impossible port', () => {
    for (const bad of [0, -1, 70000, 1.5, Number.NaN]) {
      expect(reasonOf(() => tunnelProxyConfig(bad))).toBe('bad_port');
      expect(isValidSocksPort(bad)).toBe(false);
    }
  });

  it('its own output always passes the assertion', () => {
    for (const port of [1, 1080, 9050, 65535]) {
      expect(() => assertFailClosed(tunnelProxyConfig(port))).not.toThrow();
    }
  });
});

describe('assertFailClosed — the contract every config must pass, however it was built', () => {
  const base: TunnelProxyConfig = {
    mode: 'fixed_servers',
    proxyRules: 'socks5://127.0.0.1:1080',
    proxyBypassRules: TUNNEL_BYPASS_RULES,
  };
  const withRules = (proxyRules: string): TunnelProxyConfig => ({ ...base, proxyRules });

  it('rejects a DIRECT fallback in every spelling Chromium would honour', () => {
    for (const rules of [
      'socks5://127.0.0.1:1080,DIRECT',
      'socks5://127.0.0.1:1080;direct',
      'socks5://127.0.0.1:1080, Direct',
      'https=socks5://127.0.0.1:1080,http=DIRECT',
      'DIRECT',
    ]) {
      expect(reasonOf(() => assertFailClosed(withRules(rules)))).toBe('direct_fallback');
    }
  });

  it('rejects SOCKS4 — it has no hostname form, so DNS would resolve locally and leak every site name', () => {
    expect(reasonOf(() => assertFailClosed(withRules('socks4://127.0.0.1:1080')))).toBe(
      'not_socks5',
    );
  });

  it('rejects an HTTP proxy — the tunnel endpoint is a SOCKS port by construction', () => {
    expect(reasonOf(() => assertFailClosed(withRules('http://127.0.0.1:1080')))).toBe('not_socks5');
  });

  it('rejects a REMOTE proxy address — the SOCKS endpoint is always a process on this machine', () => {
    expect(reasonOf(() => assertFailClosed(withRules('socks5://10.0.0.5:1080')))).toBe(
      'not_loopback',
    );
    expect(reasonOf(() => assertFailClosed(withRules('socks5://vpn.example.com:1080')))).toBe(
      'not_loopback',
    );
  });

  it('rejects empty rules — an empty rule set is Chromium for "go direct"', () => {
    expect(reasonOf(() => assertFailClosed(withRules('')))).toBe('empty_rules');
    expect(reasonOf(() => assertFailClosed(withRules('   ')))).toBe('empty_rules');
  });

  it('rejects any mode other than fixed_servers', () => {
    const cfg = { ...base, mode: 'system' } as unknown as TunnelProxyConfig;
    expect(reasonOf(() => assertFailClosed(cfg))).toBe('not_fixed_servers');
  });

  it('rejects a bypass list wider than loopback', () => {
    for (const bypass of [
      '<local>',
      'localhost;*.internal',
      '<-loopback>',
      'localhost;example.com',
    ]) {
      expect(reasonOf(() => assertFailClosed({ ...base, proxyBypassRules: bypass }))).toBe(
        'bypass_too_broad',
      );
    }
  });

  it('accepts a narrower bypass list, including none at all', () => {
    expect(() => assertFailClosed({ ...base, proxyBypassRules: '' })).not.toThrow();
    expect(() => assertFailClosed({ ...base, proxyBypassRules: 'localhost' })).not.toThrow();
  });
});

describe('the blackhole an unbound tunnel partition holds', () => {
  it('passes the same fail-closed contract as a real tunnel config', () => {
    expect(() => assertFailClosed(BLACKHOLE_PROXY_CONFIG)).not.toThrow();
  });

  it('points somewhere nothing can answer, with no DIRECT escape', () => {
    // "No proxy configured" is not neutral in Chromium — it means DIRECT. This is what makes a
    // created-but-unbound tunnel partition fail closed instead of silently going out the clear path.
    expect(BLACKHOLE_PROXY_CONFIG.proxyRules).toBe('socks5://127.0.0.1:1');
    expect(BLACKHOLE_PROXY_CONFIG.proxyRules.toUpperCase()).not.toContain('DIRECT');
  });
});

describe('post-condition on the live session', () => {
  it('treats a DIRECT resolution as proof the tunnel is NOT in force', () => {
    expect(proxyResolutionIsTunneled('DIRECT')).toBe(false);
    expect(proxyResolutionIsTunneled('PROXY 10.0.0.1:8080')).toBe(false);
    expect(proxyResolutionIsTunneled('')).toBe(false);
  });

  it('accepts what Chromium reports for a live SOCKS5 rule', () => {
    expect(proxyResolutionIsTunneled('SOCKS5 127.0.0.1:1080')).toBe(true);
    expect(proxyResolutionIsTunneled('SOCKS5 127.0.0.1:1080;DIRECT')).toBe(true);
  });
});

describe('WebRTC', () => {
  it('refuses non-proxied UDP outright rather than merely preferring the proxy', () => {
    // `default_public_interface_only` still emits host candidates in some paths; only this value stops
    // ICE from handing out addresses a SOCKS (TCP) proxy never saw.
    expect(TUNNEL_WEBRTC_POLICY).toBe('disable_non_proxied_udp');
  });
});
