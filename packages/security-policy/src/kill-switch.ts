/**
 * Fail-closed egress kill-switch, scoped per connection (Phase 5, L8).
 *
 * The property this exists to guarantee, stated exactly as the phase's own DoD states it: **if a tunnel
 * drops, every tab resolving to it is blocked — no leak, no silent fallback to Direct.** A VPN/Tor
 * connection dying mid-session and the browser quietly routing that tab's next request out the clear
 * path is the single worst outcome a network-privacy feature can produce, because it looks like nothing
 * happened — the user has no reason to suspect the page they are looking at was ever exposed.
 *
 * So this module has exactly one job and refuses to do anything clever with it: given each tab's
 * RESOLVED connection (from `connection-binding.ts`'s `resolveBinding`) and what is currently known
 * about each connection's health, decide per tab whether egress is allowed. A `Direct` resolution is
 * always allowed — it opted out of tunneling and was never promised one. Every tunneled resolution is
 * allowed ONLY while its connection is confirmed `up`; anything else — `down`, or a connection id this
 * function has never heard of — blocks. There is no third state that defaults to allowed, because a
 * default-allow branch is exactly the leak this module exists to prevent.
 */

export type ConnectionStatus = 'up' | 'down';

export interface TabEgressQuery {
  tabId: string;
  /** This tab's RESOLVED connection — `null` means Direct. Not the tab's raw binding: a tab on
   *  `inherit` must already have been resolved to a real connection or Direct before reaching here. */
  resolvedConnectionId: string | null;
}

export type KillSwitchReason =
  'direct' | 'connection_up' | 'connection_down_failclosed' | 'unknown_connection_failclosed';

export interface KillSwitchVerdict {
  tabId: string;
  allowed: boolean;
  reason: KillSwitchReason;
}

/**
 * Decide egress for a set of tabs against the current connection health map.
 *
 * `connectionStatus` need not — and structurally cannot — be exhaustive: a connection that was torn down
 * entirely (removed from the pool) simply has no entry, and a tab still resolved to it is blocked with
 * `unknown_connection_failclosed` rather than treated as if the missing entry meant "fine". Silence about
 * a connection's health is not evidence that it is healthy.
 */
export function killSwitchVerdicts(
  tabs: readonly TabEgressQuery[],
  connectionStatus: ReadonlyMap<string, ConnectionStatus>,
): KillSwitchVerdict[] {
  return tabs.map((tab) => {
    if (tab.resolvedConnectionId === null) {
      return { tabId: tab.tabId, allowed: true, reason: 'direct' };
    }
    const status = connectionStatus.get(tab.resolvedConnectionId);
    if (status === 'up') return { tabId: tab.tabId, allowed: true, reason: 'connection_up' };
    if (status === 'down') {
      return { tabId: tab.tabId, allowed: false, reason: 'connection_down_failclosed' };
    }
    return { tabId: tab.tabId, allowed: false, reason: 'unknown_connection_failclosed' };
  });
}

/** Convenience: which tabs a single connection dropping just blocked. Reads directly off one status
 *  flip, for the caller that only needs "what do I have to stop right now" rather than a full survey. */
export function tabsBlockedByDrop(
  tabs: readonly TabEgressQuery[],
  droppedConnectionId: string,
): readonly string[] {
  return tabs.filter((t) => t.resolvedConnectionId === droppedConnectionId).map((t) => t.tabId);
}
