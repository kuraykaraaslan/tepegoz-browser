import { useEffect, useState } from 'react';
import type { SettingsStrings } from '@tepegoz/settings-ui';
import { Badge, Card } from '@tepegoz/ui';
import type { NetworkState, TabsState } from '@tepegoz/desktop-ipc';

/**
 * Where traffic is actually going, tab by tab.
 *
 * `NetworkState` has carried `tabs` and `groups` all along — the resolved route for every tab in the
 * window, which scope decided it, and whether the kill-switch is currently holding that tab's traffic
 * — and the settings page fetched all of it and rendered none of it. The per-tab and per-group
 * overrides are set from the tab and group context menus, so the one place a user could review or
 * audit them showed only the profile-wide default.
 *
 * This is a VIEW, not a control. Changing a tab's route stays where it is set, on the tab; a second
 * place to change it would be a second opinion about the same binding. What was missing was the
 * ability to SEE it.
 *
 * `egressAllowed: false` is given its own badge because it is the one state that looks like a broken
 * network from the page's side: the kill-switch is doing exactly its job — holding traffic because the
 * tunnel that tab is bound to is not up — and nothing said so.
 */
export function NetworkRoutesCard({ s, state }: { s: SettingsStrings; state: NetworkState }) {
  const [tabs, setTabs] = useState<TabsState | null>(null);

  useEffect(() => {
    void window.tepegoz.getTabsState().then(setTabs, () => {
      setTabs(null);
    });
    return window.tepegoz.onTabsState(setTabs);
  }, []);

  const label = (connectionId: string | null): string =>
    connectionId === null
      ? s.network.direct
      : (state.connections.find((c) => c.id === connectionId)?.label ?? s.network.direct);

  const routedTabs = (tabs?.tabs ?? []).filter((tab) => state.tabs[tab.id] !== undefined);
  const routedGroups = (tabs?.groups ?? []).filter((g) => state.groups[g.id] !== undefined);

  return (
    <Card title={s.network.routesTitle} subtitle={s.network.routesHint}>
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
        <dt className="text-text-secondary">{s.network.defaultRoute}</dt>
        <dd className="text-text-primary">
          {label(state.general.kind === 'connection' ? state.general.connectionId : null)}
        </dd>
      </dl>

      {routedGroups.length > 0 && (
        <>
          <p className="mb-1.5 mt-4 text-xs font-semibold uppercase tracking-wide text-text-secondary">
            {s.network.routesGroups}
          </p>
          <ul className="space-y-1">
            {routedGroups.map((group) => (
              <li
                key={group.id}
                className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-1.5 text-xs"
              >
                <span className="min-w-0 truncate text-text-primary">{group.name}</span>
                <span className="shrink-0 text-text-secondary">
                  {state.groups[group.id]?.label ?? s.network.direct}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {routedTabs.length === 0 ? (
        <p className="mt-4 text-sm text-text-secondary">{s.network.routesNoOverrides}</p>
      ) : (
        <>
          <p className="mb-1.5 mt-4 text-xs font-semibold uppercase tracking-wide text-text-secondary">
            {s.network.routesTabs}
          </p>
          <ul className="space-y-1">
            {routedTabs.map((tab) => {
              const route = state.tabs[tab.id];
              if (route === undefined) return null;
              return (
                <li
                  key={tab.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-1.5 text-xs"
                >
                  <span className="min-w-0 flex-1 truncate text-text-primary" title={tab.url}>
                    {tab.title === '' ? tab.url : tab.title}
                  </span>
                  <span className="shrink-0 text-text-secondary">
                    {label(route.connectionId)}
                  </span>
                  <Badge variant="neutral" size="sm">
                    {s.network.routeSource[route.source]}
                  </Badge>
                  {!route.egressAllowed && (
                    <Badge variant="warning" size="sm" dot>
                      {s.network.routeHeld}
                    </Badge>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Card>
  );
}
