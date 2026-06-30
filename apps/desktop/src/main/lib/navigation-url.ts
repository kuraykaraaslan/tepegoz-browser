/**
 * Omnibox → navigable URL, with a SCHEME ALLOW-LIST at the source (security review finding).
 *
 * Only http(s) URLs are ever produced for loading. A dangerous or unexpected scheme typed/pasted into
 * the omnibox (file:, chrome:, javascript:, data:, blob:, custom protocols, …) is NOT loaded as-is —
 * it falls through to a web search. This is the real guard for the programmatic `loadURL` path, which
 * Electron's `will-navigate` event does NOT cover.
 *
 * Pure (no Electron) so it is unit-testable and reusable by every load entry point.
 */
const HTTP_SCHEME = /^https?:\/\//i;
const LOCALHOST = /^(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i;

/** True only for http/https URLs — the only schemes safe to load into an untrusted browsing view. */
export function isWebUrl(url: string): boolean {
  return HTTP_SCHEME.test(url.trim());
}

function looksLikeHost(input: string): boolean {
  const host = input.split('/')[0] ?? input;
  if (/^localhost(:\d+)?$/i.test(host)) return true; // localhost / localhost:port
  if (/^[^\s:]+:\d+$/.test(host)) return true; // host:port (incl. IP:port)
  return /^[^\s.]+(\.[^\s.]+)+$/.test(host); // dotted domain or IP
}

export function toNavigationUrl(input: string, fallbackUrl: string): string {
  const s = input.trim();
  if (s.length === 0) return fallbackUrl;
  if (HTTP_SCHEME.test(s)) return s; // already an http(s) URL
  if (!s.includes(' ') && looksLikeHost(s)) {
    // localhost is conventionally http; everything else defaults to https.
    return `${LOCALHOST.test(s) ? 'http' : 'https'}://${s}`;
  }
  return `https://duckduckgo.com/?q=${encodeURIComponent(s)}`;
}
