import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faWindowMinimize,
  faWindowMaximize,
  faWindowRestore,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';

const ICON = 'h-2.5 w-2.5';

const BTN =
  'app-no-drag flex h-full w-11 items-center justify-center text-text-secondary ' +
  'hover:bg-surface-overlay hover:text-text-primary transition-colors ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-focus';

/** Localized aria-labels, supplied by the host so the package stays i18n-agnostic. */
export interface WindowControlsLabels {
  minimize: string;
  maximize: string;
  restore: string;
  close: string;
}

export interface WindowControlsProps {
  /** Whether the window is currently maximized (drives the maximize/restore icon + label). */
  isMaximized: boolean;
  labels: WindowControlsLabels;
  onMinimize: () => void;
  onToggleMaximize: () => void;
  onClose: () => void;
}

/**
 * `@tepegoz/window-controls` — the native caption buttons (minimize / maximize·restore / close) for a
 * frameless window. Pure presentational view: the maximized state and all actions are injected, so the
 * package has no dependency on the Electron bridge. Extracted from `apps/desktop` per docs/package-map.md.
 */
export function WindowControls({
  isMaximized,
  labels,
  onMinimize,
  onToggleMaximize,
  onClose,
}: WindowControlsProps) {
  return (
    <div className="flex h-full items-stretch">
      <button type="button" aria-label={labels.minimize} className={BTN} onClick={onMinimize}>
        <FontAwesomeIcon icon={faWindowMinimize} className={ICON} aria-hidden />
      </button>
      <button
        type="button"
        aria-label={isMaximized ? labels.restore : labels.maximize}
        className={BTN}
        onClick={onToggleMaximize}
      >
        <FontAwesomeIcon
          icon={isMaximized ? faWindowRestore : faWindowMaximize}
          className={ICON}
          aria-hidden
        />
      </button>
      <button
        type="button"
        aria-label={labels.close}
        className={`${BTN} hover:bg-error hover:text-text-inverse`}
        onClick={onClose}
      >
        <FontAwesomeIcon icon={faXmark} className={ICON} aria-hidden />
      </button>
    </div>
  );
}
