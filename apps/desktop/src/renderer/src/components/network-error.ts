/**
 * Map a network-connection failure (the raw `lastError` a provider throws on a failed `connect()`) to
 * one of a small set of causes, so the connections overview can show one localized sentence with a next
 * step instead of raw provider stderr (Phase 5: "Errors in the user's language, with a next step").
 *
 * The raw string is still kept one hover away (`title=`) for a bug report — this classifier only
 * decides which sentence to render, and falls back to `unknown` rather than guessing.
 */

export type NetworkErrorKind =
  /** A helper binary (wireproxy / tor) is not installed or not where Tepegöz looked. */
  | 'binaryMissing'
  /** The WireGuard profile is missing, undecryptable, or not a valid config. */
  | 'badConfig'
  /** The chain of upstream connections loops back on itself. */
  | 'chainLoop'
  /** The upstream connection this one depends on no longer exists. */
  | 'noSuchConnection'
  /** The reserved loopback port for this connection cannot be used. */
  | 'portUnusable'
  /** The helper started but never opened its local SOCKS listener. */
  | 'noListener'
  /** The helper process exited before it was ready. */
  | 'processExited'
  /** The tunnel program ran but could not establish a connection (bad key, unreachable endpoint). */
  | 'handshake'
  /** Anything the patterns below do not recognise. */
  | 'unknown';

/**
 * Ordered so a more specific cause wins over a broader one. The real thrown messages this matches:
 * `<binary> was not found[ anywhere under <folder>]`, `This connection has no stored WireGuard
 * profile (or it could not be decrypted)`, `Endpoint "…" is not host:port`, `Connection chain loops
 * back to <id>`, `No such [upstream ]connection: <id>`, `Not a usable SOCKS port: <n>`, `no listener
 * on 127.0.0.1:<port> after <ms>ms`, `Nothing is listening on 127.0.0.1:<port>`, `the process exited
 * before its listener came up`, `wireproxy did not come up: …`, `tor did not come up: …`.
 */
const PATTERNS: readonly (readonly [NetworkErrorKind, RegExp])[] = [
  ['binaryMissing', /was not found/i],
  [
    'badConfig',
    /no stored WireGuard profile|could not be decrypted|\[Interface\]|\[Peer\]|not a valid WireGuard key|not host:port|too large to be a WireGuard config|No \[Peer\] section|No \[Interface\] section/i,
  ],
  ['chainLoop', /loops back to/i],
  ['noSuchConnection', /no such (?:upstream )?connection/i],
  ['portUnusable', /not a usable SOCKS port/i],
  ['noListener', /no listener on 127\.0\.0\.1|nothing is listening on/i],
  ['processExited', /exited before its listener|process exited/i],
  ['handshake', /did not come up/i],
];

/** The cause of a connection failure, or `'unknown'` for an empty/null/unrecognised message. */
export function classifyNetworkError(raw: string | null | undefined): NetworkErrorKind {
  if (raw === null || raw === undefined || raw.trim().length === 0) return 'unknown';
  for (const [kind, re] of PATTERNS) {
    if (re.test(raw)) return kind;
  }
  return 'unknown';
}
