# @tepegoz/web-tools

The agent's **read-only web tools** — `web_search` and `web_fetch` — kept deliberately separate from
the browser-tab tools (`browser_*`). Schemas, capability registration, and the content guard; the
actual network calls are an injected `WebToolsHost` seam the desktop app wires to `@tepegoz/http`, so
this package stays pure and unit-testable with no network access.

## Entry points

- **`@tepegoz/web-tools`** — the wire types (`WebSearchInput`, `WebFetchResult`, `WebToolsHost`, …),
  the `createSitemapReader` factory, the `web-perception` guard helpers, and the limit constants
  (`DEFAULT_WEB_SEARCH_RESULTS` 5 / `MAX` 10; `DEFAULT_WEB_FETCH_BYTES` 200k / `MAX` 1M).
- **`@tepegoz/web-tools/schemas`** — the zod input schemas (`WebSearchInputSchema`,
  `WebFetchInputSchema`), safe-parsed at the tool boundary.
- **`@tepegoz/web-tools/tools`** — `registerWebTools({ host })`: registers `web_search_items` and
  `web_fetch_*` in the Capability Plane as `dangerClass: 'read'`, category `web`.

## Two things it does that matter

- **Content guard.** Fetched pages and search snippets are the least-trusted input in the product (an
  arbitrary URL the agent chose, or a snippet any site can rank for), so the tools emit a **guarded
  string** — NFKC-folded, injection-redacted, anti-injection footer — the same shape
  `browser_get_page` returns, rather than a structured object that would reach the model unfenced and
  skip the TaintTracker. Verbatim URLs stay in the `artifacts`/`pageRefs` envelope slots so
  navigation still works.
- **Sitemap reader (AI-7).** `createSitemapReader` discovers `robots.txt` → `Sitemap:` →
  `sitemap.xml` `<loc>` entries so the agent visits a conventional path (`/blog`) only when the
  origin actually publishes it. **SSRF-safe by construction**: it only fetches URLs on the *same
  origin* as the page already loaded through the Policy plane, so discovery can't pivot to a
  private-IP or cloud-metadata host. Bounded and cached per origin.

## Scripts

`pnpm typecheck` · `pnpm lint` · `pnpm test`
