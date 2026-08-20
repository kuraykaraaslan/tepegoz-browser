/**
 * Reading OpenVPN's management channel (Phase 5).
 *
 * Pure line parsing, separated from the socket that carries it, because this is where the tunnel tells us
 * the two facts the rest of the OpenVPN path depends on — **the adapter's address** and **the DNS to use
 * inside the tunnel** — and getting either wrong fails in a way that looks like success.
 *
 * The management channel is used rather than OpenVPN's log file or stdout for one practical reason: the
 * process may be started elevated, and an elevated child cannot inherit our pipes. A localhost socket
 * works the same either way, which keeps the launcher swappable.
 */

export interface PushedOptions {
  /** The tunnel adapter's local address, from `ifconfig <local> <peer>`. */
  localAddress: string | null;
  /** The peer address on the other side of the tunnel. */
  peerAddress: string | null;
  /** Resolvers the server pushed (`dhcp-option DNS x`). */
  dnsServers: string[];
}

export type ManagementEvent =
  | { kind: 'state'; state: string; detail: string }
  | { kind: 'password'; what: string }
  | { kind: 'push'; options: PushedOptions }
  | { kind: 'fatal'; message: string }
  | { kind: 'other' };

/**
 * Parse the options OpenVPN says the server pushed.
 *
 * The line looks like:
 *   PUSH: Received control message: 'PUSH_REPLY,redirect-gateway def1,dhcp-option DNS 10.8.0.1,ifconfig 10.8.0.6 10.8.0.5'
 *
 * Note what is NOT filtered here: `redirect-gateway` and friends appear in this line even though we told
 * OpenVPN to ignore them, because the server still sent them. Reading them out is how the UI can say
 * "this profile wanted the whole machine and we declined".
 */
export function parsePushReply(line: string): PushedOptions | null {
  // `[^']*` rather than `.*`: the input is a log line the VPN server influences, and a greedy `.*`
  // before a literal quote backtracks super-linearly on a crafted one.
  const match = /PUSH_REPLY,([^']*)'/.exec(line);
  if (match === null) return null;
  const options: PushedOptions = { localAddress: null, peerAddress: null, dnsServers: [] };
  for (const raw of (match[1] ?? '').split(',')) {
    const parts = raw.trim().split(/\s+/);
    const name = (parts[0] ?? '').toLowerCase();
    if (name === 'ifconfig') {
      options.localAddress = parts[1] ?? null;
      options.peerAddress = parts[2] ?? null;
    } else if (name === 'dhcp-option' && (parts[1] ?? '').toUpperCase() === 'DNS') {
      const server = parts[2];
      if (server !== undefined) options.dnsServers.push(server);
    }
  }
  return options;
}

/**
 * Classify one line from the management channel.
 *
 * `>PASSWORD:Need 'Auth' username/password` is the one that must be answered rather than observed: with
 * `--management-query-passwords` the tunnel simply waits until it is, so a parser that treated it as
 * noise would produce a connection that hangs forever with no explanation.
 */
export function parseManagementLine(line: string): ManagementEvent {
  const trimmed = line.trim();

  const state = /^>STATE:\d+,([A-Z_]+),?(.*)$/.exec(trimmed);
  if (state !== null) return { kind: 'state', state: state[1] ?? '', detail: state[2] ?? '' };

  const password = /^>PASSWORD:Need '([^']+)'/.exec(trimmed);
  if (password !== null) return { kind: 'password', what: password[1] ?? '' };

  if (/^>PASSWORD:Verification Failed/i.test(trimmed)) {
    return { kind: 'fatal', message: 'The VPN rejected the username or password' };
  }

  if (trimmed.includes('PUSH_REPLY')) {
    const options = parsePushReply(trimmed);
    if (options !== null) return { kind: 'push', options };
  }

  // Matched by prefix and then SLICED rather than with a trailing `(.*)` group: the same log line is
  // server-influenced, and an optional separator followed by a greedy tail is a backtracking trap.
  // The trailing text is optional in any case — `AUTH_FAILED` arrives on its own, and it is the single
  // most important failure in the whole flow.
  const body = trimmed.replace(/^>LOG:\d+,[NIFW],/, '');
  for (const keyword of FATAL_PREFIXES) {
    if (!body.startsWith(keyword)) continue;
    const rest = body.slice(keyword.length).replace(/^[:\s]+/, '');
    return { kind: 'fatal', message: rest.length > 0 ? `${keyword} ${rest}` : keyword };
  }

  return { kind: 'other' };
}

/** OpenVPN's own fatal messages are far more useful than "the tunnel did not come up": they name the
 *  wrong cipher, the unreachable host, the expired certificate. */
const FATAL_PREFIXES = ['FATAL', 'Options error', 'Cannot resolve host address', 'AUTH_FAILED'];

/** Does this state mean the tunnel is carrying traffic? */
export function isConnectedState(state: string): boolean {
  return state === 'CONNECTED';
}

/** States from which the tunnel will not recover on its own. */
export function isTerminalState(state: string): boolean {
  return state === 'EXITING';
}
