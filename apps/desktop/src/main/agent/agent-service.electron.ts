import { runAgent, type AgentRunHooks, type AgentRunSummary } from '@tepegoz/agent-runtime';
import type { CanonMessage } from '@tepegoz/model-gateway';
import TabManager from '../tabs';
import AgentTabGroup from './agent-tab-group.electron';
import { mainStrings } from '../lib/i18n-main';
import { llamaEngine } from '../local-inference/llama-engine.electron';
import ModelManager from '../model-catalog/model-manager.electron';

export type { PlanApprovalDecision, AgentRunHooks, AgentRunSummary } from '@tepegoz/agent-runtime';

/**
 * Per-group conversation memory. Each entry is keyed by the tab-group id (= agent session id) and
 * holds the bounded message history for that session. `newConversation(groupId)` clears the slice.
 */
const conversations = new Map<string, CanonMessage[]>();
const MAX_HISTORY_MESSAGES = 20;

/** The active web tab's committed URL (Policy Kernel site context) — the app's Electron-side seam. */
function activeTabUrl(): string | undefined {
  const state = TabManager.getState();
  const active = state.tabs.find((t) => t.id === state.activeId);
  return active !== undefined && active.url.length > 0 ? active.url : undefined;
}

/** A specific tab's committed URL (Policy Kernel site context for tabId-scoped browser tools). */
function tabUrl(tabId: string): string | undefined {
  const tab = TabManager.getState().tabs.find((t) => t.id === tabId);
  return tab !== undefined && tab.url.length > 0 ? tab.url : undefined;
}

/**
 * Desktop adapter over the Electron-free `@tepegoz/agent-runtime`: injects the browser tool host,
 * journal reader, active-tab URL, and the localized handoff copy (`mainStrings().agent.handoff`).
 * Kept as `AgentService.run` so the IPC layer's call site is unchanged.
 */
export default class AgentService {
  static async run(prompt: string, hooks: AgentRunHooks, groupId: string): Promise<AgentRunSummary> {
    const handoff = mainStrings().agent.handoff;
    AgentTabGroup.setTopic(groupId, prompt);
    const history = conversations.get(groupId) ?? [];
    const summary = await runAgent(
      prompt,
      hooks,
      {
        activeTabUrl,
        tabUrl,
        handoffStrings: { captcha: handoff.captcha, twofa: handoff.twofa },
        localInference: { engine: llamaEngine(), resolveModel: () => ModelManager.resolveModel() },
      },
      history,
    );
    const note =
      summary.summary !== undefined && summary.summary.length > 0
        ? summary.summary
        : `(no result — task stopped: ${summary.stoppedReason})`;
    const turn: CanonMessage[] = [
      { role: 'user', content: prompt },
      { role: 'assistant', content: note },
    ];
    const prev = conversations.get(groupId) ?? [];
    conversations.set(groupId, [...prev, ...turn].slice(-MAX_HISTORY_MESSAGES));
    return summary;
  }

  /** Clears conversation memory for a specific group AND its agent tab-group binding. */
  static newConversation(groupId: string): void {
    conversations.delete(groupId);
    AgentTabGroup.reset(groupId);
  }
}
