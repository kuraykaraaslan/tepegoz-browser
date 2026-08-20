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
