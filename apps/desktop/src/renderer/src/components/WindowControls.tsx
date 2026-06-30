import { useEffect, useState } from 'react';
import type { Resources } from '@tepegoz/i18n';

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

export function WindowControls({ t }: { t: Resources }) {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    const api = window.tepegoz;
    void api.isWindowMaximized().then(setMaximized).catch(() => undefined);
    return api.onWindowMaximizedChange(setMaximized);
  }, []);

  return (
    <div className="flex h-full items-stretch">
      <button
        type="button"
        aria-label={t.window.minimize}
        className={BTN}
        onClick={() => window.tepegoz.minimizeWindow()}
      >
        <MinimizeIcon />
      </button>
      <button
        type="button"
        aria-label={maximized ? t.window.restore : t.window.maximize}
        className={BTN}
        onClick={() => window.tepegoz.toggleMaximizeWindow()}
      >
        {maximized ? <RestoreIcon /> : <MaximizeIcon />}
      </button>
      <button
        type="button"
        aria-label={t.window.close}
        className={`${BTN} hover:bg-error hover:text-text-inverse`}
        onClick={() => window.tepegoz.closeWindow()}
      >
        <CloseIcon />
      </button>
    </div>
  );
}
