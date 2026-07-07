/**
 * Omnibox → navigable URL, with a SCHEME ALLOW-LIST at the source (security review finding).
 *
 * Only http(s) URLs are ever produced for loading. A dangerous or unexpected scheme typed/pasted into
 * the omnibox (file:, chrome:, javascript:, data:, blob:, custom protocols, …) is NOT loaded as-is —
 * it falls through to a web search. This is the real guard for the programmatic `loadURL` path, which
 * Electron's `will-navigate` event does NOT cover.
 *
 * Pure (no Electron, no app imports) so it is unit-testable and reusable by every load entry point.
 * The set of internal (`tepegoz://…`) pages is app-specific, so `internalPageUrl` takes it as an
 * argument rather than importing app constants.
 */
const HTTP_SCHEME = /^https?:\/\//i;
const LOCALHOST = /^(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i;

/** True only for http/https URLs — the only schemes safe to load into an untrusted browsing view. */
export function isWebUrl(url: string): boolean {
  return HTTP_SCHEME.test(url.trim());
}

/**
 * The canonical internal-page URL (tepegoz://…) if `input` addresses one (trailing slash tolerated),
 * else null. A simple fragment (`#section-id`) is preserved so internal pages can deep-link to a
 * trusted in-app section without becoming a web navigation. Internal pages are rendered by the trusted
 * chrome, NOT loaded into a browsing view.
 * `internalUrls` must be the lowercase, canonical set of internal page URLs for the host app.
 */
export function internalPageUrl(input: string, internalUrls: readonly string[]): string | null {
  const trimmed = input.trim().toLowerCase();
  const hashIndex = trimmed.indexOf('#');
  const base = (hashIndex >= 0 ? trimmed.slice(0, hashIndex) : trimmed).replace(/\/+$/, '');
  const canonical = internalUrls.find((url) => url === base);
  if (canonical === undefined) return null;

  const fragment = hashIndex >= 0 ? trimmed.slice(hashIndex + 1) : '';
  if (fragment.length === 0) return canonical;
  return /^[a-z0-9_-]{1,64}$/.test(fragment) ? `${canonical}#${fragment}` : canonical;
}

function looksLikeHost(input: string): boolean {
  const host = input.split('/')[0] ?? input;
  if (/^localhost(:\d+)?$/i.test(host)) return true; // localhost / localhost:port
  if (/^[^\s:]+:\d+$/.test(host)) return true; // host:port (incl. IP:port)
  return /^[^\s.]+(\.[^\s.]+)+$/.test(host); // dotted domain or IP
}

/** Default web-search builder (DuckDuckGo) — used when the caller doesn't pass its own. The app wires
 *  the user's selected/custom engine via `buildSearch` (see `tabs.ts`); the pure package stays
 *  engine-agnostic and app-import-free. */
function defaultSearch(query: string): string {
  return `https://duckduckgo.com/?q=${encodeURIComponent(query)}`;
}

export function toNavigationUrl(
  input: string,
  fallbackUrl: string,
  buildSearch: (query: string) => string = defaultSearch,
): string {
  const s = input.trim();
  if (s.length === 0) return fallbackUrl;
  if (HTTP_SCHEME.test(s)) return s; // already an http(s) URL
  if (!s.includes(' ') && looksLikeHost(s)) {
    // localhost is conventionally http; everything else defaults to https.
    return `${LOCALHOST.test(s) ? 'http' : 'https'}://${s}`;
  }
  return buildSearch(s);
}
