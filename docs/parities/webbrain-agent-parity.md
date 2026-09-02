# Track — WebBrain agent-capability parity

**Status:** 📋 **Proposed — not scheduled (2026-09-01).** No branch, no ADR number reserved, no owner
sign-off. This is a captured gap list in the shape of
[`browser-settings-feature-gap.md`](../tracks/browser-settings-feature-gap.md) and
[`omnibox-competitive-parity.md`](omnibox-competitive-parity.md): every row names its nearest existing
Tepegöz behaviour and a suggested phase home, so a future session can promote a row into a real
`phase-*.md` task or an `ai-agent` PR without re-deriving the comparison.

**Source:** a same-session deep read of `.junk/webbrain` (WebBrain v33.6.0 — a shipping, GPL-3.0
Chrome/Firefox/Edge AI-browser-agent extension, ~62 core tools, 108 provider cards, 58+ site adapters,
a full offline-RAG stack) against this repo's AI surface (`phases/ai-agent/`, `packages/
orchestrator|model-gateway|capability-plane|security-policy|agent-runtime|browser-tools|web-tools|…`,
`extensions/ext-agent`). The prose comparison this track distills lives only in that chat session, not
in the repo — this file is the durable artifact.

## Why this track exists

The comparison landed on an honest asymmetry: **WebBrain is the more capable agent today; Tepegöz is
designed to be the safer, more accountable one and has not proven it yet.** WebBrain wins on raw
capability breadth — provider count, offline knowledge, site-specific guidance, skills that actually
call HTTP endpoints, CAPTCHA handling, iframe/shadow-DOM reach, a shipped MCP server. None of that
breadth requires abandoning tepegoz's DNA (deterministic Policy Kernel before the model, single
ToolGateway PEP, taint/provenance, Notary replay receipts) — most of it is a **surface-area problem**,
not an architecture problem. This track's job is to say, for every WebBrain capability the comparison
found: _does Tepegöz already have a seam for this, and if not, what would the Tepegöz-conformant version
look like_ — never "port the JS," always "re-derive the capability inside the existing kernel/PEP/i18n/
coverage discipline."

## How to read this

Each workstream below is written like an `ai-agent` phase section (Goal → Approach → new/changed
packages → ADRs owed → DoD-shaped bullets) so it can be lifted into a real phase file with minimal
rewriting. **Nothing here is committed roadmap.** Where a capability already has a named home in an
existing phase or ADR, this track says so explicitly and does **not** re-describe it — it only adds the
detail the WebBrain comparison surfaced that the existing phase text doesn't have yet. Per the "Already
planned — do NOT re-propose" rule in [`../README.md`](../../phases/README.md#deferred--adoption-gated-backlog-from-the-beyond-phases-synthesis),
local-SLM / HybridRetriever / cost-saver toggle / vision fallback / MCP server are **Phase 1b**, not
new asks — several rows below are "sharpen Phase 1b's DoD with this detail," not "add a phase."

## Ground rules — parity, not imitation

Four WebBrain capabilities are **deliberately not being matched**, because matching them would violate
a standing decision this repo already made after deliberation. Naming them here once, so no future
session re-proposes them by accident:

1. **No CAPTCHA solving.** WebBrain's `solve_captcha` spends a third-party solver's quota and injects a
   token that can auto-submit. ADR-0039 already chose the opposite shape: CAPTCHA is a **Human Handoff**
   event — the agent stops, tells the user why, and hands back control (`extensions/ext-agent/src/i18n/
en.ts` → `handoff.captcha`). 2FA is the one thing that _does_ get automatically cleared, and only
   through the Credential Broker (ADR-0039), never a page-embedded widget. Keep the handoff; do not add
   a solver.
2. **No `execute_js` / arbitrary page-mutation tool.** WebBrain's Dev mode ships `execute_js` (CDP
   `Runtime.evaluate`), `inject_css`/`patch_element`, and console/network/listener inspectors as
   model-callable tools. ADR-0026 already measured this path (isolated-world sandbox **refuted**) and
   ADR-0029 already drew the line: DevTools-class capability is **user-only, never an agent tool, never
   on a sensitive site.** Read-only diagnostics (below, workstream P3) are fine; a tool that lets the
   model run arbitrary JS in the page is not being added.
3. **No screenshot-every-step vision.** WebBrain auto-attaches a screenshot after most actions when the
   tier allows it. `ai-agent`'s own "Never" list already forbids this. Vision stays **escalation-only**
   (ADR-0008, owned by S10) — every row below that touches vision sharpens S10's existing DoD, it does not
   loosen the trigger.
4. **No in-renderer WebGPU model runtime.** WebBrain's Apocalypse Mode runs an ONNX/WebGPU LLM inside the
   extension's offscreen document. Tepegöz's local tier is `node-llama-cpp` in the **main process**
   (`@tepegoz/local-inference`), which is the correct substrate for a native desktop app — a browser-tab
   WebGPU runtime would put model weights and inference inside the renderer trust boundary this repo
   works hard to keep untrusted. Offline capability (workstream P2) is matched by content and retrieval,
   not by moving inference into the page process.

None of these are "WebBrain did it wrong" — WebBrain's own `THREAT-MODEL.md` and `AGENT.md` show they
reasoned about the same trade-offs and, being an extension with no native process and no policy kernel,
landed differently. The point of naming them is that a future reader of this track shouldn't reopen a
decision that was already made for a documented reason.

---

## Capability inventory

Legend for **Home**: an existing phase/ADR name means "already planned, this row sharpens it, no new
phase needed." **NEW** means no existing phase owns it and this track proposes one.

| #   | WebBrain capability                                                                                               | Nearest Tepegöz behaviour today                                                                                     | Gap                                                                                        | Home                                                                               |
| --- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| 1   | 106–108 provider cards, generic OpenAI-compatible card, 10 local endpoint servers                                 | 8 providers (`AIProvider` union), 1 local engine (node-llama-cpp)                                                   | Breadth + a generic OpenAI-compatible adapter + alternate local-server transports          | **P1 (NEW — extends ADR-0005)**                                                    |
| 2   | Zero-setup managed cloud default (WebBrain Cloud 1.0)                                                             | BYO-key only; no key = no run                                                                                       | Managed proxy                                                                              | **Phase 3** (already planned — "works without the user entering a key")            |
| 3   | Apocalypse Mode: ZIM/Kiwix Wikipedia + Emergency Box corpus + offline RAG (FTS5 BM25 + E5 vectors + RRF)          | `HybridRetriever` planned for **the user's own history**, not an installable knowledge corpus                       | A new _content source_ for an existing _engine_                                            | **P2 (extends Phase 8, NEW subsection)**                                           |
| 4   | 58+ site adapters (prompt guidance injected per matched site)                                                     | Phase 2 "Integration Adapters" = official-API-first, ~4 services (Gmail/Drive/Calendar/Canva) — a different concept | A lightweight guidance layer for the long tail Phase 2 will never build a full adapter for | **P4 (NEW)**                                                                       |
| 5   | Skills declare HTTP / download-job tools (`webbrain-tools` manifest)                                              | S9 skills are prompt templates only, **by explicit written design** ("S9 ships the former only")                    | The next increment S9's own doc leaves open                                                | **P5 (extends S9, after its sweep)**                                               |
| 6   | `fetch_url`/`research_url` with `/allow-api` override for write methods                                           | `web_get_page`/`web_search` (read-only), `web_send_form`; no generic mutating fetch                                 | A gated escape hatch for API-first task completion                                         | **P6 (extends S6 safety-control-plane)**                                           |
| 7   | `read_pdf` (agent-callable PDF text extraction)                                                                   | PDF viewer ships (Phase 2c, human-facing only); no agent tool                                                       | One small `browser_read_pdf` on top of the existing viewer                                 | **P3-a (NEW, small)**                                                              |
| 8   | `get_frames`/`iframe_read`/`iframe_click`/`iframe_type`/`promote_iframe`, Chrome shadow-DOM piercing              | Light-DOM-only perception (ADR-0008/S2)                                                                             | Frame + shadow-DOM reach                                                                   | **P3-b (extends S2 perception-v2)**                                                |
| 9   | `download_social_media` / `resolve_public_media` (skill-first, browser-fallback)                                  | `download_*` tools manage already-started downloads; nothing resolves a media URL                                   | A resolver tool, same trust gate as any download                                           | **P3-c (NEW, small — extends `@tepegoz/downloads`)**                               |
| 10  | Dev-mode `read_console`/`inspect_network_requests`/`inspect_event_listeners` (read-only diagnostics)              | None as agent tools (ADR-0029 keeps DevTools user-only)                                                             | A narrow **read-only** carve-out distinct from `execute_js`                                | **P3-d (NEW, small — explicitly read-only)**                                       |
| 11  | Slash commands (`/ask /act /plan /schedule /watch /export /compact …`) in the panel                               | Command palette (Chat/Do/Make/Tasks); no typed slash-command grammar                                                | A structured command surface with `/help` + autocomplete                                   | **P7-a (extends S8 assistant-ux)**                                                 |
| 12  | Selection quick-actions (Summarize/Explain/Quiz/Proofread/Translate/Humanize)                                     | Translate ships (`ext-translate`); Proofread partially (`ext-typo`); no unified selection menu                      | A small selection-action registry reusing existing extensions                              | **P7-b (extends S8, reuses `ext-translate`/`ext-typo`)**                           |
| 13  | Ask-mode token streaming to the panel, per-provider SSE parsers                                                   | `ModelGateway.generateStream`/`onDelta` exists (ADR-0025)                                                           | Wiring the interactive Ask path in `ext-agent`, not new plumbing                           | **P7-c (extends S1/S8, "wire the last mile")**                                     |
| 14  | Mid-run auto-compaction (message-count / char / token-budget triggers), emergency trim, image pruning             | `cache-window.ts` (lag-2 breakpoints) + reactor working-state collapse; no explicit mid-run summarize-and-continue  | A visible "context compacted" step, not just cache-friendly ordering                       | **P9-a (extends S1/S7 speed)**                                                     |
| 15  | 3 independent loop detectors (repeat / coordinate-click / navigation)                                             | Reactor no-progress replan + escape trigger (S0/C1, already landed)                                                 | Coordinate-click bucketing specifically; the rest is already covered                       | **P9-b (small addition to existing S3/Reactor code)**                              |
| 16  | `compact`/`mid`/`full` prompt+tool tiers sized to model capability                                                | Effort levels (`low..max`) tune _reasoning_, not _tool-surface size_; S12 local track has no tiering yet            | Tool-surface tiering keyed to the selected local model's size                              | **P8 (extends S12 local-model track)**                                             |
| 17  | MCP **server** — external agents delegate a task to your signed-in browser                                        | MCP **client** only (ADR-0018)                                                                                      | The opposite direction — already named                                                     | **Phase 1b** (already planned — "tepegoz MCP SERVER surface", detailed DoD exists) |
| 18  | Dedicated vision provider returns a **text description** of a screenshot to save tokens on a text-only main model | S10 vision-escalation exists but ships inert; no split-provider design documented                                   | Confirms + sharpens an existing plan, doesn't add one                                      | **Phase 1b / S10** (already planned)                                               |
| 19  | Tab recording + Whisper transcription, GIF export                                                                 | Nothing                                                                                                             | Real but niche; no daily-driver pull shown yet                                             | **Backlog** (Phase 10b/E candidate, not written up here)                           |
| 20  | Settings snapshot export/import (`webbrain-config/1`), diagnostic bundle export                                   | Diagnostic bundle export ships (`exportLog` in `ext-agent`); no full Settings-snapshot export/import                | Small, mostly `@tepegoz/preferences` surface work                                          | **Backlog** (fold into Phase 2b/2c settings work, not written up here)             |

---

## P1 — Provider & model reach (NEW, extends ADR-0005)

**Goal.** Go from 8 hand-written provider adapters to WebBrain's practical reach — "if it speaks the
OpenAI Chat Completions wire format, adding it is a data change, not a code change" — without touching
the two invariants `@tepegoz/model-gateway`'s README states as non-negotiable: every call is capped
(`maxTokens`) and timed (`timeoutMs`), and every adapter normalizes to `CanonRequest`/`CanonResponse`
before anything downstream sees it.

**Approach.**

- **A generic `OpenAICompatibleProvider`.** WebBrain's own contributor doc (`docs/adding-a-tool.md`
  equivalent, `providers-and-models.md#adding-a-provider`) shows the shape: a provider that speaks
  `/v1/chat/completions` needs only a config entry (`baseUrl`, `model`, auth mode, vision-model regex),
  not a new class. Add the equivalent to `@tepegoz/model-gateway`: one `OpenAICompatibleProvider` class,
  and a **provider catalog** — a data file (same philosophy as `@tepegoz/model-catalog`'s
  `models.catalog.json` or `@tepegoz/extension-catalog`: "adding a provider is a data change") listing
  id/label/baseUrl/authMode/visionRegex for every card. This turns "8 providers" into "8 _classes_,
  N _catalog entries_" — the same win WebBrain describes getting from 106 cards.
- **Local endpoints as alternate transports for the SAME `local` provider slot**, not new provider ids.
  `isLocalProvider()` and `RUNNABLE_AI_PROVIDERS` already single out `'local'` as key-free. Extend
  `@tepegoz/local-inference`'s `LlamaEngine` contract with an **HTTP-server variant** (Ollama `/api/`,
  llama.cpp `/v1/`, LM Studio `/v1/` are all OpenAI-compatible or near enough) so a user who already runs
  Ollama can point Tepegöz at it instead of downloading a second copy of the same weights through
  `@tepegoz/model-catalog`. Context-window auto-detection (llama.cpp `GET /props`, Ollama `GET /api/show`)
  is worth copying verbatim — it is what lets WebBrain auto-tune compaction instead of hardcoding 16k.
- **Vision-model detection by regex**, same as WebBrain's `openai.js` pattern table, added to the new
  catalog entries rather than hardcoded per-provider.
- **What stays exactly as designed:** the max-tokens/timeout guard, `TokenLedger` recording, and
  `ModelRouter`'s capability→tier mapping are untouched — a new catalog entry is just a new leaf
  `ModelProvider` the router can select, same as today's 8.

**New/changed packages:** `@tepegoz/model-gateway` (new `OpenAICompatibleProvider` + catalog loader),
`@tepegoz/local-inference` (HTTP-server engine variant), `@tepegoz/credential-vault` (already
provider-agnostic — no change needed, it already stores "any number of labeled keys" per provider id).

**ADR:** extends ADR-0005 (provider-agnostic gateway) rather than superseding it — record the catalog
decision as an addendum, the way ADR-0033/0035 were later refined by ADR-0039.

**DoD shape (draft, for whichever session promotes this):**

- [ ] `OpenAICompatibleProvider` passes the existing provider conformance tests (the same suite every
      current adapter passes) against ≥3 catalog entries with no adapter-specific code
- [ ] A local HTTP-server engine variant works against a running Ollama instance end-to-end (BYO — not
      bundled, not downloaded by Tepegöz, matching WebBrain's own "we don't manage the proxy" stance on
      its CLIProxyAPI card)
- [ ] Settings surfaces the catalog with search (WebBrain's own settings-search ordering — exact
      id/label match → prefix → substring — is worth copying verbatim, it is a small, already-solved UX
      problem)
- [ ] i18n: catalog labels are data, not UI strings needing translation, but the settings chrome around
      them (search placeholder, "not usable yet" hint per `RUNNABLE_AI_PROVIDERS`) gets EN+TR parity

---

## P2 — Offline knowledge corpus (extends Phase 8, new subsection)

**Goal.** Match Apocalypse Mode's practical value — "answer questions with no network connection" —
**without** taking on its GPL dependency, and by reusing the retrieval engine Phase 8 already specifies
rather than building a second one.

**The key design insight from reading WebBrain's own architecture:** WebBrain itself separates two
things that are easy to conflate. (1) **Reading** a ZIM archive's articles is done with `fzstd`, an
MIT-licensed Zstandard decoder they vendor themselves — the openZIM format is documented and reading it
imposes no license obligation. (2) **Full-text search** over that archive uses a vendored Xapian/libzim
WASM build, which is GPL, and is the _entire reason_ WebBrain's extension had to relicense from MIT to
GPL-3.0-or-later at v33.0.0 (`docs/offline-rag-licensing.md`). Tepegöz should take (1) and skip (2):
**read** ZIM archives with a from-scratch or MIT-licensed openZIM reader, and **search** them with the
retrieval engine Phase 8 is already committed to building for semantic history — `FTS5 + sqlite-vec`,
`bge-m3`/`e5` embeddings, reciprocal-rank-fusion BM25+cosine — over the _extracted article text_, not
Xapian's index. This sidesteps the license question entirely and means the retrieval code is written
once and used for both "search my own history" and "search this installed encyclopedia," instead of
shipping two search engines.

**Approach.**

- **Corpus sources, each opt-in and separately installable** (mirrors WebBrain's own separation of
  Wikipedia archives from the Emergency Box text corpus):
  - A Wikipedia-scale encyclopedia via openZIM archives from the [Kiwix OPDS catalog](https://library.kiwix.org/)
    — same source WebBrain uses, same format, no relationship to WebBrain's code.
  - A curated reference corpus (medical/survival/reference field documents) — WebBrain's own Emergency
    Box corpus is a public-domain, separately-licensed GitHub repo (`webbrain-one/emergency-box-corpus`);
    either point at a similarly-licensed public-domain set or defer this specific corpus and ship the
    encyclopedia install first.
- **Storage and lifecycle, adapted to this repo's primitives instead of copied wholesale:** WebBrain uses
  OPFS + a resumable Metalink piece downloader with per-piece verification and a lease against concurrent
  workers. Tepegöz's `@tepegoz/model-catalog` **already has this exact shape** for GGUF weights —
  `downloadStream` (HTTP Range resume, progress, cooperative cancellation), `sha256OfStream`/
  `digestsMatch`, `loadInstallState`/`upsertInstall` with lenient per-record recovery. A corpus catalog
  should be `@tepegoz/model-catalog`'s pattern applied to a second content type (or a sibling package
  built the same way), not a new downloader written from scratch. Verify **every archive with sha256**
  before it is ever queried, same discipline as GGUF weights.
- **Retrieval integration:** feed extracted-and-chunked article text into Phase 8's planned
  `HybridRetriever` as a second, clearly-labeled source alongside "my history," with its own
  language/source filter UI (WebBrain's per-source checkboxes are a reasonable UX reference). Citations
  resolve to a **local reader**, never a live URL fetch, exactly as WebBrain does — this keeps "search
  the encyclopedia" from becoming a silent egress path even in Sovereign/Air-Gapped Mode (Phase 8's own
  headline feature).
- **Trust boundary:** archive content is **untrusted page-derived text** the moment it's injected into a
  prompt, same as any web page — route it through the exact same `_wrapUntrusted`-equivalent /
  `TaintTracker` path everything else in this repo already uses. No new sanitizer needed.

**New/changed packages:** a new `@tepegoz/knowledge-catalog` (sibling to `@tepegoz/model-catalog`, same
download/verify pattern) or an extension of `@tepegoz/model-catalog` itself if the shapes turn out close
enough; the retrieval integration lives inside Phase 8's already-planned semantic-history package.

**ADR:** a subsection of ADR-0015 (Phase 8's sovereign egress/Trust-Mesh ADR — not yet written per the
Phase 8 DoD) rather than a new number; record the licensing decision (openZIM read, no Xapian, FTS5/
sqlite-vec search) explicitly so a future contributor doesn't reach for the GPL-licensed path WebBrain
took.

**DoD shape (draft):**

- [ ] An openZIM reader (no GPL dependency) extracts article text from an installed archive
- [ ] `HybridRetriever` answers a query from installed-corpus passages with citations resolving to a
      **local** reader page, never a network fetch
- [ ] Archive install is resumable, sha256-verified before first query, and atomic (a failed update never
      leaves the corpus unusable — WebBrain's "transactional corpus updates" is worth matching exactly)
- [ ] Works with Sovereign/Air-Gapped Mode ON (Phase 8's own DoD line) — this is the capability that makes
      the air-gapped claim actually useful instead of just safe
- [ ] i18n: install flow, source/language filters, citation "Open locally" affordance

---

## P3 — Perception & action reach (four small, independent additions)

### P3-a — `browser_read_pdf`

Phase 2c already ships a PDF viewer for humans; the agent has no way to read one. Add a small
`browser_read_pdf` tool in `@tepegoz/browser-tools` that extracts text from the already-rendered PDF
(reuse whatever the Phase 2c viewer uses for text, e.g. pdf.js's text layer) — no new PDF library, no new
attack surface, `dangerClass: 'read'`, same untrusted-content wrapping as `browser_get_page`.

### P3-b — Frames and shadow DOM (extends S2 perception-v2)

WebBrain's own doc calls light-DOM-only perception a known blind spot on "Web Component-heavy pages
(Stripe, Salesforce, Shopify)." S2 already owns identity-stable refs and diffing; extend the same ref
model to (1) enumerate `<iframe>`s as addressable targets (`tab_*`-shaped, not a new tool family — a
frame is conceptually a nested `readPage`/`snapshotElements` scope) and (2) pierce **open** shadow roots
in the same DOM walk `build-dom-tree-script.ts` already does (closed roots need CDP, matching WebBrain's
own Chrome/Firefox split — treat that as a documented Full-tier fallback, not a v1 requirement). Keep
WebBrain's own caution in mind: their permission gate has an accepted known limitation where a
coordinate click can land inside a cross-origin iframe under a same-page grant — if Tepegöz adds
coordinate-style clicking here, the Policy Kernel must resolve the **actual target frame's host** before
granting, not the top-level page's host (fail closed, per this repo's existing `requiredHosts`
discipline — do not accept WebBrain's documented residual risk by default).

### P3-c — Media resolver tool

A `web_resolve_media`/`download_resolve_media` tool (naming pending the `{domain}_{verb}_{noun}`
convention) that takes a public media URL (YouTube transcript, a public video/image link) and returns a
direct, verified resource — WebBrain does this as a skill-first, browser-fallback pattern
(`resolve_public_media` before `download_social_media`). Route the actual save through the **existing**
`download_*` capability tools and their existing HITL/quarantine gate (ADR-0040) — this is a resolver, not
a new download path.

### P3-d — Read-only Dev diagnostics

A narrow, explicitly **read-only** trio — console messages, network-request summaries (method/status/
timing, not bodies by default, mirroring WebBrain's own "headers/bodies omitted, sensitive header names
redacted" default), and a bounded DOM/style inspector — for debugging a page the user is already looking
at. This is _not_ `execute_js` and is _not_ DevTools access (ADR-0029 stays exactly as decided): no
mutation, no script execution, output goes through the same untrusted-content wrapper as any other page
read. If this can't be built without touching the ADR-0029 boundary, drop it rather than reopen that ADR.

**DoD shape (draft, applies to all four sub-items):** each ships `dangerClass: 'read'` (P3-a/b/d) or
inherits the existing download gate (P3-c), each is registered through the one `CapabilityRegistry` like
every other tool, each gets an entry in `docs/adding-a-tool.md`'s checklist, EN+TR i18n for any new
user-facing copy, and coverage on the new pure logic.

---

## P4 — Site-guidance adapters (NEW)

**Goal.** WebBrain's site adapters are not "an integration" in the Phase 2 sense — no OAuth, no official
API, no scoped token. They are **page-shape prompt guidance**: short, specific notes ("Gmail's compose
button is `[aria-label='Compose']`, not the first button on the page"; "cookie banners on this site trap
focus, dismiss before reading") injected into the first message when the URL matches, one at a time,
re-injected on navigation. WebBrain's own contributor rule captures why this is high-leverage: _"Short,
concrete adapter notes often fix more real tasks than broad refactors."_ Phase 2's `BrowserBackend`
fallback path is exactly where this is missing today — when the official-API adapter isn't available (or
doesn't exist for a site Phase 2 will never cover, e.g. `sahibinden.com`, `trendyol.com` — both already
name-checked in the WebBrain comparison as adapters WebBrain ships and Tepegöz doesn't), the agent falls
back to blind DOM perception with no institutional knowledge of the site's quirks.

**Approach.**

- A small `SiteAdapter` registry: `{urlPattern, notes, category}`, `getActiveAdapter(url)` returns the
  first match, exactly WebBrain's own contract — deliberately **not** a general rules engine, deliberately
  **not** model-authored (adapter text is trusted, authored by contributors, shipped in the package, never
  generated at runtime from page content — this matters for the same reason `UNTRUSTED_CONTENT_TOOLS`
  matters: adapter notes are one of the few things allowed to be _instructions_ rather than _data_, so
  they must never come from anywhere the model or a page could influence).
- Inject as a bounded block into the **existing** system-prompt assembly path in `@tepegoz/orchestrator`
  (`reactor-prompt.ts`/`messages.ts`), not a new prompt channel — same trust tier as the profile/memory
  block S9 already injects.
- **Finance-category adapters carry extra confirmation wording**, matching WebBrain's own precedent and
  this repo's existing `dangerClass: 'financial'` biometric gate — the adapter note can _explain_ why a
  step is risky, it cannot _waive_ the Policy Kernel's gate. That ordering (adapter informs, kernel still
  decides) is the whole reason this is safe to add without touching ADR-0006.
- Start with a short, high-value list rather than WebBrain's 58: the Turkish sites this repo's own
  north-star already requires ten benchmark tasks against (per `ai-agent`'s H2H protocol) are the
  natural seed set — `sahibinden`, `trendyol`, plus whatever the ≥10 Turkish-web H2H tasks turn out to
  need, then the usual global short list (Gmail/GitHub/LinkedIn/Amazon) WebBrain also leads with.

**New/changed packages:** a new small package (`@tepegoz/site-adapters`, Electron-free, pure data +
lookup) consumed by `@tepegoz/orchestrator`; no changes to the Policy Kernel or ToolGateway.

**ADR owed:** a short one — "Site-guidance adapters are trusted, contributor-authored, non-executable
prompt text; never derived from page content; never a substitute for the Policy Kernel." This is worth
writing down precisely because it sits right next to the untrusted-content boundary and a future
contributor could otherwise be tempted to auto-generate adapter notes from a page (don't).

**DoD shape (draft):**

- [ ] `SiteAdapter` registry + `getActiveAdapter` ships with ≥8 adapters (the Turkish H2H set + a short
      global list), pure and unit-tested
- [ ] Re-injects on navigation to a different matched site within the same conversation
- [ ] Finance-category adapters carry a visible extra-confirmation note **and** still require the normal
      `financial` danger-class HITL gate — a test proves the adapter cannot bypass it
- [ ] i18n: adapter notes are contributor-authored English (matching WebBrain's own approach — adapter
      _prompt text_ isn't user-facing UI copy); any user-visible "site guidance active" indicator gets
      EN+TR parity

---

## P5 — Skills that declare tools (extends S9, after its own sweep)

**Goal.** S9 shipped skills as **prompt templates only**, and its own doc states that boundary in words:
_"S9 ships the former [model-driven templates] only."_ WebBrain's skills go one step further — a skill
can declare a manifest of narrow, read-only HTTP tools (weather lookup, book search, YouTube transcript)
or a bounded "download-job" tool (submit → poll → save-through-existing-Downloads-gate → cleanup), scoped
to the skill's own declared HTTPS endpoint. This is the next increment past S9's stated scope, not a
contradiction of it — flagged explicitly as **after S9's own measurement sweep lands** (per the anti-debt
rule, this track does not open a new capability on top of a phase that is itself still measurement-owed).

**Approach.**

- Extend the existing `skill-store.ts` record (`{name, prompt, start_url, grant_profile_ref}`) with an
  optional, **bounded** tool manifest: `{name, method: 'GET'|'POST', endpoint (fixed HTTPS host, no
redirects — WebBrain's own manifest rule, worth copying verbatim: "reject redirects including opaque
browser redirects"), parameters (JSON Schema), resultPolicy: 'untrusted'}`.
- **Importing/enabling a skill with a tool manifest is the trust decision** for that declared endpoint —
  same framing WebBrain uses (`docs/skills.md`: "Importing a skill is the trust boundary for its declared
  HTTPS endpoint"). The tool itself still registers through the one `CapabilityRegistry`/`ToolGateway`
  PEP like every other tool — a skill tool gets no special bypass of zod validation, the Policy Kernel, or
  HITL. `resultPolicy: 'untrusted'` routes its output through the exact same taint-wrapping every other
  page-derived or third-party-derived result already uses.
- A "download-job" tool variant reuses the **existing** `download_*` capability tools and ADR-0040's
  quarantine gate for the actual file save — a skill cannot invent a new download path, only trigger the
  normal one.
- Keep S9's existing constraint intact: **a skill never starts a run.** A tool-declaring skill still only
  activates when the model calls `load_skill` (or the run is pre-activated per S9's existing rules) during
  an already-approved run; it does not gain the ability to auto-run anything S9 didn't already allow.

**New/changed packages:** `@tepegoz/persistence` (`skill-store.ts` schema extension), the S9 skill-loading
path in `@tepegoz/orchestrator`, `@tepegoz/capability-plane` (registration only — no PEP changes needed,
this is the whole point of "one gateway").

**ADR:** extends ADR-0027 (agent memory — S9's ADR) with an addendum, rather than a new number, since it
is explicitly the next increment of the same design the ADR already describes.

**DoD shape (draft):**

- [ ] A skill-declared HTTP tool is indistinguishable, from the ToolGateway's point of view, from a
      built-in tool: same zod validation, same Policy Kernel pass, same audit entry shape
- [ ] Redirects (including opaque ones) from a declared endpoint fail the call rather than following it
- [ ] A download-job skill tool cannot skip ADR-0040's quarantine gate — test proves it
- [ ] Explicitly gated behind S9 reaching ✅ first (not opened while S9 is still measurement-owed, per the
      anti-debt rule)

---

## P6 — Gated generic mutating fetch (extends S6 safety-control-plane)

**Goal.** WebBrain's `/allow-api` is a narrow, well-reasoned escape hatch: `web_get_page`/`web_search`
cover read-only API completion today, but a task that genuinely needs to `POST` to a REST endpoint (the
UI is broken, or there's no UI path at all) has nowhere to go. WebBrain's own framing is worth keeping
verbatim: _"API actions are invisible, often require separate auth tokens, and can have a much larger
blast radius than a visible mis-click — UI-first by default, only reach for the API when UI has actually
failed."_

**Approach.**

- Add write-method support (`POST`/`PUT`/`PATCH`/`DELETE`) to `@tepegoz/web-tools`'s existing fetch
  surface, gated by a **new, narrow** danger class (`data-egress` + explicit "mutating" flag) that the
  `EgressFirewall` and Policy Kernel already have the shape to enforce — this is not a new enforcement
  mechanism, it's a new argument shape flowing through the existing one.
- The equivalent of `/allow-api`: a **per-run, explicit** grant (not a silent default, not a global
  always-on toggle by default — matching the repo's existing per-task remembered-grant pattern from S9
  rather than WebBrain's persistent Settings toggle, which this repo's grant model already does better).
- The system-prompt guidance WebBrain adds — state the URL/method/payload in plain text before the call,
  default to UI-first — becomes part of the orchestrator's existing prompt assembly, not a new subsystem.
- `EgressFirewall`'s entropy/secret scanning (already built, per `@tepegoz/security-policy`'s README)
  already covers the exfiltration angle WebBrain's local-network blocking (RFC1918 + 169.254.169.254)
  covers by a cruder method — confirm the firewall already blocks those same targets; if not, that's a
  one-line addition to an existing check, not new infrastructure.

**New/changed packages:** `@tepegoz/web-tools` (write-method support in the existing fetch tool),
`@tepegoz/security-policy` (new danger-class case in `PolicyKernel.evaluate`), `@tepegoz/orchestrator`
(prompt guidance).

**ADR:** extends ADR-0006 (Policy Kernel) with an addendum recording the new danger-class case — no new
number needed, this is squarely what ADR-0006 already governs.

**DoD shape (draft):**

- [ ] A write-method fetch call is denied without an active per-run grant, deny-by-default
- [ ] The grant is scoped to (run, host) like every other remembered grant, not global
- [ ] `EgressFirewall` blocks RFC1918 + cloud-metadata targets for this tool the same as any other network
      capability
- [ ] i18n: the grant-request copy explains method + host + "why UI-first is the default" in the same
      voice as the existing risk-class strings in `extensions/ext-agent/src/i18n/en.ts`

---

## P7 — Assistant-UX parity (extends S8)

### P7-a — Slash commands

WebBrain's slash-command set is not decoration — `/schedule`, `/watch`, `/export --traces`, `/allow-api`,
`/compact` are real capability shortcuts that avoid a round-trip through the model just to say "compact
the context now." Add a small, **typed** command registry to `extensions/ext-agent` (WebBrain's own
architecture is worth copying exactly: commands are structured metadata — canonical signature, flags,
mode-availability — that generates `/help` and autocomplete, parsing is case-insensitive but token-exact,
and an unrecognized slash command is **rejected locally, never forwarded to the model** as free text,
closing off a whole class of "the model interprets my typo as an instruction" confusion). Priority
commands to match first: `/compact` (ties into P9-a), `/reset`, `/screenshot`, `/export`, and a
`/schedule`/`/watch` pair that front the **already-shipped** `@tepegoz/tasks` interval/page-change
triggers — this is UI on an existing capability, not new backend work.

### P7-b — Selection quick-actions

WebBrain's right-click/selection menu (Summarize/Explain/Quiz/Proofread/Translate/Humanize) is mostly
already buildable from what ships: Translate is `ext-translate` today, Proofread overlaps `ext-typo`'s
existing writing-assistance path. Add Summarize/Explain/Quiz as new short prompts through the **existing**
selected-text attachment path (`extensions/ext-agent/src/panel-attachments.ts`) rather than a new
subsystem — each is just a canned instruction prefilled into the composer with the selection attached,
same mechanism the composer's manual "attach selected text" already uses.

### P7-c — Wire interactive Ask streaming

`ModelGateway.generateStream`/`onDelta` and the ADR-0025 streaming boundary already exist. What's missing
is the **interactive Ask panel path** actually using it end to end — WebBrain's own scoping rule is worth
adopting as-is: stream only for interactive Ask (not Act/Dev, not scheduled/Continue runs, not cloud
managed runs), because tool-call buffering + streaming text at the same time is exactly the edge case that
needs the most care, and Ask is read-only so there's nothing to buffer.

**New/changed packages:** `extensions/ext-agent` (command registry, selection-action registry, streaming
wire-up); no changes below the orchestration layer for P7-a/b, `agent-runtime`/`model-gateway` glue only
for P7-c.

**DoD shape (draft):**

- [ ] An unrecognized slash command never reaches the model as a chat message
- [ ] `/schedule` and `/watch` are thin UI over the existing `@tepegoz/tasks` trigger types — no new
      scheduler
- [ ] Each new selection quick-action reuses the existing attachment/composer path, not a parallel one
- [ ] Interactive Ask streams token deltas to the panel; Act/Dev/scheduled/Continue runs remain
      non-streaming, matching WebBrain's own scoping
- [ ] i18n: EN+TR for every new command's help text and every new selection-action label

---

## P8 — Tool-surface tiering for small/local models (extends S12)

**Goal.** S12 already owns "local-LLM track: off-the-shelf baseline → fine-tune/distill → sovereign/
offline," but nothing in it currently narrows the **tool surface** a small local model sees. WebBrain's
finding is concrete and worth taking seriously: quarantining page content (Layer 1 of their
prompt-injection defense) inflates the prompt, and _"small local models are measurably more confusable"_
— the fix isn't a smaller defense, it's a smaller, better-matched tool catalog (`compact`/`mid`/`full`)
so the defense doesn't also degrade reliability on weak hardware.

**Approach.**

- Define the same three tiers, keyed off the selected local model's size (or an explicit user override),
  living in `@tepegoz/model-gateway`'s `ModelRouter` next to the existing tier/effort resolution — this is
  additive to routing logic that already exists, not a new subsystem.
- `compact`: the smallest normal Act tool set (no scheduling, no iframe tools from P3-b, no media resolver
  from P3-c). `mid`: adds the common task tools. `full`: everything, reserved for cloud/large-local models
  (matches WebBrain's own default: cloud forced to Full, local defaults to Mid).
- Ask mode ignores the tier and always stays read-only-full, same as WebBrain — tiering only shrinks the
  **action** surface, never the read surface.

**New/changed packages:** `@tepegoz/model-gateway` (tier resolution), `@tepegoz/capability-plane` (tier
as a filter dimension alongside mode, the way `getToolsForMode` already filters by mode).

**DoD shape (draft):**

- [ ] A `compact`-tier local model sees measurably fewer tool schemas in its system prompt (token count
      delta recorded, tying into S7's speed/cost metrics)
- [ ] Injection-corpus tests (already exist per this repo's `redteam.test.ts`/`injection-corpus`) pass at
      `compact` tier specifically, not just at the default tier — this is the actual claim WebBrain's
      finding makes: defense-plus-small-model needs to be tested together

---

## P9 — Small hardening additions

### P9-a — Explicit mid-run context compaction (extends S1/S7)

`cache-window.ts` already keeps message ordering cache-friendly; WebBrain additionally does an explicit,
**visible** summarize-and-continue step when message count/chars/token-budget crosses a threshold, and
surfaces it to the user ("Context automatically compacted" separator) rather than silently reordering.
Add the visible step and the user-facing marker; the underlying cache-window discipline stays as-is.

### P9-b — Coordinate-click loop bucketing

The Reactor's no-progress replan (S0/C1, already landed) covers general no-progress detection. WebBrain's
specific addition — bucket repeated **coordinate** clicks by a 5px grid and nudge/stop independently of
whether the tool-call _arguments_ look identical — catches a narrower failure mode (clicking slightly
different pixels near the same dead spot) that a same-args repeat check can miss. Small, additive, no new
subsystem.

**DoD shape (draft):** both are unit-tested pure-logic additions to existing modules
(`orchestrator/reactor.ts` and whatever owns cache-window today); neither needs a new ADR.

---

## Backlog (named, not written up)

- **Tab recording + Whisper transcription + GIF export** — real WebBrain features, no daily-driver pull
  demonstrated yet for this product. Candidate home: Phase 10b (accessibility/voice) if voice HITL lands
  first and the transcription path can be shared, otherwise Phase E (Extras, demand-gated).
- **Settings snapshot export/import** (`webbrain-config/1`-equivalent) — the diagnostic-bundle export
  already ships; a portable Settings-only export/import is smaller, mostly `@tepegoz/preferences` work.
  Fold into whichever session next touches Phase 2b/2c settings surfaces rather than opening a phase for
  it alone.
- **A `find`-style small-model-over-accessibility-tree lookup tool** — WebBrain's own comparison doc flags
  this as a Claude-Chrome idea worth borrowing, not something WebBrain itself ships. Worth remembering,
  not worth designing yet; revisit only if S2's ref-resolution proves to be a real friction point in
  practice.

---

## Routing — what this track does not own

Per the existing convention ([`../README.md`](../../phases/README.md#routing--what-stays-out) /
[`ai-agent/README.md`](../../phases/ai-agent/README.md#routing--what-stays-out)), reference these,
never duplicate them:

| Stays with        | Material                                                                                                                                                                                                        |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Phase 1b**      | MCP server, vision fallback, local-SLM, HybridRetriever's _engine_ (P2 reuses it, doesn't redefine it), cost-saver toggle                                                                                       |
| **Phase 2**       | Official-API-first integration adapters (Gmail/Drive/Calendar/Canva) — a different concept from P4's site-guidance adapters, not a duplicate                                                                    |
| **Phase 3**       | The managed-proxy zero-setup default                                                                                                                                                                            |
| **Phase 6**       | Deterministic, model-free recipes — WebBrain's "saved workflows" are the closest analog and already routed there by the existing ownership test ("if the model could be removed from the replay, it's Phase 6") |
| **Phase 7**       | NotaryService / Replay Receipts — no WebBrain equivalent exists, nothing to reconcile                                                                                                                           |
| **S9**            | Skill _templates_ as they exist today; P5 is its explicitly-flagged next increment, not a redefinition                                                                                                          |
| **ADR-0026/0029** | `execute_js`/DevTools boundary — P3-d works around it by staying strictly read-only, does not reopen it                                                                                                         |
| **ADR-0039**      | CAPTCHA/2FA handoff shape — not revisited (see Ground rules, item 1)                                                                                                                                            |

## ADRs owed (numbers assigned when a session actually opens one of these)

- P1: addendum to **ADR-0005** (provider catalog decision)
- P2: subsection of Phase 8's still-unwritten sovereign-egress ADR (recorded as owed in Phase 8's own DoD)
- P4: one new ADR — "site-guidance adapters are trusted, contributor-authored, non-executable, never a
  substitute for the Policy Kernel"
- P5: addendum to **ADR-0027** (agent memory)
- P6: addendum to **ADR-0006** (Policy Kernel — new danger-class case)

No number is reserved here; per this repo's own multi-profile-track lesson (`multi-profile-isolation.md`
— an ADR-number collision from writing a plan too far ahead of when it's actually opened), the number
gets assigned at the point a session actually starts the work, not now.
