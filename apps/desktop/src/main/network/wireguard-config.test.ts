import { describe, expect, it } from 'vitest';
import {
  parseWireGuardConfig,
  summarize,
  toWireproxyConfig,
  WireGuardConfigError,
} from './wireguard-config';

const PRIV = 'aGVsbG8td2lyZWd1YXJkLXByaXZhdGUta2V5LTEyMzQ1Njc4PQ=='.slice(0, 44);
const PUB = 'cHVibGljLWtleS1mb3ItdGVzdGluZy0xMjM0NTY3ODkwYWJjZGU='.slice(0, 44);
const PSK = 'cHJlc2hhcmVkLWtleS1mb3ItdGVzdC0xMjM0NTY3ODkwYWJjZGU='.slice(0, 44);

const FULL = `
# Frankfurt
[Interface]
PrivateKey = ${PRIV}
Address = 10.2.0.2/32, fd00::2/128
DNS = 10.2.0.1, 10.2.0.3
MTU = 1420

[Peer]
PublicKey = ${PUB}
PresharedKey = ${PSK}
AllowedIPs = 0.0.0.0/0, ::/0
Endpoint = de-fra.example.com:51820
PersistentKeepalive = 25
`;

describe('parsing', () => {
  it('reads a full profile', () => {
    const c = parseWireGuardConfig(FULL);
    expect(c.privateKey).toBe(PRIV);
    expect(c.addresses).toEqual(['10.2.0.2/32', 'fd00::2/128']);
    expect(c.dns).toEqual(['10.2.0.1', '10.2.0.3']);
    expect(c.mtu).toBe(1420);
    expect(c.peers).toHaveLength(1);
    expect(c.peers[0]).toMatchObject({
      publicKey: PUB,
      presharedKey: PSK,
      endpoint: 'de-fra.example.com:51820',
      persistentKeepalive: 25,
    });
  });

  it('ignores comments, blank lines and stray text outside a section', () => {
    const c = parseWireGuardConfig(`; a comment\nnot-a-directive\n${FULL}`);
    expect(c.peers).toHaveLength(1);
  });

  it('accepts a profile with no optional fields', () => {
    const c = parseWireGuardConfig(
      `[Interface]\nPrivateKey = ${PRIV}\nAddress = 10.2.0.2/32\nDNS = 10.2.0.1\n\n[Peer]\nPublicKey = ${PUB}\nEndpoint = h:1\n`,
    );
    expect(c.mtu).toBeNull();
    expect(c.peers[0]?.presharedKey).toBeNull();
    expect(c.peers[0]?.persistentKeepalive).toBeNull();
  });

  it('reads several peers', () => {
    const c = parseWireGuardConfig(
      `${FULL}\n[Peer]\nPublicKey = ${PUB}\nEndpoint = uk-lon.example.com:51820\n`,
    );
    expect(c.peers).toHaveLength(2);
  });
});

describe('what it refuses, and why', () => {
  const fails = (text: string): string => {
    try {
      parseWireGuardConfig(text);
    } catch (err) {
      return err instanceof WireGuardConfigError ? err.message : `unexpected:${String(err)}`;
    }
    return 'no-throw';
  };

  it('REFUSES a config with no DNS — the silent hostname leak', () => {
    // wireproxy falls back to the host resolver without a DNS line, so every site name the "tunneled"
    // group visits would go to the user's ISP in the clear while the traffic itself went through the
    // tunnel. Defaulting to some resolver would be choosing a third party on the user's behalf.
    const noDns = FULL.replace(/^DNS = .*$/m, '');
    expect(fails(noDns)).toMatch(/no DNS line/);
  });

  it('rejects a file that is not a WireGuard config at all', () => {
    expect(fails('hello world')).toMatch(/No \[Interface\]/);
    expect(
      fails(`[Interface]\nPrivateKey = ${PRIV}\nAddress = 10.0.0.1/32\nDNS = 1.1.1.1\n`),
    ).toMatch(/No \[Peer\]/);
  });

  it('rejects malformed keys rather than passing them to the tunnel', () => {
    expect(fails(FULL.replace(PRIV, 'not-a-key'))).toMatch(/not a valid WireGuard key/);
    expect(fails(FULL.replace(PUB, 'nope'))).toMatch(/not a valid WireGuard key/);
  });

  it('rejects a peer with no endpoint or a malformed one', () => {
    expect(fails(FULL.replace(/^Endpoint = .*$/m, ''))).toMatch(/no Endpoint/);
    expect(fails(FULL.replace('de-fra.example.com:51820', 'de-fra.example.com'))).toMatch(
      /host:port/,
    );
  });

  it('rejects an interface with no address', () => {
    expect(fails(FULL.replace(/^Address = .*$/m, ''))).toMatch(/no Address/);
  });

  it('refuses an absurdly large file instead of parsing it', () => {
    expect(fails('x'.repeat(200_000))).toMatch(/too large/);
  });
});

describe('rendering for wireproxy', () => {
  it('exposes the tunnel on the given loopback SOCKS port', () => {
    const rendered = toWireproxyConfig(parseWireGuardConfig(FULL), 41080);
    expect(rendered).toContain('[Socks5]');
    expect(rendered).toContain('BindAddress = 127.0.0.1:41080');
  });

  it('carries the DNS through — the whole point of demanding one', () => {
    expect(toWireproxyConfig(parseWireGuardConfig(FULL), 1080)).toContain(
      'DNS = 10.2.0.1, 10.2.0.3',
    );
  });

  it('forces AllowedIPs to everything, because here it is not a routing decision', () => {
    const narrow = FULL.replace('AllowedIPs = 0.0.0.0/0, ::/0', 'AllowedIPs = 10.2.0.0/24');
    const rendered = toWireproxyConfig(parseWireGuardConfig(narrow), 1080);
    // In kernel WireGuard this field picks which destinations enter the tunnel. In a userspace stack
    // there is no routing table, so a narrow value would DROP destinations rather than route them
    // elsewhere — everything reaching this config is already meant for the tunnel.
    expect(rendered).toContain('AllowedIPs = 0.0.0.0/0');
    expect(rendered).not.toContain('10.2.0.0/24');
  });

  it('keeps the preshared key and keepalive when present, omits them when not', () => {
    expect(toWireproxyConfig(parseWireGuardConfig(FULL), 1080)).toContain(`PresharedKey = ${PSK}`);
    const bare = parseWireGuardConfig(
      `[Interface]\nPrivateKey = ${PRIV}\nAddress = 10.2.0.2/32\nDNS = 10.2.0.1\n\n[Peer]\nPublicKey = ${PUB}\nEndpoint = h:1\n`,
    );
    expect(toWireproxyConfig(bare, 1080)).not.toContain('PresharedKey');
    expect(toWireproxyConfig(bare, 1080)).not.toContain('PersistentKeepalive');
  });
});

describe('the summary shown before committing', () => {
  it('describes the profile without exposing key material', () => {
    const s = summarize(parseWireGuardConfig(FULL));
    expect(s).toEqual({
      endpoint: 'de-fra.example.com:51820',
      addresses: ['10.2.0.2/32', 'fd00::2/128'],
      dns: ['10.2.0.1', '10.2.0.3'],
      peerCount: 1,
      fullTunnel: true,
    });
    expect(JSON.stringify(s)).not.toContain(PRIV);
  });

  it('marks a split-tunnel profile as not full', () => {
    const narrow = FULL.replace('AllowedIPs = 0.0.0.0/0, ::/0', 'AllowedIPs = 10.2.0.0/24');
    expect(summarize(parseWireGuardConfig(narrow)).fullTunnel).toBe(false);
  });
});
