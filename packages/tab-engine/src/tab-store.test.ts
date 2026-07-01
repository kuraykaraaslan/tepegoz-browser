import { describe, it, expect, beforeEach } from 'vitest';
import { TabStore } from './tab-store';

const web = (over: Partial<{ title: string; url: string; isLoading: boolean; faviconUrl: string | null }> = {}) =>
  ({ kind: 'web' as const, title: '', url: '', isLoading: true, faviconUrl: null, ...over });

let store: TabStore;
beforeEach(() => {
  store = new TabStore();
});

describe('TabStore', () => {
  it('allocates monotonically increasing ids and inserts records', () => {
    const a = store.add(web({ url: 'https://a.example' }));
    const b = store.add(web({ url: 'https://b.example' }));
    expect(a).toBe('1');
    expect(b).toBe('2');
    expect(store.ids()).toEqual(['1', '2']);
    expect(store.get(a)?.url).toBe('https://a.example');
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
    expect(store.get(a)).toMatchObject({ kind: 'web', title: 'Hello', isLoading: false, faviconUrl: 'x' });
    expect(() => store.update('999', { title: 'nope' })).not.toThrow();
  });

  it('finds an existing internal-page tab by url only', () => {
    store.add(web({ url: 'tepegoz://settings' })); // a web tab that merely looks internal
    const settings = store.add({ kind: 'internal', title: 'Settings', url: 'tepegoz://settings', isLoading: false, faviconUrl: null });
    expect(store.findInternal('tepegoz://settings')).toBe(settings);
    expect(store.findInternal('tepegoz://history')).toBeUndefined();
  });

  it('reorders placeAfter (middle, end, self, unknown ref)', () => {
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

  it('projects TabsState with injected nav flags', () => {
    const a = store.add(web({ title: 'A', url: 'https://a.example', isLoading: false }));
    store.setActive(a);
    const state = store.toState({ canGoBack: true, canGoForward: false });
    expect(state).toEqual({
      tabs: [{ id: a, title: 'A', url: 'https://a.example', isLoading: false, faviconUrl: null }],
      activeId: a,
      canGoBack: true,
      canGoForward: false,
    });
  });

  it('clear() drops tabs + active but keeps id allocation moving forward', () => {
    store.add(web());
    store.setActive('1');
    store.clear();
    expect(store.ids()).toEqual([]);
    expect(store.activeId).toBeNull();
    expect(store.add(web())).toBe('2'); // ids do not reset
  });
});
