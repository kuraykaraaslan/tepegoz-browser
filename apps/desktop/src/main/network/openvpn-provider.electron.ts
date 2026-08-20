import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';
import { checkTunnelEgress, Logger, notTunneledMessage } from '@tepegoz/libs';
import PreferenceStore from '@tepegoz/preferences';
import { probeSocksPort, type NetworkPrivacyProvider } from './connection-provider.electron';
import { locateBinary } from './vpn-binaries.electron';
import VpnSecrets from './vpn-secrets.electron';
import { openVpnArgs, parseOpenVpnProfile } from './openvpn-config';
import { OpenVpnManagement, type ManagementCredentials } from './openvpn-management.electron';
import { startBoundSocksServer, type BoundSocksServer } from './bound-socks-server.electron';
import { reserveLoopbackPort } from './loopback-port.electron';

/**
 * OpenVPN as a per-tab tunnel (Phase 5).
 *
 * The awkward provider, and worth saying why. WireGuard and Tor run in user space and hand back a SOCKS
 * port; OpenVPN is layer-3 with no common userspace stack, so it needs a real TUN adapter and the
 * operating system's routing table — which is machine-wide, and therefore the opposite of what a per-tab
 * VPN wants. Three things bridge that gap:
 *
 * 1. **The tunnel takes no routes.** Pushed `redirect-gateway`/`route`/`block-outside-dns` are filtered
 *    out, and one default route is added on the tunnel's own interface with a deliberately terrible
 *    metric, so ordinary traffic never finds it.
 * 2. **A SOCKS server bound to the tunnel's address** carries the tab group's traffic, with names
 *    resolved by the tunnel's own DNS. Under strong host semantics a bound socket's route lookup is
 *    constrained to that interface, where the high-metric route is waiting.
 * 3. **The result is MEASURED before the connection is reported up.** Point 2 is an assumption about the
 *    operating system, and its failure mode is silent — the socket quietly takes the physical route and
 *    everything loads. So every connect ends with an egress check, and a connection whose traffic did not
 *    actually change path stays down.
 *
 * Point 3 is the difference between shipping this and not. The alternative was a one-off spike on one
 * machine; measuring per connect is strictly stronger, and it is the only reason this provider is allowed
 * to exist while the routing assumption is otherwise unverified.
 */

/** Tunnels are slower to come up than a userspace handshake: TLS, then push, then adapter config. */
const CONNECT_TIMEOUT_MS = 60_000;
/** Where the address check goes. A preference so it can point at something self-hosted. */
const DEFAULT_ECHO_URL = 'https://api.ipify.org';

function runDir(): string {
  return join(app.getPath('userData'), 'vpn', 'run');
}

export class OpenVpnProvider implements NetworkPrivacyProvider {
  readonly kind = 'openvpn' as const;

  private management: OpenVpnManagement | null = null;
  private socks: BoundSocksServer | null = null;

  constructor(
    private readonly connectionId: string,
    private readonly adapterName: string,
    private readonly credentials: ManagementCredentials | null,
  ) {}

  async connect(): Promise<{ socksPort: number }> {
    const stored = VpnSecrets.read(this.connectionId);
    if (stored === null) {
      throw new Error('This connection has no stored OpenVPN profile (or it could not be decrypted)');
    }
    // Re-parsed on every connect: the profile is the source of truth, and the TAP refusal has to apply to
    // what is actually about to run.
    parseOpenVpnProfile(stored);
    const binary = locateBinary('openvpn');

    mkdirSync(runDir(), { recursive: true });
    const configPath = join(runDir(), `${this.connectionId}.ovpn`);
    const passwordPath = join(runDir(), `${this.connectionId}.mgmt`);
    const managementPort = await reserveLoopbackPort();
    // A per-session token, not a fixed secret: without it any local process could take control of the
    // tunnel through the management port.
    const managementPassword = randomBytes(24).toString('base64url');

    writeFileSync(configPath, stored, { mode: 0o600 });
    writeFileSync(passwordPath, `${managementPassword}\n`, { mode: 0o600 });

    const args = openVpnArgs({
      configPath,
      managementHost: '127.0.0.1',
      managementPort,
      managementPasswordFile: passwordPath,
      ...(this.adapterName.length > 0 ? { devNode: this.adapterName } : {}),
    });

    try {
      spawnOpenVpn(binary, args);
      const management = new OpenVpnManagement({
        port: managementPort,
        password: managementPassword,
        credentials: this.credentials,
        timeoutMs: CONNECT_TIMEOUT_MS,
      });
      this.management = management;
      const { options } = await management.waitForTunnel();

      const localAddress = options.localAddress ?? '';
      // Refused rather than defaulted: with no resolver inside the tunnel, every hostname would go to the
      // machine's own, handing the browsing list to the ISP while the traffic itself was tunneled.
      this.socks = await startBoundSocksServer({ localAddress, dnsServers: options.dnsServers });

      const echoUrl = PreferenceStore.getAll().networkEgressCheckUrl || DEFAULT_ECHO_URL;
      const check = await checkTunnelEgress(localAddress, echoUrl);
      Logger.info('Tunnel egress checked', { connectionId: this.connectionId, isTunneled: check.isTunneled });
      if (!check.isTunneled) throw new Error(notTunneledMessage(check));

      Logger.info('OpenVPN tunnel up and verified', {
        connectionId: this.connectionId,
        socksPort: this.socks.port,
      });
      return { socksPort: this.socks.port };
    } catch (err) {
      await this.disconnect();
      throw err;
    } finally {
      // The rendered config carries key material and the token file is a live credential; both are gone
      // as soon as OpenVPN has read them.
      rmSync(configPath, { force: true });
      rmSync(passwordPath, { force: true });
    }
  }

  async disconnect(): Promise<void> {
    this.management?.stop();
    this.management = null;
    const socks = this.socks;
    this.socks = null;
    if (socks !== null) await socks.close();
  }

  /** Alive means the management channel still answers AND the SOCKS front door is still listening. */
  async probe(): Promise<boolean> {
    if (this.management === null || !this.management.isAlive() || this.socks === null) return false;
    return probeSocksPort(this.socks.port);
  }
}

/**
 * Start OpenVPN, elevated when it has to be.
 *
 * OpenVPN needs privileges to configure the TUN adapter. **Only `openvpn.exe` is elevated — Tepegöz never
 * is**, and that distinction is the whole point: an agentic browser running as administrator would be a
 * far worse trade than a UAC prompt per tunnel.
 *
 * Nothing is read from the child's pipes; an elevated process cannot inherit them anyway. Everything the
 * caller needs arrives over the management socket, which is what makes this launcher replaceable later
 * with OpenVPN's Interactive Service (same conversation, no prompt).
 */
function spawnOpenVpn(binary: string, args: string[]): void {
  if (process.platform !== 'win32') {
    spawn(binary, args, { stdio: 'ignore', detached: true }).unref();
    return;
  }
  // `-Verb RunAs` raises the UAC prompt for the child alone. Arguments are passed as a PowerShell array
  // so a path with spaces survives, and each is single-quote escaped so none can inject.
  const quoted = args.map((a) => `'${a.replace(/'/g, "''")}'`).join(',');
  const command = `Start-Process -FilePath '${binary.replace(/'/g, "''")}' -Verb RunAs -WindowStyle Hidden -ArgumentList @(${quoted})`;
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
    stdio: 'ignore',
    windowsHide: true,
    detached: true,
  });
  child.unref();
}
