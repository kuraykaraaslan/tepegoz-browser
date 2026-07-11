import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { app, type WebContents } from 'electron';
import { ElectronBlocker } from '@ghostery/adblocker-electron';
import { Logger } from '@tepegoz/libs';
import adblockHost from './adblock-host.electron';
import TabManager from '../tabs';
import BrowsingWebRequestService from '../web-request/browsing-web-request-service.electron';

const DAILY_REFRESH_MS = 24 * 60 * 60 * 1000;
const COUNTED_REQUEST_CAP = 5_000;

interface AdblockMetadata {
  lastUpdatedAt: number | null;
}

let blocker: ElectronBlocker | null = null;
let initialized = false;
let refreshPromise: Promise<unknown> | null = null;
let refreshTimer: ReturnType<typeof setInterval> | null = null;
const countedRequestIds: number[] = [];
const countedRequests = new Set<number>();

function adblockDir(): string {
  return join(app.getPath('userData'), 'adblock');
}

function enginePath(): string {
  return join(adblockDir(), 'engine.bin');
}

function metadataPath(): string {
  return join(adblockDir(), 'metadata.json');
}

function isWebUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function originOf(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined;
    return parsed.origin;
  } catch {
    return undefined;
  }
}

function pageUrlFor(
  details: Electron.OnBeforeRequestListenerDetails | Electron.OnHeadersReceivedListenerDetails,
): string {
  if (details.resourceType === 'mainFrame') return details.url;
  if (details.referrer.length > 0) return details.referrer;
  const frameUrl = details.frame?.url;
  if (frameUrl !== undefined && frameUrl.length > 0) return frameUrl;
  const webContentsUrl =
    details.webContents?.isDestroyed() === false ? details.webContents.getURL() : '';
  return webContentsUrl.length > 0 ? webContentsUrl : details.url;
}

function requestSourceUrl(
  details: Electron.OnBeforeRequestListenerDetails | Electron.OnHeadersReceivedListenerDetails,
): string | undefined {
  if (details.referrer.length > 0) return details.referrer;
  const frameUrl = details.frame?.url;
  return frameUrl !== undefined && frameUrl.length > 0 ? frameUrl : undefined;
}

function recordBlockedOnce(
  details: Electron.OnBeforeRequestListenerDetails | Electron.OnHeadersReceivedListenerDetails,
  pageUrl: string,
): void {
  if (countedRequests.has(details.id)) return;
  countedRequests.add(details.id);
  countedRequestIds.push(details.id);
  while (countedRequestIds.length > COUNTED_REQUEST_CAP) {
    const removed = countedRequestIds.shift();
    if (removed !== undefined) countedRequests.delete(removed);
  }
  adblockHost.recordBlocked({
    url: details.url,
    resourceType: details.resourceType,
    ...(requestSourceUrl(details) !== undefined ? { sourceUrl: requestSourceUrl(details) } : {}),
    ...(originOf(pageUrl) !== undefined ? { pageOrigin: originOf(pageUrl) } : {}),
  });
}

function shouldFilter(
  details: Electron.OnBeforeRequestListenerDetails | Electron.OnHeadersReceivedListenerDetails,
): { active: boolean; pageUrl: string } {
  const pageUrl = pageUrlFor(details);
  return { active: adblockHost.isActiveForPage(pageUrl), pageUrl };
}

function callBeforeRequest(
  engine: ElectronBlocker,
  details: Electron.OnBeforeRequestListenerDetails,
): Promise<Electron.CallbackResponse> {
  return new Promise((resolve, reject) => {
    try {
      engine.onBeforeRequest(details, resolve);
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

function callHeadersReceived(
  engine: ElectronBlocker,
  details: Electron.OnHeadersReceivedListenerDetails,
): Promise<Electron.HeadersReceivedResponse> {
  return new Promise((resolve, reject) => {
    try {
      engine.onHeadersReceived(details, resolve);
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

async function readMetadata(): Promise<AdblockMetadata> {
  try {
    const raw = await readFile(metadataPath(), 'utf8');
    const parsed = JSON.parse(raw) as Partial<AdblockMetadata>;
    return {
      lastUpdatedAt:
        typeof parsed.lastUpdatedAt === 'number' && Number.isFinite(parsed.lastUpdatedAt)
          ? parsed.lastUpdatedAt
          : null,
    };
  } catch {
    return { lastUpdatedAt: null };
  }
}

async function writeCache(next: ElectronBlocker, metadata: AdblockMetadata): Promise<void> {
  await mkdir(adblockDir(), { recursive: true });
  const engineTmp = `${enginePath()}.tmp`;
  const metaTmp = `${metadataPath()}.tmp`;
  await writeFile(engineTmp, Buffer.from(next.serialize()));
  await writeFile(metaTmp, JSON.stringify(metadata, null, 2));
  await rename(engineTmp, enginePath());
  await rename(metaTmp, metadataPath());
}

async function loadFromCache(): Promise<boolean> {
  try {
    blocker = ElectronBlocker.deserialize(await readFile(enginePath()));
    adblockHost.setEngineStatus('ready', null);
    Logger.info('Adblock engine restored from cache');
    return true;
  } catch (err) {
    Logger.info('Adblock cache unavailable; refreshing lists', { err: String(err) });
    return false;
  }
}

function domainFor(hostname: string): string | null {
  const labels = hostname.split('.').filter((label) => label.length > 0);
  if (labels.length < 2) return hostname;
  return labels.slice(-2).join('.');
}

async function applyCosmetics(url: string, wc: WebContents): Promise<void> {
  const engine = blocker;
  const settings = adblockHost.get();
  if (
    engine === null ||
    !settings.cosmeticFiltering ||
    !adblockHost.isActiveForPage(url) ||
    !isWebUrl(url) ||
    wc.isDestroyed()
  ) {
    return;
  }
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname;
    const cosmetics = engine.getCosmeticsFilters({
      url,
      hostname,
      domain: domainFor(hostname),
      classes: [],
      hrefs: [],
      ids: [],
      getBaseRules: true,
      getInjectionRules: false,
      getExtendedRules: false,
      getRulesFromDOM: false,
      getRulesFromHostname: true,
    });
    if (cosmetics.active && cosmetics.styles.trim().length > 0 && !wc.isDestroyed()) {
      await wc.insertCSS(cosmetics.styles, { cssOrigin: 'user' });
    }
  } catch (err) {
    Logger.warn('Adblock cosmetic injection failed open', { url, err: String(err) });
  }
}

async function loadInitial(): Promise<void> {
  const metadata = await readMetadata();
  adblockHost.setLastUpdatedAt(metadata.lastUpdatedAt);
  adblockHost.setEngineStatus('loading', null);
  const restored = await loadFromCache();
  if (!restored) {
    await AdblockEngineService.refresh({ manual: false });
    return;
  }
  if (metadata.lastUpdatedAt === null || Date.now() - metadata.lastUpdatedAt > DAILY_REFRESH_MS) {
    void AdblockEngineService.refresh({ manual: false });
  }
}

const AdblockEngineService = {
  init(): void {
    if (initialized) return;
    initialized = true;

    BrowsingWebRequestService.onBeforeRequest('adblock', async (details) => {
      const engine = blocker;
      if (engine === null) return {};
      const { active, pageUrl } = shouldFilter(details);
      if (!active) return {};
      const response = await callBeforeRequest(engine, details);
      if (response.cancel === true || response.redirectURL !== undefined)
        recordBlockedOnce(details, pageUrl);
      return response;
    });

    BrowsingWebRequestService.onHeadersReceived('adblock', async (details) => {
      const engine = blocker;
      if (engine === null) return {};
      const { active, pageUrl } = shouldFilter(details);
      if (!active) return {};
      const response = await callHeadersReceived(engine, details);
      if (response.cancel === true) recordBlockedOnce(details, pageUrl);
      return response;
    });

    TabManager.onNavigation((url, wc) => {
      void applyCosmetics(url, wc);
    });

    refreshTimer = setInterval(() => {
      void AdblockEngineService.refresh({ manual: false });
    }, DAILY_REFRESH_MS);
    refreshTimer.unref?.();

    void loadInitial();
  },

  async refresh(opts: { manual: boolean }): Promise<void> {
    if (opts.manual && !adblockHost.canRefreshManual()) return;
    if (refreshPromise !== null) {
      await refreshPromise;
      return;
    }

    if (opts.manual) adblockHost.markManualRefreshAttempt();
    refreshPromise = (async () => {
      const hadEngine = blocker !== null;
      adblockHost.setEngineStatus(hadEngine ? 'updating' : 'loading', null);
      try {
        const next = await ElectronBlocker.fromPrebuiltAdsAndTracking(globalThis.fetch);
        const updatedAt = Date.now();
        await writeCache(next, { lastUpdatedAt: updatedAt });
        blocker = next;
        adblockHost.setLastUpdatedAt(updatedAt);
        adblockHost.setEngineStatus('ready', null);
        Logger.info('Adblock lists refreshed');
      } catch (err) {
        const message = String(err);
        adblockHost.setEngineStatus(hadEngine ? 'ready' : 'error', message);
        Logger.warn('Adblock list refresh failed; keeping previous engine', { err: message });
      }
    })();

    try {
      await refreshPromise;
    } finally {
      refreshPromise = null;
    }
  },

  resetForTests(): void {
    blocker = null;
    initialized = false;
    refreshPromise = null;
    countedRequestIds.length = 0;
    countedRequests.clear();
    if (refreshTimer !== null) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
  },
};

export default AdblockEngineService;
