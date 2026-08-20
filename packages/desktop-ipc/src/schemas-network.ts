import { z } from 'zod';
import { ConnectionIdSchema, NetworkGeneralBindingSchema } from '@tepegoz/shared-types';

/**
 * Renderer -> main payloads for the network-privacy bridge (Phase 5).
 *
 * Everything here crosses the untrusted boundary, so it is `safeParse`d at the handler. The connection
 * id in particular is the one value that must not be taken on trust: it names a session partition, and a
 * malformed one either escapes the partition namespace or collides two connections into one cookie jar.
 * It is validated with the SAME schema the preferences store uses, so there is one rule, not two.
 */

export const ScopeBindingInputSchema = z.union([
  z.object({ kind: z.literal('inherit') }),
  z.object({ kind: z.literal('direct') }),
  z.object({ kind: z.literal('connection'), connectionId: ConnectionIdSchema }),
]);

export const BindTabNetworkSchema = z.object({
  tabId: z.string().min(1).max(128),
  binding: ScopeBindingInputSchema,
});

export const BindGroupNetworkSchema = z.object({
  groupId: z.string().min(1).max(128),
  binding: ScopeBindingInputSchema,
});

export const SetGeneralBindingSchema = NetworkGeneralBindingSchema;

/**
 * Adding a connection. The port is the security-relevant field: it must be a real TCP port, and it is
 * only ever used as a LOOPBACK address (`assertFailClosed` re-checks that at the proxy boundary, so a
 * mistake here still cannot produce a remote proxy).
 */
export const AddNetworkConnectionSchema = z.object({
  label: z.string().min(1).max(64),
  note: z.string().max(64),
  socksPort: z.number().int().min(1).max(65535),
});

export const RemoveNetworkConnectionSchema = ConnectionIdSchema;

/** Adding a Tor connection. `upstreamConnectionId` chains it through a VPN ("Tor over VPN"). */
export const AddTorConnectionSchema = z.object({
  label: z.string().min(1).max(64),
  note: z.string().max(64),
  upstreamConnectionId: ConnectionIdSchema.nullable(),
});

/** Connect / disconnect one connection on the spot, from the manager. */
export const SetConnectionActiveSchema = z.object({
  id: ConnectionIdSchema,
  active: z.boolean(),
});

/** Point the app at a helper binary (wireproxy / tor) the user placed somewhere of their own choosing. */
export const SetBinaryPathSchema = z.object({
  binary: z.enum(['wireproxy', 'tor']),
  path: z.string().max(1024),
});
