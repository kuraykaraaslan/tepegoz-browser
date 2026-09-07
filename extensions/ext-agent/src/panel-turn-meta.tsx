import type { AgentStrings } from './i18n';
import type { Turn } from './panel-state';

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
