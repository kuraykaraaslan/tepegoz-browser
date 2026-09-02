# Track — Steel Browser agent-capability parity

**Status:** 📋 **Proposed — not scheduled (2026-09-02).** No branch, no ADR number reserved, no owner
sign-off. This is a captured gap list in the shape of
[`browser-settings-feature-gap.md`](../tracks/browser-settings-feature-gap.md) and
[`webbrain-agent-parity.md`](webbrain-agent-parity.md): every row names its nearest existing Tepegöz
behaviour and a suggested phase home, so a future session can promote a row into a real `phase-*.md`
task or an `ai-agent` PR without re-deriving the comparison. **This is the shortest track in the
folder on purpose** — see "Why this track exists" below.

**Source:** [`docs/others/tepegoz-vs-steel-browser.md`](../versus/tepegoz-vs-steel-browser.md)
(2026-09-01, a same-session deep read of `.junk/steel-browser` against this repo's AI surface) plus a
direct verification pass this session over `.junk/steel-browser`: `docs/ARCHITECTURE.md`,
`api/src/modules/actions/actions.controller.ts`, `api/src/utils/scrape/{index,cleanHtml,readability}.ts`,
`api/src/utils/scrape/__tests__/eval/invariants.ts`, `api/src/services/session.service.ts`,
`api/src/plugins/**` (listing), `api/src/scripts/{index.ts,fingerprint.js}` (listing), and a full-tree
`grep` sweep of `api/src` for `agent`/`llm`/`prompt`/`permission` — which confirms the comparison
document's central claim directly from source: **Steel's API has no agent loop, no LLM call, no prompt
construction and no permission/approval concept anywhere in `api/src`** (the only "agent" hits are an
unrelated code comment and `userAgent`; the only "prompt" hits are Chrome CLI flags). Cross-checked
against this repo's AI surface (`phases/ai-agent/`, `packages/orchestrator|model-gateway|
capability-plane|security-policy|agent-runtime|browser-tools|tool-executor|reader|human-input`,
`extensions/ext-agent`, `docs/adr/*`).

**A correction to two claims a prior session might reach for.** `@tepegoz/notary` (Phase 7) is written
and unit-tested but **`apps/desktop` does not import it** — no running session produces a signed Replay
Receipt today, only the standalone `tepegoz-verify` CLI exists and runs against nothing live. S10 vision
escalation ships **inert**: `Reactor`'s `captureVision` callback is optional and **no production caller
passes one** (`phase-s10-vision-escalation.md`'s own 2026-09-02 correction). Neither is "shipped and
working" — both are named accurately below wherever they matter.

## Why this track exists

The source comparison opens with a warning worth repeating here rather than softening: **this is the
most asymmetric comparison in the folder, because Steel is not an agent.** It has no LLM, no agent loop,
no provider abstraction, no tool/permission model, no prompt architecture and no prompt-injection
defense — confirmed directly from source above, not just asserted. Steel is Apache-2.0, shipping,
`v0.5.4-beta` **browser-session infrastructure**: a Fastify API that wraps Chrome in Puppeteer/CDP,
manages isolated sessions, and exposes `/scrape` `/screenshot` `/pdf` `/search` HTTP endpoints for
_someone else's_ agent to call. Tepegöz is a full Electron browser **and** the agent that drives it. Most
of what makes Steel good at its job — an externally-callable session factory, Selenium/Puppeteer/
Playwright client compatibility, a CDP plugin system for third-party session consumers, disposable-persona
fingerprint spoofing, session-pool IP rotation — solves a problem Tepegöz's product shape does not have: a
single-user desktop browser is not infrastructure other people's automation clients connect to. This
track's job is the same question the other tracks ask — _for every Steel capability that is genuinely good
and sits on an axis Tepegöz actually shares, does Tepegöz already have a seam, and if not what's the
Tepegöz-conformant version_ — but here that question has a short honest answer for most rows: **not
applicable, different product category**, named plainly instead of stretched into a workstream it doesn't
deserve. Only two rows survive as real, small, worth-writing-up gaps.

## How to read this

Each workstream below is written like an `ai-agent` phase section (Goal → Approach → new/changed
packages → ADR → DoD-shaped bullets) so it can be lifted into a real phase file with minimal rewriting.
**Nothing here is committed roadmap.** Where a capability already has a named home (Phase 5's own still-open
WebRTC item, `ext-adblock`, `extensions/*` + the MCP client), this track cites it and does **not**
re-describe it.

## Ground rules — parity, not imitation

Two Steel capabilities are **deliberately not being matched**, because matching them would violate a
standing decision this repo already made after deliberation. Naming them here once, so no future session
re-proposes them by accident:

1. **No externally-exposed, ungated CDP/Selenium/Puppeteer/Playwright session API.** Steel's entire value
   proposition is `/v1/sessions` returning a CDP WebSocket URL that any external automation client connects
   to and drives directly — by design, Steel carries **no permission/approval layer at all**; the security
   boundary is the caller's responsibility (confirmed above: zero permission-model hits in `api/src`
   outside an OS error-message string match). Tepegöz's architecture is the opposite bet: **one gated
   `ToolGateway` PEP** (`lookup → idempotency → zod → PolicyKernel → HITL → execute → audit`, ADR-0007)
   with a **model-before-nothing, model-before-the-model deterministic `PolicyKernel`** (ADR-0006) in front
   of every action. An external CDP endpoint a third-party client can drive directly is a second execution
   path around both — exactly the shape [`aipex-agent-parity.md`](aipex-agent-parity.md)'s Ground rule #3
   already rejected for AIPex's unauthenticated `ws://127.0.0.1:9223` control port, and exactly what the
   `ai-agent` "Never" list means by **renderer/external-trusted security decisions** never being
   accepted. Steel's Selenium-drop-in and Puppeteer/Playwright compatibility are the same shape as the
   session API and are rejected for the same reason, not separately.
2. **No hosted CAPTCHA solving.** Steel Cloud's `solveCaptcha` is a hosted, credits-metered third-party
   solver — the same shape ADR-0039 already chose the opposite of for WebBrain's `solve_captcha`: CAPTCHA
   is a **Human Handoff** event (`detectHandoff`, `extensions/ext-agent` → `handoff.captcha`), the agent
   stops and hands control back, it never spends a solver's quota. Steel's self-hosted OSS path does not
   ship a solver at all (only Steel Cloud does) — worth naming so a future session doesn't assume the
   self-host half needs a rejection too; it doesn't, there's nothing there to reject.

None of this is "Steel did it wrong." Steel's whole category has no policy kernel to protect and no
end-user identity to keep honest — a session-factory product correctly leaves permissioning to its callers.
The point of naming these is that a future reader of this track shouldn't reopen a decision already made
for a documented reason.

---

## Capability inventory

Legend for **Home**: an existing phase/ADR/package name means "already covered, this row just cites it, no
new phase needed." **NEW** means no existing phase owns it and this track proposes one. **Not
applicable** means the axis is real in Steel but doesn't map onto Tepegöz's product shape — named
honestly rather than forced into a workstream.

| #   | Steel capability                                                                                                                                                                   | Nearest Tepegöz behaviour today                                                                                                                                                                                                            | Gap                                                                                                                                                                                                                                                                                                                                                  | Home                                               |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| 1   | External session-factory API (`/v1/sessions` → CDP URL) for Puppeteer/Playwright                                                                                                   | Out-of-process CDP used only by Tepegöz's own `tab_*` tools, never exposed to an external client                                                                                                                                           | Category mismatch — a single-user desktop browser has no external "driver" consumer                                                                                                                                                                                                                                                                  | **Ground rules #1 (rejected)**                     |
| 2   | Drop-in Selenium WebDriver compatibility (`isSelenium`)                                                                                                                            | None                                                                                                                                                                                                                                       | Same axis as #1                                                                                                                                                                                                                                                                                                                                      | **Ground rules #1 (rejected)**                     |
| 3   | CDP plugin system: `BasePlugin` lifecycle hooks + `PluginManager` + third-party plugin distribution for spawned sessions                                                           | `extensions/*` (ext-agent/ext-translate/ext-adblock…) + MCP client (ADR-0018) — third-party extensibility for the **user's own browser**, not for external session consumers                                                               | Category mismatch — Steel's plugin system exists to let API callers inject behaviour into sessions they spawned; Tepegöz has no equivalent consumer                                                                                                                                                                                                  | **Not applicable — see `extensions/*` / ADR-0018** |
| 4   | `/v1/scrape` html/cleaned_html/**markdown**/readability (`defuddle`) + rich metadata (title/lang/og:*/canonical/JSON-LD/wordCount)                                                 | `browser_get_article` → `@tepegoz/reader`'s `ReaderArticle` (**typed blocks, no HTML, by deliberate security design**); no markdown serialization, no metadata capture                                                                     | Real, small gap: the already-extracted typed blocks have no plain-text markdown output, and no metadata fields exist at all                                                                                                                                                                                                                          | **P1 (NEW, extends `@tepegoz/reader`)**            |
| 5   | `/v1/screenshot` (`fullPage`, jpeg) + `/v1/pdf` (`page.pdf()`) HTTP endpoints                                                                                                      | `browser_get_screenshot` + Phase 2c PDF viewer; vision is escalation-only (S10) and **ships inert — no production caller passes `captureVision`**                                                                                          | Capability parity is roughly even; Steel's edge is HTTP reachability, which is exactly the external-consumer shape Ground rules #1 declines to add                                                                                                                                                                                                   | **Tie — no workstream**                            |
| 6   | `fingerprint-generator`/`fingerprint-injector` — WebGL/UA-CH/hardware spoofing for disposable automation personas, `skipFingerprintInjection` opt-out                              | None; `@tepegoz/human-input` covers a different axis (Catmull-Rom mouse curves + Gaussian jitter — input-dynamics realism, not environment spoofing)                                                                                       | Not applicable — Steel spoofs environment fingerprints because it spins up **disposable** Puppeteer personas that need to look like diverse real users; Tepegöz's agent drives the **user's own persistent, real** browser profile, which has no disposable identity to fake and nothing in that profile benefits from pretending to be someone else | **Not applicable — different threat model**        |
| 7   | Session-scoped `proxy-chain` server: IP rotation + `txBytes`/`rxBytes` accounting                                                                                                  | Phase 5's per-tab/group VPN/Tor routing — bound to the **user's own** privacy, not a rotating session pool                                                                                                                                 | Different purpose (user privacy vs. automation-fleet IP diversity); Phase 5 already owns the axis that matters to Tepegöz                                                                                                                                                                                                                            | **Not applicable — see Phase 5**                   |
| 8   | `optimizeBandwidth`: block image/media/stylesheet/host/pattern requests at the proxy                                                                                               | Nothing narrows resource loads during an agent-driven page load; `ext-adblock` blocks ads/trackers but is not agent-run-scoped                                                                                                             | Real, small lever for S7's own headline metric (p50 wall-clock/task) that nothing in S7's landed PRs currently pulls                                                                                                                                                                                                                                 | **P2 (NEW, extends S7 speed)**                     |
| 9   | rrweb recorder extension disables WebRTC entirely (with a `meet.google.com`/`zoom.us`/`discord.com`-style allowlist for legitimate video calls)                                    | Phase 5's own **open, unchecked** DoD line: _"WebRTC local-IP leak is a kill-switch concern... block host-candidate exposure (mDNS obfuscation) for any tunnel-bound partition"_ — the problem is already named, the allowlist shape isn't | Steel's domain-exception pattern is a concrete detail worth folding into an already-open checkbox                                                                                                                                                                                                                                                    | **Phase 5 (sharpen the open item, no new phase)**  |
| 10  | rrweb session recording (packed DOM-event stream) + embeddable live/debug viewer iframe                                                                                            | Replay timeline (agent-**action**-level) + `journal_search_events`; nothing captures DOM-event-level state                                                                                                                                 | Real gap, but recording arbitrary DOM state (form values included) on a single real person's own persistent browsing session is a materially different privacy risk than recording Steel's disposable automation sessions                                                                                                                            | **Backlog (named, not written up — see below)**    |
| 11  | HTTP file API: session-scoped upload (binary/URL)/download/list/delete/zip, for an **external** caller                                                                             | `file_*` sandboxed filesystem + `download_*`/`upload_*` — the agent's own workspace, not an HTTP surface for an external consumer                                                                                                          | Different purpose/consumer                                                                                                                                                                                                                                                                                                                           | **Not applicable**                                 |
| 12  | `blockAds` host-blocklist + request interception                                                                                                                                   | `ext-adblock` + `tool-executor`'s content guard                                                                                                                                                                                            | Already shipped                                                                                                                                                                                                                                                                                                                                      | **Tie — already covered, do not re-propose**       |
| 13  | Scrape→markdown regression suite + Tier-1 label-free invariant harness (no-script-leak / no-relative-links / non-empty-when-contentful / no-secret-leak, `error`-severity CI gate) | `@tepegoz/agent-eval`'s frozen-fixture, ground-truth-first harness — a different target (agent task completion, not one formatter's output)                                                                                                | The **pattern**, not the code, is worth reusing — for P1's own output, not as a separate workstream                                                                                                                                                                                                                                                  | **Folds into P1's DoD**                            |
| 14  | Apache-2.0 self-host, single Docker image, telemetry noop-by-default, Steel Cloud as the commercial upsell                                                                         | Tepegöz is already a local-first native app: no cloud layer at all, no telemetry by default                                                                                                                                                | Not applicable — Tepegöz already made the stronger version of this bet (no optional cloud, vs. Steel's cloud-optional)                                                                                                                                                                                                                               | **Not applicable — already Tepegöz's stated bet**  |
| 15  | `solveCaptcha` (Steel Cloud only)                                                                                                                                                  | Human Handoff Controller (`detectHandoff`, ADR-0039)                                                                                                                                                                                       | Contradicts a standing decision                                                                                                                                                                                                                                                                                                                      | **Ground rules #2 (rejected)**                     |

---

## P1 — Clean-text & metadata serialization for reader extraction (NEW, extends `@tepegoz/reader`)

**Goal.** Match Steel's genuinely strongest axis — a clean, well-formed "page → text" output with
metadata — **without** adopting its extraction pipeline (`defuddle`/readability over raw HTML) or its
trust model. `@tepegoz/reader` already extracts a page into `ReaderArticle` — **typed blocks, never
HTML** — specifically so a reading view can render untrusted page content inside the trusted app chrome
with injection "structurally impossible rather than defended against" (the package's own README). That
discipline is not up for negotiation; this workstream adds a plain-text **serialization** of the blocks
Tepegöz already safely extracted, plus the one thing `ReaderArticle` has no analog for at all: page
metadata.

**Approach.**

- Add a pure `blocksToMarkdown(article: ReaderArticle): string` formatter as a new entry point
  (`@tepegoz/reader/markdown`, matching the package's existing model/extract/view/i18n entry-point split).
  It maps each `ReaderBlock` kind to Markdown syntax (`##`/`###` headings, paragraphs, `>` quotes,
  ordered/unordered lists, fenced code, `![alt](src)` images) — a **fresh, small serializer written
  against the already-extracted typed blocks**, not a port of `defuddle`'s HTML→Markdown conversion (per
  this repo's own no-porting rule). Because the input has no HTML in it to begin with, there is no new
  sanitizer to write — the output is exactly as safe as today's blocks, just formatted differently.
- Add a small, capped `ReaderMetadata` type alongside `extractArticle`'s existing output — `title`
  (already exists on `ReaderArticle`, kept), `canonical`, `lang`, `og:title`/`og:description`/`og:image`,
  `article:published_time` — as **plain string fields with the same length-cap discipline as
  `READER_LIMITS`** (`maxTitleChars`-shaped caps per field), never raw HTML, never unbounded.
- Expose both through `browser_get_article`'s existing result shape (new `markdown` and `metadata`
  fields) rather than a new tool — same `dangerClass: 'read'`, same `wrapUntrustedContent` path every
  other page-derived tool result already goes through, no `CapabilityRegistry`/PEP change.
- Borrow Steel's **testing pattern**, not its code: its Tier-1 label-free invariant harness
  (`no-script-style-leak`, `no-relative-links`, `non-empty-when-contentful`, `no-secret-leak` — all
  `error`-severity, CI-gating) is a good idea independent of its implementation. Re-derive a small,
  Tepegöz-side equivalent as pure assertions over a handful of frozen HTML fixtures (same
  frozen-fixture-with-hash discipline `agent-eval` already uses, at package scale, not the eval harness
  itself).

**New/changed packages:** `@tepegoz/reader` (new markdown formatter + `ReaderMetadata` type),
`packages/browser-tools` (`browser_get_article` result shape).

**ADR:** none owed. This stays inside ADR-0008's existing DOM/a11y-first perception surface as a new,
read-only output format on an already-registered tool; no new trust boundary is crossed.

**DoD shape (draft):**

- [ ] `blocksToMarkdown` round-trips every `ReaderBlock` kind with zero raw HTML surviving into the
      output (mechanically testable — no `<` character in the result)
- [ ] `ReaderMetadata` fields are capped the same way `READER_LIMITS` caps blocks — a page cannot make the
      app hold unbounded metadata
- [ ] A small frozen-fixture invariant suite (Steel's four `error`-severity checks, re-derived not ported)
      passes over ≥5 frozen HTML fixtures with a recorded hash, matching `agent-eval`'s freeze discipline
- [ ] `browser_get_article`'s new fields are provably wrapped through the same `wrapUntrustedContent` path
      its existing fields already use
- [ ] i18n: none needed — the tool result is model/consumer-facing text, not UI chrome; confirm this
      explicitly rather than silently skipping the checklist item

---

## P2 — Agent-run resource blocking for speed (NEW, extends S7 speed)

**Goal.** Steel's `optimizeBandwidth` (block image/media/stylesheet/host/pattern requests at the proxy)
is a real, measured lever aimed at exactly the metric S7 already owns as its headline number — p50
wall-clock/task — that nothing in S7's landed PRs (adaptive cadence, visibility-gated realism, quick-mode
encoding) currently pulls.

**Approach.**

- Add an opt-in request-interception mode, scoped to the **active agent run's own WebContents only** —
  never a tab the human is browsing manually — that blocks non-essential resource types (`image`,
  `media`, `font`, `stylesheet`, Steel's own list) during DOM/a11y-perception steps.
- **Must fail closed toward vision, which is the one place this cannot just copy Steel's default**: Steel
  has no vision-escalation concept to protect, Tepegöz does. If S10's escalation trigger fires and needs a
  real screenshot, resource blocking on that WebContents is suspended for the capture — a blocked-image
  screenshot is a worse outcome than a slightly slower run.
- Sits next to the per-run scoping this repo already does elsewhere (`tabId`-scoped browser tools,
  ADR-0013's serialized single run) — one more flag on the same run object, not a new subsystem.
- Ties directly into S7's own measurement discipline: its own single-change branch, its own paired sweep,
  attributed independently of S7's other changes (the phase's own attribution rule).

**New/changed packages:** `packages/browser-tools` (or wherever the desktop's existing `tabId`-scoped CDP
attachment lives — the nearest seam, not a new one), `@tepegoz/orchestrator` (suspend-before-vision-capture
logic in the Reactor).

**ADR:** none owed yet. This sits inside S7's existing phase DoD. If resource blocking ever needs a
Policy-Kernel case (for example, a sensitive site whose resources must never be altered even during an
agent run), that would be a short addendum to ADR-0006 at that point — not reserved now.

**DoD shape (draft):**

- [ ] Resource blocking is scoped to the agent's own run `WebContents`, provably never applied to a tab
      the human is browsing manually
- [ ] Automatically suspended before any S10 vision capture — a test proves a blocked-resources run still
      produces a complete screenshot on escalation
- [ ] Ships on its own single-change branch with its own paired sweep (attribution rule), its wall-clock
      delta attributed to this change alone, not blended with any other S7 PR
- [ ] Recorded as **sharpening S7's own DoD**, not opening ahead of it — S7 is itself measurement-owed, so
      this is one more lever inside that phase, per the anti-debt rule, not a new phase

---

## Backlog (named, not written up)

- **DOM-event-level session recording** (Steel's rrweb pattern) — a real capability gap (Tepegöz's replay
  timeline is agent-action-level, not DOM-event-level), but recording arbitrary DOM state — including form
  field values — on a single real person's own persistent browsing session is a materially different
  privacy exposure than recording Steel's disposable, purpose-built automation sessions. If this is ever
  worth pursuing, it needs to be scoped to agent-run windows only (never idle human browsing), pass every
  captured value through the same taint/redaction path everything else in this repo already uses, and get
  its own threat-model paragraph before a workstream is written — not a smaller version of Steel's default.
  Candidate home: a future addendum to Phase 7 (Notary/accountability) once Notary itself is actually
  wired into `apps/desktop` — right now there is nothing live for a recording to attach evidentiary weight
  to.

---

## Routing — what this track does not own

Per the existing convention ([`../README.md`](../../phases/README.md#deferred--adoption-gated-backlog-from-the-beyond-phases-synthesis) /
[`ai-agent/README.md`](../../phases/ai-agent/README.md#routing--what-stays-out)), reference these,
never duplicate them:

| Stays with                                           | Material                                                                                                                                                                                              |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Phase 5**                                          | VPN/Tor routing, kill-switch, the already-open WebRTC local-IP-leak DoD line row 9 sharpens                                                                                                           |
| **Phase 2**                                          | Fingerprinting _defense_ (farbling/canvas-hash protection against the user being tracked) — a different axis from Steel's fingerprint _spoofing_ for automation personas (row 6); not to be conflated |
| **ADR-0006 / ADR-0007**                              | The single deterministic `PolicyKernel` + one `ToolGateway` PEP boundary — Ground rules #1's reasoning, not reopened                                                                                  |
| **ADR-0039**                                         | CAPTCHA/2FA Human Handoff shape — not revisited (Ground rules #2)                                                                                                                                     |
| **ADR-0018**                                         | MCP client — the nearest analog to Steel's third-party extensibility story (row 3), already the chosen shape                                                                                          |
| **`extensions/*`**                                   | Third-party extensibility for the user's own browser — not re-derived as a session-plugin system                                                                                                      |
| **[`aipex-agent-parity.md`](aipex-agent-parity.md)** | Ground rule #3 there is the same rejection this track's Ground rules #1 makes, for a structurally identical local-control-port shape — cited, not re-argued                                           |
| **S7 (`ai-agent`)**                                  | p50 wall-clock/task as the headline metric P2 feeds — not redefined                                                                                                                                   |

## ADRs owed (numbers assigned when a session actually opens one of these)

- **P1:** none owed — stays inside ADR-0008's existing perception surface.
- **P2:** none owed yet — sits inside S7's phase DoD; a future ADR-0006 addendum only if a Policy-Kernel
  case turns out to be needed.
- **Ground rules #1 / #2:** no new ADR — both are already covered by standing ADR-0006/0007/0039; nothing
  here reopens them.

No number is reserved here; per this repo's own multi-profile-track lesson
(`multi-profile-isolation.md` — an ADR-number collision from writing a plan too far ahead of when it's
actually opened), the number gets assigned at the point a session actually starts the work, not now.
