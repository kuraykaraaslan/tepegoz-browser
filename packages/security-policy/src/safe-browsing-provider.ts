import { checkUrl, resolveVerdict, type FullHashFetcher, type PrefixDatabase } from './safe-browsing';

/**
 * The gating layer between the pure Safe Browsing v5 primitives (`checkUrl` / `resolveVerdict`) and
 * the two places a verdict is consumed: a navigation gate and the download-trust provider
 * ([ADR-0040](../../../docs/adr/0040-download-trust-model.md) §5,
 * [ADR-0043](../../../docs/adr/0043-safe-browsing-service-and-egress.md)).
 *
 * Everything network- or Electron-shaped is injected. This class holds no timers, no HTTP client and
 * no disk — the desktop `SafeBrowsingService` supplies those through {@link SafeBrowsingProviderPorts}.
 * That keeps the decision logic — *when* a lookup happens, *when* a failure blocks — unit-testable
 * without a live list or a socket.
 *
 * The one asymmetry worth stating up front: **navigation fails open, downloads fail closed.** A
 * lookup that errors, times out, or cannot run (feature off, no database, no transport) must never
 * block a navigation — an offline browser that refuses every page is broken, not safe. The same
 * `unknown` on a *download* origin is allowed to hold the file in quarantine, because a blocked
 * download is recoverable through the release gate and a hostile file is not.
 */

/** The verdict a navigation gate acts on. `unknown` covers every non-answer and must not block. */
export type NavigationVerdict = 'allow' | 'block' | 'unknown';

export interface SafeBrowsingProviderPorts {
  /**
   * The master switch, read on every call. When it returns `false` the provider is fully inert: no
   * database read, no full-hash request, and every verdict is `unknown`. This is the state behind
   * the Settings "Safe Browsing protection" toggle when it is off.
   */
  enabled(): boolean;
  /**
   * The locally-held four-byte prefix set, or `null` when none has been downloaded yet. A miss in
   * this set is a definitive "not on the list" and no request is made for it.
   */
  database(): PrefixDatabase | null;
  /**
   * Step 4 — resolve prefix hits to full hashes over the network. `null` when no transport is
   * configured (no API key provisioned, kill switch engaged, or simply not wired yet). With no
   * fetcher a prefix hit is *unresolvable*, which is `unknown` — never an assumed block and never an
   * assumed pass.
   */
  fetchFullHashes(): FullHashFetcher | null;
}

export class SafeBrowsingProvider {
  constructor(private readonly ports: SafeBrowsingProviderPorts) {}

  /**
   * The shared core. Returns Google's three-state verdict:
   *  - `safe` — the URL is clear of the local set, or every prefix hit was a four-byte collision.
   *  - `unsafe` — a full hash confirmed against the resolved candidates. The only blocking verdict.
   *  - `unknown` — the feature is off, no database, no transport, or the fetch failed. Never blocks
   *    a navigation; holds a download in quarantine.
   */
  private async verdict(rawUrl: string): Promise<'safe' | 'unsafe' | 'unknown'> {
    if (!this.ports.enabled()) return 'unknown';
    const db = this.ports.database();
    if (db === null) return 'unknown';
    const fetcher = this.ports.fetchFullHashes();
    if (fetcher === null) {
      // A local clear is still a definitive `safe` — it needed no network. A prefix hit we cannot
      // resolve is a guess, and a guess is `unknown`.
      return checkUrl(rawUrl, db).clear ? 'safe' : 'unknown';
    }
    return resolveVerdict(rawUrl, db, fetcher);
  }

  /**
   * Navigation gate. **Only a confirmed `unsafe` blocks.** Every other outcome — including a failed
   * or impossible lookup — is `unknown`, which the caller must treat as "proceed".
   */
  async checkNavigation(rawUrl: string): Promise<NavigationVerdict> {
    const v = await this.verdict(rawUrl);
    if (v === 'unsafe') return 'block';
    if (v === 'safe') return 'allow';
    return 'unknown';
  }

  /**
   * Download-trust gate, checking the download's **source origin / URL** (not its bytes — content
   * reputation is out of scope, [ADR-0040](../../../docs/adr/0040-download-trust-model.md) §5).
   * `unsafe` → `blocked`; anything else → `unknown`, which leaves the file quarantined rather than
   * released or trusted.
   */
  async checkDownloadOrigin(sourceOrigin: string | undefined): Promise<'blocked' | 'unknown'> {
    if (sourceOrigin === undefined || sourceOrigin.length === 0) return 'unknown';
    return (await this.verdict(sourceOrigin)) === 'unsafe' ? 'blocked' : 'unknown';
  }
}
