import { useEffect, useMemo, useState } from 'react';
import { Toggle } from '@tepegoz/ui';
import { coreDict } from '@tepegoz/i18n';
import { useT } from '@tepegoz/i18n/react';
import { videoPlayerDict } from './i18n';
import type { VideoPlayerStrings } from './i18n';
import type {
  VideoPlayerHostApi,
  VideoPlayerPageState,
  VideoPlayerSettings,
  VideoPlayerSubtitleSize,
  VideoPlayerTheme,
} from './types';

export interface VideoPlayerSurfaceProps {
  api: VideoPlayerHostApi;
  onClose: () => void;
}

const BTN_GHOST =
  'shrink-0 rounded-md border border-border px-2 py-1 text-xs text-text-secondary ' +
  'hover:bg-surface-overlay hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-50';

const STAT_BOX = 'rounded-md border border-border px-3 py-2';

const SELECT =
  'shrink-0 rounded-md border border-border bg-surface-base px-2 py-1 text-xs text-text-primary ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-50';

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;
const SCALES = [1, 1.1, 1.25, 1.4, 1.5, 1.75, 2] as const;

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

function subtitleLabel(size: VideoPlayerSubtitleSize, x: VideoPlayerStrings): string {
  if (size === 'sm') return x.sizeSmall;
  if (size === 'lg') return x.sizeLarge;
  if (size === 'xl') return x.sizeXLarge;
  return x.sizeMedium;
}

function themeLabel(theme: VideoPlayerTheme, x: VideoPlayerStrings): string {
  if (theme === 'dark') return x.themeDark;
  if (theme === 'light') return x.themeLight;
  return x.themeAuto;
}

function SettingRow({ label, children }: Readonly<{ label: string; children: React.ReactNode }>) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm text-text-primary">{label}</span>
      {children}
    </div>
  );
}

export function VideoPlayerControls({
  api,
  surface,
}: Readonly<{ api: VideoPlayerHostApi; surface: 'popup' | 'page' }>) {
  const x = useT(videoPlayerDict);
  const [settings, setSettings] = useState<VideoPlayerSettings | null>(null);
  const [page, setPage] = useState<VideoPlayerPageState | null>(null);
  const [activeUrl, setActiveUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const activeOrigin = useMemo(() => originOf(activeUrl), [activeUrl]);
  const sitePaused =
    settings !== null && activeOrigin !== null && settings.disabledOrigins.includes(activeOrigin);

  useEffect(() => {
    let alive = true;
    void Promise.all([api.getVideoPlayerState(), api.getActiveTabUrl()]).then(
      ([state, url]) => {
        if (!alive) return;
        setSettings(state.settings);
        setPage(state.page);
        setActiveUrl(url);
      },
      () => {
        /* host unavailable — controls stay in the loading state */
      },
    );
    const unsubscribe = api.onVideoPlayerPageState((next) => {
      if (alive) setPage(next);
    });
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [api]);

  async function patch(patchSettings: Partial<VideoPlayerSettings>): Promise<void> {
    try {
      setBusy(true);
      setSettings(await api.setVideoPlayerSettings(patchSettings));
    } finally {
      setBusy(false);
    }
  }

  async function toggleSite(): Promise<void> {
    if (activeOrigin === null) return;
    try {
      setBusy(true);
      setSettings(await api.setVideoPlayerSiteEnabled(activeOrigin, sitePaused));
    } finally {
      setBusy(false);
    }
  }

  async function setSiteScale(origin: string, scale: number): Promise<void> {
    if (settings === null) return;
    const next = { ...settings.siteScales };
    if (scale === 1) delete next[origin];
    else next[origin] = scale;
    await patch({ siteScales: next });
  }

  if (settings === null) return <p className="text-sm text-text-secondary">...</p>;

  return (
    <div className="space-y-4">
      <Toggle
        id={`video-player-enabled-${surface}`}
        label={x.enabled}
        description={x.enabledHint}
        checked={settings.enabled}
        onChange={(v) => {
          void patch({ enabled: v });
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
            disabled={busy || activeOrigin === null || !settings.enabled}
            onClick={() => {
              void toggleSite();
            }}
          >
            {sitePaused ? x.resumeSite : x.pauseSite}
          </button>
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-xs text-text-secondary">{x.videosOnPage}</span>
          <span className="text-sm font-semibold text-text-primary">{page?.adopted ?? 0}</span>
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-xs text-text-secondary">{x.siteScale}</span>
          <select
            className={SELECT}
            value={activeOrigin !== null ? (settings.siteScales[activeOrigin] ?? 1) : 1}
            disabled={busy || activeOrigin === null || !settings.enabled}
            onChange={(e) => {
              if (activeOrigin === null) return;
              void setSiteScale(activeOrigin, Number(e.target.value));
            }}
          >
            {SCALES.map((s) => (
              <option key={s} value={s}>
                {s === 1 ? '1× (Normal)' : `${s}×`}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-3">
        <SettingRow label={x.defaultSpeed}>
          <select
            className={SELECT}
            value={settings.defaultSpeed}
            disabled={busy}
            onChange={(e) => {
              void patch({ defaultSpeed: Number(e.target.value) });
            }}
          >
            {SPEEDS.map((s) => (
              <option key={s} value={s}>
                {s === 1 ? '1× (Normal)' : `${s}×`}
              </option>
            ))}
          </select>
        </SettingRow>

        <SettingRow label={x.subtitleSize}>
          <select
            className={SELECT}
            value={settings.subtitleFontSize}
            disabled={busy}
            onChange={(e) => {
              void patch({ subtitleFontSize: e.target.value as VideoPlayerSubtitleSize });
            }}
          >
            {(['sm', 'md', 'lg', 'xl'] as const).map((size) => (
              <option key={size} value={size}>
                {subtitleLabel(size, x)}
              </option>
            ))}
          </select>
        </SettingRow>

        <SettingRow label={x.theme}>
          <select
            className={SELECT}
            value={settings.theme}
            disabled={busy}
            onChange={(e) => {
              void patch({ theme: e.target.value as VideoPlayerTheme });
            }}
          >
            {(['auto', 'dark', 'light'] as const).map((theme) => (
              <option key={theme} value={theme}>
                {themeLabel(theme, x)}
              </option>
            ))}
          </select>
        </SettingRow>
      </div>

      <Toggle
        id={`video-player-autohide-${surface}`}
        label={x.autoHide}
        description={x.autoHideHint}
        checked={settings.autoHideControls}
        onChange={(v) => {
          void patch({ autoHideControls: v });
        }}
      />
      <Toggle
        id={`video-player-keyboard-${surface}`}
        label={x.keyboard}
        description={x.keyboardHint}
        checked={settings.enableKeyboard}
        onChange={(v) => {
          void patch({ enableKeyboard: v });
        }}
      />

      <button
        type="button"
        className={BTN_GHOST}
        onClick={() => {
          api.tabReload();
        }}
      >
        {x.reload}
      </button>

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
                        setSettings(await api.setVideoPlayerSiteEnabled(origin, true));
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
    </div>
  );
}

export function VideoPlayerPopup({ api, onClose }: VideoPlayerSurfaceProps) {
  const x = useT(videoPlayerDict);
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
        <VideoPlayerControls api={api} surface="popup" />
      </div>
    </div>
  );
}

export function VideoPlayerPage({ api }: VideoPlayerSurfaceProps) {
  const x = useT(videoPlayerDict);
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
          <VideoPlayerControls api={api} surface="page" />
        </div>
      </div>
    </div>
  );
}
