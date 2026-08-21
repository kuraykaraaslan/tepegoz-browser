import { createAgentSessionStore } from '@tepegoz/ext-agent/tab-group-core';
import TabManager from '../tabs';

/**
 * Electron wiring for the Agent extension's per-session tab grouping. The session bookkeeping + naming
 * decisions live in the Electron-free `@tepegoz/ext-agent/tab-group-core`; this file owns the actual
 * `TabManager` operations (ADR-0020: groups are organizational only). Kept as `AgentTabGroup` so the
 * IPC/agent call sites are unchanged.
 */
const store = createAgentSessionStore();

const AgentTabGroup = {
  /** Set the fallback group name for this session — used when the model opens a tab without a label. */
  setTopic(agentGroupId: string, topic: string): void {
    store.setTopic(agentGroupId, topic);
  },

  /** Open a tab for the agent and place it in the session's group (create-or-reuse). Throws if an
   *  enabled extension's `tab:create` interceptor blocked it (surfaced to the agent as a failed
   *  tool call) — today nothing registers that interceptor, so this path is unreachable in practice. */
  openTab(agentGroupId: string, url?: string, groupName?: string, background?: boolean): string {
    const s = store.get(agentGroupId);
    const id =
      background === undefined
        ? TabManager.createTab(url)
        : TabManager.createTab(url, { background });
    if (id === null) throw new Error('Tab creation was blocked by an extension');
    if (s.tabGroupId !== null && TabManager.hasGroup(s.tabGroupId)) {
      TabManager.assignToGroup(id, s.tabGroupId);
    } else {
      s.tabGroupId = TabManager.createGroup([id]);
      const name = store.resolveGroupName(agentGroupId, groupName);
      if (name.length > 0) TabManager.renameGroup(s.tabGroupId, name);
    }
    store.recordOwnedTab(agentGroupId, id);
    return id;
  },

  /** Whether this agent session opened the tab and therefore owns close authority for it. */
  ownsTab(agentGroupId: string, tabId: string): boolean {
    return store.ownsTab(agentGroupId, tabId);
  },

  /** Drop a tab from ownership once the close has actually happened. */
  releaseTab(agentGroupId: string, tabId: string): void {
    store.releaseOwnedTab(agentGroupId, tabId);
  },

  /** Clear the session state so the next conversation opens a fresh group. */
  reset(agentGroupId: string): void {
    store.reset(agentGroupId);
  },

  /**
   * Ensure the given tab belongs to a tab group. If it has no groupId, a new group is created and
   * the tab is added to it. Returns the groupId (existing or newly created).
   */
  ensureGroupForTab(tabId: string): string {
    const state = TabManager.getState();
    const tab = state.tabs.find((t) => t.id === tabId);
    if (tab !== undefined && tab.groupId !== null) return tab.groupId;
    return TabManager.createGroup([tabId]);
  },
};

export default AgentTabGroup;
