import { z } from 'zod';

/**
 * AI-7 sitemap/robots reader — the evidence source that lets the agent visit a conventional path ONLY
 * when the origin actually publishes it (so `/blog` is a grounded route, not a hallucination). Given the
 * page the agent is on, it discovers `robots.txt` → `Sitemap:` entries → `sitemap.xml` `<loc>` URLs and
 * returns the same-origin page URLs found there.
 *
 * **Electron-free**: the outbound fetch is an injected seam ({@link SitemapFetch}) — the host wires it to
 * `@tepegoz/http`, this module stays pure/unit-testable. **SSRF-safe by construction**: it only ever
 * fetches URLs on the SAME ORIGIN as the page the agent already loaded (through the browser + Policy
 * plane), so discovery can never pivot to a private-IP / cloud-metadata host — reading the current
 * origin's own `robots.txt` is not an escalation. That same rule is what lets it work against the
 * loopback fixture server in the eval. Bounded (byte caps + entry caps + a single index level) and cached
 * per origin so a hostile or huge sitemap cannot hang or flood a run.
 */

/** Injected same-origin text fetch. Returns null on any transport failure (unreachable → simply
 *  ungrounded, never an error). The host implementation MUST enforce the caller's byte cap. */
export type SitemapFetch = (
  url: string,
  maxBytes: number,
) => Promise<{ status: number; text: string } | null>;

/** The fetch result shape, validated at the (untrusted) host boundary before use. */
const FetchResultSchema = z.object({ status: z.number(), text: z.string() });

const MAX_ROBOTS_BYTES = 64 * 1024;
const MAX_SITEMAP_BYTES = 512 * 1024;
/** Max page URLs returned — keeps the grounding candidate set (and any prompt built from it) bounded. */
const MAX_LOCS = 200;
/** Max child sitemaps followed from a `<sitemapindex>` — one level only, bounded. */
const MAX_CHILD_SITEMAPS = 5;
/** Max distinct sitemap documents fetched per origin — bounds a hostile robots.txt that declares many
 *  `Sitemap:` directives from chaining unbounded (slow) fetches and stalling discovery. */
const MAX_SITEMAPS = 3;
/** Max origins kept in the per-reader cache (LRU-ish: oldest evicted) so long sessions stay bounded. */
const MAX_CACHE_ORIGINS = 32;

export interface SitemapReader {
  /** Same-origin sitemap page URLs discovered for the page the agent is on ([] when none/unreachable). */
  discover(pageUrl: string): Promise<readonly string[]>;
}

function sameOrigin(a: string, b: string): boolean {
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    return false;
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

/** The robots.txt / sitemap.xml URLs to probe for a page: the origin root AND the page's own directory
 *  (so a multi-tenant sub-path "site" — like the eval's per-fixture dirs — is discoverable too). */
function sourceUrls(pageUrl: string): { robots: string[]; sitemaps: string[] } {
  const u = new URL(pageUrl);
  const dir = u.pathname.replace(/[^/]*$/, ''); // strip the filename → directory (keeps trailing slash)
  const roots = unique([u.origin + '/', `${u.origin}${dir}`]);
  return {
    robots: roots.map((r) => `${r}robots.txt`),
    sitemaps: roots.map((r) => `${r}sitemap.xml`),
  };
}

function decodeEntities(value: string): string {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&apos;', "'")
    .trim();
}

/** Resolve a possibly-relative URL against its source document; null when unparseable. Real sitemaps use
 *  absolute `<loc>`s, but resolving relative ones (against the sitemap/robots URL) is harmless and keeps
 *  self-hosted fixtures — which can't hardcode a dynamic port — portable. */
function absolutize(url: string, base: string): string | null {
  try {
    return new URL(url, base).href;
  } catch {
    return null;
  }
}

/** Extract `<loc>…</loc>` values from a sitemap document, resolved against `sitemapUrl` (bounded,
 *  entity-decoded). Regex, not an XML parser — the document is untrusted and we only need the locations. */
function extractLocs(xml: string, sitemapUrl: string): string[] {
  const locs: string[] = [];
  // decodeEntities trims, so no surrounding \s* in the pattern (avoids lazy-quantifier backtracking on
  // untrusted sitemap text).
  for (const m of xml.matchAll(/<loc>([\s\S]*?)<\/loc>/gi)) {
    const loc = absolutize(decodeEntities(m[1] ?? ''), sitemapUrl);
    if (loc !== null) locs.push(loc);
    if (locs.length >= MAX_LOCS * (MAX_CHILD_SITEMAPS + 1)) break; // hard ceiling before dedupe/cap
  }
  return locs;
}

/** Sitemap URLs declared in a robots.txt, resolved against the robots URL (same-origin only). */
function robotsSitemaps(robots: string, robotsUrl: string, origin: string): string[] {
  const out: string[] = [];
  for (const line of robots.split(/\r?\n/)) {
    const m = /^\s*sitemap\s*:\s*(\S+)/i.exec(line);
    if (m?.[1] === undefined) continue;
    const resolved = absolutize(m[1], robotsUrl);
    if (resolved !== null && sameOrigin(resolved, origin)) out.push(resolved);
  }
  return out;
}

/**
 * Build a sitemap reader over an injected same-origin fetch. Keeps a per-instance, size-bounded cache so
 * repeated discovery within a run (or session) is one network round-trip per origin.
 */
export function createSitemapReader(fetch: SitemapFetch): SitemapReader {
  const cache = new Map<string, Promise<readonly string[]>>();

  const fetchText = async (url: string, maxBytes: number): Promise<string | null> => {
    let raw: Awaited<ReturnType<SitemapFetch>>;
    try {
      raw = await fetch(url, maxBytes);
    } catch {
      return null;
    }
    if (raw === null) return null;
    const parsed = FetchResultSchema.safeParse(raw);
    if (!parsed.success || parsed.data.status < 200 || parsed.data.status >= 300) return null;
    return parsed.data.text.slice(0, maxBytes);
  };

  const discoverForKey = async (pageUrl: string): Promise<readonly string[]> => {
    const origin = new URL(pageUrl).origin;
    const { robots, sitemaps } = sourceUrls(pageUrl);

    // robots.txt (both probe points) → its same-origin Sitemap: directives.
    const declared: string[] = [];
    for (const robotsUrl of robots) {
      const text = await fetchText(robotsUrl, MAX_ROBOTS_BYTES);
      if (text !== null) declared.push(...robotsSitemaps(text, robotsUrl, origin));
    }

    const sitemapUrls = unique([...declared, ...sitemaps])
      .filter((u) => sameOrigin(u, origin))
      .slice(0, MAX_SITEMAPS);
    const pages: string[] = [];
    let childBudget = MAX_CHILD_SITEMAPS;

    for (const sitemapUrl of sitemapUrls) {
      const xml = await fetchText(sitemapUrl, MAX_SITEMAP_BYTES);
      if (xml === null) continue;
      const locs = extractLocs(xml, sitemapUrl).filter((u) => sameOrigin(u, origin));
      if (/<sitemapindex[\s>]/i.test(xml)) {
        // A sitemap index: its <loc>s are CHILD sitemaps — follow one bounded level.
        for (const child of locs) {
          if (childBudget <= 0) break;
          childBudget -= 1;
          const childXml = await fetchText(child, MAX_SITEMAP_BYTES);
          if (childXml !== null) {
            pages.push(...extractLocs(childXml, child).filter((u) => sameOrigin(u, origin)));
          }
        }
      } else {
        pages.push(...locs);
      }
      if (pages.length >= MAX_LOCS) break;
    }

    return unique(pages).slice(0, MAX_LOCS);
  };

  return {
    discover(pageUrl: string): Promise<readonly string[]> {
      // Cache key = origin + directory (parsed, not a raw string strip) so different origins never collide
      // — a bare-origin URL like `https://a.com` and `https://b.com` must NOT share a slot. Sub-path "sites"
      // keep distinct keys. An unparseable page URL yields no grounding (never a throw).
      let key: string;
      try {
        const u = new URL(pageUrl);
        key = `${u.origin}${u.pathname.replace(/[^/]*$/, '')}`;
      } catch {
        return Promise.resolve([]);
      }
      const hit = cache.get(key);
      if (hit !== undefined) return hit;
      const pending = discoverForKey(pageUrl).catch(() => [] as readonly string[]);
      cache.set(key, pending);
      if (cache.size > MAX_CACHE_ORIGINS) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) cache.delete(oldest);
      }
      return pending;
    },
  };
}
