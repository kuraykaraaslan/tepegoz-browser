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
  close: () => Promise<void>;
}

/**
 * A tiny static file server over `test-fixtures/sites/` — the deterministic "real page" the harness
 * points the real app at, with no cloud dependency. Bound to loopback on an ephemeral port. Path
 * traversal outside `rootDir` is refused (the fixtures are trusted, but the guard keeps it honest).
 */
export function startFixtureServer(rootDir: string): Promise<FixtureServer> {
  const server: Server = createServer((req, res) => {
    const rawPath = decodeURIComponent((req.url ?? '/').split('?')[0] ?? '/');
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

  return new Promise<FixtureServer>((resolve, reject) => {
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr === null || typeof addr === 'string') {
        reject(new Error('fixture server did not bind a TCP port'));
        return;
      }
      resolve({
        url: `http://127.0.0.1:${String(addr.port)}`,
        port: addr.port,
        close: () =>
          new Promise<void>((res, rej) => {
            server.close((err) => (err ? rej(err) : res()));
          }),
      });
    });
  });
}

/** The URL a scenario's fixture name resolves to on a running fixture server. */
export function fixtureUrl(base: string, fixture: string): string {
  return `${base}/${fixture}/`;
}
