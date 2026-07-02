import { app, session } from 'electron';
import { APP_PARTITION } from './window';
import NotificationPermissionBroker from './notifications/permission-broker';

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
 *  - `img-src` allows https/http/data: — the tab strip renders page favicons and the resize snapshot
 *    is a data: PNG.
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
 * deny permission requests by default (geolocation, media, …). The one exception is the Web
 * Notification API, which is brokered per-site through {@link NotificationPermissionBroker} (stored
 * grant/denial, else a HITL consent prompt, gated on the notifications preference).
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
      if (permission === 'notifications') {
        const origin = originOf(details.requestingUrl);
        if (origin === null) {
          callback(false);
          return;
        }
        void NotificationPermissionBroker.request(origin).then(callback);
        return;
      }
      callback(false);
    });
    // Synchronous check path (permission-state queries): reflect stored notification grants; deny the rest.
    contents.session.setPermissionCheckHandler((_wc, permission, requestingOrigin) => {
      if (permission === 'notifications') return NotificationPermissionBroker.isAllowed(requestingOrigin);
      return false;
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
