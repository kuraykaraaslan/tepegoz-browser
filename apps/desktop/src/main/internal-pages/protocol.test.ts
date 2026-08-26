import { describe, expect, it, vi } from 'vitest';

/**
 * `tepegoz://` protocol handler (Faz 0 of phases/tracks/protocol-tepegoz-pages.md). The property under
 * test: the handler only ever serves a fixed, allowlisted host at its exact root path — an unknown host,
 * a sub-path, or an unparsable URL all fall through to the same 404, never a guess or a file-system read.
 */

type Handler = (request: { url: string }) => Response;

const registerSchemesAsPrivileged = vi.fn();
let capturedHandler: Handler | null = null;
const handle = vi.fn((_scheme: string, h: Handler) => {
  capturedHandler = h;
});

vi.mock('electron', () => ({
  protocol: { registerSchemesAsPrivileged, handle },
}));

const { registerInternalPagesScheme, registerInternalPagesProtocol, INTERNAL_PAGES_SCHEME } =
  await import('./protocol');

function run(url: string): Response {
  registerInternalPagesProtocol();
  if (capturedHandler === null) throw new Error('handler was not registered');
  return capturedHandler({ url });
}

describe('registerInternalPagesScheme', () => {
  it('registers the scheme as privileged (standard + secure + fetch-capable), never CORS-open', () => {
    registerInternalPagesScheme();
    expect(registerSchemesAsPrivileged).toHaveBeenCalledWith([
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
  });
});

describe('tepegoz:// handler', () => {
  it('serves a known host at its root path with 200 and the security headers', () => {
    const res = run('tepegoz://settings');
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/html');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('Referrer-Policy')).toBe('no-referrer');
  });

  it('applies a strict CSP: no inline/eval script, no external network, no framing', () => {
    const res = run('tepegoz://settings');
    const csp = res.headers.get('Content-Security-Policy') ?? '';
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).not.toContain('http:');
    expect(csp).not.toContain('https:');
  });

  it('404s an unknown host instead of guessing', () => {
    expect(run('tepegoz://not-a-real-page').status).toBe(404);
  });

  it('404s a sub-path under a known host rather than reading anything from it', () => {
    expect(run('tepegoz://settings/anything').status).toBe(404);
  });

  it('collapses a dot-segment traversal attempt under a known host to the same 404', () => {
    // The handler never reads the path to decide what to serve, so there is nothing here for a `../`
    // segment to escape into — this pins that property rather than assuming it.
    expect(run('tepegoz://settings/../../secrets').status).toBe(404);
  });

  it('404s an unparsable URL instead of throwing', () => {
    expect(() => run('not a url')).not.toThrow();
    expect(run('not a url').status).toBe(404);
  });
});
