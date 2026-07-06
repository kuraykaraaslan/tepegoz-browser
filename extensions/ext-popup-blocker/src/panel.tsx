import { useEffect, useState } from 'react';
import { Toggle } from '@tepegoz/ui';
import { coreDict } from '@tepegoz/i18n';
import { useT } from '@tepegoz/i18n/react';
import { popupBlockerDict } from './i18n';
import type { PopupBlockerHostApi, PopupBlockerRequest, PopupBlockerSettings } from './types';

/**
 * Popup Blocker (strict) surfaces. The stateful controls ({@link PopupBlockerControls}) toggle the
 * blocker on/off + the blocked-notification, and manage the trusted-sites allowlist. It talks to the
 * host ONLY through the injected {@link PopupBlockerHostApi}. The chrome hosts it as a `popup` (compact
 * card under the toolbar icon) or a `page` (tepegoz://com.tepegoz.popup-blocker). Per-popup actions
 * (allow / background / redirect / trust) live inline on the "pop-up blocked" notification itself.
 */
export interface PopupBlockerSurfaceProps {
  api: PopupBlockerHostApi;
  onClose: () => void;
}

const BTN_GHOST =
  'shrink-0 rounded-md border border-border px-2 py-1 text-xs text-text-secondary ' +
  'hover:bg-surface-overlay hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus';

function relTime(ms: number): string {
  const sec = Math.floor((Date.now() - ms) / 1000);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  return `${Math.floor(sec / 3600)}h ago`;
}

/** The stateful controls. `surface` controls which bottom section is shown:
 *  - popup: 2 toggles + recent blocked requests
 *  - page: 2 toggles + trusted sites allowlist
 */
export function PopupBlockerControls({
  api,
  surface,
}: Readonly<{
  api: PopupBlockerHostApi;
  surface: 'popup' | 'page';
}>) {
  const x = useT(popupBlockerDict);
  const [settings, setSettings] = useState<PopupBlockerSettings | null>(null);
  const [recent, setRecent] = useState<PopupBlockerRequest[]>([]);

  useEffect(() => {
    let alive = true;
    void api.getPopupBlockerSettings().then(
      (s) => {
        if (alive) setSettings(s);
      },
      () => {
        /* host unavailable — controls stay in the loading state */
      },
    );
    if (surface === 'popup') {
      void api.getRecentRequests().then(
        (r) => {
          if (alive) setRecent(r);
        },
        () => {
          /* ignore */
        },
      );
    }
    return () => {
      alive = false;
    };
  }, [api, surface]);

  async function patch(p: Partial<PopupBlockerSettings>): Promise<void> {
    try {
      setSettings(await api.setPopupBlockerSettings(p));
    } catch {
      /* leave the current settings unchanged on failure */
    }
  }

  if (settings === null) return <p className="text-sm text-text-secondary">…</p>;

  return (
    <div className="space-y-4">
      <Toggle
        id="pb-enabled"
        label={x.enabled}
        description={x.enabledHint}
        checked={settings.enabled}
        onChange={(v) => {
          void patch({ enabled: v });
        }}
      />
      <Toggle
        id="pb-notify"
        label={x.showNotifications}
        checked={settings.showNotifications}
        onChange={(v) => {
          void patch({ showNotifications: v });
        }}
      />

      {surface === 'popup' ? (
        <div>
          <h3 className="text-xs font-medium uppercase tracking-wide text-text-secondary">
            {x.recentRequests}
          </h3>
          {recent.length === 0 ? (
            <p className="mt-1 text-sm text-text-secondary">{x.recentRequestsEmpty}</p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {recent.map((req) => (
                <li
                  key={req.id}
                  className="flex items-start justify-between gap-2 rounded-md border border-border px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-xs text-text-primary">{req.sourceOrigin}</p>
                    <p className="truncate text-xs text-text-secondary">{req.popupUrl}</p>
                    <p className="text-xs text-text-tertiary">{relTime(req.blockedAt)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      api.createTabInBackground(req.popupUrl);
                    }}
                    className={BTN_GHOST}
                  >
                    {x.open}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div>
          <h3 className="text-xs font-medium uppercase tracking-wide text-text-secondary">
            {x.trustedSites}
          </h3>
          <p className="mb-2 mt-0.5 text-xs text-text-secondary">{x.trustedHint}</p>
          {settings.trustedOrigins.length === 0 ? (
            <p className="text-sm text-text-secondary">{x.trustedEmpty}</p>
          ) : (
            <ul className="space-y-1.5">
              {settings.trustedOrigins.map((origin) => (
                <li
                  key={origin}
                  className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-1.5"
                >
                  <span className="min-w-0 truncate font-mono text-xs text-text-primary">{origin}</span>
                  <button
                    type="button"
                    onClick={() => {
                      void patch({ trustedOrigins: settings.trustedOrigins.filter((o) => o !== origin) });
                    }}
                    className={BTN_GHOST}
                  >
                    {x.remove}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/** Popup surface — a compact card. Width/height are clamped by the chrome host, not the extension. */
export function PopupBlockerPopup({ api, onClose }: PopupBlockerSurfaceProps) {
  const x = useT(popupBlockerDict);
  const c = useT(coreDict);
  return (
    <div className="flex w-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <h2 className="text-sm font-semibold text-text-primary">{x.title}</h2>
        <button type="button" onClick={onClose} aria-label={c.window.close} className={BTN_GHOST}>
          {c.window.close}
        </button>
      </div>
      <div className="p-3">
        <PopupBlockerControls api={api} surface="popup" />
      </div>
    </div>
  );
}

/** Page surface — full internal page at tepegoz://com.tepegoz.popup-blocker. */
export function PopupBlockerPage({ api }: PopupBlockerSurfaceProps) {
  const x = useT(popupBlockerDict);
  return (
    <div className="flex h-full flex-col bg-surface-base text-text-primary">
      <div className="shrink-0 border-b border-border px-8 py-4">
        <h1 className="mx-auto max-w-2xl text-base font-semibold">{x.title}</h1>
      </div>
      <div className="flex-1 overflow-auto px-8 py-6">
        <div className="mx-auto max-w-2xl space-y-4">
          <p className="text-sm text-text-secondary">{x.description}</p>
          <PopupBlockerControls api={api} surface="page" />
        </div>
      </div>
    </div>
  );
}
