import { app, session } from 'electron';
import { APP_PARTITION } from './window';
import WebPermissionBroker from './web-permissions/permission-broker';
import type { WebPermissionCapability } from '@tepegoz/desktop-ipc';

/** Safe origin of a requesting URL, or null if unparsable. */
function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * Content-Security-Policy for the TRUSTED APP CHROME only (SECURITY-06 blocking rule). Browsed pages
 * are arbitrary web content in their own partition and keep their sites' own CSP — this must never
 * apply to them.
 *
 *  - `script-src 'self'` in prod (bundled modules only); dev adds 'unsafe-inline' for the Vite
 *    React-Refresh preamble and ws/http connect for HMR.
 *  - `style-src 'unsafe-inline'` stays in prod: React inline `style={}` attributes (sidebar width,
 *    popup anchoring) are CSP "inline styles".
 *  - `img-src` allows data: (the tab strip's favicons — fetched by main on the PAGE'S OWN session and
 *    inlined, never fetched here; see `tabs-favicon.electron.ts` — and the resize snapshot's PNG) and
 *    https/http, which remains ONLY for stored bookmark icons imported from another browser. No tab
 *    favicon may use it: the chrome has no proxy, so a remote favicon fetched here would be a
 *    clear-path request to the site the user is viewing, tunnel or not. `TabFaviconSchema` enforces
 *    that at the IPC boundary rather than leaving it to this comment.
 */
function chromeCsp(dev: boolean): string {
  const script = dev ? "script-src 'self' 'unsafe-inline'" : "script-src 'self'";
  const connect = dev ? "connect-src 'self' ws: http: https:" : "connect-src 'self'";
  return [
    "default-src 'self'",
    script,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https: http:",
    "font-src 'self' data:",
    connect,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
}

/**
 * Cross-surface hardening that must apply to EVERY web contents (app chrome AND browsed pages):
 * deny permission requests by default. The exceptions are the capabilities listed in
 * `WebPermissionCapability` — notifications, clipboard read/write, camera, microphone and geolocation —
 * which are brokered PER SITE through {@link WebPermissionBroker}: a stored grant or denial, else a
 * HITL consent prompt, with notifications additionally honouring the master preference.
 *
 * Brokering is not a weakening of deny-by-default; it IS deny-by-default. No site receives any of these
 * without an explicit per-origin answer from the user, and everything outside the union is refused with
 * no way to ask. `display-capture` stays outside it deliberately — one mistaken "allow" there hands over
 * every other window on the screen, including ones this browser does not own.
 *
 * Surface-specific navigation policy is deliberately NOT global:
 *  - the app chrome window is locked to app content (deny-by-default) in `createWindow`;
 *  - browsing `WebContentsView`s must be free to navigate the web, with their own safe handlers in
 *    `TabManager` (open new windows as tabs, block non-web protocols).
 */
export function installSecurity(): void {
  app.on('web-contents-created', (_event, contents) => {
    // Async request path (getUserMedia, geolocation, notifications, …): notifications are brokered
    // per-site; everything else is denied by default.
    contents.session.setPermissionRequestHandler((_wc, permission, callback, details) => {
      // Only the media request carries `mediaTypes`; the union's other members do not declare it.
      const mediaTypes = 'mediaTypes' in details ? details.mediaTypes : undefined;
      const capabilities = permissionCapabilities(permission, mediaTypes);
      if (capabilities.length === 0) {
        callback(false);
        return;
      }
      const origin = originOf(details.requestingUrl);
      if (origin === null) {
        callback(false);
        return;
      }
      // Every capability the request needs must be granted. `requestAll` asks in sequence and stops at
      // the first refusal, so a user who declines the camera is not then asked for the microphone for
      // a call that is already not happening.
      void WebPermissionBroker.requestAll(capabilities, origin).then(callback);
    });
    // Synchronous check path (permission-state queries): reflect stored grants; deny the rest.
    contents.session.setPermissionCheckHandler((_wc, permission, requestingOrigin, details) => {
      // The CHECK path carries a single `mediaType`, not the request path's list, and it can be
      // `'unknown'` — which maps to no capability and is therefore refused, the honest answer to
      // "is this granted?" when we cannot tell what "this" is.
      const mediaTypes = details?.mediaType === undefined ? undefined : [details.mediaType];
      const capabilities = permissionCapabilities(permission, mediaTypes);
      if (capabilities.length === 0) return false;
      // `every`, and DEFENSIVELY so: the check path carries a single `mediaType`, so this list is
      // never longer than one today and `some` would behave identically. A mutation test confirmed
      // that — swapping them turns nothing red. It stays `every` because it is the answer that remains
      // correct if Chromium ever starts asking about a pair, and it is recorded here rather than
      // dressed up as a property this suite actually covers.
      return capabilities.every((c) => WebPermissionBroker.isAllowed(c, requestingOrigin));
    });
  });

  // CSP response header for every document the app chrome loads (dev server or packaged file).
  const csp = chromeCsp(!app.isPackaged);
  session.fromPartition(APP_PARTITION).webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [csp] },
    });
  });
}

/**
 * Which brokered capabilities one Chromium permission request needs — ALL of them, or the request is
 * refused.
 *
 * `media` is the reason this returns a list rather than one capability. `getUserMedia({ video, audio })`
 * arrives as a single `media` permission carrying `mediaTypes`, so a page asking for camera AND
 * microphone must satisfy BOTH per-site grants. Mapping `media` to one capability would have meant a
 * site granted the microphone silently receiving the camera as well.
 *
 * A `media` request with no `mediaTypes` at all is refused: it is a request for we-don't-know-what, and
 * there is no grant that can honestly cover it.
 */
function permissionCapabilities(
  permission: string,
  mediaTypes?: readonly string[],
): WebPermissionCapability[] {
  if (permission === 'notifications') return ['notifications'];
  if (permission === 'clipboard-read' || permission === 'deprecated-sync-clipboard-read') {
    return ['clipboardRead'];
  }
  if (permission === 'clipboard-sanitized-write') return ['clipboardWrite'];
  if (permission === 'geolocation') return ['geolocation'];
  if (permission === 'media') {
    const out: WebPermissionCapability[] = [];
    if (mediaTypes?.includes('video') === true) out.push('camera');
    if (mediaTypes?.includes('audio') === true) out.push('microphone');
    return out;
  }
  return [];
}
