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

const connectionInputBase = {
  label: z.string().min(1).max(64),
  note: z.string().max(64),
};

/**
 * Adding a connection — one schema, discriminated by protocol.
 *
 * The security-relevant field differs per arm and each is validated here: a SOCKS port must be a real TCP
 * port (and is only ever used as a LOOPBACK address — `assertFailClosed` re-checks that at the proxy
 * boundary, so a mistake here still cannot produce a remote proxy); a WireGuard source path is re-read and
 * re-parsed in main, so a profile that would resolve DNS outside the tunnel is refused at commit as well
 * as at pick.
 */
export const AddNetworkConnectionSchema = z.discriminatedUnion('kind', [
  z.object({
    ...connectionInputBase,
    kind: z.literal('wireguard'),
    sourcePath: z.string().min(1).max(4096),
  }),
  z.object({
    ...connectionInputBase,
    kind: z.literal('openvpn'),
    sourcePath: z.string().min(1).max(4096),
    adapterName: z.string().max(128),
    username: z.string().max(256),
    password: z.string().max(256),
  }),
  z.object({
    ...connectionInputBase,
    kind: z.literal('tor'),
    upstreamConnectionId: ConnectionIdSchema.nullable(),
  }),
  z.object({
    ...connectionInputBase,
    kind: z.literal('byo-socks'),
    socksPort: z.number().int().min(1).max(65535),
  }),
]);

export const RemoveNetworkConnectionSchema = ConnectionIdSchema;

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

/** Which helper binary a folder pick is for. */
export const VpnBinarySchema = z.enum(['wireproxy', 'tor']);

/** Which kind of profile a file pick is for. */
export const VpnProfileKindSchema = z.enum(['wireguard', 'openvpn']);
