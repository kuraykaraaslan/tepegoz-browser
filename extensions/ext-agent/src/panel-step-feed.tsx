import { cn } from '@tepegoz/ui';
import { DEFAULT_AGENT_MAX_STEPS } from '@tepegoz/shared-types';
import type { AgentStrings } from './i18n';
import type { AgentEvent } from './types';
import { GaugeIcon, KIND_DOT } from './panel-icons';

/**
 * The collapsible per-step progress feed for one turn (S8 PR2). Driven by the `step_*` events already
 * on the turn — `step_start` / `step_ok` / `step_error`, coloured by {@link KIND_DOT}. While the turn
 * is still working the header shows the latest step inline so a collapsed feed still tells you where
 * the run is. Split out of `panel-thread.tsx` per that file's 250-line cap.
 */
export function StepFeed({
  steps,
  open,
  working,
  latestMessage,
  onToggle,
  a,
}: {
  steps: AgentEvent[];
  open: boolean;
  working: boolean;
  latestMessage: string | undefined;
  onToggle: () => void;
  a: AgentStrings;
}) {
  if (steps.length === 0) return null;
  // One `step_start` is emitted per acting step (the reactor's own per-iteration audit hook), so
  // counting them is counting the same steps the `Reactor` charges against `maxSteps`. Shown against
  // {@link DEFAULT_AGENT_MAX_STEPS} so a run that stops at the cap reads as "used its budget", not as
  // an unexplained halt (S8 PR9). A run may be launched with a custom `maxSteps`; this is the default
  // the panel has no other way to know, and the overwhelmingly common case.
  const stepsTaken = steps.filter((e) => e.kind === 'step_start').length;
  const stepNumber =
    stepsTaken || steps.filter((e) => e.kind === 'step_ok' || e.kind === 'step_error').length;
  const budget = a.thread.stepBudget
    .replace('{n}', String(stepNumber))
    .replace('{max}', String(DEFAULT_AGENT_MAX_STEPS));
  return (
    <div className="rounded-md border border-border bg-surface-raised">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-xs text-text-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <GaugeIcon className="h-3.5 w-3.5 shrink-0 text-text-secondary" />
          <span className="shrink-0">
            {a.progress} ({steps.length})
          </span>
          <span
            className={cn(
              'shrink-0 tabular-nums',
              stepNumber >= DEFAULT_AGENT_MAX_STEPS
                ? 'text-amber-600 dark:text-amber-500'
                : 'text-text-disabled',
            )}
          >
            · {budget}
          </span>
          {working && !open && latestMessage !== undefined && (
            <span className="truncate text-text-disabled">· {latestMessage}</span>
          )}
        </span>
        <span className="shrink-0">{open ? a.reasoning.hide : a.reasoning.show}</span>
      </button>
      {open && (
        <ul className="space-y-1 border-t border-border px-2 py-2">
          {steps.map((e, i) => {
            // The last `step_start` with nothing after it, while the turn is still working, is the
            // step running RIGHT NOW — shown pulsing amber instead of the neutral start dot so
            // "where is the run" reads at a glance (S8 PR2 per-step status).
            const running = working && i === steps.length - 1 && e.kind === 'step_start';
            return (
              <li key={`s-${String(e.ts)}-${String(i)}`} className="flex items-start gap-2 px-1">
                <span
                  className={cn(
                    'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                    running ? 'animate-pulse bg-amber-500' : KIND_DOT[e.kind],
                  )}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <span className="text-text-primary [overflow-wrap:anywhere]">{e.message}</span>
                  {e.detail !== undefined && e.detail.length > 0 && (
                    <span className="ml-1 text-text-secondary [overflow-wrap:anywhere]">
                      — {e.detail}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
