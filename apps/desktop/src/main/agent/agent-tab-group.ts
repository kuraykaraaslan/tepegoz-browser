import TabManager from '../tabs';

/**
 * Per-conversation grouping for agent-opened tabs. Every tab the agent opens during one conversation
 * collects under a SINGLE named tab group; {@link AgentTabGroup.reset} (fired by the panel's "New task"
 * → `agent:new-conversation`) starts a fresh group next time. Groups are organizational only (ADR-0020),
 * so the binding lives here in the agent layer rather than in `TabManager`.
 *
 * The group name is the model-supplied label (relevant because the run's topic is resolved from
 * conversation history), falling back to the current run's task text ({@link AgentTabGroup.setTopic}).
 */
let groupId: string | null = null;
let topicHint = '';

const AgentTabGroup = {
  /** Set the fallback group name for this run — used when the model opens a tab without a groupName. */
  setTopic(topic: string): void {
    topicHint = topic.trim().slice(0, 60);
  },

  /** Open a tab for the agent and place it in the conversation's group (create-or-reuse). Foreground,
   *  like every agent tab, so the perception layer reads/acts on it next. */
  openTab(url?: string, groupName?: string): string {
    const id = TabManager.createTab(url);
    if (groupId !== null && TabManager.hasGroup(groupId)) {
      TabManager.assignToGroup(id, groupId);
    } else {
      groupId = TabManager.createGroup([id]);
      const name = (groupName ?? '').trim() || topicHint;
      if (name.length > 0) TabManager.renameGroup(groupId, name);
    }
    return id;
  },

  /** Clear the group binding so the next conversation opens a fresh group. */
  reset(): void {
    groupId = null;
    topicHint = '';
  },
};

export default AgentTabGroup;
