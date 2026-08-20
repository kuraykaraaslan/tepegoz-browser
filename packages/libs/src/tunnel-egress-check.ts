import { request } from 'node:https';

/**
 * Proving that a source-bound socket actually leaves through its tunnel (Phase 5, the OpenVPN path).
 *
 * The whole OpenVPN design rests on one assumption: with no tunnel holding the system default route, a
 * socket bound to the tunnel adapter's address is constrained to that interface, where the tunnel's own
 * high-metric default route is waiting. That is what Windows' strong host model says should happen — and
 * "should" is not good enough here, because the failure mode is **silent**: the socket simply takes the
 * physical route instead, everything loads, and the traffic left on the clear path.
 *
 * So rather than trusting a spike that ran once on one machine, the assumption is measured **every time a
 * connection comes up**, on that machine, with that adapter. Two requests to the same echo service — one
 * bound to the tunnel, one not — and the addresses must differ. Same address, or either request failing,
 * means the connection does not come up.
 *
 * **This is the one place the browser makes an outbound request the user did not directly ask for**, and
 * it is confined to the moment they connect an OpenVPN tunnel — an act whose entire point is changing
 * where traffic comes from. The endpoint is a preference so it can be pointed at something self-hosted,
 * and both requests go to the same place, so it learns nothing it would not learn from either alone.
 */

const CHECK_TIMEOUT_MS = 12_000;
/** An echo service must return the caller's address as bare text and nothing else. */
const MAX_BODY = 128;

export interface EgressCheck {
  /** The address seen when bound to the tunnel adapter. */
  tunnelAddress: string;
  /** The address seen without binding — the machine's ordinary path. */
  directAddress: string;
  /** True only when the two differ, which is the whole point. */
  isTunneled: boolean;
}

function fetchEchoedAddress(url: string, localAddress?: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const req = request(
      url,
      {
        method: 'GET',
        timeout: CHECK_TIMEOUT_MS,
        // The bound call is the measurement; the unbound one is the control.
        ...(localAddress === undefined ? {} : { localAddress, family: 4 }),
      },
      (res) => {
        let body = '';
        res.on('data', (chunk: Buffer) => {
          body += chunk.toString();
          if (body.length > MAX_BODY) {
            req.destroy();
            reject(new Error('the address-check endpoint returned more than an address'));
          }
        });
        res.on('end', () => {
          const text = body.trim();
          if (text.length === 0) reject(new Error('the address-check endpoint returned nothing'));
          else resolve(text);
        });
      },
    );
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('the address check timed out'));
    });
    req.on('error', reject);
    req.end();
  });
}

/**
 * Measure whether traffic bound to `localAddress` really leaves by a different path.
 *
 * Throws rather than returning a "probably" — the caller turns any failure into a connection that stays
 * down, because the alternative is a connection reported up whose traffic is on the clear path.
 */
export async function checkTunnelEgress(localAddress: string, echoUrl: string): Promise<EgressCheck> {
  // Sequential, not parallel: two simultaneous requests to the same host can share a connection in ways
  // that muddy which socket bound where, and this measurement has to be unambiguous.
  const tunnelAddress = await fetchEchoedAddress(echoUrl, localAddress);
  const directAddress = await fetchEchoedAddress(echoUrl);
  return { tunnelAddress, directAddress, isTunneled: tunnelAddress !== directAddress };
}

/**
 * The message shown when the check says the tunnel is not carrying the traffic.
 *
 * Deliberately explicit about what was observed. "Could not connect" would send the user looking at their
 * VPN credentials, when what actually happened is that the operating system routed a bound socket out the
 * ordinary interface — a different problem with a different fix.
 */
export function notTunneledMessage(check: EgressCheck): string {
  return (
    'Traffic sent through this tunnel came from the same address as traffic sent without it ' +
    `(${check.directAddress}), so the tunnel is not carrying it. The connection was left down rather ` +
    'than reported as protected.'
  );
}
