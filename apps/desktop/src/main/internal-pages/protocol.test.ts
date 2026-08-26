import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `tepegoz://` protocol handler (Faz 0/1/2 of phases/tracks/protocol-tepegoz-pages.md).
 *
 * Subresource requests to this scheme don't reach the handler at all — an Electron bug reproduced and
 * documented on `registerInternalPagesProtocol`'s doc comment — so the handler inlines every asset the
 * built `index.html` references into ONE self-contained response instead of serving them per-path. The
 * properties under test: the inlined document actually contains the script/style/icon content (not just
 * references to them), the CSP allows the inlined SCRIPT only by content hash (never a blanket
 * `'unsafe-inline'`) while STYLE gets `'unsafe-inline'` (several migrated pages set genuinely dynamic
 * inline `style={{}}` — a download progress bar's width, a bookmark row's per-depth indentation — so
 * there is no fixed content to hash, and a hash-source in the same directive would silently make
 * Chromium ignore `'unsafe-inline'` if one were added alongside it), the build is cached and SHARED
 * across every allowed host (one bundle, dispatched client-side by hostname in `main.tsx`), and only an
 * allowed host at its root path is ever served — everything else is a 404, not a guess.
 */

type Handler = (request: { url: string }) => Response | Promise<Response>;

const registerSchemesAsPrivileged = vi.fn();
let capturedHandler: Handler | null = null;
const sessionProtocolHandle = vi.fn((_scheme: string, h: Handler) => {
  capturedHandler = h;
});
const fromPartition = vi.fn(() => ({ protocol: { handle: sessionProtocolHandle } }));

vi.mock('electron', () => ({
  protocol: { registerSchemesAsPrivileged },
  session: { fromPartition },
}));
vi.mock('../window', () => ({ APP_PARTITION: 'persist:tepegoz-app-test' }));

const INDEX_HTML = `<!doctype html><html><head>
<link rel="icon" type="image/svg+xml" href="./favicon.svg">
<link rel="stylesheet" crossorigin href="/assets/index-ABC.css">
</head><body>
<script type="module" crossorigin src="/assets/index-XYZ.js"></script>
</body></html>`;
const JS_CONTENT = "console.log('settings bundle');";
const CSS_CONTENT = 'body{color:red}';
const ICON_CONTENT = '<svg></svg>';

const readFile = vi.fn<(path: string) => Promise<Buffer>>((path: string) => {
  if (path.endsWith('index.html')) return Promise.resolve(Buffer.from(INDEX_HTML));
  if (path.endsWith('index-XYZ.js')) return Promise.resolve(Buffer.from(JS_CONTENT));
  if (path.endsWith('index-ABC.css')) return Promise.resolve(Buffer.from(CSS_CONTENT));
  if (path.endsWith('favicon.svg')) return Promise.resolve(Buffer.from(ICON_CONTENT));
  return Promise.reject(new Error('ENOENT'));
});
vi.mock('node:fs/promises', () => ({ readFile: (path: string) => readFile(path) }));

const { registerInternalPagesScheme, registerInternalPagesProtocol, INTERNAL_PAGES_SCHEME } =
  await import('./protocol');

async function run(url: string): Promise<Response> {
  registerInternalPagesProtocol();
  if (capturedHandler === null) throw new Error('handler was not registered');
  return capturedHandler({ url });
}

beforeEach(() => {
  readFile.mockClear();
});

describe('registerInternalPagesScheme', () => {
  it('registers the scheme as privileged (standard + secure + fetch-capable + CORS-enabled)', () => {
    registerInternalPagesScheme();
    expect(registerSchemesAsPrivileged).toHaveBeenCalledWith([
      {
        scheme: INTERNAL_PAGES_SCHEME,
        privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
      },
    ]);
  });
});

describe('registerInternalPagesProtocol', () => {
  it('registers on the APP_PARTITION session, not the top-level protocol module', () => {
    registerInternalPagesProtocol();
    expect(fromPartition).toHaveBeenCalledWith('persist:tepegoz-app-test');
    expect(sessionProtocolHandle).toHaveBeenCalledWith(INTERNAL_PAGES_SCHEME, expect.any(Function));
  });
});

describe('tepegoz:// handler — inlined settings document', () => {
  it('serves 200 text/html with the script and style content INLINED, not referenced', async () => {
    const res = await run('tepegoz://settings');
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/html');
    const body = await res.text();
    expect(body).toContain(`<script type="module">${JS_CONTENT}</script>`);
    expect(body).toContain(`<style>${CSS_CONTENT}</style>`);
    // The original external references must be gone — a leftover <script src> would mean the browser
    // re-issues exactly the subresource request that never reaches this handler.
    expect(body).not.toContain('src="/assets/index-XYZ.js"');
    expect(body).not.toContain('href="/assets/index-ABC.css"');
  });

  it('inlines the favicon as a data: URI (no subresource request for it either)', async () => {
    const res = await run('tepegoz://settings');
    const body = await res.text();
    const expectedDataUri = `data:image/svg+xml;base64,${Buffer.from(ICON_CONTENT).toString('base64')}`;
    expect(body).toContain(expectedDataUri);
    expect(body).not.toContain('href="./favicon.svg"');
  });

  it('allows the inlined SCRIPT by content hash — never a blanket unsafe-inline for script', async () => {
    const res = await run('tepegoz://settings');
    const csp = res.headers.get('Content-Security-Policy') ?? '';
    expect(csp).toMatch(/script-src 'self' 'sha256-[A-Za-z0-9+/=]+'/);
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it("allows STYLE via 'unsafe-inline' — dynamic style={{}} (progress bars, tree indentation) has no fixed content to hash", async () => {
    const res = await run('tepegoz://settings');
    const csp = res.headers.get('Content-Security-Policy') ?? '';
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    // A hash-source alongside 'unsafe-inline' in the SAME directive makes Chromium ignore
    // 'unsafe-inline' outright — pin the absence of a style hash so that mistake can't creep back in.
    expect(csp).not.toMatch(/style-src[^;]*sha256/);
  });

  it('applies the security headers', async () => {
    const res = await run('tepegoz://settings');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('Referrer-Policy')).toBe('no-referrer');
  });

  it.each(['settings', 'extensions', 'history', 'downloads', 'uploads', 'bookmarks'])(
    'serves the same inlined document for host %s — main.tsx dispatches by hostname at runtime',
    async (host) => {
      const res = await run(`tepegoz://${host}`);
      expect(res.status).toBe(200);
    },
  );

  it('404s an unknown host instead of guessing', async () => {
    const res = await run('tepegoz://not-a-real-page');
    expect(res.status).toBe(404);
  });

  it('404s a sub-path under the settings host — there is nothing to serve per-path any more', async () => {
    const res = await run('tepegoz://settings/anything');
    expect(res.status).toBe(404);
  });

  it('404s an unparsable URL instead of throwing', async () => {
    await expect(run('not a url')).resolves.toMatchObject({ status: 404 });
  });
});

describe('tepegoz:// handler — safe embedding of real-world bundle content', () => {
  // Both regressions here actually shipped once (2026-08-26) and were only caught by
  // e2e/tepegoz-internal-pages.spec.ts's CSP-violation check against the REAL bundle — these pin them at
  // the unit level with minimal reproductions so they can't silently come back.

  it('does not let a literal "$&" in the bundle splice the original <script> tag back into the page', async () => {
    // String.prototype.replace(search, stringReplacement) treats "$&" as "insert the original match" —
    // and minified React contains exactly this substring in its own key-escaping regex (`"$&/"`). A
    // naive `html.replace(tag, template)` would silently re-inject `tag` (the ORIGINAL
    // `<script src=…></script>`) at the "$&" site, splitting one inline <script> into several.
    vi.resetModules();
    readFile.mockImplementation((path: string) => {
      if (path.endsWith('index.html')) return Promise.resolve(Buffer.from(INDEX_HTML));
      if (path.endsWith('index-XYZ.js')) return Promise.resolve(Buffer.from('const x = "$&/";'));
      if (path.endsWith('index-ABC.css')) return Promise.resolve(Buffer.from(CSS_CONTENT));
      if (path.endsWith('favicon.svg')) return Promise.resolve(Buffer.from(ICON_CONTENT));
      return Promise.reject(new Error('ENOENT'));
    });
    const fresh = await import('./protocol');
    let handler: Handler | null = null;
    sessionProtocolHandle.mockImplementationOnce((_s: string, h: Handler) => {
      handler = h;
    });
    fresh.registerInternalPagesProtocol();
    const res = await handler!({ url: 'tepegoz://settings' });
    const body = await res.text();
    // The "$&" must survive LITERALLY — if it got treated as a replacement pattern, this substring
    // would be gone, replaced by the original <script src=…> tag text instead.
    expect(body).toContain('const x = "$&/";');
    // And the original external tag must appear EXACTLY ONCE (inside the one legitimate reference
    // nothing else re-injected it) — actually it must not appear AT ALL once inlined.
    expect(body.match(/<script[^>]*\ssrc="\/assets\/index-XYZ\.js"/g)).toBeNull();
  });

  it('escapes an accidental </script>-like sequence in the bundle so it cannot end the tag early', async () => {
    // HTML's tokenizer recognizes `<script`, `</script`, and `<!--` lexically, with no awareness of JS
    // string/comment boundaries — a literal, accidental occurrence (React's own source has one, a probe
    // string `"<script><\/script>"`) can end the surrounding <script> tag early regardless of what the
    // JS actually means.
    vi.resetModules();
    const dangerousJs = 'var s = "<script><\\/script>"; console.log(s);';
    readFile.mockImplementation((path: string) => {
      if (path.endsWith('index.html')) return Promise.resolve(Buffer.from(INDEX_HTML));
      if (path.endsWith('index-XYZ.js')) return Promise.resolve(Buffer.from(dangerousJs));
      if (path.endsWith('index-ABC.css')) return Promise.resolve(Buffer.from(CSS_CONTENT));
      if (path.endsWith('favicon.svg')) return Promise.resolve(Buffer.from(ICON_CONTENT));
      return Promise.reject(new Error('ENOENT'));
    });
    const fresh = await import('./protocol');
    let handler: Handler | null = null;
    sessionProtocolHandle.mockImplementationOnce((_s: string, h: Handler) => {
      handler = h;
    });
    fresh.registerInternalPagesProtocol();
    const res = await handler!({ url: 'tepegoz://settings' });
    const body = await res.text();
    // The unescaped, dangerous form must be gone — every "<script"/"</script" inside the embedded
    // content must have gained an escaping backslash right after "<".
    expect(body).not.toContain('"<script><\\/script>"');
    expect(body).toContain('"<\\script><\\/script>"');
    // The document must still contain exactly the two REAL <script> tags (the one we inlined into, plus
    // none extra) — a naive embed would produce three.
    expect(body.match(/<script(?:\s[^>]*)?>/g)?.length).toBe(1);
  });
});

describe('tepegoz:// handler — caching', () => {
  it('builds the page ONCE and caches it — a second request does not re-read the files', async () => {
    // Isolated fresh module so an earlier test's cache can't hide this scenario.
    vi.resetModules();
    readFile.mockClear();
    const fresh = await import('./protocol');
    let handler: Handler | null = null;
    sessionProtocolHandle.mockImplementationOnce((_s: string, h: Handler) => {
      handler = h;
    });
    fresh.registerInternalPagesProtocol();
    await handler!({ url: 'tepegoz://settings' });
    const callsAfterFirst = readFile.mock.calls.length;
    expect(callsAfterFirst).toBeGreaterThan(0);
    await handler!({ url: 'tepegoz://settings' });
    expect(readFile).toHaveBeenCalledTimes(callsAfterFirst); // no new reads on the second request
  });

  it('shares the SAME cached build across different hosts — one bundle, dispatched client-side', async () => {
    vi.resetModules();
    readFile.mockClear();
    const fresh = await import('./protocol');
    let handler: Handler | null = null;
    sessionProtocolHandle.mockImplementationOnce((_s: string, h: Handler) => {
      handler = h;
    });
    fresh.registerInternalPagesProtocol();
    await handler!({ url: 'tepegoz://settings' });
    const callsAfterFirst = readFile.mock.calls.length;
    expect(callsAfterFirst).toBeGreaterThan(0);
    await handler!({ url: 'tepegoz://history' }); // a DIFFERENT host, same cached build
    expect(readFile).toHaveBeenCalledTimes(callsAfterFirst);
  });
});

describe('tepegoz:// handler — favicon read failure', () => {
  it('drops the icon link rather than leaving a broken subresource reference, and still serves 200', async () => {
    readFile.mockImplementation((path: string) => {
      if (path.endsWith('index.html')) return Promise.resolve(Buffer.from(INDEX_HTML));
      if (path.endsWith('index-XYZ.js')) return Promise.resolve(Buffer.from(JS_CONTENT));
      if (path.endsWith('index-ABC.css')) return Promise.resolve(Buffer.from(CSS_CONTENT));
      return Promise.reject(new Error('ENOENT')); // favicon.svg missing
    });
    // Force a fresh build: re-import the module in isolation so the cache from earlier tests doesn't
    // hide this scenario.
    vi.resetModules();
    const fresh = await import('./protocol');
    let handler: Handler | null = null;
    sessionProtocolHandle.mockImplementationOnce((_s: string, h: Handler) => {
      handler = h;
    });
    fresh.registerInternalPagesProtocol();
    const res = await handler!({ url: 'tepegoz://settings' });
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).not.toContain('rel="icon"');
  });
});
