import type { ReactNode } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBan,
  faPuzzlePiece,
  faRobot,
  faUserSecret,
  faWandMagicSparkles,
  type IconDefinition,
} from '@fortawesome/free-solid-svg-icons';

/**
 * Maps a manifest `icon` slug (data-driven, carried in the catalog) to a FontAwesome definition, so the
 * renderer no longer hardcodes an icon node per extension. Closed set; an unknown slug falls back to a
 * generic puzzle-piece — an extension always has a toolbar icon, and the SDK/renderer stay decoupled.
 */
const ICONS: Record<string, IconDefinition> = {
  robot: faRobot,
  'user-secret': faUserSecret,
  ban: faBan,
  'wand-magic-sparkles': faWandMagicSparkles,
  'puzzle-piece': faPuzzlePiece,
};

/** The toolbar icon node for a manifest `icon` slug (generic fallback for an unknown slug). */
export function iconNodeFor(iconId: string): ReactNode {
  return <FontAwesomeIcon icon={ICONS[iconId] ?? faPuzzlePiece} className="h-4 w-4" aria-hidden />;
}
