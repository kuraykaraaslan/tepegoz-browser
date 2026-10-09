import type { WebContents } from 'electron';
import { showHttpsOnlyInterstitial } from '../security/https-only-interstitial.electron';
import BrowsingSessions from './browsing-sessions.electron';
import { classifyLoadFailure, normalizeHost } from './https-only';
import {
  clearPendingHttpsOnly,
  getPendingHttpsOnly,
  tunnelKindOfPartition,
} from './https-only.electron';

/**
 * Whether a tab's traffic is currently allowed to leave (a tunnel that is down says no). Supplied by the
 * boot code instead of imported here: `BindingService` reaches the tab model, and this module is imported
 * BY the tab model's view wiring — importing it directly closes a module cycle (dependency-cruiser's
 * `no-circular`, which CI enforces). The default is "yes", the answer for a tab with no tunnel.
 */
type EgressCheck = (tabId: string) => boolean;
let mayEgress: EgressCheck = () => true;
export function setHttpsOnlyEgressCheck(check: EgressCheck): void {
  mayEgress = check;
}

/**
 * Per-tab half of HTTPS-only (ADR-0050): when the main frame fails to load after the request handler
 * upgraded or cancelled it, explain why instead of leaving Chromium's raw error page.
 *
 * Acts only when the failure matches a record the handler left for this exact tab and host within its
 * TTL. A certificate error, a DNS failure or any code outside the closed allowlist gets NO bypass offer:
 * clicking through cannot fix it, and certificates stay with the certificate broker.
 */
export function wireHttpsOnly(wc: WebContents, tabId: string): void {
  wc.on('did-fail-load', (_e, errorCode, _desc, validatedURL, isMainFrame) => {
    if (!isMainFrame || errorCode === -3) return;
    const record = getPendingHttpsOnly(wc.id);
    if (record === undefined) return;
    let host: string;
    try {
      host = normalizeHost(new URL(validatedURL).hostname);
    } catch {
      return;
    }
    if (host !== record.host) return;
    const partition = BrowsingSessions.partitionOf(wc.session);
    if (partition === null) return;
    clearPendingHttpsOnly(wc.id);
    const kind = tunnelKindOfPartition(partition);
    if (!mayEgress(tabId)) {
      showHttpsOnlyInterstitial(wc, 'tunnel-down', record.host, record.httpUrl, kind);
      return;
    }
    if (record.reason === 'non-get') {
      showHttpsOnlyInterstitial(wc, 'non-get', record.host, record.httpUrl, kind);
      return;
    }
    if (record.reason === 'loop' || classifyLoadFailure(errorCode) === 'offer-bypass') {
      showHttpsOnlyInterstitial(wc, 'bypass', record.host, record.httpUrl, kind);
    }
  });
  // A committed navigation (including the interstitial itself) ends the episode — and so does a load
  // that stops without committing (a download, a 204): otherwise its record would linger and make an
  // unrelated later failure on the same host look like an HTTPS-only fallback. did-fail-load fires
  // BEFORE did-stop-loading, so a real failure is still handled above.
  wc.on('did-navigate', () => {
    clearPendingHttpsOnly(wc.id);
  });
  wc.on('did-stop-loading', () => {
    clearPendingHttpsOnly(wc.id);
  });
}
