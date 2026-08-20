import { describe, expect, it } from 'vitest';
import {
  openVpnArgs,
  parseOpenVpnProfile,
  summarizeOpenVpn,
  OpenVpnConfigError,
} from './openvpn-config';

const FRA = `
# Frankfurt
client
dev tun
proto udp
remote de-fra.example.com 1194
remote de-fra2.example.com 443 tcp
auth-user-pass
redirect-gateway def1
block-outside-dns
cipher AES-256-GCM
<ca>
-----BEGIN CERTIFICATE-----
SECRET
-----END CERTIFICATE-----
</ca>
<tls-crypt>
-----BEGIN OpenVPN Static key V1-----
SECRET
-----END OpenVPN Static key V1-----
</tls-crypt>
`;

const fails = (text: string): string => {
  try {
    parseOpenVpnProfile(text);
  } catch (err) {
    return err instanceof OpenVpnConfigError ? err.message : `unexpected:${String(err)}`;
  }
  return 'no-throw';
};

describe('parsing', () => {
  it('reads remotes, inheriting the global proto and defaulting the port', () => {
    const p = parseOpenVpnProfile(FRA);
    expect(p.remotes).toEqual([
      { host: 'de-fra.example.com', port: 1194, proto: 'udp' },
      { host: 'de-fra2.example.com', port: 443, proto: 'tcp' },
    ]);
  });

  it('notices the things we are going to override', () => {
    const p = parseOpenVpnProfile(FRA);
    expect(p.redirectGateway).toBe(true);
    expect(p.blockOutsideDns).toBe(true);
    expect(p.authUserPass).toBe(true);
  });

  it('records inline blocks by NAME without reading their contents', () => {
    const p = parseOpenVpnProfile(FRA);
    expect(p.inlineBlocks).toEqual(['ca', 'tls-crypt']);
    // The bodies are key material; nothing here should be carrying them around.
    expect(JSON.stringify(p)).not.toContain('SECRET');
  });

  it('does not mistake a directive inside an inline block for a real one', () => {
    const sneaky = FRA.replace('SECRET\n-----END CERTIFICATE-----', 'remote evil.example.com 1\n-----END CERTIFICATE-----');
    expect(parseOpenVpnProfile(sneaky).remotes).toHaveLength(2);
  });

  it('flags directives that point at a file the stored profile will not have', () => {
    const external = `client\ndev tun\nremote h 1194\nca /etc/openvpn/ca.crt\nkey /etc/openvpn/x.key\n`;
    expect(parseOpenVpnProfile(external).externalFileRefs).toEqual(['ca', 'key']);
  });

  it('ignores comments and blank lines', () => {
    const p = parseOpenVpnProfile(`# hi\n;also hi\n\nclient\ndev tun\nremote h 1194\n`);
    expect(p.remotes).toHaveLength(1);
  });
});

describe('what it refuses', () => {
  it('refuses a TAP profile — a bridged adapter cannot be routed per tab', () => {
    // The per-tab model binds sockets to the tunnel's own address; a layer-2 bridge does not give one.
    expect(fails(FRA.replace('dev tun', 'dev tap'))).toMatch(/TAP/);
  });

  it('refuses a file that is not an OpenVPN profile', () => {
    // "hello world" parses as an unknown directive, so it fails on the missing remote rather than on
    // "no directives at all" — either way it never becomes a connection.
    expect(fails('hello world\n')).toMatch(/No "remote" line/);
    expect(fails('client\ndev tun\n')).toMatch(/No "remote" line/);
  });

  it('refuses a remote with an unusable port', () => {
    expect(fails('client\ndev tun\nremote h 99999\n')).toMatch(/unusable port/);
  });

  it('refuses an absurdly large file instead of parsing it', () => {
    expect(fails('x'.repeat(600_000))).toMatch(/too large/);
  });
});

describe('the summary shown before committing', () => {
  it('names the overrides so the user learns them BEFORE connecting', () => {
    const s = summarizeOpenVpn(parseOpenVpnProfile(FRA));
    expect(s.endpoint).toBe('de-fra.example.com:1194');
    expect(s.proto).toBe('udp');
    expect(s.authUserPass).toBe(true);
    expect(s.overrides).toEqual(['redirect-gateway', 'block-outside-dns']);
  });

  it('lists no overrides for a profile that never asked for the whole machine', () => {
    const polite = `client\ndev tun\nremote h 1194\n`;
    expect(summarizeOpenVpn(parseOpenVpnProfile(polite)).overrides).toEqual([]);
  });
});

describe('the command line — where the per-tab model is actually enforced', () => {
  const args = openVpnArgs({
    configPath: 'C:/p/fra.ovpn',
    managementHost: '127.0.0.1',
    managementPort: 41000,
    managementPasswordFile: 'C:/p/mgmt.pw',
    devNode: 'Tepegoz-fra',
  });
  const pairs = (): string[] => {
    const out: string[] = [];
    for (let i = 0; i < args.length; i += 1) {
      if (args[i] === '--pull-filter' && args[i + 1] === 'ignore') out.push(args[i + 2] ?? '');
    }
    return out;
  };

  it('drops every pushed directive that would take over the WHOLE machine', () => {
    // redirect-gateway/route would put every Direct tab in this tunnel; block-outside-dns would break
    // name resolution for every untunneled tab and for the rest of the computer.
    expect(pairs()).toEqual(['redirect-gateway', 'route ', 'route-ipv6', 'block-outside-dns']);
  });

  it('KEEPS the pushed DNS — it is what stops hostnames leaking to the ISP', () => {
    expect(pairs()).not.toContain('dhcp-option');
  });

  it('adds one default route on the tunnel, with a deliberately terrible metric', () => {
    const i = args.indexOf('--route');
    expect(args.slice(i, i + 5)).toEqual(['--route', '0.0.0.0', '0.0.0.0', 'vpn_gateway', '9999']);
  });

  it('drives everything through the management channel, with password prompts enabled', () => {
    expect(args).toContain('--management-query-passwords');
    const i = args.indexOf('--management');
    expect(args.slice(i, i + 4)).toEqual(['--management', '127.0.0.1', '41000', 'C:/p/mgmt.pw']);
  });

  it('binds to the adapter reserved for this tunnel, and omits the flag when there is none', () => {
    expect(args).toContain('--dev-node');
    const noNode = openVpnArgs({
      configPath: 'c',
      managementHost: '127.0.0.1',
      managementPort: 1,
      managementPasswordFile: 'p',
    });
    expect(noNode).not.toContain('--dev-node');
  });
});
