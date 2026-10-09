import type { WebContents } from 'electron';
import { showHttpsOnlyInterstitial } from '../security/https-only-interstitial.electron';
import BindingService from './binding-service.electron';
import BrowsingSessions from './browsing-sessions.electron';
import { classifyLoadFailure, normalizeHost } from './https-only';
import {
  clearPendingHttpsOnly,
  getPendingHttpsOnly,
  tunnelKindOfPartition,
} from './https-only.electron';

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
    if (!BindingService.mayEgress(tabId)) {
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
  // A committed navigation (including the interstitial itself) ends the episode.
  wc.on('did-navigate', () => {
    clearPendingHttpsOnly(wc.id);
  });
}
