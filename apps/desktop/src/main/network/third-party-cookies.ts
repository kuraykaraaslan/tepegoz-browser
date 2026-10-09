import { isSameSite } from '@tepegoz/security-policy';

/**
 * Third-party cookie blocking, as pure rules.
 *
 * Electron does not expose Chromium's own third-party-cookie control, so the policy is enforced where
 * this app already owns every request: no `Cookie` header goes out on a third-party request, and no
 * `Set-Cookie` is accepted from a third-party response. That covers what trackers actually use — ad and
 * analytics pixels, beacons, embedded widgets. It does NOT reach `document.cookie` written by script
 * inside a third-party frame; that is a different layer, and the setting's description says "requests".
 *
 * "Third party" means the request's registrable domain differs from the page the tab is showing. The
 * same HOST is always first-party even where there is no registrable domain to compare (`localhost`, an
 * intranet name): without that, `isSameSite`'s fail-closed answer would strip cookies from every
 * single-label host. Everything the policy cannot judge — an internal page, a non-web URL — is left
 * alone: failing to block is a missed privacy gain, wrongly blocking is a broken login.
 */
function webHost(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.hostname.toLowerCase() : null;
  } catch {
    return null;
  }
}

/** Is `requestUrl` third-party to the page at `topUrl`? Main-frame navigations never are. */
export function isThirdPartyRequest(
  topUrl: string,
  requestUrl: string,
  resourceType: string,
): boolean {
  if (resourceType === 'mainFrame') return false;
  const top = webHost(topUrl);
  const req = webHost(requestUrl);
  if (top === null || req === null) return false;
  if (top === req) return false;
  return !isSameSite(topUrl, requestUrl);
}

/** The request headers without any `Cookie` (header names are case-insensitive). */
export function withoutCookieHeader(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(headers).filter(([k]) => k.toLowerCase() !== 'cookie'));
}

/** The response headers without any `Set-Cookie` (header names are case-insensitive). */
export function withoutSetCookie<V extends string | string[]>(
  headers: Record<string, V>,
): Record<string, V> {
  return Object.fromEntries(
    Object.entries(headers).filter(([k]) => k.toLowerCase() !== 'set-cookie'),
  );
}
