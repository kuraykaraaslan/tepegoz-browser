import { readFile } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { protocol, session } from 'electron';
import { APP_PARTITION } from '../window';

/**
 * `tepegoz://` internal-page protocol — Faz 0/1 of `phases/tracks/protocol-tepegoz-pages.md`.
 *
 * Serves system pages (`tepegoz://settings`, …) as REAL pages without opening a listening socket — the
 * same shape as Chrome's own `chrome://` (a privileged scheme resolved from an in-process resource map,
 * never the network stack). This is the accepted alternative to the Express/loopback-HTTP proposal
 * recorded in `phases/tracks/express-settings.md` (see that file's Ek A).
 *
 * Faz 1 serves the SAME renderer bundle the trusted chrome window already loads via `file://`
 * (`chrome-url.ts#chromeFilePath` — `out/renderer/index.html` and its `assets/*`). That bundle already
 * has a `?surface=<kind>` dispatch in `main.tsx` for popup windows; a `tepegoz://<host>` document picks
 * its surface by HOSTNAME instead (see `main.tsx`'s `tepegoz:` branch), so no second build entry exists
 * or needs to. Exposing that directory again under a new origin adds no new content surface — it is
 * public build output with no user data or secrets in it, already unauthenticated-loadable via
 * `file://`.
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
        // The bundle's built `<script type="module" crossorigin>` tag forces a CORS-mode fetch even for
        // a SAME-origin request; Electron rejects that fetch outright ("Failed to fetch", no console log)
        // when the scheme is not CORS-enabled. This is not a same-origin-vs-cross-origin distinction
        // being relaxed — no other origin can address `tepegoz://`, so there is nothing for it to leak
        // to (found via the Faz 2 e2e test after `corsEnabled: false` left the page permanently blank).
        corsEnabled: true,
      },
    },
  ]);
}

/**
 * Hosts allowed to load the renderer bundle as a real page. Growing this set is Faz 3 of the plan doc —
 * each addition (extensions/history/downloads/…) is its own reviewed step, not a blanket switch.
 */
const REAL_PAGE_HOSTS = new Set(['settings']);

/** The renderer bundle directory. `__dirname` is `out/main` in both packaged and unpackaged builds —
 *  the same relative path `chrome-url.ts#chromeFilePath` uses to find `index.html`. */
function rendererDir(): string {
  return resolve(join(__dirname, '../renderer'));
}

const MIME_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
};

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
    "font-src 'self' data:",
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
 * Resolve a request path to an absolute file INSIDE `base`, or `null` if it would escape. URL parsing
 * upstream may already collapse `../` segments, but that is never trusted here — `resolve` runs and the
 * result is checked against `base` regardless of what the input looked like, which is what actually makes
 * this traversal-safe rather than merely traversal-unlikely.
 */
export function resolveInBase(base: string, requestPath: string): string | null {
  const rel = requestPath === '' || requestPath === '/' ? '/index.html' : requestPath;
  const abs = resolve(join(base, rel));
  if (abs !== base && !abs.startsWith(base + sep)) return null;
  return abs;
}

async function handleRequest(request: { url: string }): Promise<Response> {
  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    return notFound();
  }
  if (!REAL_PAGE_HOSTS.has(url.host)) return notFound();
  const filePath = resolveInBase(rendererDir(), decodeURIComponent(url.pathname));
  if (filePath === null) return notFound();
  try {
    const data = await readFile(filePath);
    const contentType = MIME_TYPES[extname(filePath)] ?? 'application/octet-stream';
    return new Response(new Uint8Array(data), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Security-Policy': internalPageCsp(),
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
      },
    });
  } catch {
    return notFound();
  }
}

/**
 * The `tepegoz://` request handler. Only a host in {@link REAL_PAGE_HOSTS} is served; everything else is
 * a 404, not a guess. Call AFTER `app.whenReady()`.
 *
 * Registered on the APP_PARTITION session specifically — NOT the top-level `protocol` module. Electron's
 * module-level `protocol.handle` binds to `session.defaultSession`; the chrome (and every internal-page
 * `WebContentsView`, `tabs-internal-page-view.ts`) lives on the NAMED `persist:tepegoz-app` partition, a
 * different session object with its own `protocol`. Registering on the wrong one means the scheme is
 * "privileged" but has no handler wherever it's actually loaded.
 *
 * **Known open blocker (2026-08-26, unresolved):** with this registered correctly, a top-level
 * NAVIGATION to `tepegoz://settings` succeeds (this handler runs, `index.html` comes back) — but a
 * `fetch()` issued from a document already loaded on `tepegoz://settings` to that SAME URL fails with a
 * bare `TypeError: Failed to fetch`, before ever reaching this function (confirmed by testing with every
 * response header stripped, and by reproducing the same failure from the chrome window's own devtools
 * console on the same session/scheme). Since the built renderer bundle loads its JS via
 * `<script type="module">` — a subresource fetch, not a navigation — the script never runs and the page
 * stays blank. Electron 43.4.1. Root cause not yet found; `corsEnabled: true` and registering the SAME
 * handler on `session.defaultSession` as well were both tried and neither changed the result. See
 * `phases/tracks/protocol-tepegoz-pages.md` for the next things to try (Electron issue tracker search;
 * `net.fetch`-based repro outside this app; per-session vs global scheme registration order).
 */
export function registerInternalPagesProtocol(): void {
  session.fromPartition(APP_PARTITION).protocol.handle(INTERNAL_PAGES_SCHEME, handleRequest);
}
