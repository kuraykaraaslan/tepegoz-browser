import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';
import { Logger } from '@tepegoz/libs';
import { probeSocksPort, type NetworkPrivacyProvider } from './connection-provider.electron';
import { locateBinary } from './vpn-binaries.electron';
import VpnSecrets from './vpn-secrets.electron';
import { parseWireGuardConfig, toWireproxyConfig } from './wireguard-config';
import { reserveLoopbackPort, waitForSocksPort } from './loopback-port.electron';

/**
 * WireGuard, as a userspace tunnel with its own SOCKS5 front door (Phase 5).
 *
 * `wireproxy` runs the WireGuard protocol entirely in user space over a private TCP/IP stack, and exposes
 * the result as a SOCKS5 listener on loopback. That is worth dwelling on, because it is why this provider
 * is the *simplest* one in the phase and also the safest:
 *
 * - **No adapter, no routes, no elevation.** Nothing touches the system routing table, so untunneled tabs
 *   cannot be affected by a tunnel coming up, and the browser never needs administrative rights.
 * - **It cannot leak by construction.** The process owns its own network stack and can only emit packets
 *   through the tunnel. There is no route to misconfigure and no source address to mis-bind — the two
 *   ways a kernel-level VPN silently sends traffic the wrong way.
 * - **Unlimited concurrency.** Each connection is one more process on one more loopback port, so a
 *   different tunnel per tab group costs nothing structural.
 *
 * The one thing it CAN get wrong is DNS: with no resolver configured it falls back to the host's, handing
 * every hostname to the user's ISP while the traffic itself goes through the tunnel. `parseWireGuardConfig`
 * refuses such a profile outright, so a connection that reaches this class always has one.
 */

/** How long to wait for the SOCKS listener after the process starts before calling it a failure. */
const READY_TIMEOUT_MS = 15_000;

function runDir(): string {
  return join(app.getPath('userData'), 'vpn', 'run');
}

export class WireGuardProvider implements NetworkPrivacyProvider {
  readonly kind = 'wireguard' as const;

  private child: ChildProcess | null = null;
  private port: number | null = null;

  constructor(private readonly connectionId: string) {}

  async connect(): Promise<{ socksPort: number }> {
    const stored = VpnSecrets.read(this.connectionId);
    if (stored === null) {
      throw new Error(
        'This connection has no stored WireGuard profile (or it could not be decrypted)',
      );
    }
    // Re-parsed on every connect rather than trusting a cached summary: the config is the source of
    // truth, and the DNS refusal must apply to what is actually about to run.
    const config = parseWireGuardConfig(stored);
    const binary = locateBinary('wireproxy');
    const port = await reserveLoopbackPort();
    const configPath = join(runDir(), `${this.connectionId}.conf`);

    mkdirSync(runDir(), { recursive: true });
    // The rendered config carries the private key, so it is written 0600 and deleted the moment wireproxy
    // has read it. A short-lived file is not as good as no file; wireproxy takes a path, not stdin, so
    // this is the narrowest window available rather than a comfortable one.
    writeFileSync(configPath, toWireproxyConfig(config, port), { mode: 0o600 });

    const child = spawn(binary, ['-c', configPath], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    this.child = child;
    this.port = port;

    let stderr = '';
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr = `${stderr}${chunk.toString()}`.slice(-2000);
    });

    try {
      await waitForSocksPort(port, READY_TIMEOUT_MS, () => child.exitCode !== null || child.killed);
    } catch (err) {
      await this.disconnect();
      // wireproxy's own message (bad key, unreachable endpoint) is far more useful than "timed out".
      throw new Error(`wireproxy did not come up: ${stderr.trim() || String(err)}`);
    } finally {
      rmSync(configPath, { force: true });
    }

    Logger.info('WireGuard tunnel up', { connectionId: this.connectionId, socksPort: port });
    return { socksPort: port };
  }

  async disconnect(): Promise<void> {
    const child = this.child;
    this.child = null;
    this.port = null;
    if (child === null) return;
    child.kill();
    rmSync(join(runDir(), `${this.connectionId}.conf`), { force: true });
    return Promise.resolve();
  }

  /** Alive means BOTH: the process is still running and its listener still answers. Either alone can be
   *  true while the tunnel is useless — a crashed process leaves no listener, and a wedged one leaves a
   *  listener that no longer carries anything. */
  async probe(): Promise<boolean> {
    if (this.child === null || this.child.exitCode !== null || this.port === null) return false;
    return probeSocksPort(this.port);
  }
}
