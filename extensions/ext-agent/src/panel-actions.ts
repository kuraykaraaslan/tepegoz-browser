import type { Dispatch, SetStateAction } from 'react';
import type { AIProvider } from '@tepegoz/shared-types/providers';
import type { AgentStrings } from './i18n';
import type {
  AgentAutonomy,
  AgentConfig,
  AgentConversationDetail,
  AgentEffort,
  AgentEvent,
  AgentHostApi,
  AgentSkill,
} from './types';
import {
  attachmentMeta,
  emptyGroupState,
  serializeAttachments,
  serializeConversationLog,
  stateFromConversation,
  type GroupState,
  type Turn,
} from './panel-state';
import { skillUse } from './skills-core';

/**
 * Behaviour handlers for the Agent panel: run lifecycle (run/steer/pause/stop/new-task), config
 * choosers, plan/approval responses, transcript export, and attachment capture. Extracted from
 * `panel.tsx` (ADR-0010 file-size split). Pure orchestration over the {@link useAgentSession} state
 * container — every handler reads/writes through the injected `activeState` + `mutate*` helpers.
 */
export interface AgentActionsDeps {
  api: AgentHostApi;
  a: AgentStrings;
  config: AgentConfig | null;
  setConfig: Dispatch<SetStateAction<AgentConfig | null>>;
  activeGroupId: string | null;
  activeState: GroupState;
  mutateGroup: (groupId: string, fn: (s: GroupState) => GroupState) => void;
  mutateActive: (fn: (s: GroupState) => GroupState) => void;
  setLogExported: Dispatch<SetStateAction<boolean>>;
  setExportError: Dispatch<SetStateAction<string | null>>;
}

export function useAgentActions(deps: AgentActionsDeps) {
  const {
    api, a, config, setConfig, activeGroupId, activeState, mutateGroup, mutateActive,
    setLogExported, setExportError,
  } = deps;

  function onRun(): void {
    const text = activeState.prompt.trim();
    if (text.length === 0 || activeState.running || activeGroupId === null) return;
    const groupId = activeGroupId;
    const fullPrompt = serializeAttachments(activeState.attachments, text);
    const id = `turn-${String(Date.now())}-${String(activeState.turns.length)}`;
    const newTurn: Turn = { id, prompt: text, runId: null, events: [] };
    mutateGroup(groupId, (s) => ({
      ...s,
      turns: [...s.turns, newTurn],
      running: true,
      // Clear any run-scoped state from a previous run so this one binds its OWN id on its first event
      // (guards against a stale id/paused left when a prior run was Stopped before its terminal arrived).
      paused: false,
      runId: null,
      prompt: '',
      attachments: [],
      expandedFiles: new Set(),
      skillId: null,
    }));
    void api.runAgent({
      prompt: fullPrompt,
      groupId,
      displayPrompt: text,
      attachmentMeta: attachmentMeta(activeState.attachments),
      // Attachments change the task, so `fullPrompt` stops matching the stored skill and main simply
      // refuses the binding — the run is asked about normally. That is the intended direction.
      ...(activeState.skillId !== null ? { skillId: activeState.skillId } : {}),
    })
      .catch((err: unknown) => {
        const message = err instanceof Error && err.message.trim().length > 0
          ? err.message
          : a.runFailed;
        const localRunId = `local-${id}`;
        mutateGroup(groupId, (s) => {
          const turns = s.turns.map((turn) => {
            if (turn.id !== id) return turn;
            if (turn.events.some((event) => event.kind === 'done' || event.kind === 'error')) return turn;
            const runId = turn.runId ?? localRunId;
            const event: AgentEvent = {
              runId,
              groupId,
              kind: 'error',
              message,
              ts: Date.now(),
            };
            return { ...turn, runId, events: [...turn.events, event] };
          });
          return { ...s, turns, running: false, runId: null };
        });
      })
      .finally(() => {
        mutateGroup(groupId, (s) => ({ ...s, running: false }));
      });
  }

  function onCancel(): void {
    const { runId } = activeState;
    if (runId !== null) api.cancelAgent(runId);
    // Drop the live-run flags immediately (the backend abort event may lag): a Stopped run must not keep
    // showing pause/steer controls, and clearing runId narrows the window for a stray late event.
    mutateActive((s) => ({ ...s, running: false, paused: false, runId: null }));
  }

  /** Composer submit: while a run is active this STEERS it (folds the message into the current run);
   *  otherwise it starts a new run. */
  function onSubmit(): void {
    const text = activeState.prompt.trim();
    if (text.length === 0 || activeGroupId === null) return;
    const { running, runId } = activeState;
    if (running && runId !== null) {
      api.steerAgent(runId, text);
      mutateActive((s) => ({ ...s, prompt: '' }));
      return;
    }
    onRun();
  }

  /** Toggle hold/resume on the active run (no-op when nothing is running). */
  function onPauseResume(): void {
    const { runId, paused } = activeState;
    if (runId === null) return;
    if (paused) api.resumeAgent(runId);
    else api.pauseAgent(runId);
  }

  function onNewTask(): void {
    if (activeState.running) onCancel();
    if (activeGroupId !== null) api.newAgentConversation(activeGroupId);
    mutateActive(() => emptyGroupState());
  }

  function onOpenConversation(detail: AgentConversationDetail): void {
    if (activeGroupId === null) return;
    mutateGroup(activeGroupId, () => stateFromConversation(detail));
  }

  /** Dump the full diagnostic bundle for this session — the chat transcript plus, gathered in the main
   *  process, each group tab's perceived DOM + a PNG, the model-visible memory, the recent journal, and an
   *  environment manifest — into a ~/tepegoz/ai_agent_export_<stamp>/ folder, then flash the header star.
   *  Used to hand a complete, analyse-later snapshot of an agent run off for debugging. */
  function onExportLog(): void {
    if (activeState.turns.length === 0 || activeGroupId === null) return;
    const content = serializeConversationLog(activeState.turns, {
      exportedAt: Date.now(),
      groupId: activeGroupId,
      ...(config !== null
        ? { provider: config.provider, autonomy: config.autonomy, effort: config.effort }
        : {}),
      tokens: activeState.tokens,
    });
    const title = activeState.turns[0]?.prompt.trim() ?? '';
    const meta = {
      ...(config !== null
        ? { provider: config.provider, autonomy: config.autonomy, effort: config.effort }
        : {}),
      ...(activeState.tokens != null
        ? {
            tokens: {
              inputTokens: activeState.tokens.inputTokens,
              outputTokens: activeState.tokens.outputTokens,
              totalTokens: activeState.tokens.totalTokens,
            },
          }
        : {}),
      ...(title.length > 0 ? { title } : {}),
    };
    void api
      .exportAgentBundle({ chatContent: content, groupId: activeGroupId, meta })
      .then(() => {
        setExportError(null);
        setLogExported(true);
        setTimeout(() => { setLogExported(false); }, 2000);
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error && err.message.trim().length > 0 ? err.message : a.exportLog.failed;
        setExportError(msg);
        setTimeout(() => { setExportError(null); }, 6000);
      });
  }

  function toggleReasoning(turnId: string): void {
    mutateActive((s) => {
      const next = new Set(s.openReasoning);
      if (next.has(turnId)) next.delete(turnId); else next.add(turnId);
      return { ...s, openReasoning: next };
    });
  }

  function toggleSteps(turnId: string): void {
    mutateActive((s) => {
      const next = new Set(s.openSteps);
      if (next.has(turnId)) next.delete(turnId); else next.add(turnId);
      return { ...s, openSteps: next };
    });
  }

  function chooseProvider(provider: AIProvider): void {
    setConfig((prev) => (prev !== null ? { ...prev, provider } : prev));
    void api.setAgentProvider(provider).then(() => api.getAgentConfig()).then(setConfig, () => {});
  }

  function chooseModel(model: string): void {
    const provider = config?.provider;
    if (provider === undefined) return;
    setConfig((prev) => (prev !== null ? { ...prev, model } : prev));
    void api.setAgentModel(provider, model).then(() => api.getAgentConfig()).then(setConfig, () => {});
  }

  function chooseAutonomy(level: AgentAutonomy): void {
    setConfig((prev) => (prev !== null ? { ...prev, autonomy: level } : prev));
    void api.setAgentAutonomy(level).catch(() => {});
  }

  function chooseEffort(level: AgentEffort): void {
    setConfig((prev) => (prev !== null ? { ...prev, effort: level } : prev));
    void api.setAgentEffort(level).catch(() => {});
  }

  /** S6: the posture is DECIDED in main — this only relays the click and shows the new state. */
  function chooseStrictGuard(on: boolean): void {
    setConfig((prev) => (prev !== null ? { ...prev, strictGuard: on } : prev));
    void api.setAgentStrictGuard(on).catch(() => {});
  }

  function respond(approved: boolean, remember = false): void {
    const { approval } = activeState;
    if (approval !== null) {
      api.respondAgentApproval(approval.approvalId, approved, remember);
      mutateActive((s) => ({ ...s, approval: null }));
    }
  }

  function toggleStep(id: string): void {
    mutateActive((s) => {
      const next = new Set(s.skipIds);
      if (next.has(id)) next.delete(id); else next.add(id);
      return { ...s, skipIds: next };
    });
  }

  function respondPlan(approved: boolean): void {
    const { planPreview, skipIds } = activeState;
    if (planPreview === null) return;
    if (approved) {
      api.respondAgentPlan(planPreview.planId, true, [...skipIds]);
    } else {
      api.respondAgentPlan(planPreview.planId, false);
      mutateActive((s) => ({ ...s, running: false }));
    }
    mutateActive((s) => ({ ...s, planPreview: null }));
  }

  /**
   * Use a saved skill: fill the composer with its prompt, and open its start page if it names one.
   *
   * It deliberately does NOT call `onRun`. A stored row that could start a run would move the gesture
   * that authorises a task away from the human, which is the one thing the skills library must not do.
   * Opening the start page is the same act as clicking a bookmark — visible, and still just a page.
   */
  function useSkill(skill: AgentSkill): void {
    const use = skillUse(skill);
    mutateActive((s) => ({ ...s, prompt: use.prompt, skillId: skill.id }));
    if (use.openUrl !== null) api.createTab(use.openUrl);
  }

  return {
    onRun,
    onCancel,
    onSubmit,
    onPauseResume,
    onNewTask,
    onOpenConversation,
    onExportLog,
    toggleReasoning,
    toggleSteps,
    chooseProvider,
    chooseModel,
    chooseAutonomy,
    chooseEffort,
    chooseStrictGuard,
    respond,
    toggleStep,
    respondPlan,
    useSkill,
  };
}
