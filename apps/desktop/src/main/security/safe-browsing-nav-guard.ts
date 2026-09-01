import type { NavigationVerdict } from '@tepegoz/security-policy';

/**
 * The decision half of the navigation-time Safe Browsing check ([ADR-0043](../../../../../docs/adr/0043-safe-browsing-service-and-egress.md) §1).
 *
 * `will-navigate` is a synchronous Electron event but the verdict is async, so this guard does not
 * try to `preventDefault`. It lets the navigation start, runs the check, and — only on a **confirmed
 * `block`** — invokes the injected `onBlock` effect (the wiring stops the load and shows the
 * interstitial). Every other verdict, including a failed lookup, does nothing: navigation fails open.
 *
 * Two pieces of state make it usable:
 *  - **per-URL "proceed anyway"** — once the user chooses to proceed past an interstitial for a URL,
 *    {@link SafeBrowsingNavGuard.allowOnce} records it so the immediate re-navigation to that same
 *    URL is not blocked again. Session-scoped, capped, never persisted.
 *  - **in-flight de-duplication** — repeated `will-navigate` for the same URL (redirect chains,
 *    double events) share one pending check rather than firing N requests.
 *
 * Pure and effect-injected: no Electron, no `SafeBrowsingService` import. The wiring passes real
 * implementations.
 */

export interface SafeBrowsingNavGuardPorts {
  /** The async verdict for a URL — `SafeBrowsingService.checkNavigation` in production. */
  checkNavigation(url: string): Promise<NavigationVerdict>;
  /** Invoked once when a navigation to `url` is confirmed unsafe and was not user-approved. */
  onBlock(url: string): void;
}

const MAX_ALLOWED = 200;

export class SafeBrowsingNavGuard {
  private readonly allowed = new Set<string>();
  private readonly inFlight = new Map<string, Promise<void>>();

  constructor(private readonly ports: SafeBrowsingNavGuardPorts) {}

  /**
   * Record that the user chose to proceed past the interstitial for `url`. The next check for that
   * exact URL resolves to "allow" without a lookup; it is then consumed, so a later visit is checked
   * again.
   */
  allowOnce(url: string): void {
    if (this.allowed.size >= MAX_ALLOWED) {
      const oldest = this.allowed.values().next().value;
      if (oldest !== undefined) this.allowed.delete(oldest);
    }
    this.allowed.add(url);
  }

  /**
   * Call from `will-navigate` / `will-redirect`. Returns a promise that settles when the check is
   * done (handy for tests); callers normally ignore it. Safe to call repeatedly for the same URL.
   */
  onWillNavigate(url: string): Promise<void> {
    if (this.allowed.has(url)) {
      this.allowed.delete(url);
      return Promise.resolve();
    }
    const existing = this.inFlight.get(url);
    if (existing !== undefined) return existing;

    const run = (async (): Promise<void> => {
      try {
        const verdict = await this.ports.checkNavigation(url);
        // The user may have approved it while the check was in flight.
        if (verdict === 'block' && !this.allowed.has(url)) {
          this.ports.onBlock(url);
        } else if (this.allowed.has(url)) {
          this.allowed.delete(url);
        }
      } catch {
        // A guard that throws must not break navigation. Fail open, like an `unknown` verdict.
      } finally {
        this.inFlight.delete(url);
      }
    })();

    this.inFlight.set(url, run);
    return run;
  }
}
