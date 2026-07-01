import { useEffect, useRef, useState } from 'react';
import { cn } from '@tepegoz/ui';
import type { Resources } from '@tepegoz/i18n';
import type {
  AgentApprovalRequest,
  AgentEvent,
  AgentHostApi,
  AgentPlanPreview,
  TokenUsageSnapshot,
} from './types';

/**
 * Agent extension panel (the "Do" surface). Streams every agent step from the host (observability-
 * first), runs a task on the active tab, and raises the blocking HITL approval + editable plan-preview
 * modals. It talks to the host ONLY through the injected {@link AgentHostApi} — no global bridge — so
 * the extension is decoupled from apps/desktop.
 */
interface AgentPanelProps {
  t: Resources;
  api: AgentHostApi;
  onClose: () => void;
}

const KIND_DOT: Record<AgentEvent['kind'], string> = {
  plan: 'bg-text-secondary',
  step_start: 'bg-text-secondary',
  step_ok: 'bg-green-500',
  step_error: 'bg-red-500',
  awaiting_approval: 'bg-amber-500',
  done: 'bg-green-600',
  error: 'bg-red-600',
};

const BTN_PRIMARY =
  'rounded-md bg-surface-overlay px-3 py-1.5 text-sm font-medium text-text-primary ' +
  'hover:opacity-90 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus';
const BTN_GHOST =
  'rounded-md border border-border px-3 py-1.5 text-sm text-text-secondary ' +
  'hover:bg-surface-overlay hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus';

export function AgentPanel({ t, api, onClose }: AgentPanelProps) {
  const [prompt, setPrompt] = useState('');
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [running, setRunning] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [approval, setApproval] = useState<AgentApprovalRequest | null>(null);
  const [planPreview, setPlanPreview] = useState<AgentPlanPreview | null>(null);
  const [skipIds, setSkipIds] = useState<Set<string>>(new Set());
  const [tokens, setTokens] = useState<TokenUsageSnapshot | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const offEvent = api.onAgentEvent((e) => {
      setRunId(e.runId);
      setEvents((prev) => [...prev, e]);
      if (e.kind === 'done' || e.kind === 'error') setRunning(false);
    });
    const offApproval = api.onAgentApprovalRequest((req) => {
      setApproval(req);
    });
    const offPlan = api.onAgentPlanPreview((preview) => {
      setSkipIds(new Set());
      setPlanPreview(preview);
    });
    const offTokens = api.onTokenUsage((usage) => {
      setTokens(usage);
    });
    void api.getTokenUsage().then(setTokens, () => {
      /* usage unavailable — indicator stays hidden */
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
  }, [events]);

  function onRun(): void {
    const text = prompt.trim();
    if (text.length === 0 || running) return;
    setEvents([]);
    setRunning(true);
    void api
      .runAgent(text)
      .catch(() => {
        /* the failure is also surfaced as an 'error' event in the list */
      })
      .finally(() => {
        setRunning(false);
      });
  }

  function onCancel(): void {
    if (runId !== null) api.cancelAgent(runId);
    setRunning(false);
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

  return (
    <div className="absolute inset-0 flex flex-col bg-surface-base">
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <h2 className="text-sm font-semibold text-text-primary">{t.agentConsole.title}</h2>
        <div className="flex items-center gap-3">
          {tokens !== null && (
            <span
              className="rounded-full bg-surface-overlay px-2 py-0.5 text-xs text-text-secondary"
              title={`${t.agentConsole.tokens}: ${String(tokens.inputTokens)} in / ${String(tokens.outputTokens)} out`}
            >
              {t.agentConsole.tokens}: {tokens.totalTokens.toLocaleString()}
            </span>
          )}
          <button type="button" onClick={onClose} aria-label={t.window.close} className={BTN_GHOST}>
            {t.window.close}
          </button>
        </div>
      </div>

      <form
        className="flex gap-2 border-b border-border p-3"
        onSubmit={(e) => {
          e.preventDefault();
          onRun();
        }}
      >
        <input
          type="text"
          value={prompt}
          disabled={running}
          placeholder={t.agentConsole.runPlaceholder}
          aria-label={t.agentConsole.runPlaceholder}
          onChange={(e) => {
            setPrompt(e.target.value);
          }}
          className="h-9 flex-1 rounded-md border border-border bg-surface-raised px-3 text-sm text-text-primary placeholder:text-text-disabled focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:opacity-60"
        />
        {running ? (
          <button type="button" onClick={onCancel} className={BTN_GHOST}>
            {t.common.cancel}
          </button>
        ) : (
          <button type="submit" disabled={prompt.trim().length === 0} className={BTN_PRIMARY}>
            {t.agentConsole.run}
          </button>
        )}
      </form>

      <div ref={listRef} className="flex-1 space-y-1.5 overflow-auto p-3 text-sm" aria-live="polite">
        {events.length === 0 ? (
          <p className="text-text-secondary">
            {running ? t.agentConsole.running : t.agentConsole.noActiveTasks}
          </p>
        ) : (
          events.map((e, i) => (
            <div key={`${String(e.ts)}-${String(i)}`} className="flex items-start gap-2">
              <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', KIND_DOT[e.kind])} />
              <div className="min-w-0">
                <span className="text-text-primary">{e.message}</span>
                {e.detail !== undefined && e.detail.length > 0 && (
                  <span className="ml-1 break-words text-text-secondary">— {e.detail}</span>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <p className="border-t border-border px-3 py-2 text-xs text-text-secondary">
        {t.agentConsole.aiDisclaimer}
      </p>

      {planPreview !== null && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={t.agentConsole.planTitle}
        >
          <div className="flex max-h-full w-full max-w-md flex-col rounded-lg border border-border bg-surface-raised p-4 shadow-xl">
            <h3 className="text-sm font-semibold text-text-primary">{t.agentConsole.planTitle}</h3>
            <p className="mt-1 text-xs text-text-secondary">{t.agentConsole.planBody}</p>
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
                        <span className="ml-1 break-words text-text-secondary">
                          — {step.rationale}
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => respondPlan(false)} className={BTN_GHOST}>
                {t.common.cancel}
              </button>
              <button
                type="button"
                onClick={() => respondPlan(true)}
                disabled={skipIds.size === planPreview.steps.length}
                className={BTN_PRIMARY}
              >
                {t.agentConsole.planRun}
              </button>
            </div>
          </div>
        </div>
      )}

      {approval !== null && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={t.agentConsole.approvalTitle}
        >
          <div className="w-full max-w-sm rounded-lg border border-border bg-surface-raised p-4 shadow-xl">
            <h3 className="text-sm font-semibold text-text-primary">{t.agentConsole.approvalTitle}</h3>
            <p className="mt-2 text-sm text-text-secondary">{t.agentConsole.approvalBody}</p>
            <p className="mt-3 font-mono text-sm text-text-primary">{approval.toolName}</p>
            <p className="text-xs text-text-secondary">{approval.reason}</p>
            <pre className="mt-2 max-h-24 overflow-auto rounded bg-surface-base p-2 text-xs text-text-secondary">
              {approval.argsPreview}
            </pre>
            {approval.biometric && (
              <p className="mt-2 text-xs text-amber-600">{t.agentConsole.biometricNote}</p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => respond(false)} className={BTN_GHOST}>
                {t.agentConsole.deny}
              </button>
              <button type="button" onClick={() => respond(true)} className={BTN_PRIMARY}>
                {t.agentConsole.approve}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
