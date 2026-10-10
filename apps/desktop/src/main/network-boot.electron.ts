import { app } from 'electron';
import PreferenceStore from '@tepegoz/preferences';
import { registerBasicAuthHandler } from './auth/basic-auth-broker';
import { registerCertificateHandler } from './auth/certificate-broker';
import { registerClientCertificateHandler } from './auth/client-certificate-broker';
import { passwordVault } from './stores.electron';
import BrowsingSessions from './network/browsing-sessions.electron';
import { registerGpcPreload } from './network/gpc-preload.electron';
import { privacySignalHeaders } from './network/privacy-signal-stamp';
import { dnsPrefetchStamp } from './network/dns-prefetch-stamp';
import { registerCertificateRecorder } from './network/certificate-recorder.electron';
import ConnectionPool from './network/connection-pool.electron';
import BindingService from './network/binding-service.electron';
import { broadcastNetworkState } from './ipc/ipc-network';
import userAgentHost from './extensions/user-agent-host.electron';
import DownloadService from './downloads/download-service.electron';
import SafeBrowsingService from './security/safe-browsing-service.electron';
import { registerHttpsOnly } from './network/https-only.electron';
import { setHttpsOnlyEgressCheck } from './network/https-only-wiring';
import { applySecureDns } from './network/secure-dns.electron';
import UploadService from './uploads/upload-service.electron';
import BrowsingWebRequestService from './web-request/browsing-web-request-service.electron';

/**
 * Browsing-network bootstrap, split out of the app entry: the per-session web-request plane, TLS /
 * certificate observation, Safe Browsing, downloads / uploads, the Phase 5 connection pool and the
 * auth handlers. MUST run after `whenReady` and before the first window opens.
 */
export function initBrowsingNetwork(safeMode: boolean): void {
  // The system resolver unless the user chose a DNS-over-HTTPS server. Before any tab can resolve a name.
  applySecureDns();
  // Apply the persisted User-Agent override to the browsing session BEFORE the first tab opens
  // (a no-op default when the extension is disabled).
  if (!safeMode) userAgentHost.init();
  // Own the Electron webRequest listener set for EVERY browsing session — the base partition and
  // every Phase 5 `--conn-` tunnel partition created later. Feature services register with this
  // multiplexer so Electron's "last listener wins" behavior cannot make them silently replace each
  // other; the multiplexer in turn registers with `BrowsingSessions` so a session created after
  // startup is not born without a filtering plane. CRITICAL: a session this cannot attach to is
  // refused outright rather than served unfiltered.
  BrowsingSessions.register(
    'web-request',
    (ses, partition) => {
      BrowsingWebRequestService.attach(
        ses.webRequest,
        // Chromium pre-resolves hostnames through the host resolver, NOT through the session's SOCKS
        // proxy, so a page inside a tunnel can still hand the user's own resolver the list of sites it
        // links to — always suppressed there. Direct sessions keep prefetching (a real speed win) unless
        // the user turned "pre-resolve linked addresses" off.
        {
          // Asked per response, so flipping the setting needs no restart. Tunnel partitions never
          // pre-resolve; the rule lives in `dnsPrefetchStamp`.
          stampResponseHeaders: () =>
            dnsPrefetchStamp(
              BrowsingSessions.isTunnelPartition(partition),
              PreferenceStore.getAll().preloadPages,
            ),
          // Opt-out signals (Global Privacy Control / Do Not Track), read per request for the same reason.
          stampRequestHeaders: () => privacySignalHeaders(PreferenceStore.getAll()),
          blockThirdPartyCookies: () => PreferenceStore.getAll().blockThirdPartyCookies,
          partition,
        },
      );
    },
    { critical: true },
  );
  // `navigator.globalPrivacyControl` on top-level pages (ADR-0051): the input-less page preload, attached
  // to every browsing session while the setting is on. Also in safe mode — it is a privacy signal, not a feature.
  registerGpcPreload();
  // Observe every TLS verification so the Site Info bubble can show a certificate viewer for a
  // page that loaded fine (Electron exposes no cert for a live page otherwise). The proc only
  // records — it defers the trust decision to Chromium — so it is a non-critical attacher.
  registerCertificateRecorder();
  // Create the base browsing session now, so every attacher registered above has run before the
  // first tab can load anything.
  BrowsingSessions.direct();
  // Safe Browsing: compose the prefix store + full-hash client + Settings switch. Inert until an
  // API key is provisioned (ADR-0043). Fire-and-forget — the download-trust provider works before
  // the prefix store finishes loading (an unloaded store resolves to `unknown`, nothing blocked).
  void SafeBrowsingService.init();
  // Browser downloads: attach the browsing-session will-download handler before any page can start
  // a download, load the SQLite projection, and route every file through quarantine first. The
  // download's source origin is checked against Safe Browsing (`unsafe` → auto-`blocked`).
  DownloadService.init(SafeBrowsingService.downloadTrustProvider());
  // HTTPS-only on tunnel partitions (ADR-0050). Registered here, ahead of adblock (deferred-init) and
  // also in safe mode: cleartext must not reach a tunnel exit in either.
  registerHttpsOnly();
  setHttpsOnlyEgressCheck((tabId) => BindingService.mayEgress(tabId));
  UploadService.init();
  // Network privacy (Phase 5): load the configured connections (nothing is dialled here — a
  // connection comes up only when something binds to it) and push the routing picture to the chrome
  // whenever a tunnel's health changes, so an indicator can never sit on a stale "protected".
  ConnectionPool.init();
  BindingService.installNewTabRoute();
  BindingService.installGroupExitGuard();
  // App-issued HTTP (model providers, the agent's web_fetch/sitemap reads, MCP) runs on Node's
  // stack, which `session.setProxy` does not govern — so it needs to be told the General route
  // explicitly or it leaves on the clear path regardless of what the user bound.
  BindingService.installAppEgressRoute();
  ConnectionPool.onStatusChange(() => {
    broadcastNetworkState();
  });
  // 401/407 challenges need a handler or Chromium cancels the request outright. The vault lets it
  // offer a saved credential the same way AutofillHost offers one for a page form.
  registerBasicAuthHandler(app, passwordVault);
  // Without a handler Chromium rejects a bad certificate silently; explain it instead.
  registerCertificateHandler(app);
  // Without this, Electron sends the FIRST client certificate in the OS store to any site that
  // asks — no prompt. See auth/client-certificate-broker.ts.
  registerClientCertificateHandler(app);
}
