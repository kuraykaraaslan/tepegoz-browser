import { net, type Session } from 'electron';
import { Logger } from '@tepegoz/libs';

/**
 * Fetch a page's favicon **on that page's own session** and hand back a `data:` URL.
 *
 * Why this exists rather than just passing the URL through. The tab strip renders in the trusted app
 * chrome, on `persist:tepegoz-app`, which has no proxy and never will. So `<img src="https://site/…">`
 * in a tab chip is a request made by the BROWSER CHROME, on the clear path, to the server of the site
 * you are looking at — including a site you deliberately opened behind a VPN or Tor. It leaks the one
 * fact the tunnel exists to hide (your address, to that server, correlated with that page load), it is
 * invisible, and it fires on every navigation.
 *
 * Fetching it here on `wc.session` fixes that by construction: the request follows exactly the same
 * network path as the page it belongs to — tunnel, Direct, whatever the tab is bound to — and the chrome
 * only ever receives bytes it can render without touching the network.
 *
 * Everything below is a bound on hostile input, because a favicon URL is page-controlled:
 * a byte cap, a request timeout, a status check, an image-only content-type allowlist, and a per-session
 * cache so a page cannot make the browser re-fetch on a loop. The cache is keyed per session on purpose —
 * sharing one across partitions would make it a cross-partition oracle ("was this icon already fetched?").
 */

/** Favicons are small. 64 KiB is generous for a PNG/ICO and cheap to hold as base64 in tab state. */
const MAX_BYTES = 64 * 1024;
const TIMEOUT_MS = 8_000;
/** Per-session cache entries. Bounded so a page cycling favicon URLs cannot grow it without limit. */
const CACHE_MAX = 256;

/** Only real image types. Notably no `text/html`: a 404 page served as an icon is not an icon. */
const ALLOWED_TYPES: ReadonlySet<string> = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/avif',
  'image/bmp',
  'image/x-icon',
  'image/vnd.microsoft.icon',
  'image/svg+xml',
]);

/** `null` is cached too — a site with a broken icon must not be re-fetched on every navigation. */
const caches = new WeakMap<Session, Map<string, string | null>>();

function cacheFor(ses: Session): Map<string, string | null> {
  let cache = caches.get(ses);
  if (cache === undefined) {
    cache = new Map();
    caches.set(ses, cache);
  }
  return cache;
}

function remember(cache: Map<string, string | null>, url: string, value: string | null): string | null {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  cache.set(url, value);
  return value;
}

function contentTypeOf(headers: Record<string, string | string[]>): string | null {
  for (const [name, value] of Object.entries(headers)) {
    if (name.toLowerCase() !== 'content-type') continue;
    const raw = Array.isArray(value) ? value[0] : value;
    return raw === undefined ? null : (raw.split(';', 1)[0] ?? '').trim().toLowerCase();
  }
  return null;
}

/** A `data:image/...` favicon a page declared inline — already local, nothing to fetch. */
export function isInlineImageDataUrl(url: string): boolean {
  return /^data:image\//i.test(url);
}

/**
 * The favicon for `url` as a `data:` URL, or `null` when it cannot be fetched, is not an image, or is
 * too large. Never throws: a favicon is decoration, and a rejected promise here would be noise on a
 * page-controlled event.
 */
export async function faviconDataUrl(ses: Session, url: string): Promise<string | null> {
  if (isInlineImageDataUrl(url)) return url.length <= MAX_BYTES * 2 ? url : null;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;

  const cache = cacheFor(ses);
  const cached = cache.get(url);
  if (cached !== undefined) return cached;

  return new Promise<string | null>((resolve) => {
    let settled = false;
    const finish = (value: string | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(remember(cache, url, value));
    };

    let request: Electron.ClientRequest;
    try {
      request = net.request({ url, session: ses, method: 'GET' });
    } catch (err) {
      Logger.warn('Favicon request could not be created', { err: String(err) });
      resolve(remember(cache, url, null));
      return;
    }

    const timer = setTimeout(() => {
      request.abort();
      finish(null);
    }, TIMEOUT_MS);

    request.on('error', () => finish(null));
    request.on('response', (response) => {
      if (response.statusCode !== 200) {
        request.abort();
        finish(null);
        return;
      }
      const type = contentTypeOf(response.headers);
      if (type === null || !ALLOWED_TYPES.has(type)) {
        request.abort();
        finish(null);
        return;
      }
      const chunks: Buffer[] = [];
      let total = 0;
      response.on('data', (chunk: Buffer) => {
        total += chunk.length;
        if (total > MAX_BYTES) {
          // Stop reading rather than truncate: a half-decoded image is worse than the globe fallback.
          request.abort();
          finish(null);
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => {
        if (settled) return;
        finish(`data:${type};base64,${Buffer.concat(chunks).toString('base64')}`);
      });
      response.on('error', () => finish(null));
    });
    request.end();
  });
}

export function clearFaviconCacheForTests(ses: Session): void {
  caches.delete(ses);
}
