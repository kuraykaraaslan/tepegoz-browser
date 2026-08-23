import { cn } from '@tepegoz/ui';
import { coreDict } from '@tepegoz/i18n';
import { useT } from '@tepegoz/i18n/react';
import { agentDict } from './i18n';
import type { AgentHostApi } from './types';
import { ScheduleTaskModal } from './schedule-task-modal';
import { buildNotices } from './panel-state';
import { useAgentSession } from './panel-session';
import { useAgentActions } from './panel-actions';
import { useAgentAttachments } from './panel-attachments';
import { PanelHeader } from './panel-header';
import { PanelThread } from './panel-thread';
import { PanelComposer } from './panel-composer';
import { choiceSummary } from './panel-run-config';
import { PanelModals } from './panel-modals';
import { PANEL_BOUNDS_ATTR } from './panel-dropdown-place';

/**
 * Agent extension panel (the "Do" surface). Each tab group gets its own agent session; the panel
 * switches context automatically when the active tab's group changes. Attachments (selected text,
 * files, screenshots) can be added as chips above the composer before sending a message.
 *
 * The panel is split (ADR-0010) across `panel-*` siblings: `useAgentSession` owns per-group state and
 * host subscriptions, `useAgentActions` owns the behaviour handlers, and the header / thread / composer /
 * modals are extracted presentational components. This file wires them together.
 */
interface AgentPanelProps {
  api: AgentHostApi;
  onClose: () => void;
}

export function AgentPanel({ api, onClose }: AgentPanelProps) {
  const a = useT(agentDict);
  const c = useT(coreDict);

  const {
    config,
    setConfig,
    dismissedNotices,
    setDismissedNotices,
    scheduleOpen,
    setScheduleOpen,
    logExported,
    setLogExported,
    exportError,
    setExportError,
    activeGroupId,
    listRef,
    autonomy,
    activeState,
    mutateGroup,
    mutateActive,
  } = useAgentSession(api);

  const actions = useAgentActions({
    api,
    a,
    config,
    setConfig,
    activeGroupId,
    activeState,
    mutateGroup,
    mutateActive,
    setLogExported,
    setExportError,
  });
  const attach = useAgentAttachments({ api, a, mutateActive });

  // ---- Derived values --------------------------------------------------------------------------
  const notices = buildNotices(autonomy, a.risk).filter((n) => !dismissedNotices.has(n.id));

  const {
    turns,
    approval,
    planPreview,
    running,
    paused,
    skipIds,
    tokens,
    openReasoning,
    openSteps,
    liveDelta,
    prompt,
    attachments,
    expandedFiles,
  } = activeState;

  // Gear tooltip: a one-glance summary of the current run config (provider · model · autonomy · effort),
  // shown on hover so the values are visible without opening the popover.
  const configChoice = config?.choices.find((ch) => ch.id === config.selectedId);
  const providerTip = configChoice === undefined ? a.noKeys : choiceSummary(configChoice);
  const modelTip =
    config === null || config.model === ''
      ? a.modelAuto
      : (config.models[config.provider].find((m) => m.id === config.model)?.label ?? config.model);
  const configTooltip =
    config === null
      ? a.config
      : [
          `${a.provider}: ${providerTip}`,
          `${a.modelLabel}: ${modelTip}`,
          `${a.autonomyLabel}: ${a.autonomy[config.autonomy].title}`,
          `${a.effort.title}: ${a.effort[config.effort].title}`,
        ].join('\n');

  return (
    <div
      // Bounds every menu portalled out of this panel: the page beside it is a native view painted over
      // all chrome DOM, so a menu that overflows this rect would vanish behind it (see placeMenu).
      {...{ [PANEL_BOUNDS_ATTR]: '' }}
      className={cn(
        'absolute inset-0 flex flex-col bg-surface-base',
        autonomy !== 'ask' &&
          'outline outline-2 -outline-offset-2 outline-dashed outline-amber-500/70',
      )}
    >
      <PanelHeader
        a={a}
        c={c}
        api={api}
        activeGroupId={activeGroupId}
        tokens={tokens}
        turnCount={turns.length}
        logExported={logExported}
        exportError={exportError}
        onExportLog={actions.onExportLog}
        onNewTask={actions.onNewTask}
        onClose={onClose}
        onSchedule={() => setScheduleOpen(true)}
        onOpenConversation={actions.onOpenConversation}
        onDismissExportError={() => {
          setExportError(null);
        }}
      />

      <PanelThread
        a={a}
        api={api}
        listRef={listRef}
        turns={turns}
        running={running}
        liveDelta={liveDelta}
        openReasoning={openReasoning}
        openSteps={openSteps}
        onToggleReasoning={actions.toggleReasoning}
        onToggleSteps={actions.toggleSteps}
      />

      <PanelComposer
        a={a}
        c={c}
        notices={notices}
        onDismissNotice={(id) => setDismissedNotices((prev) => new Set([...prev, id]))}
        attachments={attachments}
        expandedFiles={expandedFiles}
        prompt={prompt}
        running={running}
        paused={paused}
        config={config}
        configTooltip={configTooltip}
        mutateActive={mutateActive}
        onSubmit={actions.onSubmit}
        onCancel={actions.onCancel}
        onPauseResume={actions.onPauseResume}
        onContinueInBackground={actions.onContinueInBackground}
        removeAttachment={attach.removeAttachment}
        onAttachSelection={() => void attach.onAttachSelection()}
        onAttachFiles={() => void attach.onAttachFiles()}
        onAttachScreenshot={() => void attach.onAttachScreenshot()}
        chooseChoice={actions.chooseChoice}
        chooseModel={actions.chooseModel}
        chooseAutonomy={actions.chooseAutonomy}
        chooseEffort={actions.chooseEffort}
        chooseStrictGuard={actions.chooseStrictGuard}
        skillsApi={api}
        onUseSkill={actions.useSkill}
      />

      <PanelModals
        a={a}
        c={c}
        planPreview={planPreview}
        approval={approval}
        skipIds={skipIds}
        onRespondPlan={actions.respondPlan}
        onToggleStep={actions.toggleStep}
        onRespond={actions.respond}
      />

      <ScheduleTaskModal
        api={api}
        open={scheduleOpen}
        groupId={activeGroupId}
        fallbackFirstPrompt={turns[0]?.prompt ?? ''}
        onClose={() => setScheduleOpen(false)}
      />
    </div>
  );
}
