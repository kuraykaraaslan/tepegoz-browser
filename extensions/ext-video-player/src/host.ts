import { videoPlayerManifest } from './manifest';
import type {
  VideoPlayerSettings,
  VideoPlayerSkinOptions,
  VideoPlayerSubtitleSize,
  VideoPlayerTheme,
} from './types';

export const VIDEO_PLAYER_EXTENSION_ID = videoPlayerManifest.id;

export const DEFAULT_VIDEO_PLAYER_SETTINGS: VideoPlayerSettings = {
  enabled: true,
  defaultSpeed: 1,
  subtitleFontSize: 'md',
  theme: 'auto',
  autoHideControls: true,
  enableKeyboard: true,
  disabledOrigins: [],
  // YouTube's own player is large and hard to control by hand — default it to a comfortable 1.4x.
  siteScales: { 'https://www.youtube.com': 1.4 },
};

const MAX_DISABLED_ORIGINS = 500;
const MAX_SITE_SCALES = 500;
const MIN_SCALE = 0.5;
const MAX_SCALE = 3;
const SUBTITLE_SIZES: readonly VideoPlayerSubtitleSize[] = ['sm', 'md', 'lg', 'xl'];
const THEMES: readonly VideoPlayerTheme[] = ['light', 'dark', 'auto'];

export interface VideoPlayerHostPorts {
  getPersisted(): VideoPlayerSettings;
  setPersisted(settings: VideoPlayerSettings): void;
  isExtensionEnabled(): boolean;
}

export interface VideoPlayerHost {
  init(): void;
  get(): VideoPlayerSettings;
  update(patch: Partial<VideoPlayerSettings>): VideoPlayerSettings;
  setSiteEnabled(origin: string, enabled: boolean): VideoPlayerSettings;
  isActiveForPage(pageUrlOrOrigin: string): boolean;
  skinOptions(origin: string | null): VideoPlayerSkinOptions;
}

export function normalizeOrigin(value: string): string | null {
  try {
    const url = value.includes('://') ? new URL(value) : new URL(`https://${value}`);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.origin;
  } catch {
    return null;
  }
}

function uniqueOrigins(origins: readonly string[]): string[] {
  const clean: string[] = [];
  for (const origin of origins) {
    const normalized = normalizeOrigin(origin);
    if (normalized !== null && !clean.includes(normalized)) clean.push(normalized);
    if (clean.length >= MAX_DISABLED_ORIGINS) break;
  }
  return clean;
}

function clampSpeed(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(4, Math.max(0.25, value));
}

function clampScale(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
}

function sanitizeSiteScales(input: Record<string, number>): Record<string, number> {
  const clean: Record<string, number> = {};
  let count = 0;
  for (const [origin, scale] of Object.entries(input)) {
    const normalized = normalizeOrigin(origin);
    if (normalized === null) continue;
    clean[normalized] = clampScale(scale);
    count += 1;
    if (count >= MAX_SITE_SCALES) break;
  }
  return clean;
}

function sanitize(input: VideoPlayerSettings): VideoPlayerSettings {
  return {
    enabled: input.enabled,
    defaultSpeed: clampSpeed(input.defaultSpeed),
    subtitleFontSize: SUBTITLE_SIZES.includes(input.subtitleFontSize) ? input.subtitleFontSize : 'md',
    theme: THEMES.includes(input.theme) ? input.theme : 'auto',
    autoHideControls: input.autoHideControls,
    enableKeyboard: input.enableKeyboard,
    disabledOrigins: uniqueOrigins(input.disabledOrigins),
    siteScales: sanitizeSiteScales(input.siteScales),
  };
}

function cloneSettings(settings: VideoPlayerSettings): VideoPlayerSettings {
  return {
    ...settings,
    disabledOrigins: [...settings.disabledOrigins],
    siteScales: { ...settings.siteScales },
  };
}

export function createVideoPlayerHost(ports: VideoPlayerHostPorts): VideoPlayerHost {
  let settings = cloneSettings(DEFAULT_VIDEO_PLAYER_SETTINGS);

  const persist = (): VideoPlayerSettings => {
    ports.setPersisted(settings);
    return cloneSettings(settings);
  };

  return {
    init(): void {
      settings = sanitize({ ...DEFAULT_VIDEO_PLAYER_SETTINGS, ...ports.getPersisted() });
    },

    get(): VideoPlayerSettings {
      return cloneSettings(settings);
    },

    update(patch: Partial<VideoPlayerSettings>): VideoPlayerSettings {
      settings = sanitize({ ...settings, ...patch });
      return persist();
    },

    setSiteEnabled(origin: string, enabled: boolean): VideoPlayerSettings {
      const normalized = normalizeOrigin(origin);
      if (normalized === null) return cloneSettings(settings);
      const without = settings.disabledOrigins.filter((item) => item !== normalized);
      settings = {
        ...settings,
        disabledOrigins: enabled ? without : [...without, normalized].slice(0, MAX_DISABLED_ORIGINS),
      };
      return persist();
    },

    isActiveForPage(pageUrlOrOrigin: string): boolean {
      const origin = normalizeOrigin(pageUrlOrOrigin);
      return (
        ports.isExtensionEnabled() &&
        settings.enabled &&
        origin !== null &&
        !settings.disabledOrigins.includes(origin)
      );
    },

    skinOptions(origin: string | null): VideoPlayerSkinOptions {
      return {
        defaultSpeed: settings.defaultSpeed,
        autoHideControls: settings.autoHideControls,
        enableKeyboard: settings.enableKeyboard,
        theme: settings.theme === 'light' ? 'light' : 'dark',
        scale: (origin !== null ? settings.siteScales[origin] : undefined) ?? 1,
      };
    },
  };
}
