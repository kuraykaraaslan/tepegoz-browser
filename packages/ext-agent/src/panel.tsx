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
  TokenUsageSnapshot,
} from './types';

/**
 * Agent extension panel (the "Do" surface). Streams every agent step from the host (observability-
 * first), runs a task on the active tab, and — depending on the autonomy level — either raises the
 * blocking HITL approval + plan-preview modals (`ask`) or auto-approves them (`act`/`auto`). Talks to
 * the host ONLY through the injected {@link AgentHostApi}. Chrome resembles the Claude desktop agent:
 * header, model selector, conversation, risk banner, composer with an autonomy dropdown + send button.
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

const AUTONOMY_LEVELS: readonly AgentAutonomy[] = ['ask', 'act', 'auto'];

/** Should the panel auto-approve a gated tool call at this level? `auto` = always; `act` = only
 *  low-risk (non-biometric) tools; `ask` = never (the modal is shown). */
function autoApprovesTool(level: AgentAutonomy, biometric: boolean): boolean {
  if (level === 'auto') return true;
  if (level === 'act') return !biometric;
  return false;
}

// ---- Inline icons (no icon dependency) --------------------------------------------------------
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
const AUTONOMY_ICON: Record<AgentAutonomy, (p: { className?: string }) => ReactNode> = {
  ask: AskIcon,
  act: ActIcon,
  auto: AutoIcon,
};
const GaugeIcon = ({ className }: { className?: string }) => (
  <Svg className={className}>
    <path d="M12 13l3.5-3.5M4 19a8 8 0 1116 0" />
  </Svg>
);

/** Event kinds whose message is model prose → rendered as markdown (links + code + file paths). */
const PROSE_KINDS = new Set<AgentEvent['kind']>(['done', 'error', 'handoff']);

/** Notice severities for the dynamic notices strip above the composer (extensible: quota/limit/…). */
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

/** The notices shown above the composer. Today only the autonomy risk (level-aware); the caller can
 *  append future notices (quota, limits, …) to the returned list. */
function buildNotices(
  autonomy: AgentAutonomy,
  risk: { actTitle: string; actBody: string; autoTitle: string; autoBody: string },
): Notice[] {
  if (autonomy === 'ask') return [];
  const auto = autonomy === 'auto';
  return [
    {
      id: 'autonomy',
      severity: auto ? 'danger' : 'warning',
      title: auto ? risk.autoTitle : risk.actTitle,
      body: auto ? risk.autoBody : risk.actBody,
    },
  ];
}

// ---- A tiny dropdown (trigger + popover, closes on outside click) ------------------------------
function Dropdown({
  trigger,
  direction = 'down',
  align = 'left',
  className,
  children,
}: {
  trigger: ReactNode;
  direction?: 'down' | 'up';
  align?: 'left' | 'right';
  className?: string;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<CSSProperties>({});

  // Anchor the popover to the trigger with FIXED positioning so it can't be clipped by an ancestor's
  // `overflow-hidden` (the agent sidebar wraps this panel in one). Recomputed on open + scroll/resize.
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
    const onReflow = (): void => {
      place();
    };
    window.addEventListener('resize', onReflow);
    window.addEventListener('scroll', onReflow, true);
    return () => {
      window.removeEventListener('resize', onReflow);
      window.removeEventListener('scroll', onReflow, true);
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
    return () => {
      document.removeEventListener('mousedown', onDoc);
    };
  }, [open]);

  return (
    <div className={cn('relative', className)}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          setOpen((v) => !v);
        }}
        className="flex items-center gap-1 rounded-md px-2 py-1 text-sm text-text-primary hover:bg-surface-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
      >
        {trigger}
        <ChevronDown className="h-3 w-3 text-text-secondary" />
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            style={pos}
            className="min-w-[11rem] max-w-[16rem] rounded-lg border border-border bg-surface-raised p-1 shadow-lg"
          >
            {children(() => setOpen(false))}
          </div>,
          document.body,
        )}
    </div>
  );
}

/** One conversation turn: the user's message plus the agent events streamed for its run. Turns
 *  accumulate in the thread (chat flow); "New task" clears them and resets the host's memory. */
interface Turn {
  id: string;
  prompt: string;
  runId: string | null;
  events: AgentEvent[];
}

export function AgentPanel({ api, onClose }: AgentPanelProps) {
  const a = useT(agentDict);
  const c = useT(coreDict);
  const [prompt, setPrompt] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [running, setRunning] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [approval, setApproval] = useState<AgentApprovalRequest | null>(null);
  const [planPreview, setPlanPreview] = useState<AgentPlanPreview | null>(null);
  const [skipIds, setSkipIds] = useState<Set<string>>(new Set());
  const [tokens, setTokens] = useState<TokenUsageSnapshot | null>(null);
  const [config, setConfig] = useState<AgentConfig | null>(null);
  // Per-turn reasoning disclosure open-state (a turn's "thinking" section expands independently).
  const [openReasoning, setOpenReasoning] = useState<Set<string>>(new Set());
  const listRef = useRef<HTMLDivElement | null>(null);
  // The event callbacks are registered once; read the LIVE autonomy level through a ref to avoid a
  // stale closure (and to not re-subscribe on every level change).
  const autonomyRef = useRef<AgentAutonomy>('ask');
  const autonomy: AgentAutonomy = config?.autonomy ?? 'ask';
  useEffect(() => {
    autonomyRef.current = autonomy;
  }, [autonomy]);

  useEffect(() => {
    const offEvent = api.onAgentEvent((e) => {
      setRunId(e.runId);
      // Runs are sequential (main serializes them), so every event belongs to the most recent turn —
      // append it there and record the turn's runId from the first event that lands.
      setTurns((prev) => {
        const last = prev.length - 1;
        const turn = prev[last];
        if (turn === undefined) return prev;
        const updated: Turn = { ...turn, runId: turn.runId ?? e.runId, events: [...turn.events, e] };
        return [...prev.slice(0, last), updated];
      });
      if (e.kind === 'done' || e.kind === 'error') setRunning(false);
    });
    const offApproval = api.onAgentApprovalRequest((req) => {
      if (autoApprovesTool(autonomyRef.current, req.biometric)) {
        api.respondAgentApproval(req.approvalId, true);
      } else {
        setApproval(req);
      }
    });
    const offPlan = api.onAgentPlanPreview((preview) => {
      if (autonomyRef.current !== 'ask') {
        api.respondAgentPlan(preview.planId, true, []); // auto-approve the whole plan
      } else {
        setSkipIds(new Set());
        setPlanPreview(preview);
      }
    });
    const offTokens = api.onTokenUsage((usage) => {
      setTokens(usage);
    });
    // Do NOT seed from getTokenUsage(): the ledger is process-global and only resets when a run STARTS,
    // so a freshly opened / "New task" panel would show the PREVIOUS run's total (stale). The counter is
    // driven purely by the live onTokenUsage push, so it reflects the current task and is 0 until a run.
    void api.getAgentConfig().then(setConfig, () => {
      /* config unavailable — selectors fall back to defaults */
    });
    return () => {
      offEvent();
      offApproval();
      offPlan();
      offTokens();
    };
  }, [api]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [turns]);

  function onRun(): void {
    const text = prompt.trim();
    if (text.length === 0 || running) return;
    // Push the user's message as a new turn (it "moves up" into the thread) — prior turns stay.
    const id = `turn-${String(Date.now())}-${String(turns.length)}`;
    setTurns((prev) => [...prev, { id, prompt: text, runId: null, events: [] }]);
    setPrompt('');
    setRunning(true);
    void api
      .runAgent(text)
      .catch(() => {
        /* the failure is also surfaced as an 'error' event on the turn */
      })
      .finally(() => {
        setRunning(false);
      });
  }

  function onCancel(): void {
    if (runId !== null) api.cancelAgent(runId);
    setRunning(false);
  }

  function onNewTask(): void {
    if (running) onCancel();
    api.newAgentConversation(); // reset the host's conversation memory so the next run starts fresh
    setTurns([]);
    setPrompt('');
    setApproval(null);
    setPlanPreview(null);
    setOpenReasoning(new Set());
    setTokens(null); // reset the per-task token counter (the next run reseeds it)
  }

  function toggleReasoning(id: string): void {
    setOpenReasoning((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function chooseProvider(provider: AIProvider): void {
    setConfig((prev) => (prev !== null ? { ...prev, provider } : prev));
    void api
      .setAgentProvider(provider)
      .then(() => api.getAgentConfig())
      .then(setConfig, () => {
        /* keep the optimistic value */
      });
  }

  function chooseAutonomy(level: AgentAutonomy): void {
    setConfig((prev) => (prev !== null ? { ...prev, autonomy: level } : prev));
    void api.setAgentAutonomy(level).catch(() => {
      /* keep the optimistic value */
    });
  }

  function chooseEffort(level: AgentEffort): void {
    setConfig((prev) => (prev !== null ? { ...prev, effort: level } : prev));
    void api.setAgentEffort(level).catch(() => {
      /* keep the optimistic value */
    });
  }

  function respond(approved: boolean): void {
    if (approval !== null) {
      api.respondAgentApproval(approval.approvalId, approved);
      setApproval(null);
    }
  }

  function toggleStep(id: string): void {
    setSkipIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function respondPlan(approved: boolean): void {
    if (planPreview === null) return;
    if (approved) {
      api.respondAgentPlan(planPreview.planId, true, [...skipIds]);
    } else {
      api.respondAgentPlan(planPreview.planId, false);
      setRunning(false);
    }
    setPlanPreview(null);
  }

  const turnViews = turns.map((t) => ({ turn: t, visible: t.events }));

  const currentLabel =
    config?.choices.find((ch) => ch.provider === config.provider)?.label ?? a.modelLabel;
  const availableChoices = config?.choices.filter((ch) => ch.available) ?? [];
  const AutonomyGlyph = AUTONOMY_ICON[autonomy];
  const effort: AgentEffort = config?.effort ?? 'high';
  // Dynamic notices strip above the composer — extensible (quota / limits / errors can push here later).
  const notices = buildNotices(autonomy, a.risk);

  return (
    <div
      className={cn(
        'absolute inset-0 flex flex-col bg-surface-base',
        autonomy !== 'ask' &&
          'outline outline-2 -outline-offset-2 outline-dashed outline-amber-500/70',
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
        <Dropdown
          trigger={<span className="font-medium">{currentLabel}</span>}
          align="left"
        >
          {(close) =>
            availableChoices.length === 0 ? (
              <p className="px-2 py-1.5 text-xs text-text-secondary">{a.modelLabel}</p>
            ) : (
              availableChoices.map((ch) => (
                <button
                  key={ch.provider}
                  type="button"
                  onClick={() => {
                    chooseProvider(ch.provider);
                    close();
                  }}
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

      {/* Conversation thread — each turn is the user's message followed by the agent's response */}
      <div ref={listRef} className="flex-1 overflow-y-auto overflow-x-hidden p-3 text-sm" aria-live="polite">
        {turns.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center text-text-secondary">
            <SparkIcon className="mb-2 h-6 w-6 text-text-disabled" />
            <p>{running ? a.running : a.noActiveTasks}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {turnViews.map(({ turn, visible }, ti) => {
              // Split this turn's revealed events into the collapsible reasoning and the action timeline.
              const reasoning = visible.filter((e) => e.kind === 'plan' || e.kind === 'decision');
              const timeline = visible.filter((e) => e.kind !== 'plan' && e.kind !== 'decision');
              const open = openReasoning.has(turn.id);
              const isLast = ti === turnViews.length - 1;
              // The turn is still working while it's the active one, a run is in flight, and no terminal
              // (done/error) event has landed yet.
              const working =
                isLast && running && !turn.events.some((e) => e.kind === 'done' || e.kind === 'error');
              return (
                <div key={turn.id} className="space-y-1.5">
                  {/* User message — the text "moves up" from the composer into the thread. */}
                  <div className="flex justify-end">
                    <div
                      className="max-w-[85%] rounded-2xl rounded-br-sm bg-amber-500/15 px-3 py-2 text-text-primary [overflow-wrap:anywhere]"
                      aria-label={a.thread.you}
                    >
                      {turn.prompt}
                    </div>
                  </div>

                  {/* Collapsible reasoning (plan goal + per-step rationale) — the "thinking" disclosure. */}
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
                        <span>{open ? a.reasoning.hide : a.reasoning.show}</span>
                      </button>
                      {open && (
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
                  {timeline.map((e, i) => {
                    const isProse = PROSE_KINDS.has(e.kind);
                    return (
                      <div
                        key={`${String(e.ts)}-${String(i)}`}
                        className="flex items-start gap-2 rounded px-1"
                      >
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
                            // `overflow-wrap:anywhere` breaks long unbreakable strings (URLs, hashes) so
                            // they wrap within the panel instead of forcing horizontal scroll.
                            <span className="text-text-primary [overflow-wrap:anywhere]">{e.message}</span>
                          )}
                          {e.detail !== undefined && e.detail.length > 0 && (
                            <span
                              className={cn(
                                'text-text-secondary [overflow-wrap:anywhere]',
                                isProse ? 'mt-0.5 block text-xs' : 'ml-1',
                              )}
                            >
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

      {/* Dynamic notices strip — flush above the composer at the same width. Extensible: the autonomy
          risk is one notice today; quota / limit / other alerts can push into `notices` later. */}
      {notices.length > 0 && (
        <div className="space-y-1.5 px-3 pb-2">
          {notices.map((n) => (
            <div
              key={n.id}
              className={cn('rounded-md border px-3 py-2 text-xs', NOTICE_STYLE[n.severity])}
            >
              <span className="font-semibold">{n.title}</span> {n.body}
            </div>
          ))}
        </div>
      )}

      {/* Composer */}
      <form
        className="px-3 pb-2"
        onSubmit={(e) => {
          e.preventDefault();
          onRun();
        }}
      >
        <div className="rounded-lg border border-border bg-surface-raised focus-within:ring-2 focus-within:ring-border-focus">
          <textarea
            rows={2}
            value={prompt}
            disabled={running}
            placeholder={a.runPlaceholder}
            aria-label={a.runPlaceholder}
            onChange={(e) => {
              setPrompt(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                onRun();
              }
            }}
            className="block w-full resize-none bg-transparent px-3 py-2 text-sm text-text-primary placeholder:text-text-disabled focus:outline-none disabled:opacity-60"
          />
          <div className="flex items-center justify-between px-2 pb-2">
            <div className="flex min-w-0 items-center gap-0.5">
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
                AUTONOMY_LEVELS.map((level) => {
                  const Glyph = AUTONOMY_ICON[level];
                  return (
                    <button
                      key={level}
                      type="button"
                      onClick={() => {
                        chooseAutonomy(level);
                        close();
                      }}
                      className="flex w-full items-start gap-2 rounded-md px-2 py-2 text-left hover:bg-surface-overlay"
                    >
                      <Glyph className="mt-0.5 h-4 w-4 shrink-0 text-text-secondary" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-text-primary">
                          {a.autonomy[level].title}
                        </span>
                        <span className="block text-xs text-text-secondary">
                          {a.autonomy[level].desc}
                        </span>
                      </span>
                      {autonomy === level && (
                        <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                      )}
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
                    onClick={() => {
                      chooseEffort(level);
                      close();
                    }}
                    className="flex w-full items-start gap-2 rounded-md px-2 py-2 text-left hover:bg-surface-overlay"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-text-primary">
                        {a.effort[level].title}
                      </span>
                      <span className="block text-xs text-text-secondary">{a.effort[level].desc}</span>
                    </span>
                    {effort === level && (
                      <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                    )}
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
                disabled={prompt.trim().length === 0}
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

      {planPreview !== null && (
        <Modal
          open
          onClose={() => respondPlan(false)}
          title={a.planTitle}
          ariaLabel={a.planTitle}
          size="md"
          closeOnBackdrop={false}
        >
          <p className="mt-1 text-xs text-text-secondary">{a.planBody}</p>
          {planPreview.goal.length > 0 && (
            <p className="mt-2 text-sm text-text-primary">{planPreview.goal}</p>
          )}
          <ul className="mt-3 space-y-1.5 overflow-auto">
            {planPreview.steps.map((step, i) => (
              <li key={step.id}>
                <label className="flex cursor-pointer items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={!skipIds.has(step.id)}
                    onChange={() => {
                      toggleStep(step.id);
                    }}
                    className="mt-0.5"
                  />
                  <span className="min-w-0">
                    <span className="font-mono text-text-primary">
                      {String(i + 1)}. {step.tool}
                    </span>
                    {step.rationale.length > 0 && (
                      <span className="ml-1 break-words text-text-secondary">— {step.rationale}</span>
                    )}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => respondPlan(false)} className={BTN_GHOST}>
              {c.common.cancel}
            </button>
            <button
              type="button"
              onClick={() => respondPlan(true)}
              disabled={skipIds.size === planPreview.steps.length}
              className={BTN_PRIMARY}
            >
              {a.planRun}
            </button>
          </div>
        </Modal>
      )}

      {approval !== null && (
        <Modal
          open
          onClose={() => respond(false)}
          title={a.approvalTitle}
          ariaLabel={a.approvalTitle}
          size="sm"
          closeOnBackdrop={false}
        >
          <p className="mt-2 text-sm text-text-secondary">{a.approvalBody}</p>
          <p className="mt-3 font-mono text-sm text-text-primary">{approval.toolName}</p>
          <p className="text-xs text-text-secondary">{approval.reason}</p>
          <pre className="mt-2 max-h-24 overflow-auto rounded bg-surface-base p-2 text-xs text-text-secondary">
            {approval.argsPreview}
          </pre>
          {approval.biometric && <p className="mt-2 text-xs text-amber-600">{a.biometricNote}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => respond(false)} className={BTN_GHOST}>
              {a.deny}
            </button>
            <button type="button" onClick={() => respond(true)} className={BTN_PRIMARY}>
              {a.approve}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
