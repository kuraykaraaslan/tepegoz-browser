import type { MutableRefObject } from 'react';
import { cn } from '@tepegoz/ui';
import { Markdown } from '@tepegoz/markdown';
import type { AgentStrings } from './i18n';
import type { CompletionOutcome } from '@tepegoz/shared-types';
import type { AgentHostApi } from './types';
import { KIND_DOT, SparkIcon } from './panel-icons';
import { MessageCopyButton } from './panel-copy-button';
import { StepFeed } from './panel-step-feed';
import { toolIntent } from './panel-tool-intent';
import { humanizeStepMessage } from './panel-step-message';
import { TurnApprovals, TurnMeta } from './panel-turn-meta';
import { PROSE_KINDS, STEP_KINDS, type Turn } from './panel-state';

/**
 * The Agent panel's conversation thread: an empty-state placeholder or the per-turn transcript (user
 * bubble, collapsible reasoning + progress groups, streamed response, live "working" indicator).
 * Extracted from `panel.tsx` (ADR-0010 file-size split).
 */
interface PanelThreadProps {
  a: AgentStrings;
  api: AgentHostApi;
  listRef: MutableRefObject<HTMLDivElement | null>;
  turns: Turn[];
  running: boolean;
  /**
   * The tail of the model output currently streaming (ADR-0025). Rendered as PLAIN TEXT inside the
   * working indicator — it is unsettled, unvalidated model output, so it is never markdown, never a
   * link, and never carries authority. It disappears the moment a settled event supersedes it.
   */
  liveDelta: string;
  openReasoning: Set<string>;
  openSteps: Set<string>;
  onToggleReasoning: (turnId: string) => void;
  onToggleSteps: (turnId: string) => void;
  /** Re-run a failed turn's prompt (S8). */
  onRetry: (prompt: string) => void;
}

/**
 * Escalating weight, so the three verdicts are distinguishable at a glance rather than only by text.
 * Token-styled surfaces with a semantic accent, matching the risk-tier tones in `panel-modals`.
 */
const EVIDENCE_TONE: Record<CompletionOutcome, string> = {
  verified: 'bg-green-500/10 text-green-600 dark:text-green-400',
  attempted_unverified: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  contradicted: 'bg-red-500/10 text-red-600 dark:text-red-400',
};

export function PanelThread({
  a,
  api,
  listRef,
  turns,
  running,
  liveDelta,
  openReasoning,
  openSteps,
  onToggleReasoning,
  onToggleSteps,
  onRetry,
}: PanelThreadProps) {
  return (
    <div
      ref={listRef}
      className="flex-1 overflow-y-auto overflow-x-hidden p-3 text-sm"
      aria-live="polite"
    >
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
            // A turn whose last event is `error` failed outright (S8 "failure gets a reason" → the
            // next action). A graceful `done`-with-stop-reason is softer and gets no button.
            const failed = turn.events.at(-1)?.kind === 'error';
            const working =
              isLast &&
              running &&
              !turn.events.some((e) => e.kind === 'done' || e.kind === 'error');
            return (
              <div key={turn.id} className="space-y-1.5">
                <div className="group flex items-start justify-end gap-1">
                  <MessageCopyButton
                    text={turn.prompt}
                    label={a.thread.copyMessage}
                    copiedLabel={a.thread.copied}
                  />
                  <div
                    className="max-w-[85%] rounded-2xl rounded-br-sm bg-amber-500/15 px-3 py-2 text-text-primary [overflow-wrap:anywhere]"
                    aria-label={a.thread.you}
                  >
                    {turn.prompt}
                  </div>
                </div>

                <TurnMeta turn={turn} a={a} />

                {reasoning.length > 0 && (
                  <div className="rounded-md border border-border bg-surface-raised">
                    <button
                      type="button"
                      onClick={() => onToggleReasoning(turn.id)}
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
                          <li
                            key={`r-${String(e.ts)}-${String(i)}`}
                            className="[overflow-wrap:anywhere]"
                          >
                            {/* A `decision` event's message is the bare tool id — show what the
                                call is FOR, raw id on hover. `plan` text is left as written. */}
                            <span
                              className="text-text-primary"
                              title={e.kind === 'decision' ? e.message : undefined}
                            >
                              {e.kind === 'decision' ? toolIntent(e.message, a) : e.message}
                            </span>
                            {e.detail !== undefined && e.detail.length > 0 && (
                              <span className="ml-1">— {e.detail}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                <StepFeed
                  steps={steps}
                  open={stepsOpen}
                  working={working}
                  latestMessage={
                    latestStep === undefined
                      ? undefined
                      : humanizeStepMessage(latestStep.kind, latestStep.message, a)
                  }
                  onToggle={() => onToggleSteps(turn.id)}
                  a={a}
                />

                {turn.approvals !== undefined && <TurnApprovals approvals={turn.approvals} a={a} />}

                {response.map((e, i) => {
                  const isProse = PROSE_KINDS.has(e.kind);
                  return (
                    <div
                      key={`${String(e.ts)}-${String(i)}`}
                      className="group flex items-start gap-2 rounded px-1"
                    >
                      <span
                        className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', KIND_DOT[e.kind])}
                      />
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
                          <span className="text-text-primary [overflow-wrap:anywhere]">
                            {e.message}
                          </span>
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
                      {isProse && e.message.length > 0 && (
                        <MessageCopyButton
                          text={e.message}
                          label={a.thread.copyMessage}
                          copiedLabel={a.thread.copied}
                        />
                      )}
                    </div>
                  );
                })}
                {/* What the evidence supported (S4 → S8). Rendered only when the run reached a
                    verdict: an absent chip means "no verdict", which is not the same as "unconfirmed"
                    and must not be drawn as if it were. */}
                {turn.completionOutcome !== undefined && (
                  <div className="px-1 pt-1">
                    <span
                      title={a.evidence[`${turn.completionOutcome}Hint`]}
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]',
                        EVIDENCE_TONE[turn.completionOutcome],
                      )}
                    >
                      {a.evidence[turn.completionOutcome]}
                    </span>
                  </div>
                )}
                {failed && !running && (
                  <div className="px-1 pt-0.5">
                    <button
                      type="button"
                      onClick={() => onRetry(turn.prompt)}
                      className="rounded-md border border-border px-2 py-1 text-xs text-text-secondary hover:bg-surface-overlay hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                    >
                      {a.thread.retry}
                    </button>
                  </div>
                )}
                {working && (
                  <div className="flex items-start gap-2 px-1 text-xs text-text-secondary">
                    <span className="mt-1 h-2 w-2 shrink-0 animate-pulse rounded-full bg-amber-500" />
                    <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                      {liveDelta.length > 0 ? liveDelta : a.thread.working}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
