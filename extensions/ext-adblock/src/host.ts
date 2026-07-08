import { adblockManifest } from './manifest';
import type {
  AdblockBlockedRequest,
  AdblockEngineStatus,
  AdblockSettings,
  AdblockState,
} from './types';

export const ADBLOCK_EXTENSION_ID = adblockManifest.id;
export const ADBLOCK_MANUAL_REFRESH_COOLDOWN_MS = 30 * 60 * 1000;

export const DEFAULT_ADBLOCK_SETTINGS: AdblockSettings = {
  enabled: true,
  blockingMode: 'ads-and-trackers',
  cosmeticFiltering: true,
  disabledOrigins: [],
};

export interface AdblockHostPorts {
  getPersisted(): AdblockSettings;
  setPersisted(settings: AdblockSettings): void;
  isExtensionEnabled(): boolean;
  now?(): number;
}

export interface RecordBlockedInput {
  url: string;
  resourceType: string;
  sourceUrl?: string | undefined;
  pageOrigin?: string | undefined;
}

export interface AdblockHost {
  init(): void;
  get(): AdblockSettings;
  update(patch: Partial<AdblockSettings>): AdblockSettings;
  state(): AdblockState;
  setSiteEnabled(origin: string, enabled: boolean): AdblockSettings;
  isActiveForPage(pageUrlOrOrigin: string): boolean;
  recordBlocked(input: RecordBlockedInput): void;
  setEngineStatus(status: AdblockEngineStatus, error?: string | null): AdblockState;
  setLastUpdatedAt(ts: number | null): AdblockState;
  canRefreshManual(): boolean;
  markManualRefreshAttempt(): AdblockState;
}

const MAX_DISABLED_ORIGINS = 500;
const MAX_RECENT_BLOCKED = 50;

function uniqueOrigins(origins: readonly string[]): string[] {
  const clean: string[] = [];
  for (const origin of origins) {
    const normalized = normalizeOrigin(origin);
    if (normalized !== null && !clean.includes(normalized)) clean.push(normalized);
    if (clean.length >= MAX_DISABLED_ORIGINS) break;
  }
  return clean;
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

function cloneSettings(settings: AdblockSettings): AdblockSettings {
  return {
    enabled: settings.enabled,
    blockingMode: 'ads-and-trackers',
    cosmeticFiltering: settings.cosmeticFiltering,
    disabledOrigins: [...settings.disabledOrigins],
  };
}

function cloneState(state: AdblockState): AdblockState {
  return {
    engineStatus: state.engineStatus,
    blockedThisSession: state.blockedThisSession,
    lastUpdatedAt: state.lastUpdatedAt,
    lastError: state.lastError,
    recentBlocked: state.recentBlocked.map((item) => ({ ...item })),
    refreshAvailableAt: state.refreshAvailableAt,
  };
}

export function createAdblockHost(ports: AdblockHostPorts): AdblockHost {
  const now = (): number => ports.now?.() ?? Date.now();
  let settings = cloneSettings(DEFAULT_ADBLOCK_SETTINGS);
  let state: AdblockState = {
    engineStatus: 'idle',
    blockedThisSession: 0,
    lastUpdatedAt: null,
    lastError: null,
    recentBlocked: [],
    refreshAvailableAt: null,
  };

  const persist = (): AdblockSettings => {
    ports.setPersisted(settings);
    return cloneSettings(settings);
  };

  return {
    init(): void {
      settings = {
        ...DEFAULT_ADBLOCK_SETTINGS,
        ...ports.getPersisted(),
        blockingMode: 'ads-and-trackers',
        disabledOrigins: uniqueOrigins(ports.getPersisted().disabledOrigins),
      };
    },

    get(): AdblockSettings {
      return cloneSettings(settings);
    },

    update(patch: Partial<AdblockSettings>): AdblockSettings {
      settings = {
        ...settings,
        ...patch,
        blockingMode: 'ads-and-trackers',
        disabledOrigins:
          patch.disabledOrigins !== undefined
            ? uniqueOrigins(patch.disabledOrigins)
            : settings.disabledOrigins,
      };
      return persist();
    },

    state(): AdblockState {
      return cloneState(state);
    },

    setSiteEnabled(origin: string, enabled: boolean): AdblockSettings {
      const normalized = normalizeOrigin(origin);
      if (normalized === null) return cloneSettings(settings);
      const disabled = settings.disabledOrigins.filter((item) => item !== normalized);
      settings = {
        ...settings,
        disabledOrigins: enabled
          ? disabled
          : [...disabled, normalized].slice(0, MAX_DISABLED_ORIGINS),
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

    recordBlocked(input: RecordBlockedInput): void {
      const blockedAt = now();
      const entry: AdblockBlockedRequest = {
        id: `adblock:${blockedAt}:${input.url}`,
        url: input.url,
        resourceType: input.resourceType,
        ...(input.sourceUrl !== undefined ? { sourceUrl: input.sourceUrl } : {}),
        ...(input.pageOrigin !== undefined ? { pageOrigin: input.pageOrigin } : {}),
        blockedAt,
      };
      state = {
        ...state,
        blockedThisSession: state.blockedThisSession + 1,
        recentBlocked: [entry, ...state.recentBlocked].slice(0, MAX_RECENT_BLOCKED),
      };
    },

    setEngineStatus(status: AdblockEngineStatus, error?: string | null): AdblockState {
      state = {
        ...state,
        engineStatus: status,
        lastError: error === undefined ? state.lastError : error,
      };
      return cloneState(state);
    },

    setLastUpdatedAt(ts: number | null): AdblockState {
      state = { ...state, lastUpdatedAt: ts };
      return cloneState(state);
    },

    canRefreshManual(): boolean {
      return state.refreshAvailableAt === null || now() >= state.refreshAvailableAt;
    },

    markManualRefreshAttempt(): AdblockState {
      state = { ...state, refreshAvailableAt: now() + ADBLOCK_MANUAL_REFRESH_COOLDOWN_MS };
      return cloneState(state);
    },
  };
}
