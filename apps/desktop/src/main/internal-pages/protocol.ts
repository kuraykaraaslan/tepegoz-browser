import { protocol } from 'electron';

/**
 * `tepegoz://` internal-page protocol — Faz 0 of
 * `phases/tracks/protocol-tepegoz-pages.md`.
 *
 * Serves system pages (`tepegoz://settings`, …) as REAL pages without opening a listening socket —
 * the same shape as Chrome's own `chrome://` (a privileged scheme resolved from an in-process resource
 * map, never the network stack). This is the accepted alternative to the Express/loopback-HTTP proposal
 * recorded in `phases/tracks/express-settings.md` (see that file's Ek A).
 *
 * Faz 0 deliberately does NOT wire this into `TabManager` yet: internal tabs today have no
 * `WebContentsView` at all (`tabs-window-closing.ts`'s "no view entry ⟺ internal" invariant), and a
 * chunk of the agent-perception/screenshot/DevTools-gate code depends on that. Giving internal pages a
 * real view is Faz 2 — its own reviewed change. This module only proves the protocol layer itself:
 * scheme registration, an allowlisted resource lookup, and the response headers.
 */

export const INTERNAL_PAGES_SCHEME = 'tepegoz';

/**
 * Register `tepegoz:` as a privileged (standard + secure + fetch-capable) scheme. Electron only reads
 * this registration once, before `app.whenReady()` resolves — it MUST be called at module scope, never
 * inside a `whenReady().then()` callback.
 */
export function registerInternalPagesScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: INTERNAL_PAGES_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: false,
      },
    },
  ]);
}

interface InternalPageResource {
  contentType: string;
  body: string;
}

/**
 * Faz 0 smoke-test placeholder for `tepegoz://settings`. Not the real Settings UI — that migration
 * (moving `SettingsPage.tsx` to its own loadable bundle) is Faz 1. This exists only to prove the
 * protocol/CSP/response plumbing end to end, including inside a real `WebContentsView` (the Playwright
 * `_electron` window-discovery check the plan's Faz 0 calls for).
 */
const SETTINGS_SMOKE_TEST_HTML = `<!doctype html>
<html>
  <head><meta charset="utf-8" /><title>tepegoz://settings</title></head>
  <body>tepegoz-protocol-smoke-test</body>
</html>
`;

/**
 * Fixed host → resource allowlist. Deliberately keyed by HOST ONLY: the handler never reads the
 * request's path to decide what to serve, so there is no file-system lookup for a `../` segment to
 * escape — the traversal risk a dynamic static-file server would have is structurally absent here.
 */
const PAGES: ReadonlyMap<string, InternalPageResource> = new Map([
  ['settings', { contentType: 'text/html; charset=utf-8', body: SETTINGS_SMOKE_TEST_HTML }],
]);

/**
 * CSP for `tepegoz://` responses. Same shape as `security.ts`'s `chromeCsp` (no inline script, no eval,
 * no external network) but self-contained here: these responses do not flow through
 * `session.webRequest.onHeadersReceived` (that hook is for network-stack requests on a partition, not
 * bytes returned directly from `protocol.handle`), so the header is set on the `Response` itself.
 */
function internalPageCsp(): string {
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
}

function notFound(): Response {
  return new Response(null, { status: 404 });
}

/**
 * The `tepegoz://` request handler. Only the exact root path (`/` or empty) of a known host is served —
 * anything else (an unknown host, or a sub-path under a known one) is a 404, not a guess. Call AFTER
 * `app.whenReady()`.
 */
export function registerInternalPagesProtocol(): void {
  protocol.handle(INTERNAL_PAGES_SCHEME, (request) => {
    let url: URL;
    try {
      url = new URL(request.url);
    } catch {
      return notFound();
    }
    if (url.pathname !== '' && url.pathname !== '/') return notFound();
    const resource = PAGES.get(url.host);
    if (resource === undefined) return notFound();
    return new Response(resource.body, {
      status: 200,
      headers: {
        'Content-Type': resource.contentType,
        'Content-Security-Policy': internalPageCsp(),
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
      },
    });
  });
}
