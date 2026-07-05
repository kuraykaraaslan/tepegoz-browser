import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { cn, Modal } from '@tepegoz/ui';
import { Markdown } from '@tepegoz/markdown';
import { coreDict } from '@tepegoz/i18n';
import { useT } from '@tepegoz/i18n/react';
import type { AIProvider } from '@tepegoz/shared-types/providers';
import { agentDict } from './i18n';
import { AGENT_EFFORT_LEVELS } from './types';
import type {
  AgentApprovalRequest,
  AgentAutonomy,
  AgentConfig,
  AgentEffort,
  AgentEvent,
  AgentHostApi,
  AgentPlanPreview,
  Attachment,
  TokenUsageSnapshot,
} from './types';

/**
 * Agent extension panel (the "Do" surface). Each tab group gets its own agent session; the panel
 * switches context automatically when the active tab's group changes. Attachments (selected text,
 * files, screenshots) can be added as chips above the composer before sending a message.
 */
interface AgentPanelProps {
  api: AgentHostApi;
  onClose: () => void;
}

const KIND_DOT: Record<AgentEvent['kind'], string> = {
  plan: 'bg-text-secondary',
  decision: 'bg-indigo-400',
  step_start: 'bg-text-secondary',
  step_ok: 'bg-green-500',
  step_error: 'bg-red-500',
  awaiting_approval: 'bg-amber-500',
  input_action: 'bg-sky-400',
  handoff: 'bg-amber-500',
  done: 'bg-green-600',
  error: 'bg-red-600',
};

const BTN_PRIMARY =
  'rounded-md bg-surface-overlay px-3 py-1.5 text-sm font-medium text-text-primary ' +
  'hover:opacity-90 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus';
const BTN_GHOST =
  'rounded-md border border-border px-3 py-1.5 text-sm text-text-secondary ' +
  'hover:bg-surface-overlay hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus';
const ICON_BTN =
  'rounded-md p-1.5 text-text-secondary hover:bg-surface-overlay hover:text-text-primary ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus';

const AUTONOMY_LEVELS_ALL: readonly AgentAutonomy[] = ['ask', 'act', 'auto', 'dangerous'];
const AUTONOMY_DISABLED = new Set<AgentAutonomy>(['dangerous']);

function autoApprovesTool(level: AgentAutonomy, biometric: boolean): boolean {
  if (level === 'auto') return true;
  if (level === 'act') return !biometric;
  return false;
}

// ---- Inline icons -------------------------------------------------------------------------------
function Svg({ children, className }: { children: ReactNode; className?: string | undefined }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}
const SparkIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor">
    <path d="M12 2l1.7 6.3L20 10l-6.3 1.7L12 18l-1.7-6.3L4 10l6.3-1.7z" />
  </svg>
);
const CloseIcon = ({ className }: { className?: string }) => <Svg className={className}><path d="M6 6l12 12M18 6L6 18" /></Svg>;
const NewTaskIcon = ({ className }: { className?: string }) => <Svg className={className}><path d="M12 5v14M5 12h14" /></Svg>;
const SendIcon = ({ className }: { className?: string }) => <Svg className={className}><path d="M12 19V5M6 11l6-6 6 6" /></Svg>;
const StopIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
);
const ChevronDown = ({ className }: { className?: string }) => <Svg className={className}><path d="M6 9l6 6 6-6" /></Svg>;
const CheckIcon = ({ className }: { className?: string }) => <Svg className={className}><path d="M20 6L9 17l-5-5" /></Svg>;
const AskIcon = ({ className }: { className?: string }) => <Svg className={className}><path d="M8 12V7a2 2 0 114 0M6 12V9a2 2 0 114 0m0-1a2 2 0 114 0v1m0-1a2 2 0 114 0v6a5 5 0 01-5 5h-2a5 5 0 01-4-2l-3-4a2 2 0 013-2l2 1.5" /></Svg>;
const ActIcon = ({ className }: { className?: string }) => <Svg className={className}><path d="M4 5l7 7-7 7M13 5l7 7-7 7" /></Svg>;
const AutoIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor"><path d="M13 2L3 14h7l-1 8 10-12h-7z" /></svg>
);
const DangerousIcon = ({ className }: { className?: string }) => (
  <Svg className={className}><path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></Svg>
);
const AUTONOMY_ICON: Record<AgentAutonomy, (p: { className?: string }) => ReactNode> = {
  ask: AskIcon,
  act: ActIcon,
  auto: AutoIcon,
  dangerous: DangerousIcon,
};
const GaugeIcon = ({ className }: { className?: string }) => (
  <Svg className={className}>
    <path d="M12 13l3.5-3.5M4 19a8 8 0 1116 0" />
  </Svg>
);
const PaperclipIcon = ({ className }: { className?: string }) => (
  <Svg className={className}><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" /></Svg>
);
const CursorIcon = ({ className }: { className?: string }) => (
  <Svg className={className}><path d="M4 4l7.07 17 2.51-7.39L21 11.07z" /></Svg>
);
const CameraIcon = ({ className }: { className?: string }) => (
  <Svg className={className}><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" /><circle cx="12" cy="13" r="4" /></Svg>
);

/** Event kinds whose message is model prose → rendered as markdown. */
const PROSE_KINDS = new Set<AgentEvent['kind']>(['done', 'error', 'handoff']);

/** Tool-call progress kinds collapsed into the per-turn "Progress" group. */
const STEP_KINDS = new Set<AgentEvent['kind']>([
  'step_start', 'step_ok', 'step_error', 'awaiting_approval', 'input_action',
]);

/** Notice severities for the dynamic notices strip above the composer. */
type NoticeSeverity = 'info' | 'warning' | 'danger';
interface Notice {
  id: string;
  severity: NoticeSeverity;
  title: string;
  body: string;
}
const NOTICE_STYLE: Record<NoticeSeverity, string> = {
  info: 'border-border bg-surface-raised text-text-secondary',
  warning: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  danger: 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300',
};

function buildNotices(
  autonomy: AgentAutonomy,
  risk: { actTitle: string; actBody: string; autoTitle: string; autoBody: string },
): Notice[] {
  if (autonomy === 'ask') return [];
  const auto = autonomy === 'auto';
  return [{
    id: 'autonomy',
    severity: auto ? 'danger' : 'warning',
    title: auto ? risk.autoTitle : risk.actTitle,
    body: auto ? risk.autoBody : risk.actBody,
  }];
}

// ---- Dropdown (trigger + FIXED-position popover) -----------------------------------------------
function Dropdown({
  trigger, direction = 'down', align = 'left', className, children,
}: {
  trigger: ReactNode; direction?: 'down' | 'up'; align?: 'left' | 'right';
  className?: string; children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<CSSProperties>({});

  const place = useCallback((): void => {
    const el = triggerRef.current;
    if (el === null) return;
    const r = el.getBoundingClientRect();
    const next: CSSProperties = { position: 'fixed', zIndex: 50 };
    if (direction === 'up') next.bottom = window.innerHeight - r.top + 4;
    else next.top = r.bottom + 4;
    if (align === 'right') next.right = window.innerWidth - r.right;
    else next.left = r.left;
    setPos(next);
  }, [direction, align]);

  useLayoutEffect(() => {
    if (!open) return undefined;
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, place]);

  useEffect(() => {
    if (!open) return undefined;
    function onDoc(e: MouseEvent): void {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) === true) return;
      if (menuRef.current?.contains(t) === true) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => { document.removeEventListener('mousedown', onDoc); };
  }, [open]);

  return (
    <div className={cn('relative', className)}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => { setOpen((v) => !v); }}
        className="flex items-center gap-1 rounded-md px-2 py-1 text-sm text-text-primary hover:bg-surface-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
      >
        {trigger}
        <ChevronDown className="h-3 w-3 text-text-secondary" />
      </button>
      {open && createPortal(
        <div ref={menuRef} style={pos} className="min-w-[11rem] max-w-[16rem] rounded-lg border border-border bg-surface-raised p-1 shadow-lg">
          {children(() => setOpen(false))}
        </div>,
        document.body,
      )}
    </div>
  );
}

/** One conversation turn: the user's message + the agent events streamed for its run. */
interface Turn {
  id: string;
  prompt: string;
  runId: string | null;
  events: AgentEvent[];
}

/** Per-group state stored in the panel (keyed by groupId). */
interface GroupState {
  turns: Turn[];
  approval: AgentApprovalRequest | null;
  planPreview: AgentPlanPreview | null;
  running: boolean;
  runId: string | null;
  skipIds: Set<string>;
  tokens: TokenUsageSnapshot | null;
  openReasoning: Set<string>;
  openSteps: Set<string>;
  prompt: string;
  attachments: Attachment[];
  expandedFiles: Set<string>;
}

function emptyGroupState(): GroupState {
  return {
    turns: [],
    approval: null,
    planPreview: null,
    running: false,
    runId: null,
    skipIds: new Set(),
    tokens: null,
    openReasoning: new Set(),
    openSteps: new Set(),
    prompt: '',
    attachments: [],
    expandedFiles: new Set(),
  };
}

/** Serialize attachment content as a markdown preamble prepended to the prompt. */
function serializeAttachments(attachments: Attachment[], prompt: string): string {
  if (attachments.length === 0) return prompt;
  const parts: string[] = [];
  for (const a of attachments) {
    if (a.kind === 'selection') {
      parts.push(`[Selected text from page]\n> ${a.content.slice(0, 8000)}`);
    } else if (a.kind === 'file') {
      parts.push(`[File: ${a.label}]\n\`\`\`\n${a.content.slice(0, 8000)}\n\`\`\``);
    } else if (a.kind === 'screenshot') {
      parts.push(`[Screenshot attached — ${a.label}]`);
    }
  }
  return `${parts.join('\n\n')}\n\n---\n\n${prompt}`;
}

export function AgentPanel({ api, onClose }: AgentPanelProps) {
  const a = useT(agentDict);
  const c = useT(coreDict);
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [dismissedNotices, setDismissedNotices] = useState<Set<string>>(new Set());

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

  // Helpers to read/mutate the active group's state.
  const activeState: GroupState = activeGroupId !== null
    ? (groupStates.get(activeGroupId) ?? emptyGroupState())
    : emptyGroupState();

  function mutateActive(fn: (s: GroupState) => GroupState): void {
    if (activeGroupId === null) return;
    setGroupStates((prev) => {
      const cur = prev.get(activeGroupId) ?? emptyGroupState();
      const next = new Map(prev);
      next.set(activeGroupId, fn(cur));
      return next;
    });
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
    const fullPrompt = serializeAttachments(attachments, text);
    const id = `turn-${String(Date.now())}-${String(activeState.turns.length)}`;
    const newTurn: Turn = { id, prompt: text, runId: null, events: [] };
    mutateActive((s) => ({
      ...s,
      turns: [...s.turns, newTurn],
      running: true,
      prompt: '',
      attachments: [],
      expandedFiles: new Set(),
    }));
    void api.runAgent({ prompt: fullPrompt, groupId: activeGroupId })
      .catch(() => { /* failure surfaced as 'error' event */ })
      .finally(() => {
        mutateActive((s) => ({ ...s, running: false }));
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
