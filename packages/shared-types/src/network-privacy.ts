import { z } from 'zod';

/**
 * The shapes of Phase 5's network-privacy layer, in the one place schemas are allowed to live.
 *
 * A connection id is the load-bearing value here: it names a session partition
 * (`persist:tepegoz-web--conn-{id}`), so it is constrained to what can neither collide nor escape.
 * Two different connections whose ids normalized to the same partition would silently share one cookie
 * jar — the cross-tab bleed the phase forbids — which is why the rule lives here, in the schema source,
 * rather than being spelled out separately by the tab model and the preferences store.
 */

export const CONNECTION_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const CONNECTION_ID_MAX = 64;

export function isValidConnectionId(connectionId: string): boolean {
  return connectionId.length <= CONNECTION_ID_MAX && CONNECTION_ID_PATTERN.test(connectionId);
}

export const ConnectionIdSchema = z
  .string()
  .max(CONNECTION_ID_MAX)
  .regex(CONNECTION_ID_PATTERN, 'A connection id must be a lowercase, dash-separated slug');

/**
 * Provider families.
 *
 * Every one of them reduces to the same thing — a SOCKS5 endpoint on loopback — which is what lets a tab
 * group bind to any of them without the routing layer knowing or caring which. What differs is how each
 * gets there, and that difference is large enough to be worth naming:
 *
 * - `wireguard` and `tor` own **userspace network stacks**. They can only emit packets through their own
 *   tunnel: there is no route table to misconfigure and no source address to mis-bind, so they cannot
 *   leak by construction.
 * - `byo-socks` points at an endpoint the user already runs; its properties are theirs, not ours.
 *
 * `openvpn` is deliberately absent. It is layer-3 with no common userspace stack, so it needs a real TUN
 * adapter plus source-bound sockets and a routing assumption that is not yet verified on Windows. Adding
 * the enum member before the provider exists would be a promise the code cannot keep.
 */
export const NETWORK_CONNECTION_KINDS = ['byo-socks', 'wireguard', 'tor'] as const;
export const NetworkConnectionKindSchema = z.enum(NETWORK_CONNECTION_KINDS);
export type NetworkConnectionKind = z.infer<typeof NetworkConnectionKindSchema>;

/**
 * Fields every connection carries, whatever its protocol.
 *
 * `updatedAt`/`version` are the sync-meta down-payment: the Phase 3 account is meant to sync user data,
 * and adding these later would be a migration. Recorded now rather than discovered then.
 */
const connectionBase = {
  id: ConnectionIdSchema,
  label: z.string().min(1).max(64),
  /** The user's own note about where this exits ("Tor", "Mullvad SE") — free text, never validated
   *  against reality, and labelled as the user's claim wherever it is shown. */
  note: z.string().max(64),
  updatedAt: z.number().int().nonnegative(),
  version: z.number().int().nonnegative(),
};

/**
 * One configured connection, as persisted.
 *
 * A discriminated union rather than one wide object with optional fields: a `byo-socks` row without a
 * port, or a `tor` row carrying one, are states that should not be representable. Note what is NOT here —
 * **no key material of any kind**. A WireGuard config contains a private key, and preferences are plain
 * JSON on disk; the config is held encrypted through `safeStorage` and referenced by connection id, so
 * this row keeps only what is safe to show in a list.
 */
export const NetworkConnectionSchema = z.discriminatedUnion('kind', [
  z.object({
    ...connectionBase,
    kind: z.literal('byo-socks'),
    /** The loopback SOCKS5 port this connection routes through. */
    socksPort: z.number().int().min(1).max(65535),
  }),
  z.object({
    ...connectionBase,
    kind: z.literal('wireguard'),
    /** Display only (`de-fra.example.com:51820`) — the real config lives in the encrypted store. */
    endpoint: z.string().max(256),
  }),
  z.object({
    ...connectionBase,
    kind: z.literal('tor'),
    /**
     * Chain Tor through another connection ("Tor over VPN"), or `null` for Tor straight out.
     *
     * A tab group resolves to exactly ONE route, so "VPN *and* Tor on the same group" is this: Tor
     * configured with the VPN's SOCKS endpoint as its upstream, exposing its own SOCKS port for the group
     * to bind to. The kill-switch composes for free — if the upstream VPN drops, Tor's outbound dies and
     * the group is cut, without anything having to coordinate the two.
     */
    upstreamConnectionId: ConnectionIdSchema.nullable(),
  }),
]);
export type NetworkConnection = z.infer<typeof NetworkConnectionSchema>;

/**
 * A binding at a scope that cannot defer further (the profile-wide General default). Tab and Group
 * scopes add `inherit`; see `@tepegoz/tab-engine`'s `ScopedBinding`, which is the resolution-time shape.
 */
export const NetworkGeneralBindingSchema = z.union([
  z.object({ kind: z.literal('direct') }),
  z.object({ kind: z.literal('connection'), connectionId: ConnectionIdSchema }),
]);
export type NetworkGeneralBinding = z.infer<typeof NetworkGeneralBindingSchema>;

/** Live health of a connection, as the pool reports it. `connecting` is never treated as usable. */
export const CONNECTION_STATUSES = ['up', 'down', 'connecting'] as const;
export const ConnectionStatusSchema = z.enum(CONNECTION_STATUSES);
export type LiveConnectionStatus = z.infer<typeof ConnectionStatusSchema>;

/**
 * Per-connection health tallied over the current session — surfaced read-only in Settings so a tunnel
 * that dies quietly is visible without waiting for a leak.
 *
 * Every field is session-scoped and resets when the app restarts; NONE of it is persisted, and none of
 * it is key material. It rides the same `network:get-state` read the routing picture uses, which crosses
 * the (untrusted) renderer boundary — so it is `safeParse`d there, and a record that does not validate
 * renders as "health unavailable" rather than throwing.
 */
export const ConnectionHealthSchema = z.object({
  /** Host-clock ms of the last successful handshake, kept across drops; `null` if it has never come up
   *  this session. This is the "last handshake …" the overview shows even while the tunnel is down. */
  lastHandshakeAt: z.number().int().nonnegative().nullable(),
  /** Host-clock ms of the last failed handshake this session, or `null` if none has failed. */
  lastErrorAt: z.number().int().nonnegative().nullable(),
  /** Successful connect-and-verify handshakes this session. */
  handshakesOk: z.number().int().nonnegative(),
  /** Failed handshake attempts this session. `handshakesOk / (handshakesOk + handshakesFailed)` is the
   *  success rate the overview renders. */
  handshakesFailed: z.number().int().nonnegative(),
  /** Times this connection came back `up` after having been up earlier this session — a rising count
   *  means it is flapping even while it keeps auto-recovering. */
  reconnects: z.number().int().nonnegative(),
});
export type ConnectionHealth = z.infer<typeof ConnectionHealthSchema>;

/**
 * The closed set of causes a tunnelled tab can feel slow for (Phase 5: "'Slow' needs a cause, not a
 * spinner"). Computed in MAIN by `@tepegoz/security-policy`'s pure `classifySlowCause` from signals the
 * pool already tallies, and pushed to the renderer over the same `network:get-state` read the health
 * card uses — never derived client-side, for the same reason the per-tab tunnel shield is main-computed:
 * a security-adjacent verdict computed in the untrusted renderer is one a page-driven bug could talk into
 * lying.
 *
 * Mirrors the `PolicyReason` / `NetworkErrorKind` pattern used elsewhere in this codebase: a closed union
 * with one localized (en+tr) sentence per member, a parity test, and an honest catch-all — `unknown code
 * arrives over IPC` degrades to treating it exactly like `insufficient_signal` rather than throwing or
 * showing a raw identifier.
 */
export const SLOW_CAUSES = [
  /** The tunnel is up, the health poll is current, and nothing else measured is wrong — the most likely
   *  explanation left is the tunnel's own relay hop(s), not a fault. */
  'relay_latency',
  /** The connection is still establishing (bridge/bootstrap), or has not had its first health check yet. */
  'bridge_or_bootstrap',
  /** The tunnel itself is healthy, but recent responses from the exit are shaped like the SITE reacting
   *  to the exit address (4xx / challenge-shaped) rather than the connection. */
  'exit_blocked_by_site',
  /** The connection is down, or is flapping / its health poll has gone stale — the tunnel itself is the
   *  problem. Wins over every other cause when it applies: see `classifySlowCause`'s own doc for why a
   *  connection that is simultaneously slow AND unhealthy is reported as unhealthy, never "just latency". */
  'tunnel_degraded',
  /** The measured signals do not clearly point at one of the above. Deliberately NOT a guess — this
   *  codebase's classifiers (`classifyNetworkError`, `classifyRisk`) refuse to force a confident answer
   *  out of an ambiguous or incomplete input, and this is also the graceful fallback for an unrecognised
   *  code arriving over IPC. */
  'insufficient_signal',
] as const;
export const SlowCauseSchema = z.enum(SLOW_CAUSES);
export type SlowCause = z.infer<typeof SlowCauseSchema>;

/**
 * The manual "test this connection" flow (Phase 5 onboarding: "import a config, name it, test it, and
 * see a plain-language result; a failed test says which step failed").
 *
 * Three stages, in the order a connection actually comes up: `configParse` (synchronous, no network
 * attempt — a malformed WireGuard profile, a missing/undecryptable secret, or a Tor upstream that no
 * longer exists), then `handshake` (the SAME attempt `ensureUp`/the manual Connect button already make —
 * this does not invent a second way to bring a tunnel up). A stage after a failed one is `skipped`,
 * never silently omitted, so the UI can say "not attempted" rather than nothing.
 *
 * **`reachability` is deliberately coarser than the doc's "DNS / exit reachability" split.** The only
 * signal past a successful handshake that this codebase already produces is `ensureTunnelSession`'s
 * `resolveProxy` check — proof that Chromium's session-level proxy config took effect, not that the
 * tunnel can resolve a name or reach a real destination. Turning DNS-through-the-tunnel and exit
 * reachability into two independently-verified stages would mean adding new probing logic inside the
 * connection pool's connect path, which this change does not do. So a successful handshake reports
 * `unverified` here — "connected, not independently proven reachable" — rather than a fabricated pass on
 * either the DNS or the exit-reachability question.
 */
export const NETWORK_TEST_STAGE_STATUSES = ['pass', 'fail', 'skipped'] as const;
export const NetworkTestStageStatusSchema = z.enum(NETWORK_TEST_STAGE_STATUSES);
export type NetworkTestStageStatus = z.infer<typeof NetworkTestStageStatusSchema>;

export const NetworkTestStageSchema = z.object({
  status: NetworkTestStageStatusSchema,
  /** The raw failure message — the SAME shape `lastError` already carries, classified by the renderer's
   *  existing `classifyNetworkError` into one localized sentence rather than shown verbatim. `null`
   *  unless `status` is `'fail'`. */
  detail: z.string().max(2000).nullable(),
});
export type NetworkTestStage = z.infer<typeof NetworkTestStageSchema>;

/** `notReached` when the handshake never succeeded (config parse or the handshake itself failed);
 *  `unverified` when it did, and reachability past that point is simply not independently checked. */
export const NETWORK_REACHABILITY_KINDS = ['notReached', 'unverified'] as const;
export const NetworkReachabilitySchema = z.enum(NETWORK_REACHABILITY_KINDS);
export type NetworkReachability = z.infer<typeof NetworkReachabilitySchema>;

export const ConnectionTestResultSchema = z.object({
  connectionId: ConnectionIdSchema,
  configParse: NetworkTestStageSchema,
  handshake: NetworkTestStageSchema,
  reachability: NetworkReachabilitySchema,
});
export type ConnectionTestResult = z.infer<typeof ConnectionTestResultSchema>;
