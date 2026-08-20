import { networkInterfaces } from 'node:os';
import { test, expect } from '@playwright/test';
import { checkTunnelEgress } from '../packages/libs/src/tunnel-egress-check';

/**
 * SPIKE (make-or-break): does a source-bound socket actually leave through its tunnel?
 *
 * The OpenVPN path rests on one assumption about the host OS: with no tunnel holding the system default
 * route, a socket bound to a tunnel adapter's address is constrained to that interface, where the
 * tunnel's own high-metric default route is waiting. Windows' strong host model says it should be so.
 * The failure mode if it is not is **silent** — the socket takes the physical route, pages load, and the
 * traffic left on the clear path.
 *
 * **STATUS: WRITTEN, NOT YET RUN.** It needs a live OpenVPN tunnel, which needs the community OpenVPN
 * package (`openvpn.exe`, `tapctl`); the machine this was written on has only OpenVPN Connect, which
 * cannot hold several tunnels at once and offers no CLI. It is skipped unless `SPIKE_TUNNEL_ADDRESS`
 * names a live tunnel adapter address, so it neither fails CI nor pretends to have passed.
 *
 * Running it, once the community package is installed:
 *
 *   1. bring up a tunnel with the argv `openVpnArgs()` produces (routes filtered, one high-metric
 *      default route on the tunnel);
 *   2. find its adapter address (`ipconfig`, or the `ifconfig` line in the OpenVPN log);
 *   3. `SPIKE_TUNNEL_ADDRESS=10.x.x.x pnpm exec playwright test e2e/spike-openvpn-split-routing.spec.ts`
 *
 * With two tunnels up, run it twice with each address: three distinct exit addresses (unbound, tunnel 1,
 * tunnel 2) is what proves per-group routing is real rather than assumed.
 *
 * Note this is the SAME check the product runs on every OpenVPN connect. That is deliberate: rather than
 * trusting a spike that ran once on one machine, `OpenVpnProvider` measures the assumption per connection
 * and refuses to report one up when it does not hold. The spike is for learning the answer early; the
 * product does not depend on having run it.
 */

const ECHO_URL = process.env['SPIKE_ECHO_URL'] ?? 'https://api.ipify.org';
const tunnelAddress = process.env['SPIKE_TUNNEL_ADDRESS'] ?? '';

test.skip(tunnelAddress.length === 0, 'set SPIKE_TUNNEL_ADDRESS to a live tunnel adapter address');

test('a socket bound to the tunnel adapter leaves by a different path', async () => {
  test.setTimeout(120_000);

  // The address must actually belong to an interface on this machine, or the bind fails for a reason
  // that has nothing to do with routing and the result would mean nothing.
  const local = Object.values(networkInterfaces())
    .flat()
    .some((i) => i?.family === 'IPv4' && i.address === tunnelAddress);
  expect(local, `${tunnelAddress} is not an address on this machine`).toBe(true);

  const check = await checkTunnelEgress(tunnelAddress, ECHO_URL);

  console.log(`direct: ${check.directAddress}  tunnel: ${check.tunnelAddress}`);
  // The whole spike in one line: same address means source binding did NOT change the route, and the
  // per-tab OpenVPN model does not work on this OS as designed.
  expect(check.isTunneled).toBe(true);
});
