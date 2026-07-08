import { useEffect, useMemo, useState } from 'react';
import { Toggle } from '@tepegoz/ui';
import { coreDict } from '@tepegoz/i18n';
import { useT } from '@tepegoz/i18n/react';
import { adblockDict } from './i18n';
import type { AdblockStrings } from './i18n';
import type { AdblockBlockedRequest, AdblockHostApi, AdblockSettings, AdblockState } from './types';

export interface AdblockSurfaceProps {
  api: AdblockHostApi;
  onClose: () => void;
}

const BTN_GHOST =
  'shrink-0 rounded-md border border-border px-2 py-1 text-xs text-text-secondary ' +
  'hover:bg-surface-overlay hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-50';

const STAT_BOX = 'rounded-md border border-border px-3 py-2';

function originOf(url: string | null): string | null {
  if (url === null) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

function hostLabel(urlOrOrigin: string): string {
  try {
    return new URL(urlOrOrigin).hostname;
  } catch {
    return urlOrOrigin;
  }
}

function fmtDate(ts: number | null, fallback: string): string {
  if (ts === null) return fallback;
  return new Date(ts).toLocaleString();
}

function resourceTitle(req: AdblockBlockedRequest): string {
  try {
    const parsed = new URL(req.url);
    return parsed.hostname;
  } catch {
    return req.url;
  }
}

function statusLabel(status: AdblockState['engineStatus'], x: AdblockStrings): string {
  if (status === 'loading') return x.statusLoading;
  if (status === 'ready') return x.statusReady;
  if (status === 'updating') return x.statusUpdating;
  if (status === 'error') return x.statusError;
  return x.statusIdle;
}

function RecentBlockedList({
  items,
  empty,
}: Readonly<{ items: AdblockBlockedRequest[]; empty: string }>) {
  if (items.length === 0) return <p className="mt-1 text-sm text-text-secondary">{empty}</p>;
  return (
    <ul className="mt-2 space-y-1.5">
      {items.map((req) => (
        <li key={req.id} className="rounded-md border border-border px-3 py-2">
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 truncate font-mono text-xs text-text-primary">
              {resourceTitle(req)}
            </p>
            <span className="shrink-0 rounded bg-surface-overlay px-1.5 py-0.5 text-[11px] text-text-tertiary">
              {req.resourceType}
            </span>
          </div>
          <p className="mt-0.5 truncate text-xs text-text-secondary">{req.url}</p>
          <p className="mt-1 text-xs text-text-tertiary">
            {new Date(req.blockedAt).toLocaleTimeString()}
            {req.pageOrigin !== undefined ? ` - ${hostLabel(req.pageOrigin)}` : ''}
          </p>
        </li>
      ))}
    </ul>
  );
}

export function AdblockControls({
  api,
  surface,
}: Readonly<{
  api: AdblockHostApi;
  surface: 'popup' | 'page';
}>) {
  const x = useT(adblockDict);
  const [settings, setSettings] = useState<AdblockSettings | null>(null);
  const [state, setState] = useState<AdblockState | null>(null);
  const [activeUrl, setActiveUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const activeOrigin = useMemo(() => originOf(activeUrl), [activeUrl]);
  const sitePaused =
    settings !== null && activeOrigin !== null && settings.disabledOrigins.includes(activeOrigin);
  const updateCoolingDown =
    state?.refreshAvailableAt !== null &&
    state?.refreshAvailableAt !== undefined &&
    Date.now() < state.refreshAvailableAt;

  async function refresh(): Promise<void> {
    const [nextSettings, nextState, nextUrl] = await Promise.all([
      api.getAdblockSettings(),
      api.getAdblockState(),
      api.getActiveTabUrl(),
    ]);
    setSettings(nextSettings);
    setState(nextState);
    setActiveUrl(nextUrl);
  }

  useEffect(() => {
    let alive = true;
    void Promise.all([api.getAdblockSettings(), api.getAdblockState(), api.getActiveTabUrl()]).then(
      ([nextSettings, nextState, nextUrl]) => {
        if (!alive) return;
        setSettings(nextSettings);
        setState(nextState);
        setActiveUrl(nextUrl);
      },
      () => {
        /* host unavailable — controls stay in the loading state */
      },
    );
    return () => {
      alive = false;
    };
  }, [api]);

  async function patch(patchSettings: Partial<AdblockSettings>, reload = false): Promise<void> {
    try {
      setBusy(true);
      setSettings(await api.setAdblockSettings(patchSettings));
      setState(await api.getAdblockState());
      if (reload) api.tabReload();
    } finally {
      setBusy(false);
    }
  }

  async function toggleSite(): Promise<void> {
    if (activeOrigin === null) return;
    try {
      setBusy(true);
      setSettings(await api.setAdblockSiteEnabled(activeOrigin, sitePaused));
      setState(await api.getAdblockState());
      api.tabReload();
    } finally {
      setBusy(false);
    }
  }

  async function updateFilters(): Promise<void> {
    try {
      setBusy(true);
      setState(await api.refreshAdblockLists());
    } finally {
      setBusy(false);
    }
  }

  if (settings === null || state === null)
    return <p className="text-sm text-text-secondary">...</p>;

  return (
    <div className="space-y-4">
      <Toggle
        id={`adblock-enabled-${surface}`}
        label={x.enabled}
        description={x.enabledHint}
        checked={settings.enabled}
        onChange={(v) => {
          void patch({ enabled: v }, true);
        }}
      />
      <Toggle
        id={`adblock-cosmetic-${surface}`}
        label={x.cosmeticFiltering}
        description={x.cosmeticHint}
        checked={settings.cosmeticFiltering}
        onChange={(v) => {
          void patch({ cosmeticFiltering: v }, true);
        }}
      />

      <div className={STAT_BOX}>
        <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">
          {x.currentSite}
        </p>
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="min-w-0 truncate font-mono text-xs text-text-primary">
            {activeOrigin ?? x.noSite}
          </span>
          <button
            type="button"
            className={BTN_GHOST}
            disabled={busy || activeOrigin === null}
            onClick={() => {
              void toggleSite();
            }}
          >
            {sitePaused ? x.resumeSite : x.pauseSite}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className={STAT_BOX}>
          <p className="text-xs text-text-secondary">{x.blockedThisSession}</p>
          <p className="mt-1 text-lg font-semibold text-text-primary">{state.blockedThisSession}</p>
        </div>
        <div className={STAT_BOX}>
          <p className="text-xs text-text-secondary">{x.engineStatus}</p>
          <p className="mt-1 text-sm font-medium text-text-primary">
            {statusLabel(state.engineStatus, x)}
          </p>
        </div>
      </div>

      <div className={STAT_BOX}>
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs text-text-secondary">{x.lastUpdated}</p>
            <p className="mt-1 truncate text-xs text-text-primary">
              {fmtDate(state.lastUpdatedAt, x.neverUpdated)}
            </p>
            {state.lastError !== null ? (
              <p className="mt-1 truncate text-xs text-red-500">{state.lastError}</p>
            ) : null}
          </div>
          <button
            type="button"
            className={BTN_GHOST}
            disabled={
              busy ||
              updateCoolingDown ||
              state.engineStatus === 'loading' ||
              state.engineStatus === 'updating'
            }
            onClick={() => {
              void updateFilters();
            }}
          >
            {updateCoolingDown ? x.updateCoolingDown : x.updateNow}
          </button>
        </div>
      </div>

      <button
        type="button"
        className={BTN_GHOST}
        onClick={() => {
          api.tabReload();
          void refresh();
        }}
      >
        {x.reload}
      </button>

      {surface === 'page' ? (
        <div>
          <h3 className="text-xs font-medium uppercase tracking-wide text-text-secondary">
            {x.disabledSites}
          </h3>
          {settings.disabledOrigins.length === 0 ? (
            <p className="mt-1 text-sm text-text-secondary">{x.disabledSitesEmpty}</p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {settings.disabledOrigins.map((origin) => (
                <li
                  key={origin}
                  className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-1.5"
                >
                  <span className="min-w-0 truncate font-mono text-xs text-text-primary">
                    {origin}
                  </span>
                  <button
                    type="button"
                    className={BTN_GHOST}
                    disabled={busy}
                    onClick={() => {
                      void (async () => {
                        setBusy(true);
                        try {
                          setSettings(await api.setAdblockSiteEnabled(origin, true));
                        } finally {
                          setBusy(false);
                        }
                      })();
                    }}
                  >
                    {x.remove}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      <div>
        <h3 className="text-xs font-medium uppercase tracking-wide text-text-secondary">
          {x.recentBlocked}
        </h3>
        <RecentBlockedList items={state.recentBlocked} empty={x.recentBlockedEmpty} />
      </div>
    </div>
  );
}

export function AdblockPopup({ api, onClose }: AdblockSurfaceProps) {
  const x = useT(adblockDict);
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
        <AdblockControls api={api} surface="popup" />
      </div>
    </div>
  );
}

export function AdblockPage({ api }: AdblockSurfaceProps) {
  const x = useT(adblockDict);
  return (
    <div className="flex h-full flex-col bg-surface-base text-text-primary">
      <div className="shrink-0 border-b border-border px-8 py-4">
        <h1 className="mx-auto max-w-3xl text-base font-semibold">{x.title}</h1>
      </div>
      <div className="flex-1 overflow-auto px-8 py-6">
        <div className="mx-auto max-w-3xl space-y-4">
          <p className="text-sm text-text-secondary">{x.description}</p>
          <p className="rounded-md border border-border px-3 py-2 text-xs text-text-secondary">
            {x.bestEffort}
          </p>
          <AdblockControls api={api} surface="page" />
        </div>
      </div>
    </div>
  );
}
