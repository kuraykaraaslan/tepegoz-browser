// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import type { NetworkState } from '@tepegoz/desktop-ipc';
import { useNetworkState, withGroupRouteBadges, withNetworkBadges } from './app-network-state';

/**
 * The chrome's Phase 5 routing view. The renderer decides NOTHING — main resolves the route and the
 * kill-switch verdict, and these helpers only turn the answer into a badge. A Direct tab/group gets NO
 * badge (absence is the signal); an inherited route is marked so; an egress-blocked tab shows blocked.
 *
 * The `NetworkState` shape is rich; these fixtures build only the fields the helpers read, cast once.
 */

function net(over: Record<string, unknown> = {}): NetworkState {
  return {
    connections: [{ id: 'c1', label: 'Sweden' }],
    general: { kind: 'direct' },
    tabs: {},
    groups: {},
    binaries: {},
    secretsAvailable: false,
    ...over,
  } as unknown as NetworkState;
}
const tabs = (...ids: string[]) => ids.map((id) => ({ id })) as never;
const groups = (...ids: string[]) => ids.map((id) => ({ id })) as never;

afterEach(cleanup);
beforeEach(() => vi.restoreAllMocks());

describe('withNetworkBadges', () => {
  it('leaves a Direct tab untouched (no badge)', () => {
    expect(withNetworkBadges(tabs('t1'), net())).toEqual([{ id: 't1' }]);
  });

  it('labels a tunneled tab from the connection, and marks an inherited route', () => {
    const state = net({
      tabs: {
        t1: { connectionId: 'c1', source: 'tab', egressAllowed: true },
        t2: { connectionId: 'c1', source: 'group', egressAllowed: true },
      },
    });
    const out = withNetworkBadges(tabs('t1', 't2'), state);
    expect(out[0]?.network).toEqual({ label: 'Sweden', inherited: false, blocked: false });
    expect(out[1]?.network).toEqual({ label: 'Sweden', inherited: true, blocked: false });
  });

  it('falls back to the connection id when unlabelled, and flags an egress-blocked tab', () => {
    const state = net({
      connections: [],
      tabs: { t1: { connectionId: 'ghost', source: 'tab', egressAllowed: false } },
    });
    expect(withNetworkBadges(tabs('t1'), state)[0]?.network).toEqual({
      label: 'ghost',
      inherited: false,
      blocked: true,
    });
  });
});

describe('withGroupRouteBadges', () => {
  it('leaves a Direct group untouched', () => {
    expect(withGroupRouteBadges(groups('g1'), net())).toEqual([{ id: 'g1' }]);
  });

  it('carries the vpn/tor/label shield through for a routed group', () => {
    const state = net({
      groups: { g1: { connectionId: 'c1', vpn: 'up', tor: null, label: 'Sweden' } },
    });
    expect(withGroupRouteBadges(groups('g1'), state)[0]?.network).toEqual({
      vpn: 'up',
      tor: null,
      label: 'Sweden',
    });
  });
});

describe('useNetworkState', () => {
  it('starts Direct, takes the fetched snapshot, then live pushes', async () => {
    let push: (s: NetworkState) => void = () => undefined;
    Object.defineProperty(window, 'tepegoz', {
      configurable: true,
      value: {
        getNetworkState: () => Promise.resolve(net({ secretsAvailable: true })),
        onNetworkState: (cb: (s: NetworkState) => void) => {
          push = cb;
          return () => undefined;
        },
      },
    });
    const { result } = renderHook(() => useNetworkState());
    expect(result.current.secretsAvailable).toBe(false);
    await waitFor(() => expect(result.current.secretsAvailable).toBe(true));
    push(net({ connections: [{ id: 'x', label: 'Live' }] }));
    await waitFor(() => expect(result.current.connections[0]?.label).toBe('Live'));
  });
});
