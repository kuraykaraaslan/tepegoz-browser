/**
 * The Agent extension's per-session tab-group **bookkeeping** (Electron-free). Each agent session is
 * keyed by its tab-group id; this store holds the session→(tabGroupId, topicHint) map and the pure
 * naming decisions. The main process (`agent-tab-group.electron.ts`) owns the actual `TabManager`
 * operations (create/assign/rename groups) and uses this store for state + the group-name choice, so
 * the policy lives in the extension package while Electron I/O stays in `apps/desktop`.
 */
export interface AgentSessionState {
  /** The actual tab-group id used in TabManager (same as the agent session key), or null until set. */
  tabGroupId: string | null;
  /** Fallback group name — the trimmed opening prompt, used when the model opens a tab without a label. */
  topicHint: string;
}

export interface AgentSessionStore {
  /** The session's mutable state (created on first access, keyed by the agent group id). */
  get(agentGroupId: string): AgentSessionState;
  /** Set the fallback group name (trimmed + capped) for this session. */
  setTopic(agentGroupId: string, topic: string): void;
  /** The group name to use when creating a new group: an explicit `groupName`, else the topic hint. */
  resolveGroupName(agentGroupId: string, groupName?: string): string;
  /** Clear the session so the next conversation opens a fresh group. */
  reset(agentGroupId: string): void;
}

export function createAgentSessionStore(): AgentSessionStore {
  const sessions = new Map<string, AgentSessionState>();
  const getOrCreate = (agentGroupId: string): AgentSessionState => {
    let s = sessions.get(agentGroupId);
    if (s === undefined) {
      s = { tabGroupId: agentGroupId, topicHint: '' };
      sessions.set(agentGroupId, s);
    }
    return s;
  };
  return {
    get: getOrCreate,
    setTopic(agentGroupId, topic): void {
      getOrCreate(agentGroupId).topicHint = topic.trim().slice(0, 60);
    },
    resolveGroupName(agentGroupId, groupName): string {
      return (groupName ?? '').trim() || getOrCreate(agentGroupId).topicHint;
    },
    reset(agentGroupId): void {
      sessions.delete(agentGroupId);
    },
  };
}
