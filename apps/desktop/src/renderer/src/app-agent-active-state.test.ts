// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { useAgentActiveGroups, withAgentActiveBadge } from './app-agent-active-state';

/**
 * S8 PR7's tab-strip half: "installed, panel open, nothing happens" for a group an agent run holds
 * the lock on. The renderer decides nothing — main tracks the lock (`agentRunByGroup`), this only
 * turns the set of active group ids into a per-tab flag.
 */

const tabs = (...rows: { id: string; groupId?: string | null }[]) => rows as never;

afterEach(cleanup);
beforeEach(() => vi.restoreAllMocks());

describe('withAgentActiveBadge', () => {
  it('leaves an ungrouped tab untouched', () => {
    expect(withAgentActiveBadge(tabs({ id: 't1', groupId: null }), new Set(['g1']))).toEqual([
      { id: 't1', groupId: null },
    ]);
  });

  it('leaves a tab whose group is not active untouched (no false flag)', () => {
    expect(withAgentActiveBadge(tabs({ id: 't1', groupId: 'g1' }), new Set(['g2']))).toEqual([
      { id: 't1', groupId: 'g1' },
    ]);
  });

  it('flags every tab in an active group', () => {
    const out = withAgentActiveBadge(
      tabs({ id: 't1', groupId: 'g1' }, { id: 't2', groupId: 'g1' }, { id: 't3', groupId: 'g2' }),
      new Set(['g1']),
    );
    expect(out[0]?.agentActive).toBe(true);
    expect(out[1]?.agentActive).toBe(true);
    expect(out[2]?.agentActive).toBeUndefined();
  });

  it('never flags a tab with no groupId field at all', () => {
    expect(withAgentActiveBadge(tabs({ id: 't1' }), new Set(['g1']))).toEqual([{ id: 't1' }]);
  });
});

describe('useAgentActiveGroups', () => {
  it('starts empty, takes the fetched snapshot, then live pushes', async () => {
    let push: (ids: string[]) => void = () => undefined;
    Object.defineProperty(window, 'tepegoz', {
      configurable: true,
      value: {
        getAgentActiveGroups: () => Promise.resolve(['g1']),
        onAgentActiveGroups: (cb: (ids: string[]) => void) => {
          push = cb;
          return () => undefined;
        },
      },
    });
    const { result } = renderHook(() => useAgentActiveGroups());
    expect(result.current.size).toBe(0);
    await waitFor(() => expect(result.current.has('g1')).toBe(true));
    push(['g2']);
    await waitFor(() => expect(result.current.has('g2')).toBe(true));
    expect(result.current.has('g1')).toBe(false);
  });
});
