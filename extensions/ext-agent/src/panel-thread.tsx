import type { MutableRefObject } from 'react';
import { cn } from '@tepegoz/ui';
import { Markdown } from '@tepegoz/markdown';
import type { AgentStrings } from './i18n';
import type { AgentHostApi } from './types';
import { GaugeIcon, KIND_DOT, SparkIcon } from './panel-icons';
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
}

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
}: PanelThreadProps) {
  return (
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
                      onClick={() => onToggleSteps(turn.id)}
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
