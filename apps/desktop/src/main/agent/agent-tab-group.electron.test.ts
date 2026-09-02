import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `AgentTabGroup` — the Electron half of the Agent extension's per-session tab grouping. The session
 * bookkeeping lives in the Electron-free core (mocked here); this file owns the `TabManager` calls.
 * Pinned: `openTab`'s create-or-reuse-group logic (reuse an existing live group, else create + name
 * it, skip an empty name), its background arg passthrough and blocked-creation throw, and
 * `ensureGroupForTab`'s "already grouped → return it, else create" branch. The rest are one-line
 * delegates to the core store.
 */

const store = vi.hoisted(() => ({
  setTopic: vi.fn(),
  get: vi.fn((): { tabGroupId: string | null } => ({ tabGroupId: null })),
  resolveGroupName: vi.fn((): string => ''),
  recordOwnedTab: vi.fn(),
  ownsTab: vi.fn((): boolean => false),
  releaseOwnedTab: vi.fn(),
  reset: vi.fn(),
}));
vi.mock('@tepegoz/ext-agent/tab-group-core', () => ({ createAgentSessionStore: () => store }));

const tm = vi.hoisted(() => ({
  createTab: vi.fn((): string | null => 'tab-1'),
  hasGroup: vi.fn((): boolean => false),
  assignToGroup: vi.fn(),
  createGroup: vi.fn((): string => 'grp-new'),
  renameGroup: vi.fn(),
  getState: vi.fn((): { tabs: { id: string; groupId: string | null }[] } => ({ tabs: [] })),
}));
vi.mock('../tabs', () => ({ default: tm }));

const { default: AgentTabGroup } = await import('./agent-tab-group.electron');

beforeEach(() => {
  vi.clearAllMocks();
  store.get.mockReturnValue({ tabGroupId: null });
  store.resolveGroupName.mockReturnValue('');
  tm.createTab.mockReturnValue('tab-1');
  tm.hasGroup.mockReturnValue(false);
  tm.createGroup.mockReturnValue('grp-new');
  tm.getState.mockReturnValue({ tabs: [] });
});

describe('openTab', () => {
  it('omits the options arg entirely when background is undefined', () => {
    AgentTabGroup.openTab('a1', 'https://x.test/');
    expect(tm.createTab).toHaveBeenCalledWith('https://x.test/');
  });

  it('passes { background } through when given', () => {
    AgentTabGroup.openTab('a1', 'https://x.test/', undefined, true);
    expect(tm.createTab).toHaveBeenCalledWith('https://x.test/', { background: true });
  });

  it('throws when TabManager reports the creation was blocked', () => {
    tm.createTab.mockReturnValue(null);
    expect(() => AgentTabGroup.openTab('a1')).toThrow(/blocked by an extension/);
  });

  it('reuses the session group when it still exists', () => {
    store.get.mockReturnValue({ tabGroupId: 'grp-live' });
    tm.hasGroup.mockReturnValue(true);
    const id = AgentTabGroup.openTab('a1', 'https://x.test/');
    expect(tm.assignToGroup).toHaveBeenCalledWith(id, 'grp-live');
    expect(tm.createGroup).not.toHaveBeenCalled();
    expect(store.recordOwnedTab).toHaveBeenCalledWith('a1', id);
  });

  it('creates a fresh group and names it when the session has none', () => {
    const session = { tabGroupId: null as string | null };
    store.get.mockReturnValue(session);
    store.resolveGroupName.mockReturnValue('Research');
    const id = AgentTabGroup.openTab('a1', 'https://x.test/', 'Research');
    expect(tm.createGroup).toHaveBeenCalledWith([id]);
    expect(session.tabGroupId).toBe('grp-new');
    expect(tm.renameGroup).toHaveBeenCalledWith('grp-new', 'Research');
  });

  it('creates the group but skips renaming when the resolved name is empty', () => {
    store.get.mockReturnValue({ tabGroupId: null });
    store.resolveGroupName.mockReturnValue('');
    AgentTabGroup.openTab('a1', 'https://x.test/');
    expect(tm.createGroup).toHaveBeenCalled();
    expect(tm.renameGroup).not.toHaveBeenCalled();
  });

  it('creates a fresh group when the recorded group id is stale (hasGroup false)', () => {
    store.get.mockReturnValue({ tabGroupId: 'grp-gone' });
    tm.hasGroup.mockReturnValue(false);
    AgentTabGroup.openTab('a1', 'https://x.test/');
    expect(tm.assignToGroup).not.toHaveBeenCalled();
    expect(tm.createGroup).toHaveBeenCalled();
  });
});

describe('ensureGroupForTab', () => {
  it('returns the existing groupId when the tab is already grouped', () => {
    tm.getState.mockReturnValue({ tabs: [{ id: 't5', groupId: 'grp-7' }] });
    expect(AgentTabGroup.ensureGroupForTab('t5')).toBe('grp-7');
    expect(tm.createGroup).not.toHaveBeenCalled();
  });

  it('creates a group when the tab exists but is ungrouped', () => {
    tm.getState.mockReturnValue({ tabs: [{ id: 't5', groupId: null }] });
    expect(AgentTabGroup.ensureGroupForTab('t5')).toBe('grp-new');
    expect(tm.createGroup).toHaveBeenCalledWith(['t5']);
  });

  it('creates a group when the tab is not in state at all', () => {
    tm.getState.mockReturnValue({ tabs: [] });
    expect(AgentTabGroup.ensureGroupForTab('ghost')).toBe('grp-new');
    expect(tm.createGroup).toHaveBeenCalledWith(['ghost']);
  });
});

describe('the plain delegates', () => {
  it('forward straight to the core store', () => {
    AgentTabGroup.setTopic('a1', 'weather');
    AgentTabGroup.ownsTab('a1', 't1');
    AgentTabGroup.releaseTab('a1', 't1');
    AgentTabGroup.reset('a1');
    expect(store.setTopic).toHaveBeenCalledWith('a1', 'weather');
    expect(store.ownsTab).toHaveBeenCalledWith('a1', 't1');
    expect(store.releaseOwnedTab).toHaveBeenCalledWith('a1', 't1');
    expect(store.reset).toHaveBeenCalledWith('a1');
  });
});
