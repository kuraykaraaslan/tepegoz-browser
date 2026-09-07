import type { AgentStrings } from './i18n';
import type { TurnConfig } from './panel-state';

/**
 * A read-back line under a turn's prompt (S8 B4): which provider / model / autonomy that run actually
 * used. It is not a control — the composer's gear popover stays the place to CHANGE these — it exists
 * so scrolling back through a long transcript answers "which model was this?" without opening the
 * journal.
 */
export function TurnConfigLine({ config, a }: { config: TurnConfig; a: AgentStrings }) {
  const autonomy =
    (a.autonomy as Record<string, { title: string }>)[config.autonomy]?.title ?? config.autonomy;
  const text = [
    config.provider,
    config.model.length > 0 ? config.model : a.modelAuto,
    autonomy,
  ].join(' · ');
  return (
    <div className="flex justify-end">
      <span className="text-[11px] text-text-disabled" aria-label={a.thread.runConfig}>
        {text}
      </span>
    </div>
  );
}
