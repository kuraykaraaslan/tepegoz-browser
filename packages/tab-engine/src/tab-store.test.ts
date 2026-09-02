import { describe, it, expect, beforeEach } from 'vitest';
import { TabStore } from './tab-store';

const web = (
  over: Partial<{ title: string; url: string; isLoading: boolean; faviconUrl: string | null }> = {},
) => ({ kind: 'web' as const, title: '', url: '', isLoading: true, faviconUrl: null, ...over });

/** Assert the ADR-0020 invariants hold: pinned run first, each group contiguous. */
function assertInvariants(s: TabStore): void {
  const recs = s.records();
  // (1) pinned run precedes unpinned.
  const firstUnpinned = recs.findIndex((r) => !r.pinned);
  if (firstUnpinned !== -1) {
    expect(recs.slice(firstUnpinned).some((r) => r.pinned)).toBe(false);
  }
  // (3) no pinned tab is grouped.
  expect(recs.some((r) => r.pinned && r.groupId !== null)).toBe(false);
  // (2) each group's members are contiguous.
  const seenClosed = new Set<string>();
  let runGroup: string | null = null;
  for (const r of recs) {
    if (r.groupId === runGroup) continue;
    if (r.groupId !== null) {
      expect(seenClosed.has(r.groupId)).toBe(false); // a group must not reappear after closing
      seenClosed.add(r.groupId);
    }
    if (runGroup !== null) seenClosed.add(runGroup);
    runGroup = r.groupId;
  }
}

let store: TabStore;
beforeEach(() => {
  store = new TabStore();
});

describe('TabStore — records & ordering (existing)', () => {
  it('allocates monotonically increasing ids and inserts records', () => {
    const a = store.add(web({ url: 'https://a.example' }));
    const b = store.add(web({ url: 'https://b.example' }));
    expect(a).toBe('1');
    expect(b).toBe('2');
    expect(store.ids()).toEqual(['1', '2']);
    expect(store.get(a)?.url).toBe('https://a.example');
    expect(store.get(a)?.pinned).toBe(false);
    expect(store.get(a)?.groupId).toBeNull();
    expect(store.has('nope')).toBe(false);
  });

  it('tracks the active tab', () => {
    const a = store.add(web());
    store.add(web());
    expect(store.active()).toBeUndefined();
    store.setActive(a);
    expect(store.activeId).toBe(a);
    expect(store.active()?.id).toBe(a);
  });

  it('patches only mutable fields and ignores unknown ids', () => {
    const a = store.add(web());
    store.update(a, { title: 'Hello', isLoading: false, faviconUrl: 'x' });
    expect(store.get(a)).toMatchObject({
      kind: 'web',
      title: 'Hello',
      isLoading: false,
      faviconUrl: 'x',
    });
    expect(() => store.update('999', { title: 'nope' })).not.toThrow();
  });

  it('finds an existing internal-page tab by url only', () => {
    store.add(web({ url: 'tepegoz://settings' }));
    const settings = store.add({
      kind: 'internal',
      title: 'Settings',
      url: 'tepegoz://settings',
      isLoading: false,
      faviconUrl: null,
    });
    expect(store.findInternal('tepegoz://settings')).toBe(settings);
    expect(store.findInternal('tepegoz://history')).toBeUndefined();
  });

  it('reorders placeAfter (middle, end, self, unknown ref) — no-op normalize with no pins/groups', () => {
    const a = store.add(web());
    const b = store.add(web());
    const c = store.add(web());
    store.placeAfter(c, a); // a, c, b
    expect(store.ids()).toEqual([a, c, b]);
    store.placeAfter(a, b); // c, b, a
    expect(store.ids()).toEqual([c, b, a]);
    store.placeAfter(a, a); // no-op
    expect(store.ids()).toEqual([c, b, a]);
    store.placeAfter(b, 'unknown'); // ref missing → moves to end
    expect(store.ids()).toEqual([c, a, b]);
  });

  it('projects TabsState with groups + membership + injected nav flags', () => {
    const a = store.add(web({ title: 'A', url: 'https://a.example', isLoading: false }));
    store.setActive(a);
    const state = store.toState({ canGoBack: true, canGoForward: false });
    expect(state).toEqual({
      tabs: [
        {
          id: a,
          title: 'A',
          url: 'https://a.example',
          isLoading: false,
          faviconUrl: null,
          pinned: false,
          groupId: null,
        },
      ],
      groups: [],
      activeId: a,
      canGoBack: true,
      canGoForward: false,
      // Defaults false; only the window model (which knows) sets it.
      isPrivate: false,
      // Same: the Electron-free store cannot read a WebContents, so zoom defaults to 100%.
      activeZoomFactor: 1,
      // Same: the store has no URL parser, so the security verdict defaults to hidden.
      activeSecurityLevel: 'unknown',
    });
  });

  it('passes the injected active-tab zoom factor straight through to TabsState', () => {
    const a = store.add(web({ title: 'A', url: 'https://a.example', isLoading: false }));
    store.setActive(a);
    expect(
      store.toState({ canGoBack: false, canGoForward: false, activeZoomFactor: 1.25 })
        .activeZoomFactor,
    ).toBe(1.25);
  });

  it('passes the injected active-tab security level straight through to TabsState', () => {
    const a = store.add(web({ title: 'A', url: 'http://a.example', isLoading: false }));
    store.setActive(a);
    expect(
      store.toState({ canGoBack: false, canGoForward: false, activeSecurityLevel: 'not-secure' })
        .activeSecurityLevel,
    ).toBe('not-secure');
  });

  it('clear() drops tabs + groups + active but keeps id allocation moving forward', () => {
    const a = store.add(web());
    store.createGroup({ memberIds: [a] });
    store.setActive('1');
    store.clear();
    expect(store.ids()).toEqual([]);
    expect(store.groupsInOrder()).toEqual([]);
    expect(store.activeId).toBeNull();
    expect(store.add(web())).toBe('2'); // ids do not reset
  });
});

describe('TabStore — groups', () => {
  it('createGroup mints a UUID id and an empty settings bag by default', () => {
    const a = store.add(web());
    const g = store.createGroup({ memberIds: [a] });
    expect(g).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(store.getGroup(g)?.settings).toEqual({});
  });

  it('createGroup accepts an explicit id + settings (session restore reusing a persisted group)', () => {
    const a = store.add(web());
    const g = store.createGroup({
      id: 'restored-id',
      settings: { 'agent.panelOpen': true },
      memberIds: [a],
    });
    expect(g).toBe('restored-id');
    expect(store.getGroup(g)?.settings).toEqual({ 'agent.panelOpen': true });
  });

  it('updateGroupSettings merge-patches only the provided keys', () => {
    const a = store.add(web());
    const g = store.createGroup({ memberIds: [a], settings: { 'agent.panelOpen': true, x: 1 } });
    store.updateGroupSettings(g, { 'agent.panelOpen': false });
    expect(store.getGroup(g)?.settings).toEqual({ 'agent.panelOpen': false, x: 1 });
  });

  it('createGroup pulls members contiguous and returns a group id', () => {
    const a = store.add(web());
    const b = store.add(web());
    const c = store.add(web());
    const g = store.createGroup({ name: 'Work', color: 'red', memberIds: [a, c] });
    // a & c cluster at a's anchor; b follows.
    expect(store.ids()).toEqual([a, c, b]);
    expect(store.get(a)?.groupId).toBe(g);
    expect(store.get(c)?.groupId).toBe(g);
    expect(store.get(b)?.groupId).toBeNull();
    expect(store.getGroup(g)).toMatchObject({ name: 'Work', color: 'red', collapsed: false });
    assertInvariants(store);
  });

  it('groupsInOrder reflects strip anchor order', () => {
    const a = store.add(web());
    const b = store.add(web());
    const g1 = store.createGroup({ memberIds: [b] });
    const g2 = store.createGroup({ memberIds: [a] });
    // order is a(g2), b(g1) → g2 anchors before g1.
    expect(store.groupsInOrder().map((g) => g.id)).toEqual([g2, g1]);
  });

  it('assignToGroup clusters a distant tab next to the group and unpins it', () => {
    const a = store.add(web());
    const b = store.add(web());
    const c = store.add(web());
    const g = store.createGroup({ memberIds: [a] });
    store.setPinned(c, true);
    store.assignToGroup(c, g); // c was pinned → unpinned + grouped, pulled to the group run
    expect(store.get(c)?.pinned).toBe(false);
    expect(store.get(c)?.groupId).toBe(g);
    expect(store.ids()).toEqual([a, c, b]);
    assertInvariants(store);
  });

  it('removeFromGroup leaves the tab just after its old group run', () => {
    const a = store.add(web());
    const b = store.add(web());
    const c = store.add(web());
    store.createGroup({ memberIds: [a, b, c] }); // [a,b,c] all grouped
    store.removeFromGroup(b);
    expect(store.get(b)?.groupId).toBeNull();
    expect(store.ids()).toEqual([a, c, b]); // b drops out to just after the run
    assertInvariants(store);
  });

  it('ungroup dissolves the group in place and prunes it', () => {
    const a = store.add(web());
    const b = store.add(web());
    const g = store.createGroup({ memberIds: [a, b] });
    store.ungroup(g);
    expect(store.getGroup(g)).toBeUndefined();
    expect(store.get(a)?.groupId).toBeNull();
    expect(store.get(b)?.groupId).toBeNull();
    expect(store.groupsInOrder()).toEqual([]);
  });

  it('a group is pruned when its last member leaves', () => {
    const a = store.add(web());
    const g = store.createGroup({ memberIds: [a] });
    expect(store.getGroup(g)).toBeDefined();
    store.removeFromGroup(a);
    expect(store.getGroup(g)).toBeUndefined();
  });

  it('deleting the last member prunes the group', () => {
    const a = store.add(web());
    const b = store.add(web());
    const g = store.createGroup({ memberIds: [a] });
    store.delete(a);
    expect(store.getGroup(g)).toBeUndefined();
    expect(store.ids()).toEqual([b]);
  });

  it('moveGroup relocates the whole run intact', () => {
    const a = store.add(web());
    const b = store.add(web());
    const c = store.add(web());
    const d = store.add(web());
    const g = store.createGroup({ memberIds: [a, b] }); // [a,b],c,d
    store.moveGroup(g, 2); // place the run after the 2 non-members (c,d) → c,d,a,b
    expect(store.ids()).toEqual([c, d, a, b]);
    assertInvariants(store);
  });

  it('rename/recolor/collapse patch metadata without reordering', () => {
    const a = store.add(web());
    const b = store.add(web());
    const g = store.createGroup({ memberIds: [a] });
    store.renameGroup(g, 'Docs');
    store.recolorGroup(g, 'green');
    store.setGroupCollapsed(g, true);
    expect(store.getGroup(g)).toMatchObject({ name: 'Docs', color: 'green', collapsed: true });
    expect(store.ids()).toEqual([a, b]);
  });
});

describe('TabStore — pinning', () => {
  it('pin moves the tab to the front run and clears group membership', () => {
    store.add(web()); // a filler ungrouped tab that stays put
    const b = store.add(web());
    const c = store.add(web());
    store.createGroup({ memberIds: [b] });
    store.setPinned(c, true);
    expect(store.ids()[0]).toBe(c); // pinned run first
    store.setPinned(b, true); // pinning a grouped tab unGroups it
    expect(store.get(b)?.groupId).toBeNull();
    expect(store.ids().slice(0, 2)).toEqual([c, b]); // both pinned, at the front
    expect(store.groupsInOrder()).toEqual([]); // the group emptied → pruned
    assertInvariants(store);
  });

  it('unpin returns the tab to the unpinned region', () => {
    const a = store.add(web());
    const b = store.add(web());
    store.setPinned(b, true);
    expect(store.ids()).toEqual([b, a]);
    store.setPinned(b, false); // unpins in place → lands at the front of the unpinned region
    expect(store.ids()).toEqual([b, a]);
    assertInvariants(store);
  });
});

describe('TabStore — hidden', () => {
  it('setHidden flips the flag without reordering or touching pin/group', () => {
    const a = store.add(web());
    const b = store.add(web());
    const c = store.add(web());
    const g = store.createGroup({ memberIds: [b] });
    store.setPinned(a, true);
    const before = store.ids();
    store.setHidden(c, true);
    expect(store.get(c)?.hidden).toBe(true);
    expect(store.ids()).toEqual(before); // orthogonal to ordering → no reorder
    expect(store.get(a)?.pinned).toBe(true); // pin survives
    expect(store.get(b)?.groupId).toBe(g); // group survives
    assertInvariants(store);
  });

  it('a hidden tab may still be pinned or grouped', () => {
    const a = store.add(web());
    store.setPinned(a, true);
    store.setHidden(a, true);
    expect(store.get(a)).toMatchObject({ pinned: true, hidden: true });
  });

  it('setHidden(false) clears the flag; unknown id is a no-op', () => {
    const a = store.add(web());
    store.setHidden(a, true);
    store.setHidden(a, false);
    expect(store.get(a)?.hidden).toBe(false);
    expect(() => store.setHidden('999', true)).not.toThrow();
  });

  it('toState projects hidden only once set (absent by default) and keeps hidden tabs IN state', () => {
    const a = store.add(web());
    const b = store.add(web());
    store.setActive(a);
    store.setHidden(b, true);
    const state = store.toState({ canGoBack: false, canGoForward: false });
    expect('hidden' in state.tabs[0]!).toBe(false); // a: never set → omitted
    expect(state.tabs[1]?.hidden).toBe(true); // b: hidden
    expect(state.tabs).toHaveLength(2); // the agent must still see hidden tabs
  });
});

describe('TabStore — moveTab drop semantics', () => {
  it('dropping strictly inside a group run joins the group (inferred)', () => {
    const a = store.add(web());
    const b = store.add(web());
    const c = store.add(web());
    const g = store.createGroup({ memberIds: [a, b] }); // [a,b],c
    store.moveTab(c, 1); // between a and b → both neighbors are g → join
    expect(store.get(c)?.groupId).toBe(g);
    expect(store.ids()).toEqual([a, c, b]);
    assertInvariants(store);
  });

  it('dropping on a group boundary stays ungrouped (inferred)', () => {
    const a = store.add(web());
    const b = store.add(web());
    const c = store.add(web());
    store.createGroup({ memberIds: [a, b] }); // [a,b],c
    store.moveTab(c, 0); // before the group → ungrouped
    expect(store.get(c)?.groupId).toBeNull();
    // c ungrouped, placed before the group anchor
    expect(store.ids()).toEqual([c, a, b]);
    assertInvariants(store);
  });

  it('explicit intoGroupId overrides inference; null forces ungroup', () => {
    const a = store.add(web());
    const b = store.add(web());
    const g = store.createGroup({ memberIds: [a] });
    store.moveTab(b, 0, g); // explicit → join even at the front
    expect(store.get(b)?.groupId).toBe(g);
    store.moveTab(b, 5, null); // explicit ungroup
    expect(store.get(b)?.groupId).toBeNull();
    assertInvariants(store);
  });

  it('keeps invariants across a randomized sequence of moves', () => {
    const ids = Array.from({ length: 8 }, () => store.add(web()));
    const g1 = store.createGroup({ memberIds: [ids[1]!, ids[2]!] });
    store.createGroup({ memberIds: [ids[5]!, ids[6]!] }); // a second group to stress contiguity
    store.setPinned(ids[0]!, true);
    // deterministic pseudo-shuffle (no Math.random in the harness)
    const script: Array<[string, number, string | null | undefined]> = [
      [ids[3]!, 0, undefined],
      [ids[7]!, 2, g1],
      [ids[4]!, 6, null],
      [ids[2]!, 1, undefined],
      [ids[6]!, 4, g1],
    ];
    for (const [id, to, into] of script) {
      store.moveTab(id, to, into);
      assertInvariants(store);
    }
  });
});
