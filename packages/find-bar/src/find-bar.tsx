import { useEffect, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronDown, faChevronUp, faXmark } from '@fortawesome/free-solid-svg-icons';
import { useT } from '@tepegoz/i18n/react';
import { findBarDict } from './i18n';

const BTN =
  'flex h-7 w-7 shrink-0 items-center justify-center rounded text-text-secondary ' +
  'hover:bg-surface-overlay hover:text-text-primary disabled:pointer-events-none disabled:text-text-disabled ' +
  'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset ' +
  'focus-visible:ring-border-focus';

export interface FindBarProps {
  /** Current query. Owned by the host so the bar stays controlled across open/close. */
  query: string;
  /** 1-based index of the highlighted match; 0 when there is none. */
  activeMatch: number;
  totalMatches: number;
  matchCase: boolean;
  onQueryChange: (query: string) => void;
  onNext: () => void;
  onPrevious: () => void;
  onToggleMatchCase: () => void;
  onClose: () => void;
}

/**
 * `@tepegoz/find-bar` — the Ctrl+F find-in-page bar (Phase 2c). Presentational and Electron-free: the
 * host runs `webContents.findInPage` in main and feeds the counts back down as props, so this package
 * never touches the bridge. It self-localizes from its own dict (ADR-0016) rather than taking labels,
 * because the counter needs the strings for its screen-reader text.
 *
 * Enter / Shift+Enter cycle matches, Escape closes — the bar owns those keys while its input has focus
 * so they never reach the page underneath.
 */
export function FindBar({
  query,
  activeMatch,
  totalMatches,
  matchCase,
  onQueryChange,
  onNext,
  onPrevious,
  onToggleMatchCase,
  onClose,
}: FindBarProps) {
  const t = useT(findBarDict);
  const inputRef = useRef<HTMLInputElement>(null);

  // The host mounts the bar only while it is open, so focusing on mount is the whole "open" behaviour.
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const hasQuery = query.length > 0;
  const noMatches = hasQuery && totalMatches === 0;
  const counter = hasQuery ? `${String(activeMatch)}/${String(totalMatches)}` : '';

  return (
    <div className="flex items-center gap-1 rounded-b-md border border-t-0 border-border bg-surface-raised px-2 py-1.5 shadow-lg">
      <input
        ref={inputRef}
        type="text"
        value={query}
        placeholder={t.placeholder}
        aria-label={t.placeholder}
        spellCheck={false}
        className={
          'h-7 w-56 bg-transparent px-1 text-sm text-text-primary placeholder:text-text-secondary ' +
          'focus:outline-none ' +
          (noMatches ? 'text-error' : '')
        }
        onChange={(e) => {
          onQueryChange(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (e.shiftKey) onPrevious();
            else onNext();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
          }
        }}
      />

      <span
        aria-label={t.matchCount}
        className={
          'min-w-14 shrink-0 text-right text-xs tabular-nums ' +
          (noMatches ? 'text-error' : 'text-text-secondary')
        }
      >
        {noMatches ? t.noResults : counter}
      </span>

      <button
        type="button"
        aria-label={t.matchCase}
        aria-pressed={matchCase}
        className={BTN + (matchCase ? ' bg-surface-overlay text-text-primary' : '')}
        onClick={onToggleMatchCase}
      >
        <span aria-hidden className="text-xs font-semibold">
          {'Aa'}
        </span>
      </button>

      <button
        type="button"
        aria-label={t.previous}
        disabled={totalMatches === 0}
        className={BTN}
        onClick={onPrevious}
      >
        <FontAwesomeIcon icon={faChevronUp} className="h-3 w-3" aria-hidden />
      </button>
      <button
        type="button"
        aria-label={t.next}
        disabled={totalMatches === 0}
        className={BTN}
        onClick={onNext}
      >
        <FontAwesomeIcon icon={faChevronDown} className="h-3 w-3" aria-hidden />
      </button>
      <button type="button" aria-label={t.close} className={BTN} onClick={onClose}>
        <FontAwesomeIcon icon={faXmark} className="h-3 w-3" aria-hidden />
      </button>
    </div>
  );
}
