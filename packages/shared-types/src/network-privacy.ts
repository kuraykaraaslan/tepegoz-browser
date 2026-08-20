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

/** Provider families. Only `byo-socks` exists today; bundled WireGuard/Tor need a signed native binary. */
export const NETWORK_CONNECTION_KINDS = ['byo-socks'] as const;
export const NetworkConnectionKindSchema = z.enum(NETWORK_CONNECTION_KINDS);
export type NetworkConnectionKind = z.infer<typeof NetworkConnectionKindSchema>;

/**
 * One configured connection, as persisted.
 *
 * `updatedAt`/`version` are the sync-meta down-payment: the Phase 3 account is meant to sync user data,
 * and adding these later would be a migration. They are carried even though a **loopback SOCKS port is
 * device-local by nature** — the port number that means "my Tor daemon" on this machine means nothing on
 * another — so this row is a sync candidate for its label and intent, not for its endpoint. Recorded here
 * rather than discovered during Phase 3.
 */
export const NetworkConnectionSchema = z.object({
  id: ConnectionIdSchema,
  label: z.string().min(1).max(64),
  kind: NetworkConnectionKindSchema,
  /** The loopback SOCKS5 port this connection routes through. */
  socksPort: z.number().int().min(1).max(65535),
  /** The user's own note about where this exits ("Tor", "Mullvad SE") — free text, never validated
   *  against reality, and labelled as the user's claim wherever it is shown. */
  note: z.string().max(64),
  updatedAt: z.number().int().nonnegative(),
  version: z.number().int().nonnegative(),
});
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
