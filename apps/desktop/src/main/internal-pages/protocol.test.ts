import { join, resolve, sep } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `tepegoz://` protocol handler (Faz 0/1 of phases/tracks/protocol-tepegoz-pages.md). Two properties
 * under test: (1) `resolveInBase` — the pure path-confinement function — never resolves outside its
 * base directory no matter what the input path looks like; (2) the handler only ever serves a host in
 * its fixed allowlist, and a missing file (or file-system error) is a 404, never a throw.
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
// The handler MUST register on the app-chrome partition's own session, not the top-level `protocol`
// module (which binds to `session.defaultSession`) — that mismatch is exactly the bug the Faz 2 e2e test
// caught (see the doc comment on `registerInternalPagesProtocol`). Assert the correct partition is used.
vi.mock('../window', () => ({ APP_PARTITION: 'persist:tepegoz-app-test' }));

const readFile = vi.fn<(path: string) => Promise<Buffer>>();
vi.mock('node:fs/promises', () => ({ readFile: (path: string) => readFile(path) }));

const {
  registerInternalPagesScheme,
  registerInternalPagesProtocol,
  resolveInBase,
  INTERNAL_PAGES_SCHEME,
} = await import('./protocol');

async function run(url: string): Promise<Response> {
  registerInternalPagesProtocol();
  if (capturedHandler === null) throw new Error('handler was not registered');
  return capturedHandler({ url });
}

beforeEach(() => {
  readFile.mockReset();
});

describe('registerInternalPagesScheme', () => {
  it('registers the scheme as privileged (standard + secure + fetch-capable + CORS-enabled)', () => {
    registerInternalPagesScheme();
    expect(registerSchemesAsPrivileged).toHaveBeenCalledWith([
      {
        scheme: INTERNAL_PAGES_SCHEME,
        privileges: {
          standard: true,
          secure: true,
          supportFetchAPI: true,
          // Required for the bundle's `<script type="module" crossorigin>` tag to load at all — see the
          // comment on this privilege in protocol.ts for why `false` here silently blanks the page.
          corsEnabled: true,
        },
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

describe('resolveInBase (path confinement)', () => {
  // A genuine absolute path (resolved against CWD, so it carries a real drive root on Windows) —
  // `join('C', 'app', ...)` alone is NOT absolute and would make every containment check below
  // meaningless (`resolve()` would silently prepend the CWD to it).
  const base = resolve('tepegoz-test-fixture-base');

  it('maps the root path to index.html', () => {
    expect(resolveInBase(base, '/')).toBe(join(base, 'index.html'));
    expect(resolveInBase(base, '')).toBe(join(base, 'index.html'));
  });

  it('resolves a normal nested asset path inside the base', () => {
    expect(resolveInBase(base, '/assets/index-abc123.js')).toBe(
      join(base, 'assets', 'index-abc123.js'),
    );
  });

  it('rejects a traversal attempt that would escape the base, regardless of how it is spelled', () => {
    expect(resolveInBase(base, '/../../secrets')).toBeNull();
    expect(resolveInBase(base, '/assets/../../../secrets')).toBeNull();
    expect(resolveInBase(base, `..${sep}..${sep}secrets`)).toBeNull();
  });
});

describe('tepegoz:// handler', () => {
  it('serves a known host at its root path with 200, the security headers, and the resolved bytes', async () => {
    readFile.mockResolvedValueOnce(Buffer.from('<html>hi</html>'));
    const res = await run('tepegoz://settings');
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/html');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(await res.text()).toBe('<html>hi</html>');
  });

  it('maps a .js asset to a JS content type', async () => {
    readFile.mockResolvedValueOnce(Buffer.from('console.log(1)'));
    const res = await run('tepegoz://settings/assets/index-abc123.js');
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/javascript');
  });

  it('applies a strict CSP: no inline/eval script, no external network, no framing', async () => {
    readFile.mockResolvedValueOnce(Buffer.from('<html></html>'));
    const res = await run('tepegoz://settings');
    const csp = res.headers.get('Content-Security-Policy') ?? '';
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).not.toContain('http:');
    expect(csp).not.toContain('https:');
  });

  it('404s an unknown host instead of guessing', async () => {
    expect((await run('tepegoz://not-a-real-page')).status).toBe(404);
    expect(readFile).not.toHaveBeenCalled();
  });

  it('404s when the resolved file does not exist, instead of throwing', async () => {
    readFile.mockRejectedValueOnce(new Error('ENOENT'));
    const res = await run('tepegoz://settings/does-not-exist.js');
    expect(res.status).toBe(404);
  });

  it('a dot-segment traversal attempt still resolves safely (the URL layer already clamps it to root, proven above) and 404s like any other missing file', async () => {
    // `new URL('tepegoz://settings/../../secrets').pathname` is `/secrets`, not an escape — browsers
    // collapse dot-segments before a scheme handler ever sees them. The actual confinement property
    // (arbitrary path input can never resolve outside `base`) is what `resolveInBase` is tested for
    // directly, above, independent of that upstream normalization.
    readFile.mockRejectedValueOnce(new Error('ENOENT'));
    const res = await run('tepegoz://settings/../../secrets');
    expect(res.status).toBe(404);
  });

  it('404s an unparsable URL instead of throwing', async () => {
    await expect(run('not a url')).resolves.toMatchObject({ status: 404 });
  });
});
