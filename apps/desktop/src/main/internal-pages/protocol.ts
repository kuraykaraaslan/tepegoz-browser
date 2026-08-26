import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { protocol, session } from 'electron';
import { APP_PARTITION } from '../window';

/**
 * `tepegoz://` internal-page protocol — Faz 0/1/2 of `phases/tracks/protocol-tepegoz-pages.md`.
 *
 * Serves system pages (`tepegoz://settings`, …) as REAL pages without opening a listening socket — the
 * same shape as Chrome's own `chrome://` (a privileged scheme resolved from an in-process resource map,
 * never the network stack). This is the accepted alternative to the Express/loopback-HTTP proposal
 * recorded in `phases/tracks/express-settings.md` (see that file's Ek A).
 *
 * **Subresource requests do not work for this scheme (root-caused 2026-08-26).** A top-level navigation
 * to `tepegoz://settings` reaches `handleRequest` and returns fine, but a SEPARATE subsequent request for
 * an asset the document references (`<script src>`, `<link href>`) never reaches `handleRequest` at all —
 * Electron's own internal bridge throws `TypeError: Cannot convert argument to a ByteString because the
 * character at index 86 has a value of 65533 …` inside `new Headers(...)` (undici, called from
 * `node:electron/js2c/browser_init`) before dispatching to the registered handler. Confirmed NOT caused
 * by: CSP content, `corsEnabled`, response header count, response size (tested to 2MB of pure-ASCII AND
 * of multi-byte-UTF-8 filler), concurrent requests, load-vs-attach ordering, or the real preload script —
 * an isolated minimal repro reproducing every one of those exactly still works. It reproduces ONLY when
 * `session.fromPartition(APP_PARTITION).webRequest.onHeadersReceived` (installed by `security.ts` for the
 * CSP header) is registered on the SAME session as a `protocol.handle`-served SUBRESOURCE request — the
 * navigation request is unaffected either way. This looks like an Electron bug in that specific
 * combination (Electron 43.4.1), not something fixable from this module's response shape.
 *
 * **The workaround, and why it's fine:** inline the referenced script/style/icon directly into the single
 * HTML response, so the browser never issues a second (subresource) request to this scheme at all. CSP
 * allows the inlined script/style via a `'sha256-…'` hash of their EXACT bundled content (computed once,
 * cached) rather than a blanket `'unsafe-inline'` — content this app built and shipped itself, not
 * arbitrary inline script. The favicon is inlined as a `data:` URI for the same reason. This is scoped to
 * `tepegoz://` responses only; the chrome's own `file://` document is untouched and keeps loading its
 * assets as separate requests exactly as before.
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

function sha256Base64(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('base64');
}

/**
 * CSP for a `tepegoz://` document. `scriptHashes`/`styleHashes` allowlist the EXACT inlined
 * script/style content by content hash — this app's own bundled code, not arbitrary inline script — so
 * no blanket `'unsafe-inline'` is needed even though the content is now embedded rather than fetched.
 */
function internalPageCsp(scriptHashes: readonly string[], styleHashes: readonly string[]): string {
  const scriptSrc = ["script-src 'self'", ...scriptHashes.map((h) => `'sha256-${h}'`)].join(' ');
  const styleSrc = ["style-src 'self'", ...styleHashes.map((h) => `'sha256-${h}'`)].join(' ');
  return [
    "default-src 'self'",
    scriptSrc,
    styleSrc,
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

/** A relative asset href/src from the built HTML, resolved against the renderer directory. Strips the
 *  leading `./` or `/` Vite emits — both mean "relative to this document" for our purposes. */
function assetPath(dir: string, href: string): string {
  return join(dir, href.replace(/^\.?\//, ''));
}

interface InlinedPage {
  html: string;
  csp: string;
}

/**
 * Build the fully self-contained `tepegoz://settings` document: every `<script src>` and
 * `<link rel="stylesheet">` the built `index.html` references is read and inlined; the favicon (if any)
 * becomes a `data:` URI. Computed once and cached — the bundle is build output, immutable for the life of
 * the running app.
 */
let cachedSettingsPage: Promise<InlinedPage> | null = null;

async function buildInlinedSettingsPage(): Promise<InlinedPage> {
  const dir = rendererDir();
  const htmlPath = join(dir, 'index.html');
  let html = (await readFile(htmlPath)).toString('utf8');

  const scriptHashes: string[] = [];
  for (const m of [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"[^>]*><\/script>/g)]) {
    const js = (await readFile(assetPath(dir, m[1]!))).toString('utf8');
    scriptHashes.push(sha256Base64(js));
    html = html.replace(m[0], `<script type="module">${js}</script>`);
  }

  const styleHashes: string[] = [];
  for (const m of [...html.matchAll(/<link[^>]*\shref="([^"]+\.css)"[^>]*>/g)]) {
    const css = (await readFile(assetPath(dir, m[1]!))).toString('utf8');
    styleHashes.push(sha256Base64(css));
    html = html.replace(m[0], `<style>${css}</style>`);
  }

  const iconMatch = /<link rel="icon"[^>]*\shref="([^"]+)"[^>]*>/.exec(html);
  if (iconMatch) {
    try {
      const href = iconMatch[1]!;
      const icon = await readFile(assetPath(dir, href));
      const mime = MIME_TYPES[extname(href)] ?? 'application/octet-stream';
      html = html.replace(href, `data:${mime};base64,${icon.toString('base64')}`);
    } catch {
      html = html.replace(iconMatch[0], ''); // no icon rather than a broken subresource request
    }
  }

  return { html, csp: internalPageCsp(scriptHashes, styleHashes) };
}

function getInlinedSettingsPage(): Promise<InlinedPage> {
  cachedSettingsPage ??= buildInlinedSettingsPage();
  return cachedSettingsPage;
}

/**
 * The `tepegoz://` request handler. Only a host in {@link REAL_PAGE_HOSTS} is served, and only its root
 * path — everything else is a 404, not a guess (there is nothing to serve per-path any more: the whole
 * document is self-contained). Call AFTER `app.whenReady()`.
 *
 * Registered on the APP_PARTITION session specifically — NOT the top-level `protocol` module. Electron's
 * module-level `protocol.handle` binds to `session.defaultSession`; the chrome (and every internal-page
 * `WebContentsView`, `tabs-internal-page-view.ts`) lives on the NAMED `persist:tepegoz-app` partition, a
 * different session object with its own `protocol`. Registering on the wrong one means the scheme is
 * "privileged" but has no handler wherever it's actually loaded.
 */
export function registerInternalPagesProtocol(): void {
  session.fromPartition(APP_PARTITION).protocol.handle(INTERNAL_PAGES_SCHEME, async (request) => {
    let url: URL;
    try {
      url = new URL(request.url);
    } catch {
      return notFound();
    }
    if (!REAL_PAGE_HOSTS.has(url.host)) return notFound();
    if (url.pathname !== '' && url.pathname !== '/') return notFound();
    try {
      const page = await getInlinedSettingsPage();
      return new Response(page.html, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Security-Policy': page.csp,
          'X-Content-Type-Options': 'nosniff',
          'Referrer-Policy': 'no-referrer',
        },
      });
    } catch {
      return notFound();
    }
  });
}
