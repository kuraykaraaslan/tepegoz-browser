import { runAgent, type AgentRunHooks, type AgentRunSummary } from '@tepegoz/agent-runtime';
import TabManager from '../tabs';
import { browserHost } from './browser-host';
import { journalHost } from './journal-host';
import { mainStrings } from '../lib/i18n-main';

export type { PlanApprovalDecision, AgentRunHooks, AgentRunSummary } from '@tepegoz/agent-runtime';

/** The active web tab's committed URL (Policy Kernel site context) — the app's Electron-side seam. */
function activeTabUrl(): string | undefined {
  const state = TabManager.getState();
  const active = state.tabs.find((t) => t.id === state.activeId);
  return active !== undefined && active.url.length > 0 ? active.url : undefined;
}

/**
 * Desktop adapter over the Electron-free `@tepegoz/agent-runtime`: injects the browser tool host,
 * journal reader, active-tab URL, and the localized handoff copy (`mainStrings().agent.handoff`).
 * Kept as `AgentService.run` so the IPC layer's call site is unchanged.
 */
export default class AgentService {
  static run(prompt: string, hooks: AgentRunHooks): Promise<AgentRunSummary> {
    const handoff = mainStrings().agent.handoff;
    return runAgent(prompt, hooks, {
      browserHost,
      journal: journalHost,
      activeTabUrl,
      handoffStrings: { captcha: handoff.captcha, twofa: handoff.twofa },
    });
  }
}
