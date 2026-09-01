import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { app } from 'electron';
import { Logger } from '@tepegoz/libs';
import { SafeBrowsingProvider, type NavigationVerdict } from '@tepegoz/security-policy';
import PreferenceStore from '@tepegoz/preferences';
import type { DownloadTrustVerdict } from '@tepegoz/downloads';
import type { DownloadTrustProvider } from '../downloads/download-service-model.electron';
import { PrefixStore, type PrefixStoreIo } from './safe-browsing-prefix-store';
import { createFullHashFetcher, type FetchLike } from './safe-browsing-v5-client';
import { safeBrowsingApiKey } from './safe-browsing-config';

/**
 * The one service that owns Safe Browsing at runtime ([ADR-0043](../../../../../docs/adr/0043-safe-browsing-service-and-egress.md)):
 * it composes the on-disk prefix store, the direct-to-Google full-hash client, and the Settings
 * switch into a single {@link SafeBrowsingProvider}, and exposes the two consumers — a navigation
 * gate and the download-trust provider.
 *
 * It holds no policy of its own. Every "should we look this up" decision lives in
 * `SafeBrowsingProvider`; this file is the wiring: a `userData` path, `PreferenceStore`, the API key,
 * and `globalThis.fetch`. The prefix-list *refresh* (the SB v5 threat-list update) is not wired yet —
 * `database()` stays `null` until it is, which the provider reads as `unknown` (nothing blocked).
 */

function dir(): string {
  return join(app.getPath('userData'), 'safe-browsing');
}
function prefixesPath(): string {
  return join(dir(), 'prefixes.json');
}

const fsIo: PrefixStoreIo = {
  read: async () => {
    try {
      return await readFile(prefixesPath(), 'utf8');
    } catch {
      return null;
    }
  },
  write: async (contents) => {
    await mkdir(dir(), { recursive: true });
    const tmp = `${prefixesPath()}.${process.pid}.tmp`;
    await writeFile(tmp, contents, 'utf8');
    await rename(tmp, prefixesPath());
  },
};

const doFetch: FetchLike = globalThis.fetch;

class SafeBrowsingServiceImpl {
  private initialized = false;
  private readonly store = new PrefixStore(fsIo);
  private readonly provider = new SafeBrowsingProvider({
    enabled: () => PreferenceStore.getAll().safeBrowsingEnabled,
    database: () => this.store.database(),
    fetchFullHashes: () => this.fetcher,
  });
  private readonly fetcher = createFullHashFetcher({
    apiKey: safeBrowsingApiKey(),
    fetchImpl: doFetch,
  });

  async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    await this.store.load();
    const on = PreferenceStore.getAll().safeBrowsingEnabled;
    const haveKey = this.fetcher !== null;
    const haveDb = this.store.database() !== null;
    Logger.info('Safe Browsing initialized', {
      enabled: on,
      fullHashResolution: haveKey,
      prefixDatabase: haveDb ? this.store.count() : 0,
    });
    if (on && !haveKey) {
      Logger.info('Safe Browsing has no API key — navigation and download checks resolve to unknown');
    }
  }

  /** Navigation gate. Only a confirmed unsafe returns `block`; every other outcome is `unknown`. */
  checkNavigation(rawUrl: string): Promise<NavigationVerdict> {
    return this.provider.checkNavigation(rawUrl);
  }

  /**
   * The {@link DownloadTrustProvider} for `DownloadService.init` — replaces `unknownTrustProvider`.
   * Checks the download's source origin; `unsafe` → `blocked`, everything else → `unknown` (the file
   * stays quarantined, never trusted). Content-hash reputation is out of scope (ADR-0040 §5).
   */
  downloadTrustProvider(): DownloadTrustProvider {
    return {
      check: async ({ sourceOrigin }): Promise<DownloadTrustVerdict> =>
        this.provider.checkDownloadOrigin(sourceOrigin),
    };
  }
}

const SafeBrowsingService = new SafeBrowsingServiceImpl();
export default SafeBrowsingService;
