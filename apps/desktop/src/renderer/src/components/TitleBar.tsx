import { useEffect, useState } from 'react';
import type { Resources } from '@tepegoz/i18n';

/**
 * Custom window chrome for the frameless window (browser-style): a draggable title region plus
 * minimize / maximize-restore / close caption controls. These are window chrome (not reusable app
 * primitives), so they're plain token-styled buttons rather than KUIreact atoms. The whole bar is a
 * drag region except the controls (`.app-no-drag`); `-webkit-app-region: drag` also restores OS
 * caption behaviors (edge-snap, double-click-to-maximize, system menu).
 */
interface TitleBarProps {
  t: Resources;
}

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

export function TitleBar({ t }: TitleBarProps) {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    const api = window.tepegoz;
    void api.isWindowMaximized().then(setMaximized).catch(() => undefined);
    return api.onWindowMaximizedChange(setMaximized);
  }, []);

  const captionBtn =
    'app-no-drag flex h-full w-11 items-center justify-center text-text-secondary ' +
    'hover:bg-surface-overlay hover:text-text-primary transition-colors ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-focus';

  return (
    <header className="app-drag flex h-9 shrink-0 select-none items-center justify-between border-b border-border bg-surface-raised">
      <div className="flex items-center gap-2 px-3">
        <span className="h-2.5 w-2.5 rounded-full bg-primary" aria-hidden="true" />
        <h1 className="text-xs font-semibold text-text-primary">{t.common.appName}</h1>
      </div>
      <div className="flex h-full items-stretch">
        <button
          type="button"
          aria-label={t.window.minimize}
          className={captionBtn}
          onClick={() => window.tepegoz.minimizeWindow()}
        >
          <MinimizeIcon />
        </button>
        <button
          type="button"
          aria-label={maximized ? t.window.restore : t.window.maximize}
          className={captionBtn}
          onClick={() => window.tepegoz.toggleMaximizeWindow()}
        >
          {maximized ? <RestoreIcon /> : <MaximizeIcon />}
        </button>
        <button
          type="button"
          aria-label={t.window.close}
          className={`${captionBtn} hover:bg-error hover:text-text-inverse`}
          onClick={() => window.tepegoz.closeWindow()}
        >
          <CloseIcon />
        </button>
      </div>
    </header>
  );
}
