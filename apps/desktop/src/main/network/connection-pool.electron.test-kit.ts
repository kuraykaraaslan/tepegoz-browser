import type { NetworkConnection } from '@tepegoz/shared-types';

/** `NetworkConnection` fixtures shared by the `connection-pool` suites. */

export const conn = (id: string, socksPort = 9050): NetworkConnection => ({
  id,
  label: id.toUpperCase(),
  kind: 'byo-socks',
  socksPort,
  note: 'Tor',
  updatedAt: 1,
  version: 1,
});

export const wgConn = (id: string): NetworkConnection =>
  ({
    id,
    label: id.toUpperCase(),
    kind: 'wireguard',
    note: '',
    updatedAt: 1,
    version: 1,
  }) as NetworkConnection;
export const torConn = (id: string, upstreamConnectionId: string | null): NetworkConnection => ({
  id,
  label: id.toUpperCase(),
  kind: 'tor',
  upstreamConnectionId,
  note: '',
  updatedAt: 1,
  version: 1,
});
