import { beforeEach, describe, expect, it, vi } from 'vitest';

interface FakeTab {
  tabId: string;
  groupId: string | null;
}

const h = vi.hoisted(() => ({
  prefs: { networkGeneralBinding: { kind: 'direct', connectionId: '' } },
  update: vi.fn(),
  tabs: [] as FakeTab[],
  groups: [] as { id: string; settings: Record<string, string> }[],
  rehostTab: vi.fn(() => true),
  updateGroupSettings: vi.fn(),
  ensureUp: vi.fn(),
  statusMap: vi.fn(() => new Map<string, 'up' | 'down'>()),
  direct: vi.fn(() => ({ partition: 'persist:tepegoz-web' })),
  ensure: vi.fn((partition: string) => ({ partition })),
}));

vi.mock('electron', () => ({ session: { fromPartition: (p: string) => ({ partition: p }) } }));
vi.mock('@tepegoz/preferences', () => ({
  default: {
    getAll: () => h.prefs,
    update: (patch: Record<string, unknown>) => {
      h.update(patch);
      Object.assign(h.prefs, patch);
    },
  },
}));
vi.mock('../tabs', () => ({
  default: {
    bindingStates: () => h.tabs,
    allGroups: () => h.groups,
    rehostTab: h.rehostTab,
    updateGroupSettings: (groupId: string, patch: Record<string, string>) => {
      h.updateGroupSettings(groupId, patch);
      const group = h.groups.find((g) => g.id === groupId);
      if (group !== undefined) Object.assign(group.settings, patch);
    },
  },
}));
vi.mock('./browsing-sessions.electron', () => ({
  default: { direct: h.direct, ensure: h.ensure },
}));
vi.mock('./connection-pool.electron', () => ({
  default: { ensureUp: h.ensureUp, statusMap: h.statusMap },
}));

const { default: BindingService } = await import('./binding-service.electron');

const rehostedTo = (): string[] =>
  h.rehostTab.mock.calls.map((c) => (c as unknown as [string, { partition: string }])[1].partition);
const rehostedTabs = (): string[] =>
  h.rehostTab.mock.calls.map((c) => (c as unknown as [string])[0]);

beforeEach(() => {
  BindingService.resetForTests();
  h.prefs.networkGeneralBinding = { kind: 'direct', connectionId: '' };
  h.tabs = [
    { tabId: 'a', groupId: 'g1' },
    { tabId: 'b', groupId: 'g1' },
    { tabId: 'c', groupId: null },
  ];
  h.groups = [{ id: 'g1', settings: {} }];
  for (const fn of [h.update, h.rehostTab, h.updateGroupSettings, h.ensureUp, h.direct, h.ensure]) {
    fn.mockClear();
  }
  h.rehostTab.mockReturnValue(true);
  h.ensureUp.mockResolvedValue({ partition: 'persist:tepegoz-web--conn-tor' });
  h.statusMap.mockReturnValue(new Map());
});

describe('resolution over live state', () => {
  it('defaults every tab to Direct', () => {
    expect(BindingService.resolveFor('c')).toEqual({
      resolved: { connectionId: null },
      source: 'general',
    });
  });

  it('reads a group binding out of the settings bag ADR-0020 reserved', async () => {
    await BindingService.bindGroup('g1', { kind: 'connection', connectionId: 'tor' });
    expect(h.updateGroupSettings).toHaveBeenCalledWith('g1', { 'vpn.connectionId': 'tor' });
    expect(BindingService.resolveFor('a').resolved).toEqual({ connectionId: 'tor' });
    expect(BindingService.resolveFor('c').resolved).toEqual({ connectionId: null });
  });

  it('distinguishes an explicit group Direct from "no entry" (inherit)', async () => {
    h.prefs.networkGeneralBinding = { kind: 'connection', connectionId: 'tor' };
    await BindingService.bindGroup('g1', { kind: 'direct' });
    // The group opted OUT; General must not pull it back in.
    expect(BindingService.resolveFor('a').source).toBe('group');
    expect(BindingService.resolveFor('a').resolved).toEqual({ connectionId: null });
  });
});

describe('applying a binding', () => {
  it('brings the connection up BEFORE the tab moves onto it', async () => {
    const order: string[] = [];
    h.ensureUp.mockImplementation(() => {
      order.push('ensureUp');
      return Promise.resolve({ partition: 'persist:tepegoz-web--conn-tor' });
    });
    h.rehostTab.mockImplementation(() => {
      order.push('rehost');
      return true;
    });
    await BindingService.bindTab('a', { kind: 'connection', connectionId: 'tor' });
    expect(order).toEqual(['ensureUp', 'rehost']);
    expect(rehostedTo()).toEqual(['persist:tepegoz-web--conn-tor']);
  });

  it('LEAVES THE TAB ALONE when the tunnel cannot come up — never optimistic, never Direct', async () => {
    // Both alternatives are wrong in opposite directions: moving it anyway tells the user they are
    // protected when they are not; sending it Direct is the leak itself.
    h.ensureUp.mockRejectedValue(new Error('nothing listening'));
    await BindingService.bindTab('a', { kind: 'connection', connectionId: 'tor' });
    expect(h.rehostTab).not.toHaveBeenCalled();
  });

  it('a tab bound to Direct goes to the base session', async () => {
    await BindingService.bindTab('a', { kind: 'direct' });
    expect(h.direct).toHaveBeenCalled();
    expect(h.ensureUp).not.toHaveBeenCalled();
  });
});

describe('who moves', () => {
  it('a GROUP change moves only the members that were inheriting', async () => {
    await BindingService.bindTab('b', { kind: 'direct' }); // b now has its own override
    h.rehostTab.mockClear();
    await BindingService.bindGroup('g1', { kind: 'connection', connectionId: 'tor' });
    expect(rehostedTabs()).toEqual(['a']);
  });

  it('a GENERAL change moves only tabs inheriting all the way up', async () => {
    await BindingService.bindGroup('g1', { kind: 'connection', connectionId: 'tor' });
    h.rehostTab.mockClear();
    await BindingService.setGeneral({ kind: 'connection', connectionId: 'tor' });
    // a and b inherit, but their GROUP has an explicit binding — only the ungrouped c re-resolves.
    expect(rehostedTabs()).toEqual(['c']);
  });

  it('sequences applies rather than racing them onto the same connection', async () => {
    const active: number[] = [];
    let concurrent = 0;
    h.ensureUp.mockImplementation(() => {
      concurrent += 1;
      active.push(concurrent);
      return Promise.resolve().then(() => {
        concurrent -= 1;
        return { partition: 'persist:tepegoz-web--conn-tor' };
      });
    });
    await BindingService.setGeneral({ kind: 'connection', connectionId: 'tor' });
    expect(Math.max(...active)).toBe(1);
  });
});

describe('the kill-switch, as reported', () => {
  it('blocks a tab whose connection the pool has never heard of', () => {
    h.prefs.networkGeneralBinding = { kind: 'connection', connectionId: 'ghost' };
    expect(BindingService.mayEgress('c')).toBe(false);
  });

  it('blocks a tab whose connection is down, and allows it when up', () => {
    h.prefs.networkGeneralBinding = { kind: 'connection', connectionId: 'tor' };
    h.statusMap.mockReturnValue(new Map([['tor', 'down']]));
    expect(BindingService.mayEgress('c')).toBe(false);
    h.statusMap.mockReturnValue(new Map([['tor', 'up']]));
    expect(BindingService.mayEgress('c')).toBe(true);
  });

  it('always allows a Direct tab — it opted out and was never promised a tunnel', () => {
    expect(BindingService.mayEgress('c')).toBe(true);
  });
});

describe('removing a connection', () => {
  it('drops every binding that pointed at it so no tab is stranded on a dead id', async () => {
    h.prefs.networkGeneralBinding = { kind: 'connection', connectionId: 'tor' };
    await BindingService.bindGroup('g1', { kind: 'connection', connectionId: 'tor' });
    await BindingService.bindTab('c', { kind: 'connection', connectionId: 'tor' });

    await BindingService.releaseConnection('tor');

    expect(h.updateGroupSettings).toHaveBeenCalledWith('g1', { 'vpn.connectionId': '' });
    expect(h.prefs.networkGeneralBinding).toEqual({ kind: 'direct' });
    expect(BindingService.resolveFor('c').resolved).toEqual({ connectionId: null });
  });

  it('leaves bindings for OTHER connections untouched', async () => {
    await BindingService.bindTab('a', { kind: 'connection', connectionId: 'mullvad' });
    await BindingService.releaseConnection('tor');
    expect(BindingService.resolveFor('a').resolved).toEqual({ connectionId: 'mullvad' });
  });
});

describe('preserving a route when pinning strips a tab out of its group', () => {
  it("keeps the group's tunnel: a leak would mean the tab silently drops to General on pin", async () => {
    await BindingService.bindGroup('g1', { kind: 'connection', connectionId: 'tor' });
    expect(BindingService.resolveFor('a').resolved).toEqual({ connectionId: 'tor' });
    h.rehostTab.mockClear(); // only interested in what preserveRouteOnGroupExit itself triggers

    // The pin handler fires this BEFORE clearing the tab's groupId (see WindowTabsGroups.setPinned).
    BindingService.preserveRouteOnGroupExit('a', 'g1');
    // Simulate what pinning does next: the tab now belongs to no group.
    h.tabs = h.tabs.map((t) => (t.tabId === 'a' ? { ...t, groupId: null } : t));

    const after = BindingService.resolveFor('a');
    expect(after.resolved).toEqual({ connectionId: 'tor' }); // unchanged — no leak
    expect(after.source).toBe('tab'); // now owned by the tab itself, not inherited
    // No re-host: the destination never moved, so nothing needed to.
    expect(h.rehostTab).not.toHaveBeenCalled();
  });

  it('does nothing when the tab already had its own override', async () => {
    await BindingService.bindGroup('g1', { kind: 'connection', connectionId: 'tor' });
    await BindingService.bindTab('a', { kind: 'direct' });
    h.rehostTab.mockClear();

    BindingService.preserveRouteOnGroupExit('a', 'g1');
    h.tabs = h.tabs.map((t) => (t.tabId === 'a' ? { ...t, groupId: null } : t));

    // Still Direct — the group's tunnel was never this tab's route to begin with.
    expect(BindingService.resolveFor('a').resolved).toEqual({ connectionId: null });
  });

  it('does nothing when the group itself was inheriting (resolution already at General)', () => {
    h.prefs.networkGeneralBinding = { kind: 'connection', connectionId: 'tor' };

    BindingService.preserveRouteOnGroupExit('a', 'g1'); // g1 has no binding set — inherit
    h.tabs = h.tabs.map((t) => (t.tabId === 'a' ? { ...t, groupId: null } : t));

    // Still following General, not frozen onto a copy that would stop tracking it.
    expect(BindingService.resolveFor('a')).toEqual({
      resolved: { connectionId: 'tor' },
      source: 'general',
    });
  });
});
