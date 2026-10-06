import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { faFile, faGear, faLock, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import { cn } from '@tepegoz/ui';
import type { OmniboxSecurityLabels, OmniboxSecurityLevel } from './omnibox-types';

/** The leading control's offset from the input's left edge (Tailwind `left-1.5`) and the gap kept
 *  between it and the URL text — the two halves of the input's measured left padding. */
export const LEAD_INSET_PX = 6;
export const LEAD_GAP_PX = 8;

/** Per-level glyph for the leading site-info control (Chrome's lock / "Not secure" affordance). */
const SITE_INFO_ICONS: Record<Exclude<OmniboxSecurityLevel, 'unknown'>, IconDefinition> = {
  secure: faLock,
  'not-secure': faTriangleExclamation,
  dangerous: faTriangleExclamation,
  internal: faGear,
  file: faFile,
};

/**
 * The leading control at the start of the address bar — Chrome's site-info button. A lock on
 * `https://`, a red triangle + "Not secure" on `http://` or a bypassed certificate, a gear on an
 * internal page. The caller positions it absolutely over the input's left padding so the input keeps
 * its own border + focus ring (the only keyboard-focus indicator — it must not move to a wrapper), and
 * measures this element to size that padding. Renders as a plain indicator when `onOpen` is omitted.
 */
export function SiteInfoControl({
  level,
  labels,
  onOpen,
}: {
  level: Exclude<OmniboxSecurityLevel, 'unknown'>;
  labels: OmniboxSecurityLabels;
  onOpen: ((anchor: { x: number; y: number; width: number; height: number }) => void) | undefined;
}) {
  const alarm = level === 'not-secure' || level === 'dangerous';
  const word =
    level === 'not-secure' ? labels.notSecure : level === 'dangerous' ? labels.dangerous : null;
  const inner = (
    <>
      <FontAwesomeIcon
        icon={SITE_INFO_ICONS[level]}
        className={cn('h-3.5 w-3.5 shrink-0', alarm ? 'text-error' : 'text-text-secondary')}
        aria-hidden
      />
      {word !== null && <span className="truncate text-xs font-medium text-error">{word}</span>}
    </>
  );
  const boxClass = 'flex max-w-full items-center gap-1 rounded-full px-1.5 py-1';
  if (onOpen === undefined) {
    return (
      <span className={boxClass} aria-hidden>
        {inner}
      </span>
    );
  }
  return (
    <button
      type="button"
      aria-label={labels.button}
      aria-haspopup="dialog"
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        onOpen({ x: r.x, y: r.y, width: r.width, height: r.height });
      }}
      className={cn(
        boxClass,
        'hover:bg-surface-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus',
      )}
    >
      {inner}
    </button>
  );
}
