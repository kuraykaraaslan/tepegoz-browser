import { connect, type Socket } from 'node:net';
import { Logger } from '@tepegoz/libs';
import {
  isConnectedState,
  isTerminalState,
  parseManagementLine,
  type PushedOptions,
} from './openvpn-management';

/**
 * The socket half of OpenVPN's management channel (Phase 5).
 *
 * Line parsing lives next door in a pure module; this drives the conversation. It is the whole control
 * surface for a tunnel — readiness, the adapter address, the pushed DNS, credential prompts, shutdown —
 * and it works identically whether OpenVPN was started elevated or not, which is what lets the launcher
 * stay swappable.
 */

export interface ManagementCredentials {
  username: string;
  password: string;
}

export interface TunnelUp {
  options: PushedOptions;
}

export interface ManagementOptions {
  port: number;
  password: string;
  /** Asked for only when the tunnel prompts. A profile with embedded certs never will. */
  credentials: ManagementCredentials | null;
  /** How long to wait for CONNECTED before giving up. */
  timeoutMs: number;
}

export class OpenVpnManagement {
  private socket: Socket | null = null;
  private buffer = '';

  constructor(private readonly options: ManagementOptions) {}

  /**
   * Connect, authenticate, release the hold, and wait for the tunnel to report CONNECTED.
   *
   * The pushed options are captured on the way past. Both facts are needed together — an address with no
   * DNS would produce a tunnel whose hostnames could only be resolved by the machine, which is the leak
   * the bound SOCKS server refuses to start without.
   */
  async waitForTunnel(): Promise<TunnelUp> {
    const socket = connect(this.options.port, '127.0.0.1');
    this.socket = socket;
    socket.setEncoding('utf8');

    return new Promise<TunnelUp>((resolve, reject) => {
      let pushed: PushedOptions | null = null;
      let settled = false;
      const finish = (err: Error | null, value?: TunnelUp): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (err !== null) reject(err);
        else if (value !== undefined) resolve(value);
      };
      const timer = setTimeout(
        () => finish(new Error('the tunnel did not report CONNECTED in time')),
        this.options.timeoutMs,
      );

      socket.on('error', (err) => finish(err));
      socket.on('close', () => finish(new Error('the management connection closed before the tunnel came up')));

      socket.on('data', (chunk: string) => {
        this.buffer += chunk;
        const lines = this.buffer.split(/\r?\n/);
        this.buffer = lines.pop() ?? '';
        for (const line of lines) {
          // The password prompt for the management channel itself is plain text, not a `>PASSWORD:` event.
          if (line.startsWith('ENTER PASSWORD:')) {
            socket.write(`${this.options.password}\n`);
            continue;
          }
          if (line.startsWith('SUCCESS: password')) {
            // Order matters: `log on` must be enabled BEFORE the hold is released, or the PUSH_REPLY
            // line goes past before anyone is listening for it.
            socket.write('log on all\nstate on\nhold release\n');
            continue;
          }

          const event = parseManagementLine(line);
          if (event.kind === 'push') {
            pushed = event.options;
          } else if (event.kind === 'password') {
            const creds = this.options.credentials;
            if (creds === null) {
              finish(new Error('This profile needs a username and password, and none are stored'));
              return;
            }
            // Sent over the loopback management socket, never written to a file on disk.
            socket.write(`username "${event.what}" ${creds.username}\n`);
            socket.write(`password "${event.what}" ${creds.password}\n`);
          } else if (event.kind === 'fatal') {
            finish(new Error(event.message));
            return;
          } else if (event.kind === 'state') {
            if (isConnectedState(event.state)) {
              if (pushed === null || pushed.localAddress === null) {
                finish(new Error('The tunnel connected but never said what address it took'));
                return;
              }
              finish(null, { options: pushed });
              return;
            }
            if (isTerminalState(event.state)) {
              finish(new Error('The tunnel exited before it connected'));
              return;
            }
          }
        }
      });
    });
  }

  /** Is the management channel still answering? Used by the pool's health poll. */
  isAlive(): boolean {
    return this.socket !== null && !this.socket.destroyed;
  }

  /** Ask the tunnel to shut down, then drop the socket. Never throws. */
  stop(): void {
    const socket = this.socket;
    this.socket = null;
    if (socket === null) return;
    try {
      socket.write('signal SIGTERM\n');
    } catch (err) {
      Logger.warn('Could not signal the tunnel to stop', { err: String(err) });
    }
    socket.destroy();
  }
}
