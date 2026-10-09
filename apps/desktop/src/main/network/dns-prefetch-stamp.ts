/**
 * The `X-DNS-Prefetch-Control` response header for a browsing session.
 *
 * Chromium pre-resolves the hostnames a page links to through the host resolver — NOT through the
 * session's SOCKS proxy — so the machine's own DNS provider learns every site a page mentions. That is
 * always suppressed inside a tunnel (the tunnel exists to hide exactly that). On a Direct session it is a
 * speed win, so it stays on unless the user turned "pre-resolve linked addresses" off.
 *
 * Pure so the rule is table-testable; the session wiring just feeds it the facts at response time.
 */
export const DNS_PREFETCH_OFF: Readonly<Record<string, string>> = {
  'X-DNS-Prefetch-Control': 'off',
};

export function dnsPrefetchStamp(
  isTunnel: boolean,
  preloadPages: boolean | undefined,
): Record<string, string> {
  // `=== false`, not falsy: a preferences object that predates the field reads as "on" (the default).
  return isTunnel || preloadPages === false ? { ...DNS_PREFETCH_OFF } : {};
}
