import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';
import { Logger } from '@tepegoz/libs';
import { probeSocksPort, type NetworkPrivacyProvider } from './connection-provider.electron';
import { locateBinary } from './vpn-binaries.electron';
import { reserveLoopbackPort, waitForSocksPort } from './loopback-port.electron';

/**
 * Tor, one process per connection (Phase 5).
 *
 * Tor already *is* a SOCKS proxy, so it needs none of the machinery a layer-3 VPN does — and like
 * wireproxy it owns its own network stack, so it cannot leak by construction.
 *
 * **One process per connection, not one process with several ports.** A shared process would be lighter,
 * but two connections would then share guards and, depending on Tor's isolation flags, possibly circuits.
 * A separate `DataDirectory` per connection makes "this group and that group take different paths through
 * Tor" true by construction rather than by configuration — which is the whole reason a user would create
 * two Tor connections instead of one.
 *
 * **Chaining ("Tor over VPN").** A tab group resolves to exactly one route, so combining a VPN and Tor on
 * the same group means running Tor *through* the VPN: `Socks5Proxy` points Tor's own outbound at the
 * VPN's loopback SOCKS port, and the group binds to Tor's port. The kill-switch composes for free — if
 * the upstream VPN drops, Tor's outbound dies with it and the group is cut, with nothing having to
 * coordinate the two. What it buys: the VPN provider sees "Tor traffic" but not its content, and the Tor
 * entry guard sees the VPN's address rather than the user's.
 */

/** Tor bootstrapping (descriptor fetch, circuit build) is slower than a VPN handshake. */
const READY_TIMEOUT_MS = 90_000;

function torDir(connectionId: string): string {
  return join(app.getPath('userData'), 'vpn', 'tor', connectionId);
}

/** Resolves the upstream connection's SOCKS port, bringing it up if needed. `null` = Tor straight out. */
export type UpstreamResolver = () => Promise<number>;

export class TorProvider implements NetworkPrivacyProvider {
  readonly kind = 'tor' as const;

  private child: ChildProcess | null = null;
  private port: number | null = null;

  constructor(
    private readonly connectionId: string,
    private readonly resolveUpstream: UpstreamResolver | null,
  ) {}

  async connect(): Promise<{ socksPort: number }> {
    const binary = locateBinary('tor');
    // The upstream comes up FIRST and is fully verified before Tor is told to use it. Starting Tor
    // against a port that is not answering yet would either fail confusingly or — worse — have Tor retry
    // later against whatever ends up on that port.
    const upstreamPort = this.resolveUpstream === null ? null : await this.resolveUpstream();

    const port = await reserveLoopbackPort();
    const dataDir = torDir(this.connectionId);
    mkdirSync(dataDir, { recursive: true });

    const torrc = [
      `SocksPort 127.0.0.1:${String(port)}`,
      `DataDirectory ${dataDir}`,
      // No control port: nothing in this app drives Tor beyond starting and stopping it, and an open
      // control port is a local privilege surface with no user here.
      'ControlPort 0',
      ...(upstreamPort === null ? [] : [`Socks5Proxy 127.0.0.1:${String(upstreamPort)}`]),
      '',
    ].join('\n');
    const torrcPath = join(dataDir, 'torrc');
    writeFileSync(torrcPath, torrc, { mode: 0o600 });

    const child = spawn(binary, ['-f', torrcPath], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    this.child = child;
    this.port = port;

    let output = '';
    const capture = (chunk: Buffer): void => {
      output = `${output}${chunk.toString()}`.slice(-4000);
    };
    child.stdout?.on('data', capture);
    child.stderr?.on('data', capture);

    try {
      await waitForSocksPort(port, READY_TIMEOUT_MS, () => child.exitCode !== null || child.killed);
    } catch (err) {
      await this.disconnect();
      throw new Error(
        `tor did not come up: ${output.trim().split('\n').slice(-3).join(' ') || String(err)}`,
      );
    }

    Logger.info('Tor connection up', {
      connectionId: this.connectionId,
      socksPort: port,
      chained: upstreamPort !== null,
    });
    return { socksPort: port };
  }

  async disconnect(): Promise<void> {
    const child = this.child;
    this.child = null;
    this.port = null;
    if (child === null) return;
    child.kill();
    // The torrc is rewritten on every connect (the ports change), but the DataDirectory is kept: it holds
    // the guard state that makes this connection's path through Tor stable across restarts. It is deleted
    // only when the connection itself is removed.
    return Promise.resolve();
  }

  async probe(): Promise<boolean> {
    if (this.child === null || this.child.exitCode !== null || this.port === null) return false;
    return probeSocksPort(this.port);
  }

  /** Drop this connection's Tor state entirely — called when the connection is removed, not on stop. */
  static forget(connectionId: string): void {
    rmSync(torDir(connectionId), { recursive: true, force: true });
  }
}
