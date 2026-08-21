import { useEffect, useState } from 'react';
import type { NetworkState } from '@tepegoz/desktop-ipc';
import type {
  GroupRouteBadge,
  TabDescriptor,
  TabGroupDescriptor,
  TabNetworkBadge,
} from '@tepegoz/tab-strip';

/**
 * The chrome's view of Phase 5 routing: which connections exist and where each tab currently goes.
 *
 * Subscribed, not polled. The event that matters is a tunnel DROPPING, and an indicator refreshed only
 * when the chrome happens to ask would keep showing "protected" for the length of that gap — which is
 * precisely the window in which a user keeps typing into a page they believe is tunneled.
 *
 * The renderer decides nothing here. Main resolves the route and the kill-switch verdict; this turns the
 * answer into a badge. That split is the standing rule for this app (the renderer displays and relays,
 * it never decides), and it matters more than usual for a security indicator: an indicator computed in
 * the untrusted process is one a page-driven bug could talk into lying.
 */

const EMPTY: NetworkState = {
  connections: [],
  general: { kind: 'direct' },
  tabs: {},
  groups: {},
  binaries: {
    wireproxy: { found: false, path: '', isOverride: false, dropInDir: '' },
    tor: { found: false, path: '', isOverride: false, dropInDir: '' },
  },
  secretsAvailable: false,
};

export function useNetworkState(): NetworkState {
  const [state, setState] = useState<NetworkState>(EMPTY);

  useEffect(() => {
    void window.tepegoz.getNetworkState().then(setState, () => undefined);
    return window.tepegoz.onNetworkState(setState);
  }, []);

  return state;
}

/**
 * Attach the route badge to the tabs the strip is about to render.
 *
 * A Direct tab gets NO badge rather than a "direct" one: the absence already reads as "not tunneled",
 * and a badge on every tab would make the one that matters harder to spot, not easier.
 */
export function withNetworkBadges<T extends TabDescriptor>(
  tabs: readonly T[],
  network: NetworkState,
): (T & { network?: TabNetworkBadge })[] {
  const labelOf = new Map(network.connections.map((c) => [c.id, c.label]));
  return tabs.map((tab) => {
    const route = network.tabs[tab.id];
    if (route === undefined || route.connectionId === null) return tab;
    return {
      ...tab,
      network: {
        label: labelOf.get(route.connectionId) ?? route.connectionId,
        inherited: route.source !== 'tab',
        blocked: !route.egressAllowed,
      },
    };
  });
}

/**
 * Attach the route shield to the groups the strip is about to render.
 *
 * A Direct group gets NO badge, exactly like a Direct tab: the absence is the signal, and a shield on
 * every group would bury the ones that mean something.
 */
export function withGroupRouteBadges<T extends TabGroupDescriptor>(
  groups: readonly T[],
  network: NetworkState,
): (T & { network?: GroupRouteBadge })[] {
  return groups.map((group) => {
    const route = network.groups[group.id];
    if (route === undefined || route.connectionId === null) return group;
    return { ...group, network: { vpn: route.vpn, tor: route.tor, label: route.label } };
  });
}
