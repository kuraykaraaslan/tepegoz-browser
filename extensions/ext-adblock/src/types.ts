export type AdblockBlockingMode = 'ads-and-trackers';

export type AdblockEngineStatus = 'idle' | 'loading' | 'ready' | 'updating' | 'error';

export interface AdblockSettings {
  enabled: boolean;
  blockingMode: AdblockBlockingMode;
  cosmeticFiltering: boolean;
  disabledOrigins: string[];
}

export interface AdblockBlockedRequest {
  id: string;
  url: string;
  resourceType: string;
  sourceUrl?: string | undefined;
  pageOrigin?: string | undefined;
  blockedAt: number;
}

export interface AdblockState {
  engineStatus: AdblockEngineStatus;
  blockedThisSession: number;
  lastUpdatedAt: number | null;
  lastError: string | null;
  recentBlocked: AdblockBlockedRequest[];
  refreshAvailableAt: number | null;
}

export interface AdblockHostApi {
  getAdblockSettings(): Promise<AdblockSettings>;
  setAdblockSettings(patch: Partial<AdblockSettings>): Promise<AdblockSettings>;
  getAdblockState(): Promise<AdblockState>;
  setAdblockSiteEnabled(origin: string, enabled: boolean): Promise<AdblockSettings>;
  refreshAdblockLists(): Promise<AdblockState>;
  getActiveTabUrl(): Promise<string | null>;
  tabReload(): void;
}
