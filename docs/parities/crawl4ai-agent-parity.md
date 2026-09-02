# Track — Crawl4AI agent-capability parity

**Status:** 📋 **Proposed — not scheduled (2026-09-02).** No branch, no ADR number reserved, no owner
sign-off. This is a captured gap list in the shape of
[`browser-settings-feature-gap.md`](../tracks/browser-settings-feature-gap.md) and
[`webbrain-agent-parity.md`](webbrain-agent-parity.md): every row names its nearest existing Tepegöz
behaviour and a suggested phase home, so a future session can promote a row into a real `phase-*.md`
task or an `ai-agent` PR without re-deriving the comparison. Unlike the WebBrain and AIPex tracks,
this one is deliberately narrow — see "Why this track exists" below for the category reason.

**Source:** a same-session deep read of
[`docs/others/tepegoz-vs-crawl4ai.md`](../versus/tepegoz-vs-crawl4ai.md) (2026-09-01), itself
sourced from `.junk/crawl4ai`'s `README.md`/`README-first.md`/`MISSION.md`/`ROADMAP.md`/
`PROGRESSIVE_CRAWLING.md` + `crawl4ai/extraction_strategy.py`, `content_filter_strategy.py`,
`chunking_strategy.py`, `async_webcrawler.py`, `deep_crawling/`, `deploy/docker/{server.py,mcp_bridge.py,
egress_broker.py}`, `SECURITY.md`, against this repo's AI surface. This session **re-verified the
load-bearing claims directly against source rather than trusting the comparison's summary**: confirmed
`PruningContentFilter`/`BM25ContentFilter`/`LLMContentFilter` in `content_filter_strategy.py`;
`JsonCssExtractionStrategy`/`JsonXPathExtractionStrategy` in `extraction_strategy.py`; all six chunking
strategies in `chunking_strategy.py` (`RegexChunking`/`NlpSentenceChunking`/
`TopicSegmentationChunking`/`FixedLengthWordChunking`/`SlidingWindowChunking`/
`OverlappingWindowChunking`); and that `execute_js` is one of `deploy/docker/server.py`'s seven
`@mcp_tool`-wrapped endpoints — **disabled by default** (`server.py:97`, `"arbitrary JS + SSRF risk"`,
requires `CRAWL4AI_EXECUTE_JS_ENABLED=true`). On the Tepegöz side this session read
`packages/reader/src/extract.ts`, `packages/web-tools/src/web-perception.ts`,
`apps/desktop/src/main/agent/article-text-script.ts`, `apps/desktop/src/main/agent/browser-host.electron.ts`
and `apps/desktop/src/main/web/web-tools-host.electron.ts` directly, and confirmed two accuracy-sensitive
claims that must not be overstated here: **`@tepegoz/notary` is written and unit-tested but `apps/desktop`
does not import it anywhere** (grep across `apps/desktop` for `tepegoz/notary` returns no hits) — no run
produces a receipt today; and **S10 vision ships inert** — `captureVision` is an optional callback on
`ReactorOptions` (`packages/orchestrator/src/reactor-types.ts`) that only `reactor.ts` itself and its own
test wire up, with no production caller anywhere in `apps/desktop`. Neither capability is used by
anything this track proposes, so they are noted here only so this document does not imply otherwise.

## Why this track exists

The comparison lands on a category difference too large for most of it to resolve into a Tepegöz gap at
all. Crawl4AI is a crawl/scrape **library** — a URL (or thousands of them) in, LLM-ready Markdown or
schema-driven JSON out, for a developer building a pipeline. Tepegöz is a browser **agent** that acts
inside one live, policy-gated session. Batch/parallel crawling, deep-crawl strategies (BFS/DFS/Best-First

- URL seeding), an adaptive "have I read enough" crawl-stopper, a Docker API server, and an MCP **server**
  surface are not missing Tepegöz capabilities in any useful sense — they are a different product's job,
  and building any of them would mean Tepegöz stops being what it is. The one place the two products'
  work genuinely overlaps is **perception**: both take an unstructured page and turn it into something an
  LLM can use cheaply — prose stripped of navigation/boilerplate, occasionally reshaped into a schema. And
  on that one axis this track's finding is unusually specific, not generic "Crawl4AI is more mature": Tepegöz
  already built a decent, tested, Readability-style scoring heuristic for exactly this problem
  (`@tepegoz/reader`'s `extract.ts` — paragraph density discounted by link density, penalised/rewarded by
  class/id name) — it is simply not reused by the two agent-facing tools that need the same thing
  (`browser_get_article`, `web_get_page`), each of which runs its own, cruder, independent pass today. So
  this track is not "port Crawl4AI's technique," it is "finish wiring the technique Tepegöz already has."

## How to read this

The one workstream below is written like an `ai-agent` phase section (Goal → Approach →
new/changed packages → ADR → DoD-shaped bullets) so it can be lifted into S2's own phase file with
minimal rewriting. **Nothing here is committed roadmap.** Per the "Already planned — do NOT re-propose"
rule in [`../README.md`](../../phases/README.md#deferred--adoption-gated-backlog-from-the-beyond-phases-synthesis)
and the sibling tracks' own routing sections, several axes the source comparison scores in Crawl4AI's
favor (provider breadth, PDF extraction, MCP-server direction, offline/local embeddings) already have a
named home in this repo or in a sibling track — those are cited in Routing below, not re-derived here.

## Ground rules — parity, not imitation

One Crawl4AI capability is **deliberately not being matched**, because matching it would violate a
standing decision this repo already made after deliberation:

1. **No model/API-triggered arbitrary-JS execution tool.** Crawl4AI's own Docker/MCP surface ships
   `execute_js` (`deploy/docker/server.py`, `@mcp_tool("execute_js")`), and its c4a script DSL has an
   `EVAL` command for the same purpose during crawl-prep. Tellingly, **Crawl4AI's own maintainers ship it
   disabled by default** — `server.py:97` gates it behind `CRAWL4AI_EXECUTE_JS_ENABLED=true` and names the
   reason inline: `"arbitrary JS + SSRF risk"`. Tepegöz's own measurement went further and already closed
   this door from the other side: **ADR-0026** tested and **refuted** an isolated-world sandbox for
   model-authored scripts and replaced it with a read-only, request-cancelling extraction path (S5);
   **ADR-0029** draws the line that DevTools-class capability — which arbitrary script execution is — stays
   **user-only, never an agent tool, never on a sensitive site**. A rival that ships the same primitive
   behind its own opt-in flag is not a reason to reopen either decision.

## Capability inventory

Legend for **Home**: an existing phase/ADR/track name means "already planned or already covered
elsewhere, this row cites it, no new phase needed." **NEW** would mean no existing phase owns it — no row
below needs that label; everything Crawl4AI does well on the overlapping axis already has a Tepegöz seam,
either one this track sharpens or one a sibling track/phase already claims.

| #   | Crawl4AI capability                                                                                                                                                                                                                                               | Nearest Tepegöz behaviour today                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Gap                                                                                                           | Home                                                                                                                                                              |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Markdown generator + `PruningContentFilter`/`BM25ContentFilter` — model-free boilerplate/nav removal by paragraph density and link density                                                                                                                        | `@tepegoz/reader`'s `extract.ts` (Readability-style: link-density discount + negative/positive class-name scoring) — but only wired into the human-facing Reader View, not into either agent tool. `browser_get_article` runs `article-text-script.ts` instead: a fixed 7-entry selector list (`article`/`main`/`[role=main]`/`#content`/`#main`/`.post`/`.article`) + a fixed chrome-strip list, no density scoring at all. `web_get_page` runs `web-tools-host.electron.ts`'s `stripHtml` — a regex tag-strip + byte-truncate, no content-vs-chrome distinction whatsoever | Two of Tepegöz's own three "give me the content" implementations are cruder than the third, already-built one | **P1 (sharpen — extends S2 perception-v2, addendum to ADR-0008)**                                                                                                 |
| 2   | `LLMContentFilter` — query-guided relevance trimming (keep only what's relevant to the task, not just what's prose)                                                                                                                                               | None — `web_get_page`/`web_search` return full (capped) text regardless of task relevance                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Needs a relevance signal (embeddings or a retrieval index) Tepegoz doesn't have yet                           | **Backlog** — gated behind Phase 8's embedding engine, which is ⏸ not started                                                                                     |
| 3   | `JsonCssExtractionStrategy`/`JsonXPathExtractionStrategy` + `JSON_SCHEMA_BUILDER`'s self-correcting schema-generation loop — author a CSS/XPath schema once (with or without an LLM), then extract structured JSON with **zero** model calls on every later visit | None — no schema-driven, model-free "extract this JSON shape" primitive exists; every extraction today re-reads DOM/elements and re-reasons about them each visit                                                                                                                                                                                                                                                                                                                                                                                                            | A genuinely useful, genuinely missing capability, but not urgent enough to design here (see Backlog)          | **Backlog** — nearest analog is Phase 6's own ownership test                                                                                                      |
| 4   | Six chunking strategies (`Regex`/`NlpSentence`/`TopicSegmentation`/`FixedLengthWord`/`SlidingWindow`/`OverlappingWindow`) for feeding extracted text to a retrieval/RAG pipeline                                                                                  | None — Tepegoz has no chunking layer because it has no installed retrieval corpus yet                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Feeds an engine that doesn't exist yet                                                                        | **Phase 8** (already routed — see `webbrain-agent-parity.md` P2's precedent for reusing Phase 8's planned `HybridRetriever` rather than building a second engine) |
| 5   | Heuristic (`DefaultTableExtraction`) + LLM table extraction                                                                                                                                                                                                       | `browser_analyze_page`'s isolated-world sandbox (S5) already returns table contents in one call; S5's own doc records that a curated `browser_extract_table(ref)` shape was explicitly **not built** — "ergonomics gap, not a capability one"                                                                                                                                                                                                                                                                                                                                | None of substance — already covered, more curated ergonomics is the only open item and S5 already names it    | **S5** (already planned, sharpen only — cite, don't duplicate)                                                                                                    |
| 6   | `read_pdf`-equivalent: PDF text extraction                                                                                                                                                                                                                        | Phase 2c ships a human-facing PDF viewer; no agent tool                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Already proposed                                                                                              | **`webbrain-agent-parity.md` P3-a** (`browser_read_pdf`) — cite, don't duplicate                                                                                  |
| 7   | `CosineStrategy` — local `sentence-transformers` embeddings + hierarchical clustering                                                                                                                                                                             | `@tepegoz/local-inference` does GBNF-constrained generation, not embeddings                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Local embedding-based extraction                                                                              | **Phase 8** (local embeddings/`HybridRetriever`, already planned)                                                                                                 |

---

## P1 — Unify agent-facing content extraction on `@tepegoz/reader`'s density heuristic (sharpens S2 perception-v2, addendum to ADR-0008)

**Goal.** Close the gap the Crawl4AI comparison actually found — not "Tepegoz lacks a Markdown generator,"
but "Tepegoz built a good one and only wired it into one of the three places that need it." Make
`browser_get_article` and `web_get_page` reuse the density-scoring heuristic `@tepegoz/reader` already
has, tested, and exports (`@tepegoz/reader/extract` — a real `package.json` subpath, not an internal-only
module), instead of each running its own weaker pass.

**Approach.**

- **`browser_get_article` (in-page, the easy half).** Both `article-text-script.ts` (today's heuristic)
  and `@tepegoz/reader/extract`'s `findArticleRoot`/`extractArticle` run against a real, already-parsed
  `Document` — same substrate, same read-only clone-before-strip discipline, same "return `null`/`'body'`
  rather than pretend an article was found" contract. Swapping the injected script's selector-list logic
  for reader's link-density + negative/positive class-name scoring is substitution, not new
  infrastructure. Reader's `ReaderBlock[]` output can either be flattened to text (matching today's
  `{ text, source }` shape exactly) or handed through with its light structure (`heading`/`paragraph`/
  `list`/`quote`) intact — the latter gets the agent something closer to Crawl4AI's heading-aware Markdown
  than a flattened `innerText` blob ever could, at no extra sanitizer cost since `ReaderBlock` was already
  designed to have no `html` field.
- **`web_get_page` (fetched, non-rendered URL — the real decision).** `web-tools-host.electron.ts` fetches
  in the **main process**, where there is no `Document` to walk — `@tepegoz/reader/extract` is written
  against a DOM on purpose (its own header comment explains why: it runs inside a page where a DOM already
  exists, so pulling in a DOM implementation would be pure weight there). Reusing the _same heuristic_ for
  a fetch-any-URL tool is therefore a real mechanism choice a session has to make, not a copy-paste:
  either (a) parse the fetched HTML into a lightweight DOM (only for this path, still Electron-free at the
  package boundary) and run the existing scorer unmodified, or (b) port just the two scoring primitives —
  paragraph segmentation and a tag-based link-density estimate — to operate on parsed HTML without a full
  DOM. Either way the target is fixed (`web_get_page` stops returning raw stripped-tag boilerplate) and
  the mechanism is left to whichever session opens this, recorded in the ADR addendum rather than decided
  by this track.
- **What stays exactly as designed:** `sanitizeContent`/`wrapUntrustedContent`/taint-wrapping (AI-5) do
  not move — this only changes what text enters that pipeline, never the trust boundary around it. The
  `source` field's honest-degradation contract (`'body'` means "no article found," never a silent
  overclaim) is preserved for both tools.

**New/changed packages:** `@tepegoz/browser-tools` + `apps/desktop/src/main/agent` (swap
`article-text-script.ts`'s heuristic), `@tepegoz/web-tools` + `apps/desktop/src/main/web` (fetch-path
content reduction), `@tepegoz/reader` (no new package — `/extract` is already public; only exports a
non-DOM scoring helper if approach (b) above is chosen).

**ADR:** addendum to **ADR-0008** (DOM/a11y-first perception) recording the fetch-path mechanism decision
— no new number, this is squarely what ADR-0008 already governs (how the agent perceives page content,
model-free-first).

**DoD shape (draft, for whichever session promotes this):**

- [ ] `browser_get_article` reuses `@tepegoz/reader/extract`'s scoring instead of `article-text-script.ts`'s
      fixed selector list; a fixture whose real content sits in a container outside every current
      `CONTENT_SELECTORS` entry (e.g. `<div class="entry-content">`), and a fixture with a
      `<div class="related-posts">` sidebar the current chrome-strip list doesn't catch, both pass
      where today's heuristic fails
- [ ] `web_get_page` measurably reduces boilerplate on a "mostly nav/ads" fixture page (content length or
      token count drops vs today's blind `stripHtml`+truncate) with no model call
- [ ] The fetch-path mechanism (DOM-parse vs non-DOM scoring port) is decided and named in the ADR-0008
      addendum, not left implicit in code
- [ ] Every existing AI-5 guarantee is unchanged — the sanitizer/taint test suite passes unmodified against
      the new heuristic's output
- [ ] i18n: none expected — this is a perception-quality change with no new user-facing string; the DoD
      confirms that stays true rather than assuming it

---

## Backlog (named, not written up)

- **Schema-driven, model-free extraction** (Crawl4AI's `JsonCssExtractionStrategy`/`JsonXPathExtractionStrategy`
  - its schema-validation feedback loop). Real and genuinely missing — nothing in Tepegoz lets an agent
    define a CSS/XPath shape once and replay extraction on later visits with zero model calls. Nearest home
    is Phase 6's own ownership test ("if the model could be removed from the replay, it's Phase 6"), which
    this fits precisely — a schema, once authored, is exactly the kind of model-free, signed, replayable
    artifact Phase 6 already exists for. Not written up as a full workstream because Phase 6 itself is
    frozen out of v1; revisit when that phase resumes.
- **Query-guided content filtering** (Crawl4AI's `LLMContentFilter`/`BM25ContentFilter` used for
  relevance, not just density). Needs an embedding or retrieval signal Tepegoz doesn't have yet — folds
  into Phase 8 once its `HybridRetriever` exists, same as chunking (inventory row 4).
- **A `crawl4ai-doctor`-style diagnostic command** for the agent's own tool/provider/policy wiring — real
  but small, no daily-driver pull demonstrated for this product yet; fold into whichever session next
  touches developer-settings-surface.md's diagnostics rather than opening a track for it alone.

---

## Routing — what this track does not own

Per the existing convention ([`../README.md`](../../phases/README.md#deferred--adoption-gated-backlog-from-the-beyond-phases-synthesis) /
[`ai-agent/README.md`](../../phases/ai-agent/README.md#routing--what-stays-out)), reference these,
never duplicate them:

| Stays with                                      | Material                                                                                                                                                                   |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Phase 1b**                                    | MCP **server** surface (opposite direction from Crawl4AI's MCP server — already the AIPex track's P1), local-SLM, cost-saver toggle, vision fallback                       |
| **`webbrain-agent-parity.md` P1**               | Generic OpenAI-compatible provider + catalog — already proposed, closes the same provider-breadth axis Crawl4AI's litellm dependency raises; not re-proposed here          |
| **`webbrain-agent-parity.md` P3-a**             | `browser_read_pdf` — already proposed, closes Crawl4AI's PDF-extraction axis                                                                                               |
| **`webbrain-agent-parity.md` P2** / **Phase 8** | Chunking strategies, local/Cosine-style embeddings, an installable offline corpus — routed via P2's `HybridRetriever`-reuse precedent                                      |
| **S5**                                          | Structured table/list extraction — `browser_analyze_page` already returns table contents; a curated `browser_extract_table` was explicitly not built (ergonomics gap only) |
| **Phase 6**                                     | Deterministic, model-free schema-driven extraction (Backlog above) — frozen out of v1, not scheduled by this track                                                         |
| **ADR-0026 / ADR-0029**                         | `execute_js`/DevTools boundary — Crawl4AI's MCP `execute_js` tool and c4a script's `EVAL` command are rejected here (Ground rules), not reopened                           |

## ADRs owed (numbers assigned when a session actually opens one of these)

- P1: addendum to **ADR-0008** (DOM/a11y-first perception) — records the `web_get_page` fetch-path
  content-reduction mechanism decision

No number is reserved here; per this repo's own multi-profile-track lesson
([`multi-profile-isolation.md`](../tracks/multi-profile-isolation.md) — an ADR-number collision from writing a plan
too far ahead of when it's actually opened), the number gets assigned at the point a session actually
starts the work, not now.
