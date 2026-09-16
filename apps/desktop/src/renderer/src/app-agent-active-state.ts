import { useEffect, useState } from 'react';
import type { TabDescriptor } from '@tepegoz/tab-strip';

/**
 * Which tab groups currently hold an agent run lock (S8 PR7) — "installed, panel open, nothing
 * happens" is the single largest rival-evidence complaint cluster, and the tab strip is the one place
 * a user looks WITHOUT opening the Agent Console first.
 *
 * Subscribed, not polled — same reasoning as `useNetworkState`: the run's own start/stop is the event
 * that matters, and a badge refreshed only when the chrome happens to ask would show a run as
 * "finished" a beat late, or "still running" after it already ended.
 *
 * The renderer decides nothing here, same standing rule as the network badges: main tracks which
 * groups hold the lock (`agentRunByGroup` in `ipc-agent-shared.ts`), this just turns that into a set
 * the strip can look tabs up against.
 */
export function useAgentActiveGroups(): ReadonlySet<string> {
  const [groups, setGroups] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    void window.tepegoz.getAgentActiveGroups().then(
      (ids) => setGroups(new Set(ids)),
      () => undefined,
    );
    return window.tepegoz.onAgentActiveGroups((ids) => setGroups(new Set(ids)));
  }, []);

  return groups;
}

/**
 * Attach the "agent active" flag to the tabs the strip is about to render.
 *
 * A tab whose group is NOT active gets no flag at all (rather than `agentActive: false`), matching the
 * route badge's own "absence is the signal" discipline — the common case draws nothing.
 */
export function withAgentActiveBadge<T extends TabDescriptor>(
  tabs: readonly T[],
  activeGroups: ReadonlySet<string>,
): (T & { agentActive?: boolean })[] {
  return tabs.map((tab) => {
    if (tab.groupId === null || tab.groupId === undefined || !activeGroups.has(tab.groupId)) {
      return tab;
    }
    return { ...tab, agentActive: true };
  });
}
