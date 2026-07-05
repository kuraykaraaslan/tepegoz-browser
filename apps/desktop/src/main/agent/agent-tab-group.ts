import TabManager from '../tabs';

/**
 * Per-group tab management for agent sessions. Each agent session is keyed by its tab-group id
 * (the same id used by TabManager/TabStore). When the user opens the agent panel, the active tab is
 * auto-enrolled in a group via {@link ensureGroupForTab}; that groupId becomes the session key.
 * Tabs the agent opens during a run are added to the same group via {@link openTab}. Groups are
 * organizational only (ADR-0020) — no session/policy isolation, just visual grouping.
 */
interface SessionState {
  /** The actual tab-group id used in TabManager (same as the agent session key). */
  tabGroupId: string | null;
  topicHint: string;
}

const sessions = new Map<string, SessionState>();

function getOrCreate(agentGroupId: string): SessionState {
  let s = sessions.get(agentGroupId);
  if (s === undefined) {
    s = { tabGroupId: agentGroupId, topicHint: '' };
    sessions.set(agentGroupId, s);
  }
  return s;
}

const AgentTabGroup = {
  /** Set the fallback group name for this session — used when the model opens a tab without a label. */
  setTopic(agentGroupId: string, topic: string): void {
    getOrCreate(agentGroupId).topicHint = topic.trim().slice(0, 60);
  },

  /** Open a tab for the agent and place it in the session's group (create-or-reuse). */
  openTab(agentGroupId: string, url?: string, groupName?: string): string {
    const s = getOrCreate(agentGroupId);
    const id = TabManager.createTab(url);
    if (s.tabGroupId !== null && TabManager.hasGroup(s.tabGroupId)) {
      TabManager.assignToGroup(id, s.tabGroupId);
    } else {
      s.tabGroupId = TabManager.createGroup([id]);
      const name = (groupName ?? '').trim() || s.topicHint;
      if (name.length > 0) TabManager.renameGroup(s.tabGroupId, name);
    }
    return id;
  },

  /** Clear the session state so the next conversation opens a fresh group. */
  reset(agentGroupId: string): void {
    sessions.delete(agentGroupId);
  },

  /**
   * Ensure the given tab belongs to a tab group. If it has no groupId, a new group is created and
   * the tab is added to it. Returns the groupId (existing or newly created).
   */
  ensureGroupForTab(tabId: string): string {
    const state = TabManager.getState();
    const tab = state.tabs.find((t) => t.id === tabId);
    if (tab !== undefined && tab.groupId !== null) return tab.groupId;
    const gid = TabManager.createGroup([tabId]);
    return gid;
  },
};

export default AgentTabGroup;
