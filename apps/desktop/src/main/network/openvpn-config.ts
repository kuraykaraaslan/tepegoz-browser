/**
 * `.ovpn` parsing, and the argv that makes one tunnel behave (Phase 5).
 *
 * Pure — no Electron, no filesystem — so the part that reads a user-supplied file is testable on its own.
 * A `.ovpn` is untrusted input that decides where a tab group's traffic goes, and it usually carries key
 * material, so both halves matter.
 *
 * **The argv is the interesting part, not the parsing.** OpenVPN is layer-3: left alone it takes the
 * system's default route and every tab in the browser goes through it, which is the opposite of a per-tab
 * tunnel. So the pushed routing directives are filtered out and one deliberately-unattractive default
 * route is added on the tunnel's own interface. Nothing else in this app can undo a route the OS took, so
 * getting this list right is the difference between "one group is tunneled" and "the whole machine is".
 */

export interface OpenVpnRemote {
  host: string;
  port: number;
  proto: 'udp' | 'tcp' | null;
}

export interface OpenVpnProfile {
  remotes: OpenVpnRemote[];
  /** `dev tun` or `dev tap`. Only `tun` is usable here — see {@link parseOpenVpnProfile}. */
  dev: 'tun' | 'tap';
  /** True when the server will ask for a username/password. */
  authUserPass: boolean;
  /** True when the profile expects to take over the default route. We ignore it and say so. */
  redirectGateway: boolean;
  /** True when the profile asks Windows to block DNS outside the tunnel — also ignored, see below. */
  blockOutsideDns: boolean;
  /** Inline `<ca>`, `<cert>`, `<key>`, `<tls-auth>`, `<tls-crypt>` blocks present in the file. */
  inlineBlocks: string[];
  /** Directives referencing an external file, which will not resolve once the profile is stored. */
  externalFileRefs: string[];
}

/** Safe-to-display facts about a profile. No key material. */
export interface OpenVpnSummary {
  endpoint: string;
  proto: string;
  authUserPass: boolean;
  /** Warnings the manager shows BEFORE the user commits — each is something we will override. */
  overrides: string[];
}

export class OpenVpnConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OpenVpnConfigError';
  }
}

/** Directives that name a file on disk. A stored profile has no directory to resolve them against. */
const FILE_DIRECTIVES = ['ca', 'cert', 'key', 'tls-auth', 'tls-crypt', 'pkcs12', 'crl-verify'];

interface Directive {
  name: string;
  args: string[];
}

function directives(text: string): { list: Directive[]; inline: string[] } {
  const list: Directive[] = [];
  const inline: string[] = [];
  let skipUntil: string | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/[#;].*$/, '').trim();
    if (line.length === 0) continue;
    if (skipUntil !== null) {
      if (line === skipUntil) skipUntil = null;
      continue; // inside an inline block: its contents are key material, never inspected
    }
    const open = /^<([a-zA-Z0-9-]+)>$/.exec(line);
    if (open !== null) {
      const tag = open[1] ?? '';
      inline.push(tag);
      skipUntil = `</${tag}>`;
      continue;
    }
    const parts = line.split(/\s+/);
    const name = (parts[0] ?? '').toLowerCase();
    if (name.length > 0) list.push({ name, args: parts.slice(1) });
  }
  return { list, inline };
}

/**
 * Parse a `.ovpn`. Throws {@link OpenVpnConfigError} with a message meant for the user — every rejection
 * is something they can act on.
 */
export function parseOpenVpnProfile(text: string): OpenVpnProfile {
  if (text.length > 512_000) throw new OpenVpnConfigError('This file is too large to be an OpenVPN profile');
  const { list, inline } = directives(text);
  if (list.length === 0) throw new OpenVpnConfigError('This file contains no OpenVPN directives');

  const globalProto = list.find((d) => d.name === 'proto')?.args[0]?.toLowerCase();
  const remotes: OpenVpnRemote[] = [];
  for (const d of list.filter((x) => x.name === 'remote')) {
    const host = d.args[0];
    if (host === undefined) throw new OpenVpnConfigError('A "remote" line has no host');
    const port = Number(d.args[1] ?? '1194');
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new OpenVpnConfigError(`"remote ${host}" has an unusable port`);
    }
    const proto = (d.args[2] ?? globalProto ?? '').toLowerCase();
    remotes.push({
      host,
      port,
      proto: proto.startsWith('tcp') ? 'tcp' : proto.startsWith('udp') ? 'udp' : null,
    });
  }
  if (remotes.length === 0) throw new OpenVpnConfigError('No "remote" line found');

  const dev = (list.find((d) => d.name === 'dev')?.args[0] ?? 'tun').toLowerCase();
  if (!dev.startsWith('tun') && !dev.startsWith('tap')) {
    throw new OpenVpnConfigError(`Unsupported device type "${dev}"`);
  }
  if (dev.startsWith('tap')) {
    // A TAP profile bridges at layer 2. The whole per-tab model here rests on binding sockets to the
    // tunnel's own IP, which a bridged adapter does not give us in a usable form.
    throw new OpenVpnConfigError(
      'This profile uses a TAP (bridged) device, which cannot be routed per tab. A "dev tun" profile is required.',
    );
  }

  const externalFileRefs = list
    .filter((d) => FILE_DIRECTIVES.includes(d.name) && d.args.length > 0)
    .map((d) => d.name);

  return {
    remotes,
    dev: 'tun',
    authUserPass: list.some((d) => d.name === 'auth-user-pass'),
    redirectGateway: list.some((d) => d.name === 'redirect-gateway'),
    blockOutsideDns: list.some((d) => d.name === 'block-outside-dns'),
    inlineBlocks: inline,
    externalFileRefs,
  };
}

/** The safe-to-display shape, including what we are going to override and why. */
export function summarizeOpenVpn(profile: OpenVpnProfile): OpenVpnSummary {
  const first = profile.remotes[0];
  const overrides: string[] = [];
  if (profile.redirectGateway) overrides.push('redirect-gateway');
  if (profile.blockOutsideDns) overrides.push('block-outside-dns');
  return {
    endpoint: first === undefined ? '' : `${first.host}:${String(first.port)}`,
    proto: first?.proto ?? 'udp',
    authUserPass: profile.authUserPass,
    overrides,
  };
}

/**
 * The command line for one tunnel.
 *
 * Every `--pull-filter` here removes something the server would otherwise do to the WHOLE machine:
 *
 * - `redirect-gateway` and `route` would take the system default route, so every Direct tab would end up
 *   in this tunnel — the opposite of a per-tab VPN.
 * - `block-outside-dns` is a Windows firewall rule that blocks DNS on every other interface. It would
 *   break name resolution for every untunneled tab in the browser, and for the rest of the machine.
 * - `dhcp-option` is kept deliberately: the pushed DNS is read from the log and used as the resolver for
 *   this tunnel's SOCKS server, which is what stops hostnames leaking to the ISP.
 *
 * The one route we DO add is a default route on the tunnel's own interface with a deliberately terrible
 * metric: unbound sockets keep the physical path, and only sockets bound to the tunnel's address find it.
 */
export function openVpnArgs(options: {
  configPath: string;
  managementHost: string;
  managementPort: number;
  managementPasswordFile: string;
  /** Metric for our own default route. High on purpose — it must never win for ordinary traffic. */
  routeMetric?: number;
  /** Windows adapter to bind this tunnel to, when one was reserved for it. */
  devNode?: string;
}): string[] {
  const metric = String(options.routeMetric ?? 9999);
  return [
    '--config',
    options.configPath,
    ...(options.devNode === undefined ? [] : ['--dev-node', options.devNode]),
    '--pull-filter',
    'ignore',
    'redirect-gateway',
    '--pull-filter',
    'ignore',
    'route ',
    '--pull-filter',
    'ignore',
    'route-ipv6',
    '--pull-filter',
    'ignore',
    'block-outside-dns',
    '--route',
    '0.0.0.0',
    '0.0.0.0',
    'vpn_gateway',
    metric,
    '--management',
    options.managementHost,
    String(options.managementPort),
    options.managementPasswordFile,
    '--management-query-passwords',
    '--management-hold',
    // Without this OpenVPN keeps its own log only; we read state and the pushed options from the
    // management channel instead of a file we would have to find and tail.
    '--verb',
    '3',
  ];
}
