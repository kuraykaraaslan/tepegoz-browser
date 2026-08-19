import { createServer, type Server } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { join, normalize, extname } from 'node:path';

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

export interface FixtureServer {
  /** Base origin, e.g. `http://127.0.0.1:53124`. A fixture named `blog-behind-nav` lives at
   *  `${url}/blog-behind-nav/`. */
  url: string;
  port: number;
  /**
   * A SECOND origin serving the same fixtures, on its own loopback port (S4).
   *
   * Origin includes the port, so this is a genuine cross-origin peer — which is what a navigation-swap
   * trap needs, and what a single origin cannot provide. Binding a second loopback listener keeps the
   * harness loopback-only; widening the bind to all interfaces to get a second *hostname* would trade a
   * real exposure increase for the same test.
   *
   * A fixture discovers it at runtime through the reserved `/__alt` endpoint — it cannot know the
   * ephemeral port any other way.
   */
  altUrl: string;
  close: () => Promise<void>;
}

/**
 * A tiny static file server over `test-fixtures/sites/` — the deterministic "real page" the harness
 * points the real app at, with no cloud dependency. Bound to loopback on an ephemeral port. Path
 * traversal outside `rootDir` is refused (the fixtures are trusted, but the guard keeps it honest).
 */
/** Build one static-fixture listener. `altOrigin` is resolved lazily, since each server learns the
 *  other's port only after both have bound. */
function createFixtureListener(rootDir: string, altOrigin: () => string): Server {
  return createServer((req, res) => {
    const rawPath = decodeURIComponent((req.url ?? '/').split('?')[0] ?? '/');
    // Reserved endpoint (S4): the peer origin, so a navigation-swap fixture can send itself somewhere
    // genuinely cross-origin without hard-coding an ephemeral port.
    if (rawPath === '/__alt' || rawPath === '/__alt/') {
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' }).end(altOrigin());
      return;
    }
    // Reserved endpoint (AI-8B): `/__status/500` answers with that HTTP status, so a fixture can exercise
    // a REAL server failure rather than a simulated one. `__status` is not a fixture directory, so nothing
    // under `sites/` can shadow it, and the code is clamped to the valid HTTP range.
    const status = /^\/__status\/(\d{3})\/?$/.exec(rawPath);
    if (status !== null) {
      const code = Number(status[1]);
      const safe = Number.isInteger(code) && code >= 100 && code <= 599 ? code : 500;
      res
        .writeHead(safe, { 'content-type': 'application/json; charset=utf-8' })
        .end(JSON.stringify({ ok: safe < 400, status: safe }));
      return;
    }
    // Resolve within rootDir; a directory serves its index.html.
    let filePath = normalize(join(rootDir, rawPath));
    if (!filePath.startsWith(normalize(rootDir))) {
      res.writeHead(403).end('forbidden');
      return;
    }
    try {
      if (statSync(filePath).isDirectory()) filePath = join(filePath, 'index.html');
      statSync(filePath);
    } catch {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': CONTENT_TYPES[extname(filePath)] ?? 'application/octet-stream' });
    createReadStream(filePath).pipe(res);
  });
}

/** Bind one listener on an ephemeral loopback port. */
function listen(server: Server): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr === null || typeof addr === 'string') {
        reject(new Error('fixture server did not bind a TCP port'));
        return;
      }
      resolve(addr.port);
    });
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

export async function startFixtureServer(rootDir: string): Promise<FixtureServer> {
  let primaryOrigin = '';
  let altOrigin = '';
  // Each listener reports the OTHER as its peer, so `/__alt` is symmetric: a fixture reached on either
  // origin can swap to the one it is not on.
  const primary = createFixtureListener(rootDir, () => altOrigin);
  const alt = createFixtureListener(rootDir, () => primaryOrigin);
  const [primaryPort, altPort] = await Promise.all([listen(primary), listen(alt)]);
  primaryOrigin = `http://127.0.0.1:${String(primaryPort)}`;
  altOrigin = `http://127.0.0.1:${String(altPort)}`;
  return {
    url: primaryOrigin,
    port: primaryPort,
    altUrl: altOrigin,
    close: async () => {
      await Promise.all([closeServer(primary), closeServer(alt)]);
    },
  };
}

/** The URL a scenario's fixture name resolves to on a running fixture server. */
export function fixtureUrl(base: string, fixture: string): string {
  return `${base}/${fixture}/`;
}
