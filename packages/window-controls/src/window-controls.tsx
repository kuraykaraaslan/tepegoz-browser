const ICON = 'h-2.5 w-2.5';

function MinimizeIcon() {
  return (
    <svg className={ICON} viewBox="0 0 10 10" aria-hidden="true">
      <rect x="0" y="4.5" width="10" height="1" fill="currentColor" />
    </svg>
  );
}
function MaximizeIcon() {
  return (
    <svg className={ICON} viewBox="0 0 10 10" aria-hidden="true">
      <rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" />
    </svg>
  );
}
function RestoreIcon() {
  return (
    <svg className={ICON} viewBox="0 0 10 10" aria-hidden="true">
      <rect x="0.5" y="2.5" width="7" height="7" fill="none" stroke="currentColor" />
      <path d="M2.5 2.5 V0.5 H9.5 V7.5 H7.5" fill="none" stroke="currentColor" />
    </svg>
  );
}
function CloseIcon() {
  return (
    <svg className={ICON} viewBox="0 0 10 10" aria-hidden="true">
      <path d="M1 1 L9 9 M9 1 L1 9" stroke="currentColor" strokeWidth="1.1" />
    </svg>
  );
}

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
        <MinimizeIcon />
      </button>
      <button
        type="button"
        aria-label={isMaximized ? labels.restore : labels.maximize}
        className={BTN}
        onClick={onToggleMaximize}
      >
        {isMaximized ? <RestoreIcon /> : <MaximizeIcon />}
      </button>
      <button
        type="button"
        aria-label={labels.close}
        className={`${BTN} hover:bg-error hover:text-text-inverse`}
        onClick={onClose}
      >
        <CloseIcon />
      </button>
    </div>
  );
}
