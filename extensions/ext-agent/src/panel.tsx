import { useEffect, useRef, useState } from 'react';
import { Modal, cn } from '@tepegoz/ui';
import { Markdown } from '@tepegoz/markdown';
import { coreDict } from '@tepegoz/i18n';
import { useT } from '@tepegoz/i18n/react';
import type { AIProvider } from '@tepegoz/shared-types/providers';
import { agentDict } from './i18n';
import { AGENT_EFFORT_LEVELS } from './types';
import type {
  AgentAutonomy,
  AgentConfig,
  AgentEvent,
  AgentEffort,
  AgentHostApi,
  AgentConversationDetail,
} from './types';
import { ConversationHistoryDropdown } from './conversation-history-dropdown';
import { Dropdown } from './panel-dropdown';
import {
  AUTONOMY_ICON,
  CameraIcon,
  CheckIcon,
  CloseIcon,
  CursorIcon,
  GaugeIcon,
  KIND_DOT,
  NewTaskIcon,
  PaperclipIcon,
  SendIcon,
  SparkIcon,
  StopIcon,
} from './panel-icons';
import {
  AUTONOMY_DISABLED,
  AUTONOMY_LEVELS_ALL,
  NOTICE_STYLE,
  PROSE_KINDS,
  STEP_KINDS,
  autoApprovesTool,
  buildNotices,
  emptyGroupState,
  attachmentMeta,
  serializeAttachments,
  stateFromConversation,
  type Attachment,
  type GroupState,
  type Turn,
} from './panel-state';

/**
 * Agent extension panel (the "Do" surface). Each tab group gets its own agent session; the panel
 * switches context automatically when the active tab's group changes. Attachments (selected text,
 * files, screenshots) can be added as chips above the composer before sending a message.
 */
interface AgentPanelProps {
  api: AgentHostApi;
  onClose: () => void;
}

const BTN_PRIMARY =
  'rounded-md bg-surface-overlay px-3 py-1.5 text-sm font-medium text-text-primary ' +
  'hover:opacity-90 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus';
const BTN_GHOST =
  'rounded-md border border-border px-3 py-1.5 text-sm text-text-secondary ' +
  'hover:bg-surface-overlay hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus';
const ICON_BTN =
  'rounded-md p-1.5 text-text-secondary hover:bg-surface-overlay hover:text-text-primary ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus';

export function AgentPanel({ api, onClose }: AgentPanelProps) {
  const a = useT(agentDict);
  const c = useT(coreDict);
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [dismissedNotices, setDismissedNotices] = useState<Set<string>>(new Set());
  const [savingTask, setSavingTask] = useState(false);

  // Active tab-group id — the agent session key.
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);

  // Per-group state: keyed by groupId.
  const [groupStates, setGroupStates] = useState<Map<string, GroupState>>(new Map());

  const listRef = useRef<HTMLDivElement | null>(null);
  const autonomyRef = useRef<AgentAutonomy>('ask');
  const autonomy: AgentAutonomy = config?.autonomy ?? 'ask';
  useEffect(() => { autonomyRef.current = autonomy; }, [autonomy]);

  // On mount: ensure the active tab is in a group and get the groupId.
  useEffect(() => {
    void api.ensureActiveGroup().then((gid) => {
      setActiveGroupId(gid);
    }, () => { /* no active tab */ });
  }, [api]);

  // Subscribe to active-group changes (when user switches tab groups).
  useEffect(() => {
    return api.onActiveGroupChange((gid) => {
      if (gid !== null) {
        // Ensure group exists in the state map (create empty entry if first visit).
        setGroupStates((prev) => {
          if (prev.has(gid)) return prev;
          const next = new Map(prev);
          next.set(gid, emptyGroupState());
          return next;
        });
      }
      setActiveGroupId(gid);
    });
  }, [api]);

  useEffect(() => {
    if (activeGroupId === null) return;
    let cancelled = false;
    void api.getCurrentAgentConversation(activeGroupId).then((detail) => {
      if (cancelled || detail === null) return;
      mutateGroup(activeGroupId, () => stateFromConversation(detail));
    }, () => {});
    return () => { cancelled = true; };
  }, [api, activeGroupId]);

  // Helpers to read/mutate the active group's state.
  const activeState: GroupState = activeGroupId !== null
    ? (groupStates.get(activeGroupId) ?? emptyGroupState())
    : emptyGroupState();

  function mutateGroup(groupId: string, fn: (s: GroupState) => GroupState): void {
    setGroupStates((prev) => {
      const cur = prev.get(groupId) ?? emptyGroupState();
      const next = new Map(prev);
      next.set(groupId, fn(cur));
      return next;
    });
  }

  function mutateActive(fn: (s: GroupState) => GroupState): void {
    if (activeGroupId === null) return;
    mutateGroup(activeGroupId, fn);
  }

  // Subscribe to agent events, approvals, plan previews, and token usage.
  useEffect(() => {
    const offEvent = api.onAgentEvent((e) => {
      setGroupStates((prev) => {
        const gid = e.groupId;
        const cur = prev.get(gid) ?? emptyGroupState();
        const last = cur.turns.length - 1;
        const turn = cur.turns[last];
        if (turn === undefined) return prev;
        const updated: Turn = { ...turn, runId: turn.runId ?? e.runId, events: [...turn.events, e] };
        const next = new Map(prev);
        const newTurns = [...cur.turns.slice(0, last), updated];
        const isTerminal = e.kind === 'done' || e.kind === 'error';
        next.set(gid, { ...cur, turns: newTurns, running: isTerminal ? false : cur.running, runId: isTerminal ? null : cur.runId });
        return next;
      });
    });

    const offApproval = api.onAgentApprovalRequest((req) => {
      if (autoApprovesTool(autonomyRef.current, req.biometric)) {
        api.respondAgentApproval(req.approvalId, true);
      } else {
        setGroupStates((prev) => {
          const gid = req.groupId;
          const cur = prev.get(gid) ?? emptyGroupState();
          const next = new Map(prev);
          next.set(gid, { ...cur, approval: req });
          return next;
        });
      }
    });

    const offPlan = api.onAgentPlanPreview((preview) => {
      if (autonomyRef.current !== 'ask') {
        api.respondAgentPlan(preview.planId, true, []);
      } else {
        setGroupStates((prev) => {
          const gid = preview.groupId;
          const cur = prev.get(gid) ?? emptyGroupState();
          const next = new Map(prev);
          next.set(gid, { ...cur, planPreview: preview, skipIds: new Set() });
          return next;
        });
      }
    });

    const offTokens = api.onTokenUsage((usage) => {
      // Token usage is associated with the active group.
      setGroupStates((prev) => {
        const gid = activeGroupId;
        if (gid === null) return prev;
        const cur = prev.get(gid) ?? emptyGroupState();
        const next = new Map(prev);
        next.set(gid, { ...cur, tokens: usage });
        return next;
      });
    });

    void api.getAgentConfig().then(setConfig, () => { /* config unavailable */ });
    return () => { offEvent(); offApproval(); offPlan(); offTokens(); };
  }, [api, activeGroupId]);

  // Auto-scroll conversation to bottom on new events.
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [activeState.turns]);

  // Reset dismissed notices when autonomy changes.
  useEffect(() => {
    setDismissedNotices(new Set());
  }, [autonomy]);

  function onRun(): void {
    const text = prompt.trim();
    if (text.length === 0 || activeState.running || activeGroupId === null) return;
    const groupId = activeGroupId;
    const fullPrompt = serializeAttachments(attachments, text);
    const id = `turn-${String(Date.now())}-${String(activeState.turns.length)}`;
    const newTurn: Turn = { id, prompt: text, runId: null, events: [] };
    mutateGroup(groupId, (s) => ({
      ...s,
      turns: [...s.turns, newTurn],
      running: true,
      prompt: '',
      attachments: [],
      expandedFiles: new Set(),
    }));
    void api.runAgent({
      prompt: fullPrompt,
      groupId,
      displayPrompt: text,
      attachmentMeta: attachmentMeta(attachments),
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
    mutateActive((s) => ({ ...s, running: false }));
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

  function chooseAutonomy(level: AgentAutonomy): void {
    setConfig((prev) => (prev !== null ? { ...prev, autonomy: level } : prev));
    void api.setAgentAutonomy(level).catch(() => {});
  }

  function chooseEffort(level: AgentEffort): void {
    setConfig((prev) => (prev !== null ? { ...prev, effort: level } : prev));
    void api.setAgentEffort(level).catch(() => {});
  }

  function respond(approved: boolean): void {
    const { approval } = activeState;
    if (approval !== null) {
      api.respondAgentApproval(approval.approvalId, approved);
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

  // ---- Attachment actions -----------------------------------------------------------------------
  function removeAttachment(id: string): void {
    mutateActive((s) => {
      const nextExpanded = new Set(s.expandedFiles);
      nextExpanded.delete(id);
      return { ...s, attachments: s.attachments.filter((a) => a.id !== id), expandedFiles: nextExpanded };
    });
  }

  function addAttachment(att: Attachment): void {
    mutateActive((s) => ({ ...s, attachments: [...s.attachments, att] }));
  }

  async function onAttachSelection(): Promise<void> {
    try {
      const text = await api.capturePageSelection();
      if (text.trim().length === 0) return;
      const lineCount = text.split('\n').length;
      addAttachment({
        id: `sel-${String(Date.now())}`,
        kind: 'selection',
        label: `${String(lineCount)} ${a.attach.lines}`,
        content: text,
      });
    } catch { /* ignore */ }
  }

  async function onAttachFiles(): Promise<void> {
    try {
      const files = await api.pickAgentFiles();
      for (const f of files) {
        addAttachment({
          id: `file-${String(Date.now())}-${f.name}`,
          kind: 'file',
          label: f.name,
          content: f.content,
        } satisfies Attachment);
      }
    } catch { /* ignore */ }
  }

  async function onAttachScreenshot(): Promise<void> {
    try {
      const dataUrl = await api.capturePageScreenshot();
      if (dataUrl === null) return;
      addAttachment({
        id: `shot-${String(Date.now())}`,
        kind: 'screenshot',
        label: a.attach.screenshot,
        content: dataUrl,
      });
    } catch { /* ignore */ }
  }

  async function onSaveAsTask(): Promise<void> {
    const text = prompt.trim();
    if (api.saveCurrentPromptAsTask === undefined || text.length === 0 || savingTask) return;
    setSavingTask(true);
    try {
      await api.saveCurrentPromptAsTask({
        prompt: text,
        name: text.split(/\r?\n/, 1)[0]?.slice(0, 80),
      });
    } finally {
      setSavingTask(false);
    }
  }

  // ---- Derived values --------------------------------------------------------------------------
  const currentLabel = config?.choices.find((ch) => ch.provider === config.provider)?.label ?? a.modelLabel;
  const availableChoices = config?.choices.filter((ch) => ch.available) ?? [];
  const AutonomyGlyph = AUTONOMY_ICON[autonomy];
  const effort: AgentEffort = config?.effort ?? 'high';
  const notices = buildNotices(autonomy, a.risk).filter((n) => !dismissedNotices.has(n.id));

  const {
    turns, approval, planPreview, running, skipIds, tokens, openReasoning, openSteps,
    prompt, attachments, expandedFiles,
  } = activeState;

  return (
    <div
      className={cn(
        'absolute inset-0 flex flex-col bg-surface-base',
        autonomy !== 'ask' && 'outline outline-2 -outline-offset-2 outline-dashed outline-amber-500/70',
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <SparkIcon className="h-4 w-4 text-amber-500" />
          <h2 className="text-sm font-semibold text-text-primary">{a.title}</h2>
        </div>
        <div className="flex items-center gap-1.5">
          {tokens !== null && tokens.totalTokens > 0 && (
            <span
              className="rounded-full bg-surface-overlay px-2 py-0.5 text-xs text-text-secondary"
              title={`${a.tokens}: ${String(tokens.inputTokens)} in / ${String(tokens.outputTokens)} out`}
            >
              {a.tokens}: {tokens.totalTokens.toLocaleString()}
            </span>
          )}
          <ConversationHistoryDropdown
            api={api}
            groupId={activeGroupId}
            labels={a.history}
            iconButtonClassName={ICON_BTN}
            onOpenConversation={onOpenConversation}
          />
          <button type="button" onClick={onNewTask} aria-label={a.newTask} title={a.newTask} className={ICON_BTN}>
            <NewTaskIcon className="h-4 w-4" />
          </button>
          <button type="button" onClick={onClose} aria-label={c.window.close} title={c.window.close} className={ICON_BTN}>
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Model selector row */}
      <div className="flex items-center border-b border-border px-2 py-1">
        <Dropdown trigger={<span className="font-medium">{currentLabel}</span>} align="left">
          {(close) =>
            availableChoices.length === 0 ? (
              <p className="px-2 py-1.5 text-xs text-text-secondary">{a.modelLabel}</p>
            ) : (
              availableChoices.map((ch) => (
                <button
                  key={ch.provider}
                  type="button"
                  onClick={() => { chooseProvider(ch.provider); close(); }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-text-primary hover:bg-surface-overlay"
                >
                  <span className="flex-1">{ch.label}</span>
                  {config?.provider === ch.provider && <CheckIcon className="h-4 w-4 text-amber-500" />}
                </button>
              ))
            )
          }
        </Dropdown>
      </div>

      {/* Conversation thread */}
      <div ref={listRef} className="flex-1 overflow-y-auto overflow-x-hidden p-3 text-sm" aria-live="polite">
        {turns.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center text-text-secondary">
            <SparkIcon className="mb-2 h-6 w-6 text-text-disabled" />
            <p>{running ? a.running : a.noActiveTasks}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {turns.map((turn, ti) => {
              const visible = turn.events;
              const reasoning = visible.filter((e) => e.kind === 'plan' || e.kind === 'decision');
              const steps = visible.filter((e) => STEP_KINDS.has(e.kind));
              const response = visible.filter(
                (e) => !STEP_KINDS.has(e.kind) && e.kind !== 'plan' && e.kind !== 'decision',
              );
              const reasoningOpen = openReasoning.has(turn.id);
              const stepsOpen = openSteps.has(turn.id);
              const latestStep = steps.at(-1);
              const isLast = ti === turns.length - 1;
              const working = isLast && running && !turn.events.some((e) => e.kind === 'done' || e.kind === 'error');
              return (
                <div key={turn.id} className="space-y-1.5">
                  <div className="flex justify-end">
                    <div
                      className="max-w-[85%] rounded-2xl rounded-br-sm bg-amber-500/15 px-3 py-2 text-text-primary [overflow-wrap:anywhere]"
                      aria-label={a.thread.you}
                    >
                      {turn.prompt}
                    </div>
                  </div>

                  {reasoning.length > 0 && (
                    <div className="rounded-md border border-border bg-surface-raised">
                      <button
                        type="button"
                        onClick={() => toggleReasoning(turn.id)}
                        className="flex w-full items-center justify-between px-2 py-1.5 text-xs text-text-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                      >
                        <span className="flex items-center gap-1.5">
                          <SparkIcon className="h-3.5 w-3.5 text-indigo-400" />
                          {a.reasoning.title} ({reasoning.length})
                        </span>
                        <span>{reasoningOpen ? a.reasoning.hide : a.reasoning.show}</span>
                      </button>
                      {reasoningOpen && (
                        <ul className="space-y-1 border-t border-border px-3 py-2 text-xs text-text-secondary">
                          {reasoning.map((e, i) => (
                            <li key={`r-${String(e.ts)}-${String(i)}`} className="[overflow-wrap:anywhere]">
                              <span className="text-text-primary">{e.message}</span>
                              {e.detail !== undefined && e.detail.length > 0 && (
                                <span className="ml-1">— {e.detail}</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                  {steps.length > 0 && (
                    <div className="rounded-md border border-border bg-surface-raised">
                      <button
                        type="button"
                        onClick={() => toggleSteps(turn.id)}
                        className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-xs text-text-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                      >
                        <span className="flex min-w-0 items-center gap-1.5">
                          <GaugeIcon className="h-3.5 w-3.5 shrink-0 text-text-secondary" />
                          <span className="shrink-0">{a.progress} ({steps.length})</span>
                          {working && !stepsOpen && latestStep !== undefined && (
                            <span className="truncate text-text-disabled">· {latestStep.message}</span>
                          )}
                        </span>
                        <span className="shrink-0">{stepsOpen ? a.reasoning.hide : a.reasoning.show}</span>
                      </button>
                      {stepsOpen && (
                        <ul className="space-y-1 border-t border-border px-2 py-2">
                          {steps.map((e, i) => (
                            <li key={`s-${String(e.ts)}-${String(i)}`} className="flex items-start gap-2 px-1">
                              <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', KIND_DOT[e.kind])} />
                              <div className="min-w-0 flex-1">
                                <span className="text-text-primary [overflow-wrap:anywhere]">{e.message}</span>
                                {e.detail !== undefined && e.detail.length > 0 && (
                                  <span className="ml-1 text-text-secondary [overflow-wrap:anywhere]">— {e.detail}</span>
                                )}
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                  {response.map((e, i) => {
                    const isProse = PROSE_KINDS.has(e.kind);
                    return (
                      <div key={`${String(e.ts)}-${String(i)}`} className="flex items-start gap-2 rounded px-1">
                        <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', KIND_DOT[e.kind])} />
                        <div className="min-w-0 flex-1">
                          {isProse ? (
                            <Markdown
                              source={e.message}
                              onOpenLink={(u) => api.createTab(u)}
                              onOpenFile={(p) => api.openAgentFile(p)}
                              copyLabel={a.copy}
                              className="text-text-primary"
                            />
                          ) : (
                            <span className="text-text-primary [overflow-wrap:anywhere]">{e.message}</span>
                          )}
                          {e.detail !== undefined && e.detail.length > 0 && (
                            <span className={cn('text-text-secondary [overflow-wrap:anywhere]', isProse ? 'mt-0.5 block text-xs' : 'ml-1')}>
                              — {e.detail}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {working && (
                    <div className="flex items-center gap-2 px-1 text-xs text-text-secondary">
                      <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-amber-500" />
                      {a.thread.working}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Notices strip */}
      {notices.length > 0 && (
        <div className="space-y-1.5 px-3 pt-2 pb-1">
          {notices.map((n) => (
            <div key={n.id} className={cn('flex items-start gap-2 rounded-md border px-3 py-2 text-xs', NOTICE_STYLE[n.severity])}>
              <span className="flex-1"><span className="font-semibold">{n.title}</span> {n.body}</span>
              <button
                type="button"
                aria-label={c.window.close}
                onClick={() => setDismissedNotices((prev) => new Set([...prev, n.id]))}
                className="shrink-0 opacity-60 hover:opacity-100 focus-visible:outline-none"
              >
                <CloseIcon className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Composer */}
      <form
        className="px-3 pt-1.5 pb-2"
        onSubmit={(e) => { e.preventDefault(); onRun(); }}
      >
        <div className="rounded-lg border border-border bg-surface-raised focus-within:ring-2 focus-within:ring-border-focus">
          {/* Attachment chips */}
          {attachments.length > 0 && (
            <div className="flex flex-col gap-1 px-3 pt-2 pb-1">
              {attachments.map((att) => {
                const isFile = att.kind === 'file';
                const expanded = isFile && expandedFiles.has(att.id);
                return (
                  <div key={att.id} className="flex flex-col gap-0.5">
                    <span className="flex items-center gap-1 rounded-full bg-surface-overlay px-2 py-0.5 text-xs text-text-secondary self-start">
                      {att.kind === 'selection' && <CursorIcon className="h-3 w-3 shrink-0" />}
                      {att.kind === 'file' && <PaperclipIcon className="h-3 w-3 shrink-0" />}
                      {att.kind === 'screenshot' && <CameraIcon className="h-3 w-3 shrink-0" />}
                      {isFile ? (
                        <button
                          type="button"
                          onClick={() => mutateActive((s) => {
                            const next = new Set(s.expandedFiles);
                            if (next.has(att.id)) next.delete(att.id); else next.add(att.id);
                            return { ...s, expandedFiles: next };
                          })}
                          className="max-w-[14rem] truncate text-left underline-offset-2 hover:underline focus-visible:outline-none"
                        >
                          {att.label}
                        </button>
                      ) : (
                        <span className="max-w-[10rem] truncate">{att.label}</span>
                      )}
                      <button
                        type="button"
                        aria-label={a.attach.removeLabel}
                        onClick={() => removeAttachment(att.id)}
                        className="ml-0.5 rounded-full p-0.5 hover:bg-surface-base focus-visible:outline-none"
                      >
                        <CloseIcon className="h-2.5 w-2.5" />
                      </button>
                    </span>
                    {expanded && (
                      <pre className="max-h-40 overflow-auto rounded-md bg-surface-base px-2 py-1.5 text-xs text-text-secondary [overflow-wrap:anywhere] whitespace-pre-wrap">
                        {att.content}
                      </pre>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <textarea
            rows={2}
            value={prompt}
            disabled={running}
            placeholder={a.runPlaceholder}
            aria-label={a.runPlaceholder}
            onChange={(e) => { const value = e.target.value; mutateActive((s) => ({ ...s, prompt: value })); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onRun(); }
            }}
            className="block w-full resize-none bg-transparent px-3 py-2 text-sm text-text-primary placeholder:text-text-disabled focus:outline-none disabled:opacity-60"
          />
          <div className="flex items-center justify-between px-2 pb-2">
            <div className="flex min-w-0 items-center gap-0.5">
              {/* Attachment buttons */}
              <button
                type="button"
                title={a.attach.addSelection}
                aria-label={a.attach.addSelection}
                onClick={() => { void onAttachSelection(); }}
                className={cn(ICON_BTN, 'p-1')}
              >
                <CursorIcon className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                title={a.attach.addFile}
                aria-label={a.attach.addFile}
                onClick={() => { void onAttachFiles(); }}
                className={cn(ICON_BTN, 'p-1')}
              >
                <PaperclipIcon className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                title={a.attach.addScreenshot}
                aria-label={a.attach.addScreenshot}
                onClick={() => { void onAttachScreenshot(); }}
                className={cn(ICON_BTN, 'p-1')}
              >
                <CameraIcon className="h-3.5 w-3.5" />
              </button>

              <div className="mx-1 h-4 w-px bg-border" />

              {api.saveCurrentPromptAsTask !== undefined && (
                <button
                  type="button"
                  title={a.saveAsTask}
                  aria-label={a.saveAsTask}
                  disabled={prompt.trim().length === 0 || savingTask}
                  onClick={() => { void onSaveAsTask(); }}
                  className={cn(ICON_BTN, 'text-xs disabled:opacity-40')}
                >
                  {a.saveAsTask}
                </button>
              )}

              <Dropdown
                direction="up"
                trigger={
                  <span className="flex items-center gap-1.5">
                    <AutonomyGlyph className="h-3.5 w-3.5 text-amber-500" />
                    {a.autonomy[autonomy].title}
                  </span>
                }
              >
                {(close) =>
                  AUTONOMY_LEVELS_ALL.map((level) => {
                    const Glyph = AUTONOMY_ICON[level];
                    const disabled = AUTONOMY_DISABLED.has(level);
                    return (
                      <button
                        key={level}
                        type="button"
                        disabled={disabled}
                        onClick={disabled ? undefined : () => { chooseAutonomy(level); close(); }}
                        className={
                          'flex w-full items-start gap-2 rounded-md px-2 py-2 text-left' +
                          (disabled ? ' cursor-not-allowed opacity-40' : ' hover:bg-surface-overlay')
                        }
                      >
                        <Glyph className={cn('mt-0.5 h-4 w-4 shrink-0', disabled ? 'text-red-500/50' : 'text-text-secondary')} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-text-primary">{a.autonomy[level].title}</span>
                          <span className="block text-xs text-text-secondary">{a.autonomy[level].desc}</span>
                        </span>
                        {autonomy === level && <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />}
                      </button>
                    );
                  })
                }
              </Dropdown>
              <Dropdown
                direction="up"
                trigger={
                  <span className="flex items-center gap-1.5">
                    <GaugeIcon className="h-3.5 w-3.5 text-text-secondary" />
                    {a.effort[effort].title}
                  </span>
                }
              >
                {(close) =>
                  AGENT_EFFORT_LEVELS.map((level) => (
                    <button
                      key={level}
                      type="button"
                      onClick={() => { chooseEffort(level); close(); }}
                      className="flex w-full items-start gap-2 rounded-md px-2 py-2 text-left hover:bg-surface-overlay"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-text-primary">{a.effort[level].title}</span>
                        <span className="block text-xs text-text-secondary">{a.effort[level].desc}</span>
                      </span>
                      {effort === level && <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />}
                    </button>
                  ))
                }
              </Dropdown>
            </div>

            {running ? (
              <button
                type="button"
                onClick={onCancel}
                aria-label={a.stop}
                title={a.stop}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-overlay text-text-primary hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
              >
                <StopIcon className="h-3.5 w-3.5" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={prompt.trim().length === 0 && attachments.length === 0}
                aria-label={a.send}
                title={a.send}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500 text-white hover:opacity-90 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
              >
                <SendIcon className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </form>

      {/* Footer disclaimer */}
      <p className="px-3 pb-2 text-center text-xs text-text-secondary">{a.aiDisclaimer}</p>

      {/* Plan preview modal */}
      {planPreview !== null && (
        <Modal open onClose={() => respondPlan(false)} title={a.planTitle} ariaLabel={a.planTitle} size="md" closeOnBackdrop={false}>
          <p className="mt-1 text-xs text-text-secondary">{a.planBody}</p>
          {planPreview.goal.length > 0 && <p className="mt-2 text-sm text-text-primary">{planPreview.goal}</p>}
          <ul className="mt-3 space-y-1.5 overflow-auto">
            {planPreview.steps.map((step, i) => (
              <li key={step.id}>
                <label className="flex cursor-pointer items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={!skipIds.has(step.id)}
                    onChange={() => { toggleStep(step.id); }}
                    className="mt-0.5"
                  />
                  <span className="min-w-0">
                    <span className="font-mono text-text-primary">{String(i + 1)}. {step.tool}</span>
                    {step.rationale.length > 0 && (
                      <span className="ml-1 break-words text-text-secondary">— {step.rationale}</span>
                    )}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => respondPlan(false)} className={BTN_GHOST}>{c.common.cancel}</button>
            <button type="button" onClick={() => respondPlan(true)} disabled={skipIds.size === planPreview.steps.length} className={BTN_PRIMARY}>
              {a.planRun}
            </button>
          </div>
        </Modal>
      )}

      {/* HITL approval modal */}
      {approval !== null && (
        <Modal open onClose={() => respond(false)} title={a.approvalTitle} ariaLabel={a.approvalTitle} size="sm" closeOnBackdrop={false}>
          <p className="mt-2 text-sm text-text-secondary">{a.approvalBody}</p>
          <p className="mt-3 font-mono text-sm text-text-primary">{approval.toolName}</p>
          <p className="text-xs text-text-secondary">{approval.reason}</p>
          <pre className="mt-2 max-h-24 overflow-auto rounded bg-surface-base p-2 text-xs text-text-secondary">
            {approval.argsPreview}
          </pre>
          {approval.biometric && <p className="mt-2 text-xs text-amber-600">{a.biometricNote}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => respond(false)} className={BTN_GHOST}>{a.deny}</button>
            <button type="button" onClick={() => respond(true)} className={BTN_PRIMARY}>{a.approve}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
