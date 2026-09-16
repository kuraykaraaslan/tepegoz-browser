import { SparkIcon } from './panel-icons';
import type { AgentStrings } from './i18n';
import type { AgentEvent } from './types';
import { toolIntent } from './panel-tool-intent';

/**
 * The collapsible "Reasoning" group above a turn's step feed: `plan` text and each `decision` event's
 * tool intent, raw id on hover. Split out of `panel-thread.tsx` (ADR-0010 250-line cap).
 */
export function ReasoningPanel({
  reasoning,
  open,
  onToggle,
  a,
}: {
  reasoning: AgentEvent[];
  open: boolean;
  onToggle: () => void;
  a: AgentStrings;
}) {
  if (reasoning.length === 0) return null;
  return (
    <div className="rounded-md border border-border bg-surface-raised">
      <button
        type="button"
        onClick={onToggle}
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
              {/* A `decision` event's message is the bare tool id — show what the call is FOR, raw id
                  on hover. `plan` text is left as written. */}
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
  );
}
