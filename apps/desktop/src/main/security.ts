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
 * deny permission requests by default (geolocation, media, …). The one exception is the Web
 * Notification and clipboard APIs, which are brokered per-site through {@link WebPermissionBroker}
 * (stored grant/denial, else a HITL consent prompt; notifications also honor the master preference).
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
      const capability = permissionCapability(permission);
      if (capability !== null) {
        const origin = originOf(details.requestingUrl);
        if (origin === null) {
          callback(false);
          return;
        }
        void WebPermissionBroker.request(capability, origin).then(callback);
        return;
      }
      callback(false);
    });
    // Synchronous check path (permission-state queries): reflect stored grants; deny the rest.
    contents.session.setPermissionCheckHandler((_wc, permission, requestingOrigin) => {
      const capability = permissionCapability(permission);
      if (capability !== null) return WebPermissionBroker.isAllowed(capability, requestingOrigin);
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

function permissionCapability(permission: string): WebPermissionCapability | null {
  if (permission === 'notifications') return 'notifications';
  if (permission === 'clipboard-read' || permission === 'deprecated-sync-clipboard-read') {
    return 'clipboardRead';
  }
  if (permission === 'clipboard-sanitized-write') return 'clipboardWrite';
  return null;
}
