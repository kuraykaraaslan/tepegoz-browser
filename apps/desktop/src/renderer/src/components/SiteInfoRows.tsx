import type { ReactNode } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { faArrowLeft, faChevronRight, faUpRightFromSquare } from '@fortawesome/free-solid-svg-icons';

/**
 * A drill-down header: back arrow, the pane's title, the host beneath it, close on the right — the
 * shape Chrome's "Security" sub-page uses.
 */
export function SubHeader({
  title,
  subtitle,
  backLabel,
  onBack,
  close,
}: {
  title: string;
  subtitle: string;
  backLabel: string;
  onBack: () => void;
  close: ReactNode;
}) {
  return (
    <header className="flex items-start gap-2.5 px-4 pb-2 pt-3">
      <button
        type="button"
        aria-label={backLabel}
        onClick={onBack}
        className="mt-0.5 shrink-0 rounded-full border border-border p-1.5 text-text-secondary hover:bg-surface-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
      >
        <FontAwesomeIcon icon={faArrowLeft} className="h-3 w-3" aria-hidden />
      </button>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-text-primary">{title}</p>
        {subtitle !== '' && (
          <p className="truncate text-xs text-text-secondary" title={subtitle}>
            {subtitle}
          </p>
        )}
      </div>
      {close}
    </header>
  );
}

/**
 * One list row of the panel: glyph, label, and a trailing affordance that says where the row goes —
 * a chevron for a pane inside the bubble, the "leaves this bubble" arrow for Site settings, an inline
 * word (`action`) for a row that acts in place. Rendered as a plain `div` when there is nothing to
 * click, so a non-row does not sit in the tab order pretending to be a button.
 */
export function Row({
  icon,
  iconClass,
  title,
  titleClass = '',
  trailing = 'chevron',
  action,
  onClick,
}: {
  icon: IconDefinition;
  iconClass: string;
  title: string;
  titleClass?: string;
  trailing?: 'chevron' | 'external' | 'none';
  action?: string;
  onClick?: () => void;
}) {
  const inner = (
    <>
      <FontAwesomeIcon icon={icon} className={`h-4 w-4 shrink-0 ${iconClass}`} aria-hidden />
      <span className={`min-w-0 flex-1 truncate text-sm ${titleClass}`}>{title}</span>
      {action !== undefined && (
        <span className="shrink-0 text-xs font-medium text-primary-on-surface">{action}</span>
      )}
      {onClick !== undefined && trailing !== 'none' && (
        <FontAwesomeIcon
          icon={trailing === 'external' ? faUpRightFromSquare : faChevronRight}
          className="h-3 w-3 shrink-0 text-text-secondary"
          aria-hidden
        />
      )}
    </>
  );
  const box = 'flex w-full items-center gap-3 px-4 py-2.5 text-left';
  if (onClick === undefined) {
    return <div className={box}>{inner}</div>;
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${box} hover:bg-surface-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-focus`}
    >
      {inner}
    </button>
  );
}
