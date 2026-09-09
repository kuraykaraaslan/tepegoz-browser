import { describe, it, expect } from 'vitest';
import {
  type ConnectionCandidate,
  type DiscoveryPorts,
  type SrvRecord,
  discoverXmpp,
  explicitCandidate,
  sortSrv,
} from './autodiscover';

function ports(over: Partial<DiscoveryPorts> = {}): DiscoveryPorts {
  return {
    resolveSrv: () => Promise.resolve([]),
    getText: () => Promise.resolve(null),
    ...over,
  };
}

const srv = (target: string, port: number, priority = 10, weight = 0): SrvRecord => ({
  target,
  port,
  priority,
  weight,
});

describe('sortSrv', () => {
  it('orders by priority asc then weight desc', () => {
    const sorted = sortSrv([
      srv('c', 1, 20, 5),
      srv('a', 1, 10, 1),
      srv('b', 1, 10, 9),
    ]);
    expect(sorted.map((r) => r.target)).toEqual(['b', 'a', 'c']);
  });
});

describe('discoverXmpp', () => {
  it('prefers direct-TLS SRV, then STARTTLS SRV', async () => {
    const candidates = await discoverXmpp(
      'example.com',
      ports({
        resolveSrv: (name) =>
          Promise.resolve(
            name.startsWith('_xmpps-client')
              ? [srv('tls.example.com', 5223)]
              : [srv('plain.example.com', 5222)],
          ),
      }),
    );
    expect(candidates).toEqual<ConnectionCandidate[]>([
      { kind: 'tcp', host: 'tls.example.com', port: 5223, tls: true },
      { kind: 'tcp', host: 'plain.example.com', port: 5222, tls: false },
    ]);
  });

  it('honours the RFC 2782 "no service" record (target ".")', async () => {
    const candidates = await discoverXmpp(
      'example.com',
      ports({
        resolveSrv: (name) =>
          Promise.resolve(name.startsWith('_xmpp-client') ? [srv('.', 0)] : [srv('t', 5223)]),
      }),
    );
    // starttls SRV is "." → skipped; only the direct-TLS candidate remains
    expect(candidates).toEqual([{ kind: 'tcp', host: 't', port: 5223, tls: true }]);
  });

  it('reads WebSocket endpoints from host-meta.json', async () => {
    const candidates = await discoverXmpp(
      'example.com',
      ports({
        getText: (url) =>
          Promise.resolve(
            url.endsWith('.json')
              ? JSON.stringify({
                  links: [
                    { rel: 'urn:xmpp:alt-connections:websocket', href: 'wss://example.com/ws' },
                    { rel: 'urn:xmpp:alt-connections:xbosh', href: 'https://example.com/bosh' },
                    { rel: 'urn:xmpp:alt-connections:websocket', href: 'ws://insecure/ws' },
                  ],
                })
              : null,
          ),
      }),
    );
    expect(candidates).toContainEqual({ kind: 'websocket', url: 'wss://example.com/ws' });
    expect(candidates).not.toContainEqual({ kind: 'websocket', url: 'ws://insecure/ws' });
  });

  it('reads WebSocket endpoints from an XRD host-meta when no JSON', async () => {
    const xrd =
      '<XRD xmlns="http://docs.oasis-open.org/ns/xri/xrd-1.0">' +
      '<Link rel="urn:xmpp:alt-connections:websocket" href="wss://xrd.example.com/ws"/>' +
      '</XRD>';
    const candidates = await discoverXmpp(
      'example.com',
      ports({ getText: (url) => Promise.resolve(url.endsWith('.json') ? null : xrd) }),
    );
    expect(candidates).toContainEqual({ kind: 'websocket', url: 'wss://xrd.example.com/ws' });
  });

  it('falls back to the domain A record on port 5222 when nothing else resolves', async () => {
    const candidates = await discoverXmpp('example.com', ports());
    expect(candidates).toEqual([
      { kind: 'tcp', host: 'example.com', port: 5222, tls: false },
    ]);
  });

  it('tolerates SRV rejection and malformed host-meta JSON', async () => {
    const candidates = await discoverXmpp(
      'example.com',
      ports({
        resolveSrv: () => Promise.reject(new Error('SERVFAIL')),
        getText: (url) => Promise.resolve(url.endsWith('.json') ? '{ not json' : null),
      }),
    );
    expect(candidates).toEqual([{ kind: 'tcp', host: 'example.com', port: 5222, tls: false }]);
  });
});

describe('explicitCandidate', () => {
  it('maps security mode to tls + default port', () => {
    expect(explicitCandidate({ host: 'h', port: null, security: 'tls' })).toEqual({
      kind: 'tcp',
      host: 'h',
      port: 5223,
      tls: true,
    });
    expect(explicitCandidate({ host: 'h', port: 15222, security: 'starttls' })).toEqual({
      kind: 'tcp',
      host: 'h',
      port: 15222,
      tls: false,
    });
  });
});
