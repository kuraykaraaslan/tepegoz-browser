import { describe, expect, it } from 'vitest';
import {
  affectedByGeneralChange,
  affectedByGroupChange,
  isValidConnectionId,
  partitionKeyFor,
  resolveBinding,
  type ScopedBinding,
  type TabBindingState,
} from './connection-binding';

const conn = (id: string): ScopedBinding => ({ kind: 'connection', connectionId: id });
const inherit: ScopedBinding = { kind: 'inherit' };
const direct: ScopedBinding = { kind: 'direct' };

describe('resolving a binding — most-specific wins', () => {
  it('a TAB override wins over everything, even a different group binding', () => {
    const r = resolveBinding(conn('vpn-a'), conn('vpn-b'), { kind: 'connection', connectionId: 'vpn-c' });
    expect(r).toEqual({ resolved: { connectionId: 'vpn-a' }, source: 'tab' });
  });

  it('an explicit tab DIRECT wins even inside a tunneled group', () => {
    const r = resolveBinding(direct, conn('vpn-b'), { kind: 'connection', connectionId: 'vpn-c' });
    expect(r).toEqual({ resolved: { connectionId: null }, source: 'tab' });
  });

  it('a GROUP binding is used when the tab inherits', () => {
    const r = resolveBinding(inherit, conn('vpn-b'), { kind: 'connection', connectionId: 'vpn-c' });
    expect(r).toEqual({ resolved: { connectionId: 'vpn-b' }, source: 'group' });
  });

  it('a group set to DIRECT sends its inheriting tabs Direct, not to General', () => {
    const r = resolveBinding(inherit, direct, { kind: 'connection', connectionId: 'vpn-c' });
    expect(r).toEqual({ resolved: { connectionId: null }, source: 'group' });
  });

  it('falls to GENERAL when the tab inherits and the group ALSO inherits', () => {
    const r = resolveBinding(inherit, inherit, { kind: 'connection', connectionId: 'vpn-c' });
    expect(r).toEqual({ resolved: { connectionId: 'vpn-c' }, source: 'general' });
  });

  it('an UNGROUPED tab (group=null) falls straight to General — not the same as an inheriting group', () => {
    const r = resolveBinding(inherit, null, { kind: 'connection', connectionId: 'vpn-c' });
    expect(r).toEqual({ resolved: { connectionId: 'vpn-c' }, source: 'general' });
  });

  it('DEFAULT IS DIRECT — an ungrouped tab with no General set resolves to Direct, the pure local-first floor', () => {
    const r = resolveBinding(inherit, null, { kind: 'direct' });
    expect(r).toEqual({ resolved: { connectionId: null }, source: 'general' });
  });

  it('inherit is never itself a destination — resolution always bottoms out at a connection or Direct', () => {
    for (const [tab, group, general] of [
      [inherit, null, { kind: 'direct' } as const],
      [inherit, inherit, { kind: 'direct' } as const],
      [conn('x'), inherit, { kind: 'direct' } as const],
    ] as const) {
      const r = resolveBinding(tab, group, general);
      expect('connectionId' in r.resolved).toBe(true);
    }
  });
});

describe('partition keys', () => {
  it('Direct uses the partition the browser ALREADY uses — no rename, no orphaned user data', () => {
    // This exact string is what every existing profile's cookies/logins live behind today
    // (`apps/desktop/src/main/tabs-shared.ts`). If this test ever needs updating, the change it is
    // reporting is "we just signed every user out of every site".
    expect(partitionKeyFor({ connectionId: null })).toBe('persist:tepegoz-web');
  });

  it('a tunneled resolution hangs off the same base as a `--conn-` sibling', () => {
    expect(partitionKeyFor({ connectionId: 'vpn-a' })).toBe('persist:tepegoz-web--conn-vpn-a');
  });

  it('two groups on the SAME connection share one partition — groups are a binding layer, not a partition axis', () => {
    const a = partitionKeyFor({ connectionId: 'vpn-a' });
    const b = partitionKeyFor({ connectionId: 'vpn-a' });
    expect(a).toBe(b);
  });

  it('distinct connections never share a partition', () => {
    expect(partitionKeyFor({ connectionId: 'vpn-a' })).not.toBe(partitionKeyFor({ connectionId: 'vpn-b' }));
  });

  it('rejects an id that could collide or escape rather than sanitizing it into a shared jar', () => {
    for (const bad of ['vpn/a', 'vpn a', '../etc', 'VPN-A', 'vpn--a', '-vpn', 'vpn-', '', 'x'.repeat(65)]) {
      expect(isValidConnectionId(bad)).toBe(false);
      expect(() => partitionKeyFor({ connectionId: bad })).toThrow();
    }
  });

  it('accepts ordinary generated ids', () => {
    for (const ok of ['vpn-a', 'tor-1', 'wg0', 'mullvad-se-sto-001']) {
      expect(isValidConnectionId(ok)).toBe(true);
    }
  });
});

describe('re-resolution on a GROUP change', () => {
  const tab = (id: string, binding: ScopedBinding, groupId: string | null): TabBindingState => ({
    tabId: id,
    binding,
    groupId,
  });

  it('reloads only the members that were INHERITING the group', () => {
    const tabs = [tab('a', inherit, 'g1'), tab('b', inherit, 'g1'), tab('c', conn('vpn-x'), 'g1')];
    expect(affectedByGroupChange(tabs, 'g1')).toEqual(['a', 'b']);
  });

  it('leaves a tab with an explicit override ALONE — it was never affected by the group', () => {
    const tabs = [tab('a', conn('vpn-x'), 'g1')];
    expect(affectedByGroupChange(tabs, 'g1')).toEqual([]);
  });

  it('ignores tabs in a DIFFERENT group entirely', () => {
    const tabs = [tab('a', inherit, 'g1'), tab('b', inherit, 'g2')];
    expect(affectedByGroupChange(tabs, 'g1')).toEqual(['a']);
  });
});

describe('re-resolution on a GENERAL change', () => {
  const tab = (id: string, binding: ScopedBinding, groupId: string | null): TabBindingState => ({
    tabId: id,
    binding,
    groupId,
  });

  it('affects an ungrouped inheriting tab', () => {
    const tabs = [tab('a', inherit, null)];
    expect(affectedByGeneralChange(tabs, new Map())).toEqual(['a']);
  });

  it('affects a grouped tab ONLY when its group is ALSO inheriting', () => {
    const groups = new Map([['g1', inherit]]);
    const tabs = [tab('a', inherit, 'g1')];
    expect(affectedByGeneralChange(tabs, groups)).toEqual(['a']);
  });

  it('does NOT affect a tab whose group has its own explicit binding', () => {
    const groups = new Map([['g1', conn('vpn-x')]]);
    const tabs = [tab('a', inherit, 'g1')];
    expect(affectedByGeneralChange(tabs, groups)).toEqual([]);
  });

  it('does NOT affect a tab with its own explicit binding, even ungrouped', () => {
    const tabs = [tab('a', direct, null)];
    expect(affectedByGeneralChange(tabs, new Map())).toEqual([]);
  });

  it('treats a group with no recorded binding the same as an inheriting group', () => {
    // A group that has never had a binding SET is functionally on 'inherit' — the map simply has no
    // entry for it, and that must not be read as "leave this tab alone".
    const tabs = [tab('a', inherit, 'g-never-bound')];
    expect(affectedByGeneralChange(tabs, new Map())).toEqual(['a']);
  });
});
