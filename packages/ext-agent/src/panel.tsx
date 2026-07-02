import { useEffect, useRef, useState } from 'react';
import { cn, Modal } from '@tepegoz/ui';
import { coreDict } from '@tepegoz/i18n';
import { useT } from '@tepegoz/i18n/react';
import { agentDict } from './i18n';
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
  api: AgentHostApi;
  onClose: () => void;
}

const KIND_DOT: Record<AgentEvent['kind'], string> = {
  plan: 'bg-text-secondary',
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

export function AgentPanel({ api, onClose }: AgentPanelProps) {
  const a = useT(agentDict);
  const c = useT(coreDict);
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
        <h2 className="text-sm font-semibold text-text-primary">{a.title}</h2>
        <div className="flex items-center gap-3">
          {tokens !== null && (
            <span
              className="rounded-full bg-surface-overlay px-2 py-0.5 text-xs text-text-secondary"
              title={`${a.tokens}: ${String(tokens.inputTokens)} in / ${String(tokens.outputTokens)} out`}
            >
              {a.tokens}: {tokens.totalTokens.toLocaleString()}
            </span>
          )}
          <button type="button" onClick={onClose} aria-label={c.window.close} className={BTN_GHOST}>
            {c.window.close}
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
          placeholder={a.runPlaceholder}
          aria-label={a.runPlaceholder}
          onChange={(e) => {
            setPrompt(e.target.value);
          }}
          className="h-9 flex-1 rounded-md border border-border bg-surface-raised px-3 text-sm text-text-primary placeholder:text-text-disabled focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:opacity-60"
        />
        {running ? (
          <button type="button" onClick={onCancel} className={BTN_GHOST}>
            {c.common.cancel}
          </button>
        ) : (
          <button type="submit" disabled={prompt.trim().length === 0} className={BTN_PRIMARY}>
            {a.run}
          </button>
        )}
      </form>

      <div
        ref={listRef}
        className="flex-1 space-y-1.5 overflow-auto p-3 text-sm"
        aria-live="polite"
      >
        {events.length === 0 ? (
          <p className="text-text-secondary">{running ? a.running : a.noActiveTasks}</p>
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
        {a.aiDisclaimer}
      </p>

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
