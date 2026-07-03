import { Badge, Card } from '@tepegoz/ui';
import { useT } from '@tepegoz/i18n/react';
import { settingsDict } from './i18n';

export interface ComingSoonCardProps {
  /** Section title (host-supplied, already localized). */
  title: string;
  /** Optional one-line explanation of the not-yet-wired feature (host-supplied, localized). */
  description?: string;
  /** Not-yet-wired sub-settings, previewed as disabled rows so the section looks real. */
  items?: readonly string[];
}

/**
 * A type-safe placeholder for a modern-browser settings section that this browser doesn't implement
 * yet. Pure presentation: it persists nothing and calls no IPC, so a placeholder section adds ZERO
 * fields to `Preferences`/`PreferencesSchema` — no schema drift. Only the `comingSoon` badge string is
 * owned here (settings-ui dict); titles/descriptions/items are host-supplied and localized upstream.
 * Promote a placeholder to a real control only once the feature is actually wired.
 */
export function ComingSoonCard({ title, description, items }: ComingSoonCardProps) {
  const t = useT(settingsDict);
  return (
    <Card
      title={title}
      headerRight={
        <Badge variant="neutral" dot>
          {t.comingSoon}
        </Badge>
      }
    >
      {description !== undefined && <p className="text-sm text-text-secondary">{description}</p>}
      {items !== undefined && items.length > 0 && (
        <ul className="mt-3 space-y-2">
          {items.map((item) => (
            <li
              key={item}
              className="flex items-center justify-between rounded-md border border-border px-3 py-2 opacity-50"
            >
              <span className="text-sm text-text-primary">{item}</span>
              <span className="text-xs uppercase tracking-wide text-text-secondary">
                {t.comingSoon}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
