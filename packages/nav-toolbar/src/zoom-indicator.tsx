import { useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMagnifyingGlassPlus, faMinus, faPlus } from '@fortawesome/free-solid-svg-icons';
import { NAV_BTN } from './nav-toolbar';

/** The pill in the address bar. Its own class rather than `NAV_BTN` — that one pins `w-8`, and the
 *  pill has to be wide enough for "125%". Shares the hover / focus-ring treatment. */
const ZOOM_PILL =
  'flex h-8 items-center gap-1 rounded-md px-1.5 text-xs font-medium text-text-secondary ' +
  'hover:bg-surface-overlay hover:text-text-primary transition-colors ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus';

/** Localized strings for the zoom indicator + its popover. Supplied by the host (leaf stays i18n-free). */
export interface ZoomIndicatorLabels {
  /** aria-label for the omnibox pill and the popover heading, e.g. "Zoom". */
  indicator: string;
  zoomIn: string;
  zoomOut: string;
  reset: string;
}

export interface ZoomIndicatorProps {
  /** The active tab's zoom as a whole-number percent (e.g. `125`). */
  percent: number;
  labels: ZoomIndicatorLabels;
  onZoom: (direction: 'in' | 'out' | 'reset') => void;
}

/**
 * Chrome-style zoom indicator: a small pill at the trailing edge of the address bar that appears only
 * when the active tab is off 100%. Clicking it opens a bubble with −, the current level, +, and
 * Reset. The buttons drive the host's `onZoom`; the level shown is whatever the host last passed as
 * `percent` (main is the source of truth — this never optimistically updates).
 */
export function ZoomIndicator({ percent, labels, onZoom }: ZoomIndicatorProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (event: MouseEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  // Back to 100% → nothing to indicate. Closing here also dismisses an open bubble left over from the
  // press that reset it.
  if (percent === 100) return null;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={`${labels.indicator}: ${percent}%`}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
        className={ZOOM_PILL}
      >
        <FontAwesomeIcon icon={faMagnifyingGlassPlus} className="h-3.5 w-3.5" aria-hidden />
        <span>{percent}%</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={labels.indicator}
          className="absolute right-0 top-full z-30 mt-1 flex items-center gap-1 rounded-md border border-border bg-surface-raised p-1 shadow-lg"
        >
          <button
            type="button"
            aria-label={labels.zoomOut}
            onClick={() => onZoom('out')}
            className={NAV_BTN}
          >
            <FontAwesomeIcon icon={faMinus} className="h-3.5 w-3.5" aria-hidden />
          </button>
          <span className="min-w-[3.5rem] text-center text-sm tabular-nums text-text-primary">
            {percent}%
          </span>
          <button
            type="button"
            aria-label={labels.zoomIn}
            onClick={() => onZoom('in')}
            className={NAV_BTN}
          >
            <FontAwesomeIcon icon={faPlus} className="h-3.5 w-3.5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => onZoom('reset')}
            className="ml-1 rounded px-2 py-1 text-sm text-text-secondary hover:bg-surface-overlay hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
          >
            {labels.reset}
          </button>
        </div>
      )}
    </div>
  );
}
