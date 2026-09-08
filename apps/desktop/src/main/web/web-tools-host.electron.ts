import { createHttpClient } from '@tepegoz/http';
import {
  createSitemapReader,
  isPublicHttpUrl,
  type SitemapFetch,
  type WebFetchResolvedInput,
  type WebFetchResult,
  type WebSearchResolvedInput,
  type WebSearchResult,
  type WebToolsHost,
} from '@tepegoz/web-tools';

const client = createHttpClient({
  timeoutMs: 20_000,
  headers: {
    Accept: 'text/html,text/plain,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'User-Agent': 'TepegozBrowser/1.0',
  },
  // The agent picks the `web_get_page` URL, so the shared seam refuses a loopback / private /
  // link-local / cloud-metadata target before the fetch and re-checks every redirect hop. The zod
  // `.refine` on `WebFetchInputSchema.url` stays as defense in depth + a cleaner error for the agent.
  blockPrivateHosts: true,
});

function decodeHtml(value: string): string {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&nbsp;', ' ')
    .trim();
}

function stripHtml(value: string): string {
  return decodeHtml(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' '),
  );
}

function titleOf(html: string): string | undefined {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const title = match === null ? '' : stripHtml(match[1] ?? '');
  return title.length > 0 ? title.slice(0, 2048) : undefined;
}

function cleanDuckDuckGoUrl(href: string): string | null {
  try {
    const url = new URL(decodeHtml(href), 'https://duckduckgo.com');
    const uddg = url.searchParams.get('uddg');
    const target = uddg !== null ? new URL(uddg) : url;
    return /^https?:$/i.test(target.protocol) ? target.toString() : null;
  } catch {
    return null;
  }
}

function parseDuckDuckGo(html: string, maxResults: number): WebSearchResult[] {
  const results: WebSearchResult[] = [];
  const seen = new Set<string>();
  const pattern = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(pattern)) {
    const url = cleanDuckDuckGoUrl(match[1] ?? '');
    const title = stripHtml(match[2] ?? '');
    if (url === null || title.length === 0 || seen.has(url)) continue;
    seen.add(url);
    results.push({ title: title.slice(0, 256), url, source: 'duckduckgo' });
    if (results.length >= maxResults) break;
  }
  return results;
}

async function search(input: WebSearchResolvedInput): Promise<WebSearchResult[]> {
  const response = await client.get<string>('https://duckduckgo.com/html/', {
    params: { q: input.query },
    responseType: 'text',
    transformResponse: [(data: unknown) => String(data)],
  });
  return parseDuckDuckGo(response.data, input.maxResults);
}

async function fetchPage(input: WebFetchResolvedInput): Promise<WebFetchResult> {
  // The SSRF guard (literal address + every redirect hop) is enforced by the `blockPrivateHosts`
  // client above; the schema `.refine` already refused a private-host URL before we got here.
  const response = await client.get<string>(input.url, {
    responseType: 'text',
    maxContentLength: input.maxBytes,
    transformResponse: [(data: unknown) => String(data)],
  });
  // Where the bytes ACTUALLY came from. axios's Node adapter carries the post-redirect URL on the
  // last request (follow-redirects' `responseUrl`); fall back to the requested URL when it can't be
  // read (no redirect metadata, a non-Node adapter, a test stub). `url` stays the URL we asked for —
  // the gap between "what I asked for" and "where I landed" is exactly what a citation / pageRef needs.
  const lastRequest = response.request as { res?: { responseUrl?: unknown } } | undefined;
  const redirectedTo = lastRequest?.res?.responseUrl;
  const finalUrl =
    typeof redirectedTo === 'string' && redirectedTo.length > 0 ? redirectedTo : input.url;
  // Belt and braces on the value we hand the model: the `blockPrivateHosts` client already re-checks
  // every redirect hop, but re-verify the final URL here too before it becomes a pageRef / citation.
  if (finalUrl !== input.url && !isPublicHttpUrl(finalUrl)) {
    throw new Error(
      `web_get_page landed on a non-public address after a redirect: ${finalUrl}`,
    );
  }
  const raw = response.data.slice(0, input.maxBytes + 1);
  const truncated = raw.length > input.maxBytes;
  const text = stripHtml(raw.slice(0, input.maxBytes)).slice(0, input.maxBytes);
  const contentType = response.headers['content-type'];
  return {
    url: input.url,
    finalUrl,
    status: response.status,
    ...(titleOf(response.data) !== undefined ? { title: titleOf(response.data) } : {}),
    ...(typeof contentType === 'string' ? { mimeType: contentType.split(';')[0] } : {}),
    text,
    truncated,
  };
}

export const webToolsHost: WebToolsHost = {
  search,
  fetch: fetchPage,
};

// AI-7 sitemap/robots discovery over the shared HTTP seam. The reader only ever asks for SAME-ORIGIN URLs
// (robots.txt / sitemap.xml of the page the agent is already on), so this fetch cannot become an SSRF
// pivot; non-2xx is surfaced as a normal status (not thrown) so a missing sitemap is simply "ungrounded".
const sitemapFetch: SitemapFetch = async (url, maxBytes) => {
  try {
    const response = await client.get<string>(url, {
      responseType: 'text',
      maxContentLength: maxBytes,
      transformResponse: [(data: unknown) => String(data)],
      validateStatus: () => true,
      // Do NOT follow redirects: the reader guarantees a SAME-ORIGIN request, but a redirect could bounce
      // it to a private-IP / metadata host (SSRF). A redirected robots/sitemap is treated as unreachable.
      maxRedirects: 0,
    });
    return { status: response.status, text: String(response.data).slice(0, maxBytes) };
  } catch {
    return null;
  }
};

// One reader for the process so its per-origin cache survives across runs in a session.
const sitemapReader = createSitemapReader(sitemapFetch);

/** Same-origin sitemap page URLs for the page the agent is on — the AI-7 `discoverSitemap` deps seam. */
export function discoverSitemap(pageUrl: string): Promise<readonly string[]> {
  return sitemapReader.discover(pageUrl);
}
