# Track — Firecrawl agent-capability parity

**Status:** 📋 **Proposed — not scheduled (2026-09-02).** No branch, no ADR number reserved, no owner
sign-off. This is a captured gap list in the shape of
[`browser-settings-feature-gap.md`](../tracks/browser-settings-feature-gap.md),
[`webbrain-agent-parity.md`](webbrain-agent-parity.md) and
[`aipex-agent-parity.md`](aipex-agent-parity.md): every row names its nearest existing Tepegöz behaviour
and a suggested phase home, so a future session can promote a row into a real `phase-*.md` task or an
`ai-agent` PR without re-deriving the comparison. It is deliberately **short** — see "Why this
track exists" for why almost none of Firecrawl's surface area translates into a Tepegöz gap.

**Source:** [`docs/others/tepegoz-vs-firecrawl.md`](../versus/tepegoz-vs-firecrawl.md) (Turkish,
2026-09-01) against a same-session deep read of `.junk/firecrawl` (Firecrawl — a shipping,
**AGPL-3.0-licensed** web-data API + hosted service; `apps/api` Express + worker queues, 10+-language
SDKs, `api.firecrawl.dev`) and this repo's AI surface (`phases/ai-agent/`, `packages/orchestrator|
model-gateway|capability-plane|security-policy|agent-runtime|browser-tools|web-tools|tool-executor|
reader|notary`, `extensions/ext-agent`). This file is the durable English track artifact. Key claims were
re-verified against source in this session: `apps/api/src/controllers/v2/map.ts` +
`apps/api/src/lib/map-utils.ts` (`getMapResults`, `performCosineSimilarityV2`, the index+search-engine+
sitemap blend), `packages/web-tools/src/sitemap-reader.ts` (`createSitemapReader`),
`packages/web-tools/src/web-tools.ts` (`web_search_items`/`web_get_page`),
`packages/agent-runtime/src/agent-runtime-types.ts` (`AgentRunDeps.discoverSitemap`),
`packages/reader/src/extract.ts` (`extractArticle`), and two accuracy checks that change how this track
is written: **`@tepegoz/notary` is written and unit-tested but `apps/desktop` does not import it anywhere**
(no `package.json` dependency, no import — grep-verified), and **S10 vision escalation ships inert**
(`captureVision` is an optional Reactor hook with no production caller, per the 2026-09-02 correction
already recorded in `phase-s10-vision-escalation.md`). Neither capability is treated as "existing" below.

## Why this track exists

The comparison this track distills opens with a category mismatch and holds it throughout: Firecrawl is
not a browser agent — it has no user, no window, no tab model, no signed-in session. It is a web-data
API/service that turns a URL (or a whole site, or a search query) into clean Markdown/JSON/screenshots
**at scale, for other agents to consume**. Tepegöz is the opposite shape: a live, user-present browser
agent that acts inside one signed-in session behind a model-pre deterministic Policy Kernel. Most of the
comparison's 22 scored axes are therefore not a capability gap at all — provider abstraction, prompt
architecture, cost ledgering, MCP direction and untrusted-content handling each land at "roughly equal"
or "Tepegöz ahead, once the category difference is priced in" in the comparison's own per-axis verdict.
The one place a real, narrow gap survives that filter is the pair the comparison calls out as Firecrawl's
actual strength: **perception** (turning a page into boilerplate-free, LLM-ready text without wasting
token budget) and **discovery** (finding which pages a site actually publishes, optionally ranked by
relevance to a query) — because Tepegöz's _own_ agent already needs both for its _own_ single-session
tasks, not because Firecrawl's bulk-harvesting business is worth imitating. This track maps only those
two axes onto the nearest existing Tepegöz seam — `@tepegoz/reader`'s Readability-style extractor and
`@tepegoz/web-tools`'s SSRF-safe sitemap reader — and explicitly declines the rest as a different
product's job, not a missed opportunity.

## How to read this

Each workstream below is written like an `ai-agent` phase section (Goal → Approach → new/changed
packages → ADR → DoD-shaped bullets) so it can be lifted into a real phase file with minimal rewriting.
**Nothing here is committed roadmap.** Where a capability already has a named home in an existing phase,
ADR, or a sibling track, this file cites it and does **not** re-describe it. Per the "Already planned —
do NOT re-propose" rule in [`../README.md`](../../phases/README.md#deferred--adoption-gated-backlog-from-the-beyond-phases-synthesis),
the **MCP server** surface is **Phase 1b**, and agent-callable PDF text extraction is already
[`webbrain-agent-parity.md`](webbrain-agent-parity.md) **P3-a** — both are cited below, neither is
reworked.

## Ground rules — parity, not imitation

Three Firecrawl design choices are **deliberately not being matched**, because matching them would either
violate a standing decision this repo already made, or misread what kind of product Tepegöz is. Naming
them here once, so no future session re-proposes them by accident:

1. **No LLM-based prompt-injection classifier as a security gate.** Firecrawl's `promptInjectionGuard.ts`
   is a separate, **fail-open** LLM call (`gpt-4o-mini`, `generateObject`) sitting in front of one hatch —
   its JSON-extraction pipeline only; plain `/scrape`/`/crawl` Markdown output isn't covered at all.
   Tepegöz's defense is **model-PRE and deterministic** (ADR-0006 Policy Kernel; `sanitizeText` /
   `wrapUntrustedContent` / `TaintTracker` / `EgressFirewall`), applied to **every** tool call, not one
   hatch. P1/P2 below route through that exact same deterministic fencing `web_get_page`/`web_search_items`
   already use — neither adds a second, model-judged gate in front of anything.
2. **No bulk crawl / site-wide harvesting capability.** Firecrawl's `/crawl`, `/batch-scrape` and its
   credit-billed hosted API are its actual product — an unattended, at-scale content-harvesting service.
   Tepegöz is a live-session, user-present browser agent (per `CLAUDE.md`: "agentic, security-by-design,
   local-first browser"), not a background scraping service. P2's discovery tool stays a single bounded
   same-origin sitemap read, never a multi-page crawl loop, and carries no path toward becoming one.
3. **No raw/arbitrary browser-automation code path.** Firecrawl's `interact` endpoint has a "code" mode
   that runs a caller-supplied Playwright script. ADR-0026 (isolated-world sandbox measured and
   **REFUTED**) and ADR-0029 (DevTools-class capability is user-only, never an agent tool) already settled
   this identically for `execute_js` in both `webbrain-agent-parity.md` and `aipex-agent-parity.md`. Not
   revisited here.

None of these are "Firecrawl did it wrong" — Firecrawl is a stateless, multi-tenant API service with no
native process and no policy kernel, and reasoned about the same trade-offs from that substrate. The point
of naming them is that a future reader of this track shouldn't reopen a decision already made for a
documented reason.

---

## Capability inventory

Legend for **Home**: an existing phase/ADR/track name means "already planned or already settled, no new
work needed here." **NEW** means no existing plan owns it and this track proposes one. **Ground rules #N**
means deliberately not matched. **Out of scope** means a different product category, not a gap.

| #   | Firecrawl capability                                                                                                                                                                                                   | Nearest Tepegöz behaviour today                                                                                                                                                                                           | Gap                                                                                                                                         | Home                                                                                             |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 1   | Clean, boilerplate-free single-page extraction — `onlyMainContent`, HTML→Markdown, adaptive `trimToTokenLimit` token-budget trim                                                                                       | `@tepegoz/reader`'s Readability-style `extractArticle` (link-density penalty, class/id scoring, typed blocks, no HTML) via `browser_get_article`; `web_get_page`'s raw-fetch path has **no** boilerplate stripping at all | One scorer, one call site; no budget-aware trim anywhere in the read path                                                                   | **P1 (NEW, small — extends `@tepegoz/reader` + `@tepegoz/web-tools`)**                           |
| 2   | `/map` — sitemap + link discovery, optionally ranked by relevance to a search term (`getMapResults` blends an internal index, a live search-engine query, and a sitemap crawl, then `performCosineSimilarityV2` ranks) | `@tepegoz/web-tools`'s SSRF-safe, same-origin-only `createSitemapReader` (cached, byte/entry-capped, one sitemap-index level)                                                                                             | Wired **only** as an internal navigation-grounding seam (`AgentRunDeps.discoverSitemap`); never a model-callable tool; no relevance ranking | **P2 (NEW — extends `@tepegoz/web-tools`)**                                                      |
| 3   | Agent-callable PDF/DOCX text extraction                                                                                                                                                                                | Phase 2c ships a human-facing PDF viewer; no agent tool                                                                                                                                                                   | Same gap, already named                                                                                                                     | **Already planned** — `webbrain-agent-parity.md` P3-a (`browser_read_pdf`); not re-proposed here |
| 4   | MCP **server** (npx + hosted, action logs, delegated HMAC credential)                                                                                                                                                  | MCP **client** only (ADR-0018)                                                                                                                                                                                            | Opposite direction, already named twice                                                                                                     | **Phase 1b** (already planned); see also `webbrain` P17 / `aipex` P1                             |
| 5   | Bulk `crawl` / `batch-scrape` — whole-site harvesting at scale, credit-billed, rotating proxies                                                                                                                        | Nothing — not attempted                                                                                                                                                                                                   | Not a gap: Firecrawl's actual product, a different category from a live-session agent                                                       | **Out of scope** — Ground rules #2                                                               |
| 6   | `promptInjectionGuard.ts` — fail-open LLM classifier gating one extraction hatch                                                                                                                                       | Model-PRE deterministic Policy Kernel (ADR-0006) + `sanitizeText`/`wrapUntrustedContent`/`TaintTracker`/`EgressFirewall`, applied to every tool call                                                                      | None — the comparison's own verdict already favors Tepegöz's architecture here                                                              | **Ground rules #1** — rejected as an imitation, not adopted                                      |

---

## P1 — Boilerplate-free content extraction + budget-aware trim (NEW, small — extends `@tepegoz/reader` + `@tepegoz/web-tools`)

**Goal.** Firecrawl's entire product is turning a page into clean text a model can use without wasting
tokens on nav/footer/ads/cookie banners — and it adapts the trim to the actual token budget
(`trimToTokenLimit`: tiktoken, with a character pre-filter before the synchronous encode so a long page
never blocks the event loop). Tepegöz already owns a scorer for exactly this shape —
`@tepegoz/reader`'s Readability-style `extractArticle` (link-density penalty, negative/positive
class-name scoring, typed blocks instead of raw HTML) — but it feeds **one** call site
(`browser_get_article`); `web_get_page`'s raw-fetch path has no boilerplate stripping at all, so a
fetched page's nav/footer/cookie-banner text goes straight into the model's context today.

**Approach.**

- Reuse the **same** scorer (`extractArticle`/`findArticleRoot`) as an opt-in filter for `web_get_page`
  when the caller doesn't need the whole page — a `mode: 'article' | 'full'` input flag, `article`
  default-on, matching Firecrawl's own `onlyMainContent`-by-default choice. No second scorer, no new DOM
  dependency: `web_get_page` already needs _some_ DOM parse to resolve `finalUrl`/`title`; extend that
  path, and fall back to `full` with a noted limitation where no DOM is available.
- Add a small, budget-aware trim to `@tepegoz/reader` (or `@tepegoz/tool-executor`, which already owns
  `sanitizeText`) that trims by an approximate token count rather than a raw byte/char cap. Firecrawl's
  char-pre-filter-before-sync-tokenize trick is worth copying verbatim to avoid blocking on a long
  synchronous encode; Tepegöz doesn't need `tiktoken` specifically (multi-provider), a conservative
  chars-per-token heuristic keyed off `ModelRouter`'s selected provider is enough — this is a budget
  guard, not a billing figure.
- Everything still routes through the existing untrusted-content pipeline (`wrapUntrustedContent` /
  `sanitizeText`) exactly as today — this is a quality/budget improvement to content that already gets
  fenced, not a new trust boundary.

**New/changed packages:** `@tepegoz/reader` (trim utility), `@tepegoz/web-tools` (`mode` flag on
`web_get_page`, reusing the existing scorer).

**ADR:** none needed — squarely inside ADR-0008 (DOM/a11y-first perception). Worth a short addendum note
recording "one content scorer, two call sites" so a future session doesn't build a second Readability
clone for `web_get_page`.

**DoD shape (draft):**

- [ ] `web_get_page` in `article` mode returns measurably less boilerplate text than today's raw fetch on
      a fixture page with nav/footer/cookie-banner content (byte-count delta recorded)
- [ ] The trim utility is deterministic and unit-tested: same input + budget → same output, never
      mid-word
- [ ] No second content-scoring implementation exists in the tree — `web_get_page`'s article mode calls
      the exact `extractArticle` `browser_get_article` already uses
- [ ] i18n: no new user-facing strings expected (this is agent-facing tool behaviour); if a
      mode-selection surface is ever added to a tool-inspector/settings UI, it gets EN+TR parity then

---

## P2 — Agent-callable site discovery over the existing sitemap reader (NEW — extends `@tepegoz/web-tools`)

**Goal.** Firecrawl's `/map` answers "what URLs does this site actually have, optionally ranked by
relevance to a query" in one bounded call — useful for a task like "find the pricing page" without a
blind multi-click crawl. Tepegöz already built the safety-relevant part of this: `createSitemapReader`
is same-origin-only **by construction** (so it can never pivot to a private-IP / cloud-metadata host),
byte-capped, entry-capped, one sitemap-index level deep, and per-origin cached. It is wired, but only as
an internal navigation-grounding check (`AgentRunDeps.discoverSitemap`, consulted before proposing a
path, never returned to the model as a list) — there is no way for the agent to _ask_ "what pages does
this site publish."

**Approach.**

- Add a `web_map_site` tool (naming pending the `{domain}_{verb}_{noun}` convention) in
  `@tepegoz/web-tools`, registered through the same `CapabilityRegistry`/PEP as `web_search_items` /
  `web_get_page`, `dangerClass: 'read'`. It calls the **existing** `SitemapReader.discover(pageUrl)` —
  no second downloader, no new SSRF surface, the same same-origin/byte/entry caps that already protect
  the grounding path.
- When the caller supplies a `query`, rank the returned URLs by relevance instead of sitemap order.
  Firecrawl computes this with embeddings (`performCosineSimilarityV2`); Tepegöz doesn't need a network
  embedding call for this — a lexical relevance score (path segments + a discovered page title, when
  cheaply available, matched against the query by term overlap, no model call) covers the same use case
  and keeps the tool fully offline/deterministic — consistent with `web_search_items` staying the only
  place a live search _engine_ is called.
- URLs returned are exactly what the site's own sitemap already publishes — a strictly narrower, safer
  version of Firecrawl's `/map`, which also blends in a live search-engine query and an internal crawl
  index. This tool deliberately does **not** add a second web-search call (that's `web_search_items`'s
  job) or a multi-page crawl (Ground rules #2) — it answers "what does this one site's own sitemap say,"
  nothing wider.
- Same untrusted-content handling as `web_search_items`'s results: any discovered page title is
  page-authored text, fenced the same way search snippets already are.

**New/changed packages:** `@tepegoz/web-tools` (new tool + ranking helper). No change to
`@tepegoz/agent-runtime`'s existing `discoverSitemap` grounding seam — both consume the same underlying
`SitemapReader`.

**ADR:** none needed — extends ADR-0007 (single tool plane) + ADR-0008 (perception) by adding one more
`dangerClass: 'read'` tool over an already-audited engine; not worth a number.

**DoD shape (draft):**

- [ ] `web_map_site` returns only same-origin URLs the site's own robots.txt/sitemap.xml actually
      publish — a test proves it never returns a URL the reader didn't discover
- [ ] With a `query`, results are ordered by the lexical relevance score, deterministic and unit-tested
- [ ] Without a `query`, behaviour is unchanged from what `discoverSitemap` already returns internally
      (no regression to grounding)
- [ ] i18n: the tool's own description string follows the existing tool-descriptor pattern (English, not
      user-facing UI — matches every other `web_*`/`browser_*` tool today)

---

## Backlog (named, not written up)

- **Embedding-based ranking for `web_map_site`** — P2's lexical relevance score is a deliberate v1
  simplification. If/when Phase 8's `HybridRetriever` lands (FTS5 + embeddings), P2's ranking could be
  swapped for the same engine rather than staying purely lexical. Not opened now — Phase 8 is
  measurement-owed and this is a small refinement, not a blocker to shipping P2.

---

## Routing — what this track does not own

Per the existing convention ([`../README.md`](../../phases/README.md#routing--what-stays-out) /
[`ai-agent/README.md`](../../phases/ai-agent/README.md#routing--what-stays-out)), reference these,
never duplicate them:

| Stays with                          | Material                                                                                                                                                                                                                                                                                                              |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Phase 1b**                        | The MCP **server** surface — Firecrawl ships one; Tepegöz's own unbuilt line is already named (`webbrain` P17 / `aipex` P1); not re-proposed here                                                                                                                                                                     |
| **`webbrain-agent-parity.md` P3-a** | Agent-callable PDF text extraction (`browser_read_pdf`) — Firecrawl's web-hosted PDF/DOCX parsing names the same underlying gap; the Tepegöz-shaped version is already written up there                                                                                                                               |
| **ADR-0006**                        | The deterministic, model-pre Policy Kernel — not reopened by adding an LLM injection classifier (Ground rules #1)                                                                                                                                                                                                     |
| **ADR-0026 / ADR-0029**             | `execute_js` / DevTools / raw-automation boundary — not reopened by Firecrawl's `interact` "code" mode (Ground rules #3)                                                                                                                                                                                              |
| **Out of category, no home needed** | Hosted API + credit billing + multi-tenant service, 10+-language SDKs/CLI/playground, bulk crawl/batch-scrape at scale, rotating-proxy infra, screenshot pipeline, `deterministicJson`/change-tracking/diff, org-level SIEM/threat-protection policy — Firecrawl's actual product, not a browser-agent capability gap |

## ADRs owed (numbers assigned when a session actually opens one of these)

- **P1:** none — an addendum _note_ to **ADR-0008** ("one content scorer, two call sites"), not a new
  number.
- **P2:** none — squarely governed by **ADR-0007** + **ADR-0008**; no new danger class, no new number.

No number is reserved here; per this repo's own multi-profile-track lesson
([`multi-profile-isolation.md`](../tracks/multi-profile-isolation.md) — an ADR-number collision from writing a plan
too far ahead of when it's actually opened), a number gets assigned at the point a session actually
starts the work, not now.
