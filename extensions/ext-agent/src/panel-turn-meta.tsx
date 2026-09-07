import { CheckIcon } from './panel-icons';
import type { AgentStrings } from './i18n';
import type { Turn, TurnApproval } from './panel-state';

/**
 * The per-turn metadata row under the prompt: a skill pill (S8 B2) and a provider · model · autonomy
 * read-back (S8 B4). Both are visibility only — the composer's gear popover stays the place to CHANGE
 * the run settings, and the pill is the same honesty logic as the S4 evidence chip. A turn restored
 * from a stored conversation carries neither and renders nothing.
 */
export function TurnMeta({ turn, a }: { turn: Turn; a: AgentStrings }) {
  if (turn.config === undefined && turn.skill === undefined) return null;
  const config = turn.config;
  const autonomy =
    config === undefined
      ? ''
      : ((a.autonomy as Record<string, { title: string }>)[config.autonomy]?.title ??
        config.autonomy);
  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {turn.skill !== undefined && (
        <span
          aria-label={a.thread.skillUsed}
          className="rounded-full bg-indigo-500/10 px-2 py-0.5 text-[11px] text-indigo-500 dark:text-indigo-400"
        >
          {turn.skill.name}
        </span>
      )}
      {config !== undefined && (
        <span className="text-[11px] text-text-disabled" aria-label={a.thread.runConfig}>
          {[config.provider, config.model.length > 0 ? config.model : a.modelAuto, autonomy].join(
            ' · ',
          )}
        </span>
      )}
    </div>
  );
}

/**
 * A permanent record of every approval the user GRANTED in a turn (S8 B3). The modal is deliberately
 * blocking and closes on answer; without this the only trace of "you allowed X here" is the journal.
 * Denials are not shown — a denied action did not happen.
 */
export function TurnApprovals({ approvals, a }: { approvals: TurnApproval[]; a: AgentStrings }) {
  if (approvals.length === 0) return null;
  return (
    <ul className="space-y-1 px-1">
      {approvals.map((g, i) => {
        const flags = [
          g.remembered ? a.thread.allowedRemembered : null,
          g.scoped ? a.thread.allowedScoped : null,
        ].filter((f): f is string => f !== null);
        return (
          <li
            key={`${g.tool}-${String(g.ts)}-${String(i)}`}
            className="flex items-start gap-2 rounded-md border border-green-500/30 bg-green-500/5 px-2 py-1 text-xs text-text-secondary"
          >
            <CheckIcon className="mt-0.5 h-3 w-3 shrink-0 text-green-600 dark:text-green-400" />
            <span className="[overflow-wrap:anywhere]">
              {a.thread.allowed.replace('{tool}', g.tool)}
              {flags.length > 0 && (
                <span className="text-text-disabled"> · {flags.join(' · ')}</span>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
