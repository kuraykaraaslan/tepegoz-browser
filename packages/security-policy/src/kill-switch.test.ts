import { describe, expect, it } from 'vitest';
import { killSwitchVerdicts, tabsBlockedByDrop, type ConnectionStatus } from './kill-switch';

const up = (): ReadonlyMap<string, ConnectionStatus> => new Map([['vpn-a', 'up']]);

describe('the kill switch — fail closed, never a silent fallback to Direct', () => {
  it('allows a Direct tab regardless of any connection’s status', () => {
    const verdicts = killSwitchVerdicts([{ tabId: 't1', resolvedConnectionId: null }], new Map());
    expect(verdicts).toEqual([{ tabId: 't1', allowed: true, reason: 'direct' }]);
  });

  it('allows a tab whose connection is confirmed UP', () => {
    const verdicts = killSwitchVerdicts([{ tabId: 't1', resolvedConnectionId: 'vpn-a' }], up());
    expect(verdicts).toEqual([{ tabId: 't1', allowed: true, reason: 'connection_up' }]);
  });

  it('BLOCKS every tab on a connection that just went DOWN', () => {
    const status = new Map<string, ConnectionStatus>([['vpn-a', 'down']]);
    const verdicts = killSwitchVerdicts(
      [
        { tabId: 't1', resolvedConnectionId: 'vpn-a' },
        { tabId: 't2', resolvedConnectionId: 'vpn-a' },
      ],
      status,
    );
    expect(verdicts.every((v) => !v.allowed)).toBe(true);
    expect(verdicts.every((v) => v.reason === 'connection_down_failclosed')).toBe(true);
  });

  it('does NOT block a tab on a DIFFERENT, still-healthy connection', () => {
    const status = new Map<string, ConnectionStatus>([
      ['vpn-a', 'down'],
      ['vpn-b', 'up'],
    ]);
    const verdicts = killSwitchVerdicts(
      [
        { tabId: 't1', resolvedConnectionId: 'vpn-a' },
        { tabId: 't2', resolvedConnectionId: 'vpn-b' },
      ],
      status,
    );
    expect(verdicts.find((v) => v.tabId === 't1')?.allowed).toBe(false);
    expect(verdicts.find((v) => v.tabId === 't2')?.allowed).toBe(true);
  });

  it('BLOCKS a tab resolved to a connection the status map has never heard of', () => {
    // A connection removed from the pool entirely has no entry. Silence about health is not evidence
    // of health — this is the branch that stops a missing entry from defaulting to "must be fine".
    const verdicts = killSwitchVerdicts(
      [{ tabId: 't1', resolvedConnectionId: 'ghost-conn' }],
      new Map(),
    );
    expect(verdicts).toEqual([
      { tabId: 't1', allowed: false, reason: 'unknown_connection_failclosed' },
    ]);
  });

  it('there is no third status that resolves to allowed — down and unknown are both blocked', () => {
    const statuses: (ConnectionStatus | undefined)[] = ['down', undefined];
    for (const s of statuses) {
      const map = s === undefined ? new Map<string, ConnectionStatus>() : new Map([['vpn-a', s]]);
      const [verdict] = killSwitchVerdicts([{ tabId: 't1', resolvedConnectionId: 'vpn-a' }], map);
      expect(verdict?.allowed, `status=${String(s)}`).toBe(false);
    }
  });
});

describe('tabsBlockedByDrop — the fast path for one connection going down', () => {
  it('lists exactly the tabs resolved to the dropped connection', () => {
    const tabs = [
      { tabId: 't1', resolvedConnectionId: 'vpn-a' },
      { tabId: 't2', resolvedConnectionId: 'vpn-b' },
      { tabId: 't3', resolvedConnectionId: 'vpn-a' },
    ];
    expect(tabsBlockedByDrop(tabs, 'vpn-a')).toEqual(['t1', 't3']);
  });

  it('never includes a Direct tab', () => {
    const tabs = [{ tabId: 't1', resolvedConnectionId: null }];
    expect(tabsBlockedByDrop(tabs, 'vpn-a')).toEqual([]);
  });
});
