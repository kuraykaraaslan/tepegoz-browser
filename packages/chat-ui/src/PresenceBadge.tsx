import { useT } from '@tepegoz/i18n/react';
import type { ChatPresence } from '@tepegoz/shared-types';
import { chatUiDict } from './i18n';
import { presenceMeta } from './presence';

export interface PresenceBadgeProps {
  presence: ChatPresence;
  /** Hide the text label and render only the status dot (roster rows, avatars). */
  dotOnly?: boolean;
}

/**
 * A contact's / account's presence as a themed dot plus (optionally) its localized label. Carries the
 * tone as `data-tone` and the connected-ness as `data-online` so the surface's stylesheet owns the
 * colour; the accessible name is always the full label even in `dotOnly` mode.
 */
export function PresenceBadge({ presence, dotOnly = false }: Readonly<PresenceBadgeProps>) {
  const s = useT(chatUiDict);
  const meta = presenceMeta(presence, s.presence);
  return (
    <span
      className="chat-presence"
      data-tone={meta.tone}
      data-online={meta.online}
      data-dot-only={dotOnly}
      title={dotOnly ? meta.label : undefined}
    >
      <span className="chat-presence__dot" aria-hidden="true" />
      {dotOnly ? (
        <span className="chat-presence__sr-only">{meta.label}</span>
      ) : (
        <span className="chat-presence__label">{meta.label}</span>
      )}
    </span>
  );
}
