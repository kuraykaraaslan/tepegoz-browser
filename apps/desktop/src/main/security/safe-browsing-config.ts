/**
 * The Google Safe Browsing API key ([ADR-0043](../../../../../docs/adr/0043-safe-browsing-service-and-egress.md) §4).
 *
 * It is a **build/release input, not a user secret**: one key for the whole app, granting nothing but
 * Safe Browsing list access, never stored in the credential vault. It is stamped into the main bundle
 * by `electron.vite.config.ts` (`define`) from `TEPEGOZ_SAFE_BROWSING_KEY` at build time; a
 * `TEPEGOZ_SAFE_BROWSING_KEY` in the process environment overrides it (dev + tests).
 *
 * When it resolves to an empty string — the state today, until a key is provisioned — the
 * `SafeBrowsingService` composes a `SafeBrowsingProvider` with no full-hash transport, so every
 * prefix hit resolves to `unknown`: no navigation is blocked and no download is auto-`blocked`. That
 * is the same behaviour as the Settings switch being off.
 */
export function safeBrowsingApiKey(): string {
  const fromEnv = process.env['TEPEGOZ_SAFE_BROWSING_KEY'];
  if (fromEnv !== undefined && fromEnv.trim().length > 0) return fromEnv.trim();
  // Not present under vitest (no vite pass); guard `typeof` before touching the identifier.
  if (typeof __TEPEGOZ_SAFE_BROWSING_KEY__ === 'string' && __TEPEGOZ_SAFE_BROWSING_KEY__.length > 0) {
    return __TEPEGOZ_SAFE_BROWSING_KEY__;
  }
  return '';
}
