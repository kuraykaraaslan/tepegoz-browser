import { isValidConnectionId as isValidId, type ResolvedConnection } from './connection-binding';

/**
 * The partition private (disposable) browsing lives on.
 *
 * **The missing `persist:` prefix is the whole feature.** Electron persists a partition to disk if and
 * only if its name starts with `persist:`; without it, cookies, storage, IndexedDB and cache live in
 * memory for as long as the session object does and are gone when the process ends. So "leaves nothing
 * on close" is a property of the NAME, enforced by Electron, not something this app has to remember to
 * clean up — and `privatePartitionKey` is asserted never to produce a `persist:` name.
 *
 * That is the floor, not the ceiling: the app still clears the session explicitly when the last private
 * window closes, because a browser that only forgets at quit would keep an afternoon's private browsing
 * alive in a process the user thinks they finished with.
 *
 * **One partition for the whole run, shared by every private window.** Chrome's model, and the right
 * one: a link opened from one private window into another belongs to the same throwaway identity, and
 * per-window partitions would silently sign the user out every time they opened a second window.
 *
 * **Tunnels still apply.** A private tab on a profile whose General binding is a VPN or Tor gets
 * `tepegoz-private--conn-{id}`, mirroring `partitionKeyFor` exactly. Ignoring the binding here would
 * send private traffic out over the clear path — the precise failure `defaultForNewTab` exists to
 * prevent, and it would be at its worst in the mode whose entire promise is privacy.
 */
export const PRIVATE_PARTITION = 'tepegoz-private';

/** True for any partition this module owns — the check the session registry and its tests use. */
export function isPrivatePartition(partition: string): boolean {
  return partition === PRIVATE_PARTITION || partition.startsWith(`${PRIVATE_PARTITION}--conn-`);
}

/**
 * The partition key a private tab is hosted on, for a resolved network binding.
 *
 * Throws on an invalid connection id for the same reason `partitionKeyFor` does: quietly folding
 * `vpn/a` and `vpn-a` onto one partition would put two connections' traffic in one cookie jar.
 */
export function privatePartitionKey(resolved: ResolvedConnection): string {
  if (resolved.connectionId === null) return PRIVATE_PARTITION;
  if (!isValidId(resolved.connectionId)) {
    throw new Error(
      `Invalid connection id for a private session partition: ${JSON.stringify(resolved.connectionId)}`,
    );
  }
  return `${PRIVATE_PARTITION}--conn-${resolved.connectionId}`;
}
