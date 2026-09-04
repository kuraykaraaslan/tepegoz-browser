// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { settingsDict } from '@tepegoz/settings-ui';
import type { NetworkState, TabsState } from '@tepegoz/desktop-ipc';
import { NetworkRoutesCard } from './settings-network-routes';

/**
 * The read-only "where traffic is going" card. It joins the live tab list (over the bridge) with the
 * NetworkState the settings page already holds: only tabs/groups that carry a route override are
 * listed, an unknown/absent connection id resolves to "Direct", a tab with no title falls back to its
 * URL, and `egressAllowed: false` gets its own "held" badge (the kill-switch doing its job, which
 * otherwise looks like a broken network).
 */

const s = settingsDict.en;

const state = (over: Partial<NetworkState> = {}): NetworkState =>
  ({
    connections: [{ id: 'fra', label: 'FRA' }],
    general: { kind: 'connection', connectionId: 'fra' },
    tabs: {},
    groups: {},
    binaries: {},
    secretsAvailable: true,
    ...over,
  }) as unknown as NetworkState;

const tabsState = (over: Partial<TabsState> = {}): TabsState =>
  ({ tabs: [], groups: [], activeId: null, ...over }) as unknown as TabsState;

const getTabsState = vi.fn();
const onTabsState = vi.fn(() => () => undefined);

beforeEach(() => {
  vi.clearAllMocks();
  getTabsState.mockResolvedValue(tabsState());
  Object.defineProperty(window, 'tepegoz', {
    configurable: true,
    value: { getTabsState, onTabsState },
  });
});
afterEach(cleanup);

function renderCard(networkState: NetworkState) {
  render(<NetworkRoutesCard s={s} state={networkState} />);
}

describe('NetworkRoutesCard', () => {
  it('shows the default route resolved from the general binding', async () => {
    renderCard(state());
    await waitFor(() => expect(getTabsState).toHaveBeenCalled());
    expect(screen.getByText(s.network.defaultRoute)).toBeTruthy();
    expect(screen.getByText('FRA')).toBeTruthy();
  });

  it('says nothing is on its own route when no tab carries an override', async () => {
    getTabsState.mockResolvedValue(
      tabsState({ tabs: [{ id: 't1', title: 'A', url: 'https://a/' }] as TabsState['tabs'] }),
    );
    renderCard(state());
    await waitFor(() => expect(screen.getByText(s.network.routesNoOverrides)).toBeTruthy());
  });

  it('lists a routed tab with its connection label, source badge and held badge', async () => {
    getTabsState.mockResolvedValue(
      tabsState({
        tabs: [
          { id: 't1', title: '', url: 'https://held.example/' },
          { id: 't2', title: 'Safe tab', url: 'https://ok/' },
        ] as TabsState['tabs'],
      }),
    );
    renderCard(
      state({
        tabs: {
          t1: { connectionId: 'fra', source: 'tab', egressAllowed: false },
          t2: { connectionId: 'fra', source: 'group', egressAllowed: true },
        } as unknown as NetworkState['tabs'],
      }),
    );

    const held = await screen.findByText('https://held.example/');
    const heldRow = held.closest('li') as HTMLElement;
    // empty title → URL shown; the "held" badge is present on this row
    expect(within(heldRow).getByText(s.network.routeHeld)).toBeTruthy();
    expect(within(heldRow).getByText(s.network.routeSource.tab)).toBeTruthy();

    const safeRow = screen.getByText('Safe tab').closest('li') as HTMLElement;
    expect(within(safeRow).queryByText(s.network.routeHeld)).toBeNull();
    expect(within(safeRow).getByText(s.network.routeSource.group)).toBeTruthy();
  });

  it('resolves an unknown connection id to Direct', async () => {
    getTabsState.mockResolvedValue(
      tabsState({ tabs: [{ id: 't1', title: 'Gone', url: 'https://x/' }] as TabsState['tabs'] }),
    );
    renderCard(
      state({
        tabs: {
          t1: { connectionId: 'deleted', source: 'tab', egressAllowed: true },
        } as unknown as NetworkState['tabs'],
      }),
    );
    const row = (await screen.findByText('Gone')).closest('li') as HTMLElement;
    expect(within(row).getByText(s.network.direct)).toBeTruthy();
  });

  it('falls back to no live tab list when the bridge getTabsState call rejects', async () => {
    getTabsState.mockRejectedValueOnce(new Error('bridge down'));
    renderCard(state());
    await waitFor(() => expect(getTabsState).toHaveBeenCalled());
    // still renders the default route from NetworkState; the routed-tab section stays empty
    expect(screen.getByText(s.network.defaultRoute)).toBeTruthy();
    expect(screen.getByText(s.network.routesNoOverrides)).toBeTruthy();
  });

  it('shows "Direct" as the default route when the general binding is plain direct', () => {
    renderCard(state({ general: { kind: 'direct' } as NetworkState['general'] }));
    const row = screen.getByText(s.network.defaultRoute).closest('div') ?? document.body;
    expect(within(row).getAllByText(s.network.direct).length).toBeGreaterThan(0);
  });

  it('renders a routed group section when a group carries an override', async () => {
    getTabsState.mockResolvedValue(
      tabsState({ groups: [{ id: 'g1', name: 'Work' }] as TabsState['groups'] }),
    );
    renderCard(
      state({
        groups: { g1: { connectionId: 'fra', label: 'FRA', vpn: null, tor: null } } as unknown as NetworkState['groups'],
      }),
    );
    const row = (await screen.findByText('Work')).closest('li') as HTMLElement;
    expect(within(row).getByText('FRA')).toBeTruthy();
  });
});
