import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `webToolsHost` (+ `discoverSitemap`) — the desktop web_search / web_fetch tools over the shared
 * HTTP seam. Pinned: `search` posts the query to DuckDuckGo's HTML endpoint and parses result
 * anchors (uddg-unwrapped URLs, HTML-stripped titles, dedup, capped at maxResults, non-http dropped);
 * `fetch` returns the stripped text with `truncated` set past maxBytes and only includes title /
 * mimeType when present; and the sitemap fetch is same-origin, no-redirect, status-not-thrown, and
 * null on error.
 */

const http = vi.hoisted(() => ({ get: vi.fn(), blockPrivateHosts: false }));
vi.mock('@tepegoz/http', async (orig) => {
  const actual = await orig<typeof import('@tepegoz/http')>();
  // Keep the real SSRF guard (web-tools re-exports it for its zod refine); swap only the client,
  // recording the SSRF opt-in it was built with.
  return {
    ...actual,
    createHttpClient: (opts: { blockPrivateHosts?: boolean }) => {
      http.blockPrivateHosts = opts.blockPrivateHosts ?? false;
      return http;
    },
  };
});

const sitemap = vi.hoisted(
  (): { fetch?: (url: string, maxBytes: number) => Promise<unknown> } => ({}),
);
vi.mock('@tepegoz/web-tools', async (orig) => {
  const actual = await orig<typeof import('@tepegoz/web-tools')>();
  return {
    isPublicHttpUrl: actual.isPublicHttpUrl,
    createSitemapReader: (fn: (url: string, maxBytes: number) => Promise<unknown>) => {
      sitemap.fetch = fn;
      return { discover: vi.fn(() => Promise.resolve(['https://x.test/a'])) };
    },
  };
});

const { webToolsHost, discoverSitemap } = await import('./web-tools-host.electron');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('search', () => {
  const ddg = (anchors: string) => ({ data: anchors, status: 200, headers: {} });

  it('queries the DDG HTML endpoint and unwraps uddg result URLs', async () => {
    http.get.mockResolvedValue(
      ddg(
        '<a class="result__a" href="/l/?uddg=https%3A%2F%2Freal.example%2Fpage">Real &amp; <b>Page</b></a>',
      ),
    );
    const out = await webToolsHost.search({ query: 'cats', maxResults: 5 });
    expect(http.get).toHaveBeenCalledWith(
      'https://duckduckgo.com/html/',
      expect.objectContaining({ params: { q: 'cats' }, responseType: 'text' }),
    );
    expect(out).toEqual([
      { title: 'Real & Page', url: 'https://real.example/page', source: 'duckduckgo' },
    ]);
  });

  it('dedupes, caps at maxResults, and drops non-http / empty-title anchors', async () => {
    http.get.mockResolvedValue(
      ddg(
        '<a class="result__a" href="https://a.test/1">One</a>' +
          '<a class="result__a" href="https://a.test/1">One again</a>' +
          '<a class="result__a" href="https://a.test/2">Two</a>' +
          '<a class="result__a" href="ftp://a.test/3">Three</a>' +
          '<a class="result__a" href="https://a.test/4">   </a>' +
          '<a class="result__a" href="https://a.test/5">Five</a>',
      ),
    );
    const out = await webToolsHost.search({ query: 'q', maxResults: 2 });
    expect(out.map((r) => r.url)).toEqual(['https://a.test/1', 'https://a.test/2']);
  });

  it('drops an anchor whose uddg target will not parse as a URL', async () => {
    http.get.mockResolvedValue(
      ddg(
        '<a class="result__a" href="/l/?uddg=:::not a url:::">Broken</a>' +
          '<a class="result__a" href="https://ok.test/">OK</a>',
      ),
    );
    const out = await webToolsHost.search({ query: 'q', maxResults: 5 });
    expect(out.map((r) => r.url)).toEqual(['https://ok.test/']);
  });
});

describe('fetch', () => {
  it('returns stripped text plus title + mimeType when both are present', async () => {
    http.get.mockResolvedValue({
      data: '<html><head><title>Hello &amp; Bye</title></head><body><script>x()</script><p>Body  text</p></body></html>',
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
    const r = await webToolsHost.fetch({ url: 'https://p.test/', maxBytes: 5000 });
    expect(r).toMatchObject({
      url: 'https://p.test/',
      finalUrl: 'https://p.test/',
      status: 200,
      title: 'Hello & Bye',
      mimeType: 'text/html',
      truncated: false,
    });
    expect(r.text).toContain('Body text');
    expect(r.text).not.toContain('x()');
    expect(r.text).not.toContain('<p>');
  });

  it('marks truncated and omits title / mimeType when absent', async () => {
    http.get.mockResolvedValue({ data: 'abcdefghij', status: 200, headers: {} });
    const r = await webToolsHost.fetch({ url: 'https://p.test/', maxBytes: 4 });
    expect(r.truncated).toBe(true);
    expect(r.text).toHaveLength(4);
    expect('title' in r).toBe(false);
    expect('mimeType' in r).toBe(false);
  });

  it('reports the post-redirect URL as finalUrl while url stays the requested URL', async () => {
    http.get.mockResolvedValue({
      data: '<html><body>landed</body></html>',
      status: 200,
      headers: {},
      request: { res: { responseUrl: 'https://elsewhere.example/landing' } },
    });
    const r = await webToolsHost.fetch({ url: 'https://p.test/start', maxBytes: 5000 });
    expect(r.url).toBe('https://p.test/start');
    expect(r.finalUrl).toBe('https://elsewhere.example/landing');
  });

  it('leaves finalUrl === url when the response reports no redirect', async () => {
    http.get.mockResolvedValue({
      data: 'hello',
      status: 200,
      headers: {},
      request: { res: { responseUrl: 'https://p.test/' } },
    });
    const r = await webToolsHost.fetch({ url: 'https://p.test/', maxBytes: 5000 });
    expect(r.finalUrl).toBe('https://p.test/');
    expect(r.finalUrl).toBe(r.url);
  });

  it('rejects when a redirect lands the fetch on a non-public address', async () => {
    http.get.mockResolvedValue({
      data: 'secret',
      status: 200,
      headers: {},
      request: { res: { responseUrl: 'http://169.254.169.254/latest/meta-data/' } },
    });
    await expect(webToolsHost.fetch({ url: 'https://p.test/', maxBytes: 5000 })).rejects.toThrow(
      /non-public address/,
    );
  });

  it('builds the client with blockPrivateHosts so the seam guards the URL + every redirect hop', () => {
    // The literal-address + per-hop SSRF guard now lives in `@tepegoz/http` (`blockPrivateHosts`),
    // exercised directly in that package's `http-client.test.ts`; this host just has to opt in.
    // `createHttpClient` is mocked to a bare spy here, so we assert the wiring, not the behaviour.
    expect(http.blockPrivateHosts).toBe(true);
  });
});

describe('discoverSitemap + the sitemap fetch', () => {
  it('delegates to the process sitemap reader', async () => {
    expect(await discoverSitemap('https://x.test/page')).toEqual(['https://x.test/a']);
  });

  it('sitemap fetch surfaces the status (not thrown) and slices the body', async () => {
    http.get.mockResolvedValue({ data: 'SITEMAPDATA', status: 404 });
    const res = (await sitemap.fetch!('https://x.test/sitemap.xml', 4)) as {
      status: number;
      text: string;
    };
    expect(res).toEqual({ status: 404, text: 'SITE' });
    expect(http.get).toHaveBeenCalledWith(
      'https://x.test/sitemap.xml',
      expect.objectContaining({ maxRedirects: 0, validateStatus: expect.any(Function) as unknown }),
    );
  });

  it('sitemap fetch returns null on a transport error', async () => {
    http.get.mockRejectedValue(new Error('ECONNREFUSED'));
    expect(await sitemap.fetch!('https://x.test/robots.txt', 100)).toBeNull();
  });
});

describe('the transformResponse/validateStatus thunks passed to the http client', () => {
  // These run inside the real client (mocked here to a bare spy), so nothing calls them unless we
  // capture and invoke them directly off the options each call site passes.
  it('each transformResponse coerces the raw response data to a string', async () => {
    http.get.mockResolvedValue({ data: '<html></html>', status: 200, headers: {} });

    await webToolsHost.search({ query: 'q', maxResults: 1 });
    const searchOpts = http.get.mock.calls[0]![1] as {
      transformResponse: [(d: unknown) => string];
    };
    expect(searchOpts.transformResponse[0](123)).toBe('123');

    http.get.mockClear();
    await webToolsHost.fetch({ url: 'https://p.test/', maxBytes: 10 });
    const fetchOpts = http.get.mock.calls[0]![1] as { transformResponse: [(d: unknown) => string] };
    expect(fetchOpts.transformResponse[0](null)).toBe('null');

    http.get.mockClear();
    await sitemap.fetch!('https://x.test/sitemap.xml', 10);
    const sitemapOpts = http.get.mock.calls[0]![1] as {
      transformResponse: [(d: unknown) => string];
      validateStatus: () => boolean;
    };
    expect(sitemapOpts.transformResponse[0](42)).toBe('42');
    expect(sitemapOpts.validateStatus()).toBe(true);
  });
});
