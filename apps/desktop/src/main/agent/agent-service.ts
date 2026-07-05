import { runAgent, type AgentRunHooks, type AgentRunSummary } from '@tepegoz/agent-runtime';
import type { CanonMessage } from '@tepegoz/model-gateway';
import TabManager from '../tabs';
import { browserHost } from './browser-host';
import AgentTabGroup from './agent-tab-group';
import { journalHost } from './journal-host';
import { mainStrings } from '../lib/i18n-main';
import { llamaEngine } from '../local-inference/llama-engine.electron';
import ModelManager from '../model-catalog/model-manager.electron';

export type { PlanApprovalDecision, AgentRunHooks, AgentRunSummary } from '@tepegoz/agent-runtime';

/**
 * Conversation memory (source of truth): every turn appends the user's prompt and the agent's closing
 * summary (or a short note when a run produced none) so a follow-up message — including pronoun
 * references like "research this" — runs with the earlier context. Bounded to the last
 * {@link MAX_HISTORY_MESSAGES} messages to cap token growth; reset by {@link AgentService.newConversation}.
 */
let conversation: CanonMessage[] = [];
const MAX_HISTORY_MESSAGES = 20;

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
  static async run(prompt: string, hooks: AgentRunHooks): Promise<AgentRunSummary> {
    const handoff = mainStrings().agent.handoff;
    // Fallback name for any tab group the agent opens this run (the model usually supplies its own).
    AgentTabGroup.setTopic(prompt);
    // Snapshot the memory BEFORE this turn so the run sees only prior turns as context.
    const history = conversation;
    const summary = await runAgent(
      prompt,
      hooks,
      {
        browserHost,
        journal: journalHost,
        activeTabUrl,
        handoffStrings: { captcha: handoff.captcha, twofa: handoff.twofa },
        // On-device inference seam: the node-llama-cpp engine + the selected downloaded model.
        localInference: { engine: llamaEngine(), resolveModel: () => ModelManager.resolveModel() },
      },
      history,
    );
    // Record EVERY turn (not only summarized ones) so the subject survives into the next follow-up even
    // when a run is refused / handed off / capped. Balanced user+assistant pair keeps provider message
    // alternation valid; bounded by MAX_HISTORY_MESSAGES.
    const note =
      summary.summary !== undefined && summary.summary.length > 0
        ? summary.summary
        : `(no result — task stopped: ${summary.stoppedReason})`;
    const turn: CanonMessage[] = [
      { role: 'user', content: prompt },
      { role: 'assistant', content: note },
    ];
    conversation = [...conversation, ...turn].slice(-MAX_HISTORY_MESSAGES);
    return summary;
  }

  /** Clears conversation memory AND the agent's per-conversation tab group so the next run starts a
   *  fresh thread and a fresh group (host "New task"). */
  static newConversation(): void {
    conversation = [];
    AgentTabGroup.reset();
  }
}
