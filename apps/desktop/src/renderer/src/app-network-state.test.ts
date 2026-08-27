// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import type { NetworkState } from '@tepegoz/desktop-ipc';
import { useNetworkState, withGroupRouteBadges, withNetworkBadges } from './app-network-state';

/**
 * The chrome's Phase 5 routing view. The renderer decides NOTHING — main resolves the route and the
 * kill-switch verdict, and these helpers only turn the answer into a badge. A Direct tab/group gets NO
 * badge (absence is the signal); an inherited route is marked so; an egress-blocked tab shows blocked.
 */

function baseState(over: Partial<NetworkState> = {}): NetworkState {
  return {
    connections: [{ id: 'c1', label: 'Sweden' }],
    general: { kind: 'direct' },
    tabs: {},
    groups: {},
    binaries: {
      wireproxy: { found: false, path: '', isOverride: false, dropInDir: '' },
      tor: { found: false, path: '', isOverride: false, dropInDir: '' },
    },
    secretsAvailable: false,
    ...over,
  } as NetworkState;
}

describe('withNetworkBadges', () => {
  it('leaves a Direct tab untouched (no badge)', () => {
    const [tab] = withNetworkBadges([{ id: 't1' }] as never, baseState());
    expect(tab).toEqual({ id: 't1' });
  });

  it('labels a tunneled tab from the connection, and marks an inherited route', () => {
    const net = baseState({
      tabs: {
        t1: { connectionId: 'c1', source: 'tab', egressAllowed: true },
        t2: { connectionId: 'c1', source: 'group', egressAllowed: true },
      },
    });
    const [a, b] = withNetworkBadges([{ id: 't1' }, { id: 't2' }] as never, net);
    expect(a.network).toEqual({ label: 'Sweden', inherited: false, blocked: false });
    expect(b.network).toEqual({ label: 'Sweden', inherited: true, blocked: false });
  });

  it('falls back to the connection id when it has no label, and flags an egress-blocked tab', () => {
    const net = baseState({
      connections: [],
      tabs: { t1: { connectionId: 'ghost', source: 'tab', egressAllowed: false } },
    });
    const [tab] = withNetworkBadges([{ id: 't1' }] as never, net);
    expect(tab.network).toEqual({ label: 'ghost', inherited: false, blocked: true });
  });
});

describe('withGroupRouteBadges', () => {
  it('leaves a Direct group untouched', () => {
    const [g] = withGroupRouteBadges([{ id: 'g1' }] as never, baseState());
    expect(g).toEqual({ id: 'g1' });
  });

  it('carries the vpn/tor/label shield through for a routed group', () => {
    const net = baseState({
      groups: { g1: { connectionId: 'c1', vpn: true, tor: false, label: 'Sweden' } },
    });
    const [g] = withGroupRouteBadges([{ id: 'g1' }] as never, net);
    expect(g.network).toEqual({ vpn: true, tor: false, label: 'Sweden' });
  });
});

describe('useNetworkState', () => {
  it('starts empty (Direct), takes the fetched snapshot, then live pushes', async () => {
    let push: ((s: NetworkState) => void) | null = null;
    const fetched = baseState({ general: { kind: 'vpn' } as NetworkState['general'] });
    Object.defineProperty(window, 'tepegoz', {
      configurable: true,
      value: {
        getNetworkState: () => Promise.resolve(fetched),
        onNetworkState: (cb: (s: NetworkState) => void) => {
          push = cb;
          return () => undefined;
        },
      },
    });
    const { result } = renderHook(() => useNetworkState());
    expect(result.current.general.kind).toBe('direct');
    await waitFor(() => expect(result.current.general.kind).toBe('vpn'));
    const pushed = baseState({ connections: [{ id: 'x', label: 'Live' }] });
    push?.(pushed);
    await waitFor(() => expect(result.current.connections[0]?.label).toBe('Live'));
  });

  afterEach(cleanup);
  beforeEach(() => vi.restoreAllMocks());
});
