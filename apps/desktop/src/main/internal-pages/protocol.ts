import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { protocol, session } from 'electron';
import { APP_PARTITION } from '../window';
import { REAL_PAGE_HOSTS } from './real-page-hosts';

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
 * allows the inlined script via a `'sha256-…'` hash of its EXACT bundled content (computed once, cached)
 * rather than a blanket `'unsafe-inline'` — content this app built and shipped itself, not arbitrary
 * inline script. The favicon is inlined as a `data:` URI for the same reason. This is scoped to
 * `tepegoz://` responses only; the chrome's own `file://` document is untouched and keeps loading its
 * assets as separate requests exactly as before.
 *
 * **A second, unrelated bug the FIRST version of this inlining shipped with (found and fixed the same
 * day, 2026-08-26):** naively splicing the read file content in with
 * `html.replace(searchString, \`<script>${js}</script>\`)` silently corrupted the page. Two independent
 * failure modes, both from treating a 1.9MB real bundle as if it were safe arbitrary text:
 * 1. `String.prototype.replace`'s STRING replacement argument treats `$&`/`$1`/`` $` ``/`$'`/`$$` as live
 *    substitution patterns — and minified React code is all but guaranteed to contain the literal string
 *    `$&` (its own key-escaping regex replace uses exactly `"$&/"`). That silently spliced the ORIGINAL
 *    `<script src=…>` tag text back into the middle of the inlined script, splitting one intended
 *    `<script>` element into three real DOM script elements (`document.scripts.length === 3`) — verified
 *    by loading the raw constructed HTML directly and inspecting `document.scripts`. Fixed by
 *    {@link spliceReplace}, which splices by index instead of going through `replace`'s pattern language.
 * 2. Separately, the bundle contains one literal, accidental `<script><\/script>` (a probe string in
 *    React's own source) — HTML's tokenizer recognizes `<!--`, `<script`, and `</script` as special
 *    sequences PURELY LEXICALLY, with no awareness of JS string/comment boundaries, so an unescaped
 *    occurrence of any of them inside inlined script/style content can prematurely end the tag regardless
 *    of what the surrounding JS/CSS means. Fixed by {@link escapeForInlineTag}.
 * Neither bug depends on the other; both had to be fixed for the page to render at all. Confirmed via
 * `e2e/tepegoz-internal-pages.spec.ts`'s CSP-violation check (reloads each page with a `console-message`
 * collector attached and asserts zero CSP-related messages), which is what caught bug #1 after bug #2's
 * fix alone stopped `document.scripts.length` from settling back to 1.
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

// Hosts allowed to load the renderer bundle as a real page — `./real-page-hosts` (see its doc comment
// for why this is a separate leaf module). Every host serves the IDENTICAL inlined document — it's the
// same single-page bundle for all of them; `main.tsx` picks which surface to mount at runtime from
// `location.hostname`. Adding a page here only requires that dispatch case in `main.tsx` and the
// corresponding `tepegoz://` URL in `tabs-internal-page-view.ts`'s `REAL_PAGE_BASE_URLS`.

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
 * CSP for a `tepegoz://` document. `scriptHashes` allowlists the EXACT inlined script content by
 * content hash — this app's own bundled code, not arbitrary inline script — so no blanket
 * `'unsafe-inline'` is needed there.
 *
 * `style-src` is different: several migrated pages set genuinely DYNAMIC inline `style={{}}` (the
 * downloads progress bar's `width`, the bookmarks tree's per-depth `paddingLeft`/drag `opacity`) — values
 * computed at runtime, so there is no fixed content to hash. Matches `security.ts#chromeCsp`'s own
 * `style-src 'self' 'unsafe-inline'` (same justification, same trust level — this is the same first-party
 * bundle the chrome document already loads). A hash-source and `'unsafe-inline'` in the SAME directive
 * would not layer: per the CSP algorithm, `'unsafe-inline'` is ignored whenever any hash/nonce-source is
 * present in that directive, and Chromium always evaluates hash-sources — so `style-src` deliberately
 * carries NO hash here, only `'unsafe-inline'`. `script-src` keeps its hash (no page needs inline script).
 */
function internalPageCsp(scriptHashes: readonly string[]): string {
  const scriptSrc = ["script-src 'self'", ...scriptHashes.map((h) => `'sha256-${h}'`)].join(' ');
  return [
    "default-src 'self'",
    scriptSrc,
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

/** A relative asset href/src from the built HTML, resolved against the renderer directory. Strips the
 *  leading `./` or `/` Vite emits — both mean "relative to this document" for our purposes. */
function assetPath(dir: string, href: string): string {
  return join(dir, href.replace(/^\.?\//, ''));
}

/**
 * Make `content` safe to place literally between `<script>…</script>` (or `<style>…</style>`) tags.
 * The HTML tokenizer starts recognizing an end tag — or, after a `<!--`, a NESTED start tag — on the
 * exact character sequences `<!--`, `<script`, `</script` (case-insensitively), regardless of what those
 * characters mean as JS/CSS. A 1.9MB real-world bundle contains at least one of these completely by
 * accident (React's own source has a literal `"<script><\/script>"` probe string) — inserting a
 * backslash right after the `<` breaks the HTML-level match while leaving the JS/CSS meaning unchanged:
 * inside a string or comment, `\s`/`\/` /`\!` are themselves once the JS/CSS parser sees them (per-spec,
 * a backslash before a non-special character is just that character), so this is a no-op for the code
 * that actually runs — it only stops the HTML PARSER from ending the tag early.
 */
function escapeForInlineTag(content: string): string {
  return content.replace(/<(!--|\/?script|\/?style)/gi, '<\\$1');
}

/**
 * Splice `replacement` in place of the FIRST match of `search` in `html`, treating `replacement` as
 * LITERAL TEXT. `String.prototype.replace(search, replacementString)` is NOT safe for this: its
 * replacement-string argument treats `$&`, `$1`, `` $` ``, `$'`, `$$` as live substitution patterns, and
 * a real bundle's minified code is all but guaranteed to contain `$&` (React's own key-escaping regex
 * replace literally uses the string `"$&/"`) — when that string is `replacement`, `html.replace(search,
 * replacement)` silently substitutes `$&` back to the ORIGINAL MATCHED TEXT (the `<script src=…>` tag
 * itself), splicing a second, spurious script/style start+end sequence into the middle of the inlined
 * content. This is exactly what caused `document.scripts.length` to come back as 3, not 1, the first
 * time this shipped. Splicing by index sidesteps the special-pattern feature entirely.
 */
function spliceReplace(html: string, search: string, replacement: string): string {
  const at = html.indexOf(search);
  if (at === -1) return html;
  return html.slice(0, at) + replacement + html.slice(at + search.length);
}

interface InlinedPage {
  html: string;
  csp: string;
}

/**
 * Build the fully self-contained `tepegoz://` document: every `<script src>` and
 * `<link rel="stylesheet">` the built `index.html` references is read and inlined; the favicon (if any)
 * becomes a `data:` URI. Computed once and cached — the bundle is build output, immutable for the life of
 * the running app — and shared by every host in {@link REAL_PAGE_HOSTS}, since it's the same bundle for
 * all of them.
 */
let cachedInlinedPage: Promise<InlinedPage> | null = null;

async function buildInlinedAppPage(): Promise<InlinedPage> {
  const dir = rendererDir();
  const htmlPath = join(dir, 'index.html');
  let html = (await readFile(htmlPath)).toString('utf8');

  const scriptHashes: string[] = [];
  for (const m of [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"[^>]*><\/script>/g)]) {
    const js = escapeForInlineTag((await readFile(assetPath(dir, m[1]!))).toString('utf8'));
    // Hash the ESCAPED text: that is byte-for-byte what ends up between the tags, which is what the
    // browser hashes to check against CSP — hashing the pre-escape content would never match.
    scriptHashes.push(sha256Base64(js));
    html = spliceReplace(html, m[0], `<script type="module">${js}</script>`);
  }

  // No hash-tracking here: `style-src` allows 'unsafe-inline' outright (see internalPageCsp's doc
  // comment), so this inlining only needs to happen, not be hashed.
  for (const m of [...html.matchAll(/<link[^>]*\shref="([^"]+\.css)"[^>]*>/g)]) {
    const css = escapeForInlineTag((await readFile(assetPath(dir, m[1]!))).toString('utf8'));
    html = spliceReplace(html, m[0], `<style>${css}</style>`);
  }

  const iconMatch = /<link rel="icon"[^>]*\shref="([^"]+)"[^>]*>/.exec(html);
  if (iconMatch) {
    try {
      const href = iconMatch[1]!;
      const icon = await readFile(assetPath(dir, href));
      const mime = MIME_TYPES[extname(href)] ?? 'application/octet-stream';
      html = spliceReplace(html, href, `data:${mime};base64,${icon.toString('base64')}`);
    } catch {
      html = spliceReplace(html, iconMatch[0], ''); // no icon rather than a broken subresource request
    }
  }

  return { html, csp: internalPageCsp(scriptHashes) };
}

function getInlinedAppPage(): Promise<InlinedPage> {
  cachedInlinedPage ??= buildInlinedAppPage();
  return cachedInlinedPage;
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
      const page = await getInlinedAppPage();
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
