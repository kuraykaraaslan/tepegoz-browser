import type { ChatPresence } from '@tepegoz/shared-types';
import type { ChatUiStrings } from './i18n';

/**
 * The visual weight a presence carries — the timeline / roster map this to a colour token, never a
 * literal colour, so the theme owns the palette.
 */
export type PresenceTone = 'positive' | 'caution' | 'busy' | 'neutral';

export interface PresenceMeta {
  readonly label: string;
  readonly tone: PresenceTone;
  /** True for any state where the contact is connected (online / away / xa / dnd). */
  readonly online: boolean;
}

const TONE: Record<ChatPresence, PresenceTone> = {
  online: 'positive',
  away: 'caution',
  xa: 'caution',
  dnd: 'busy',
  offline: 'neutral',
};

export function presenceMeta(
  presence: ChatPresence,
  labels: ChatUiStrings['presence'],
): PresenceMeta {
  return {
    label: labels[presence],
    tone: TONE[presence],
    online: presence !== 'offline',
  };
}
