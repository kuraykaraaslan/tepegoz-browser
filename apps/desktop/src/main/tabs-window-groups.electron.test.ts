import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `WindowTabsGroups` — tab grouping + pinning over a REAL `TabStore`. Most methods are one-line
 * store passthroughs; what's worth pinning is the logic on top:
 *   - `createGroup` filters caller-supplied member ids by what the store actually has, and defaults
 *     to the active tab when given none;
 *   - `setPinned` notifies the involuntary-group-exit observers BEFORE the store drops the membership
 *     (so a group-scoped route can still read the scope), a thrown observer is swallowed, and it
 *     never notifies on UN-pin;
 *   - `newTabInGroup` / `closeGroup` respect group existence and membership.
 */

vi.mock('electron', () => ({
  WebContentsView: class {},
  BrowserWindow: { fromWebContents: () => null },
  dialog: { showMessageBoxSync: () => 0 },
}));
vi.mock('@tepegoz/libs', () => ({
  Logger: { warn: vi.fn(), info: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));
vi.mock('./lib/i18n-main', () => ({
  mainStrings: () => ({
    browser: { unloadTitle: 't', unloadDetail: 'd', unloadLeave: 'l', unloadStay: 's' },
  }),
}));
vi.mock('./lib/navigation-url', () => ({
  isWebUrl: () => true,
  internalPageUrl: () => null,
  toNavigationUrl: (u: string) => u,
}));
vi.mock('./network/browsing-sessions.electron', () => ({
  default: { defaultForNewTab: () => ({}), private: () => ({}) },
}));
vi.mock('./network/certificate-recorder.electron', () => ({ getRecordedCert: () => null }));
vi.mock('@tepegoz/shared-types', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tepegoz/shared-types')>();
  return { ...actual, classifyPageSecurity: () => ({ level: 'neutral' }) };
});
vi.mock('./tabs-content-bounds', () => ({
  resolveViewBounds: () => ({ x: 0, y: 0, width: 1, height: 1 }),
}));
vi.mock('./extensions/action-interceptors.electron', () => ({
  default: { shouldBlock: () => false },
}));
vi.mock('./tabs-view-wiring', () => ({ wireView: vi.fn(), unwireView: vi.fn() }));
vi.mock('./tabs-internal-page-view', () => ({
  createInternalPageView: vi.fn(),
  destroyInternalPageView: vi.fn(),
  hasRealPage: () => false,
  hideInternalPageView: vi.fn(),
  navigateInternalPageView: vi.fn(),
  showInternalPageView: vi.fn(),
}));
vi.mock('./navigation/unload-broker', () => ({ askBeforeClose: vi.fn() }));

const groupExitObservers = new Set<(tabId: string, groupId: string) => void>();
vi.mock('./tabs-shared', () => ({
  rememberClosedTab: vi.fn(),
  internalBaseUrl: (u: string) => u,
  internalTitleFor: () => 'Internal',
  browsedViewWebPreferences: () => ({}),
  homeUrl: () => 'https://example.com/',
  searchUrlForQuery: (q: string) => q,
  persistSession: vi.fn(),
  involuntaryGroupExitObservers: groupExitObservers,
}));

const { WindowTabsGroups } = await import('./tabs-window-groups');

function fakeWindow() {
  const children: unknown[] = [];
  return {
    isDestroyed: () => false,
    close: vi.fn(),
    setTitle: vi.fn(),
    getContentSize: () => [1200, 800],
    webContents: { send: vi.fn() },
    contentView: {
      children,
      addChildView: (v: unknown) => children.push(v),
      removeChildView: (v: unknown) => {
        const i = children.indexOf(v);
        if (i !== -1) children.splice(i, 1);
      },
    },
  };
}

class Harness extends WindowTabsGroups {
  addTab(title: string): string {
    return this.store.add({
      kind: 'web',
      title,
      url: 'https://x.test/',
      isLoading: false,
      faviconUrl: null,
    });
  }
  setActive(id: string): void {
    this.store.setActive(id);
  }
  groupIdOf(tabId: string): string | null {
    return this.store.get(tabId)?.groupId ?? null;
  }
  groupExists(groupId: string): boolean {
    return this.store.getGroup(groupId) !== undefined;
  }
  recordCount(): number {
    return this.store.records().length;
  }
  pinnedOf(id: string): boolean | undefined {
    return this.store.get(id)?.pinned;
  }
}

let tabs: Harness;
beforeEach(() => {
  groupExitObservers.clear();
  tabs = new Harness(fakeWindow() as never, false);
});

describe('createGroup', () => {
  it('drops member ids the store does not have', () => {
    const a = tabs.addTab('a');
    const gid = tabs.createGroup([a, 'ghost-1', 'ghost-2']);
    expect(tabs.groupIdOf(a)).toBe(gid);
    expect(tabs.groupExists(gid)).toBe(true);
  });

  it('groups only the ids the store has, ignoring every ghost id', () => {
    const a = tabs.addTab('a');
    const b = tabs.addTab('b');
    const gid = tabs.createGroup(['ghost', a, 'ghost2', b]);
    expect(tabs.groupMemberIds(gid).sort()).toEqual([a, b].sort());
  });
});

describe('setPinned', () => {
  it('is a no-op for an unknown tab', () => {
    expect(() => tabs.setPinned('nope', true)).not.toThrow();
  });

  it('notifies the group-exit observers with the LOSING group before membership is dropped', () => {
    const a = tabs.addTab('a');
    const gid = tabs.createGroup([a]);
    let seenGroupAtCallback: string | null = 'unset';
    groupExitObservers.add((tabId, groupId) => {
      expect(tabId).toBe(a);
      // The membership must still be readable while the observer runs.
      seenGroupAtCallback = tabs.groupIdOf(a);
      expect(groupId).toBe(gid);
    });

    tabs.setPinned(a, true);

    expect(seenGroupAtCallback).toBe(gid);
    expect(tabs.groupIdOf(a)).toBeNull(); // pinning stripped the group afterwards
  });

  it('swallows a throwing observer and still pins', () => {
    const a = tabs.addTab('a');
    tabs.createGroup([a]);
    groupExitObservers.add(() => {
      throw new Error('observer boom');
    });
    expect(() => tabs.setPinned(a, true)).not.toThrow();
    expect(tabs.pinnedOf(a)).toBe(true);
  });

  it('does NOT notify observers when UN-pinning', () => {
    const a = tabs.addTab('a');
    tabs.setPinned(a, true);
    const spy = vi.fn();
    groupExitObservers.add(spy);
    tabs.setPinned(a, false);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('group membership guards', () => {
  it('newTabInGroup does nothing when the group does not exist', () => {
    const before = tabs.recordCount();
    tabs.newTabInGroup('missing');
    expect(tabs.recordCount()).toBe(before);
  });

  it('hasGroup reflects creation and ungroup', () => {
    const a = tabs.addTab('a');
    const gid = tabs.createGroup([a]);
    expect(tabs.hasGroup(gid)).toBe(true);
    tabs.ungroup(gid);
    expect(tabs.hasGroup(gid)).toBe(false);
  });

  it('groupMemberIds lists exactly the tabs assigned to a group', () => {
    const a = tabs.addTab('a');
    const b = tabs.addTab('b');
    tabs.addTab('c');
    const gid = tabs.createGroup([a, b]);
    expect(tabs.groupMemberIds(gid).sort()).toEqual([a, b].sort());
  });
});
