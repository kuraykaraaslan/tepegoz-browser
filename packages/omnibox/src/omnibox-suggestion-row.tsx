import { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import {
  faBookmark,
  faCalculator,
  faClockRotateLeft,
  faDownload,
  faGear,
  faGlobe,
  faKeyboard,
  faMagnifyingGlass,
  faRobot,
  faTerminal,
  faWandMagicSparkles,
  faWindowMaximize,
} from '@fortawesome/free-solid-svg-icons';
import { emphasisSegments } from './omnibox-emphasis';
import type { OmniboxSuggestion } from './omnibox-suggest';

/**
 * A distinct FontAwesome glyph for every {@link OmniboxSuggestion} kind — all twelve, so a typed URL
 * no longer wears a search icon (omnibox § A6). Glyphs match how each concept is drawn elsewhere in
 * the app (bookmark star/book, `faRobot` for the agent, `faWandMagicSparkles` for a skill, `faGlobe`
 * for a bare navigation, …).
 */
const SUGGESTION_ICONS: Record<OmniboxSuggestion['kind'], IconDefinition> = {
  navigate: faGlobe,
  search: faMagnifyingGlass,
  history: faClockRotateLeft,
  bookmark: faBookmark,
  tab: faWindowMaximize,
  calc: faCalculator,
  'quick-setting': faGear,
  command: faTerminal,
  agent: faRobot,
  download: faDownload,
  skill: faWandMagicSparkles,
  palette: faKeyboard,
};

/**
 * The leading glyph for a suggestion row — or, for a tab/bookmark/history row that carries one, the
 * site's own favicon. `faviconUrl` is already constrained to an inline `data:` URL upstream
 * (`inlineFaviconOnly`), so this never makes a network request from the chrome; a decode failure
 * falls back to the kind glyph.
 */
export function SuggestionIcon({
  kind,
  faviconUrl,
}: {
  kind: OmniboxSuggestion['kind'];
  faviconUrl?: string | undefined;
}) {
  const [failed, setFailed] = useState(false);
  // Rows are reconciled by position as the user types, so this same instance can be handed a
  // different row's favicon — clear a stale failure when the URL changes.
  useEffect(() => setFailed(false), [faviconUrl]);
  if (faviconUrl !== undefined && faviconUrl.length > 0 && !failed) {
    return (
      <img
        src={faviconUrl}
        alt=""
        aria-hidden="true"
        className="h-3.5 w-3.5 shrink-0 rounded-[3px] object-contain"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <FontAwesomeIcon
      icon={SUGGESTION_ICONS[kind]}
      className="h-3.5 w-3.5 shrink-0 text-text-secondary"
      aria-hidden
    />
  );
}

/**
 * A suggestion's text with the part that matches the typed query emphasised — Chrome/Firefox's
 * matched-substring bolding. `emphasisSegments` finds the span the same accent- and Turkish-folded way
 * the suggestion was itself matched (`@tepegoz/i18n`'s `foldForSearch`). Rendered as plain `<span>`
 * text nodes only: the matched runs carry `font-semibold`, never `dangerouslySetInnerHTML`.
 */
export function EmphasizedText({
  text,
  query,
  className,
}: {
  text: string;
  query: string;
  className?: string | undefined;
}) {
  return (
    <span className={className}>
      {emphasisSegments(text, query).map((seg, i) => (
        <span key={i} className={seg.match ? 'font-semibold' : undefined}>
          {seg.text}
        </span>
      ))}
    </span>
  );
}
