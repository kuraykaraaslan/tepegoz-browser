# Track — Playwright MCP tool/perception-capability parity

**Status:** 📋 **Proposed — not scheduled (2026-09-01).** No branch, no ADR number reserved, no owner
sign-off. This is a captured gap list in the shape of
[`browser-settings-feature-gap.md`](../tracks/browser-settings-feature-gap.md),
[`omnibox-competitive-parity.md`](omnibox-competitive-parity.md),
[`webbrain-agent-parity.md`](webbrain-agent-parity.md) and
[`aipex-agent-parity.md`](aipex-agent-parity.md): every row names its nearest existing Tepegöz behaviour
and a suggested phase home, so a future session can promote a row into a real `phase-*.md` task or an
`ai-agent` PR without re-deriving the comparison.

**Source:** a same-session deep read of `.junk/playwright-mcp` (Microsoft's `@playwright/mcp` v0.0.80,
Apache-2.0 — `README.md`'s full 24-tool default reference plus the storage/network/devtools/testing/
vision/pdf/config opt-in families, `config.d.ts`, `index.d.ts`, `server.json`, `package.json`, `cli.js`,
`SECURITY.md`, `CLAUDE.md`, `tests/capabilities.spec.ts`'s frozen default-tool-list snapshot) against
[`docs/others/tepegoz-vs-playwright-mcp.md`](../versus/tepegoz-vs-playwright-mcp.md) (the
existing Turkish comparison this track distills) and this repo's AI surface (`phases/ai-agent/`,
`packages/orchestrator|model-gateway|capability-plane|security-policy|agent-runtime|browser-tools|
web-tools|mcp-client|recipe-compiler|notary|shared-types`, `extensions/ext-agent`, `docs/adr/*`). Every
claim about Playwright MCP below was checked against the source files directly in this session, not
carried over from the comparison doc unverified; every claim about Tepegöz was checked against the owning
package/ADR the same way — including one correction the comparison doc did not need to make but this
track does: **`@tepegoz/notary` is written and unit-tested, but `apps/desktop` never imports it — no
running import of the package exists outside `packages/notary` itself, so no live agent run produces a
Replay Receipt today.** Any workstream below that touches Notary states this as a precondition, not a
capability.

## Why this track exists

The comparison this track distills reached a framing sharper than "who's ahead": **Playwright MCP is not
an agent at all.** It has no model, no provider abstraction, no policy engine, no autonomy levels — its
own README says the quiet part out loud ("Playwright MCP is **not** a security boundary"; `secrets` is "a
convenience and not a security feature"; `--allowed-origins` "does not serve as a security boundary and
does not affect redirects"). Every decision Tepegöz's agent stack exists to make — plan, decide, gate,
prove — Playwright MCP deliberately leaves to whatever MCP client connects to it. So this track does not
chase "agent capability parity"; there is no agent on the other side to be at parity with. It chases the
**three axes where the two products genuinely share a surface**: the raw tool/action repertoire a browser
exposes to any caller, the accessibility-tree-first perception mechanics both products build on (ADR-0008
already made the same bet Playwright MCP's README argues for), and — because Playwright MCP's entire
product **is** an MCP server — a concretely tested reference for the direction Tepegöz's own MCP surface
runs the opposite way today (ADR-0018: client) but is already named to grow into tomorrow (Phase 1b's
unbuilt "tepegöz MCP server" DoD line, Phase 9's unwired Governed Agent Endpoint decision layer). Where
Playwright MCP is ahead, it is ahead in **tool/perception breadth and dev-tooling ergonomics** — that is
its whole job, and it does it well, Microsoft-backed, at `v0.0.80`, tested on three engines. None of that
breadth requires importing its "not a security boundary" posture: every row below is translated through
the existing kernel/PEP/i18n/coverage discipline, never ported as JS.

## How to read this

Each workstream below is written like an `ai-agent` phase section (Goal → Approach → new/changed
packages → ADRs owed → DoD-shaped bullets) so it can be lifted into a real phase file with minimal
rewriting. **Nothing here is committed roadmap.** Two of the six workstreams (P1, P6) mostly **sharpen**
detail onto phases/tracks that already own the material — [`aipex-agent-parity.md`](aipex-agent-parity.md)
P1 already fully specced a governed MCP server, and [S4](../../phases/ai-agent/phase-s4-verified-outcomes.md)/
[Phase 6](../../phases/product/phase-6-deterministic-automation.md) already own verified-completion and deterministic
replay — this track adds only the detail Playwright MCP's source surfaced that those don't have yet, and
says so explicitly rather than re-describing them.

## Ground rules — parity, not imitation

Six things Playwright MCP does (or explicitly declines to do) are **deliberately not being matched**,
because matching them would either violate a standing decision this repo already made, or because
matching them would mean adopting a different product's category rather than sharpening this one. Naming
them here once so no future session re-proposes them by accident:

1. **No live-page arbitrary-JS tool, and no server-process arbitrary-JS tool.** Playwright MCP ships both:
   `browser_evaluate` runs a model-authored function on the **live page** (full page-JS principal, full
   network access), and `browser_run_code_unsafe` runs one **in the Playwright server process itself** —
   its own tool description calls it, verbatim, _"Unsafe: executes arbitrary JavaScript in the Playwright
   server process and is RCE-equivalent."_ ADR-0026 already measured the closest analog to the first shape
   — an isolated-world sandbox that shares the DOM without sharing the page's JS principal — and found by
   spike that it is a JS-principal boundary, not a network one: a canary server was hit on the first
   attempt. What Tepegöz ships instead is narrower and already solves the underlying productivity problem
   (bulk data extraction without N clicks) without either shape: `browser_analyze_page`
   (`code_exec_read`) runs in a hidden window whose **session refuses all network egress**, holds an
   **`innerHTML`-copied snapshot** of the page (never a loaded, script-executing origin), and is journaled
   by a **16-hex script hash only, never the script body**. `code_exec_write` exists as a declared class
   and is **denied unconditionally** — present so that ever enabling it is a visible kernel change with
   its own ADR, not a flag someone flips. Neither of Playwright MCP's two shapes is being added; the safe
   version is already shipped.
2. **No response-mocking / route-interception tool.** Playwright MCP's `browser_route`/`browser_unroute`/
   `browser_route_list` (storage-adjacent opt-in family) let the calling side rewrite what the page
   receives from the network before the page ever sees it. Handing that lever to the agent's own
   tool-call surface would let a compromised planning step — or an injected instruction — manufacture the
   exact kind of evidence [S4](../../phases/ai-agent/phase-s4-verified-outcomes.md)'s `CompletionEvidence` and
   trap fixtures exist to catch (a page that lies about its own state, e.g. "Saved!" over a 5xx). A tool
   that can make any page say anything is not compatible with a program whose fourth north-star condition
   is "the agent does not believe a lie the page tells it." This is also a category tell: response mocking
   is how you **test** a frontend against a fake backend, not how you **complete a task** on a real one. A
   much narrower, safe subset (`network_state_set`-style online/offline toggle, no response rewriting) is
   named in the Backlog, not rejected.
3. **No decorative network-origin allow/deny list presented as a safety control.** Playwright MCP's
   `--allowed-origins`/`--blocked-origins` are, by its own docs, _"does not serve as a security boundary
   and does not affect redirects."_ Tepegoz's `EgressFirewall` (`inspectEgress`, Shannon-entropy
   secret/leak scanning) and the pre-model `PolicyKernel` are the actual enforcement layer here; adding a
   second, weaker, origin-string allowlist next to a real one is a net negative — a future contributor
   could reach for the decorative one by mistake. The one piece worth copying is named in P1: `--allowed-
hosts` (DNS-rebinding protection for a bound HTTP transport) is a real mechanism, not a stated
   non-boundary, and Tepegoz's own future MCP HTTP transport doesn't have an equivalent yet.
4. **No cross-engine execution and no "attach to a different already-running browser" mode.** Playwright
   MCP runs Chromium, Firefox, and WebKit behind one interface, and `--extension`/`--cdp-endpoint` connect
   to an already-running Chrome/Edge via CDP. Tepegoz **is** the native Chromium-based browser — one
   secure `createWindow()` factory, renderer-untrusted, out-of-process CDP under its own control. Running
   a second or third browser engine inside it, or puppeting some other already-running browser instance,
   contradicts that design; this is a category mismatch, not an unbuilt feature.
5. **No headless-server / Docker CI-runner distribution mode for the agent surface.** Playwright MCP ships
   an official headless-Chromium Docker image explicitly for CI/worker use. "Run Tepegöz as a headless
   container a CI job drives" is a different product than a local-first desktop browser and is not part of
   this program; the closest legitimate analog — unattended **task** runs inside the installed app — is
   already `@tepegoz/tasks`' job, not this track's.
6. **No test-authoring tooling.** `browser_verify_*`'s sibling `browser_generate_locator` (emit a
   CSS/role locator for use in a hand-written test file) and the `--codegen typescript|python|java|csharp`
   language selector exist because Playwright MCP's primary declared use case is **writing and
   self-healing tests**, a different job from Tepegoz's end-user task completion. The part of this axis
   that _does_ transfer — a durable, reproducible record of what an agent run actually did — is matched by
   P5 through the existing Notary/recipe-compiler seam, not by adopting Playwright's literal
   code-generation feature or its locator-for-a-test-suite framing.

None of these are "Playwright MCP did it wrong." Its README is explicit that these are deliberate,
documented trade-offs for a tool server whose real authorization boundary is meant to live in whatever MCP
client connects to it. The point of naming them here is that a future reader of this track shouldn't
reopen a decision already made for a documented reason.

---

## Capability inventory

Legend for **Home**: an existing phase/ADR/track name means "already planned, this row sharpens it, no
new phase needed." **NEW** means no existing phase owns it and this track proposes one. **Rejected**
points at the Ground Rules item that declines it.

| #   | Playwright MCP capability                                                                                                                                                                                                                    | Nearest Tepegöz behaviour today                                                                                                                                                                                                                                   | Gap                                                                                                                                                                                                                  | Home                                                                              |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 1   | `browser_find` — search the accessibility snapshot by text/regex, return matching nodes + a few lines of surrounding context under their tree path, without capturing the whole snapshot                                                     | `browser_get_elements`/`browser_analyze_page` (full or coordinate-targeted reads; no in-place text/regex search mode)                                                                                                                                             | A cheap, targeted "where is X" primitive distinct from a full re-snapshot                                                                                                                                            | **P2 (extends S2)**                                                               |
| 2   | `--snapshot-mode full\|none`, `--snapshot-boxes` (viewport-relative bounding boxes), per-call `depth` limit on `browser_snapshot`                                                                                                            | S2's diff/dedupe/elision (a different cost lever — unchanged-run elision, not per-call shape control)                                                                                                                                                             | Per-call shape/cost knobs distinct from S2's existing diffing                                                                                                                                                        | **P2 (extends S2)**                                                               |
| 3   | `browser_take_screenshot`'s explicit tool description: _"You can't perform actions based on the screenshot, use browser_snapshot for actions"_                                                                                               | ADR-0008 (DOM/a11y-first perception) + S10 (vision escalation-only, ships inert)                                                                                                                                                                                  | None — same philosophy; Tepegoz's planned design (model-in-the-loop escalation) is already a superset of Playwright MCP's static warning                                                                             | **Already planned (S10)** — cite only                                             |
| 4   | Storage family: `browser_cookie_{get,set,delete,list,clear}`, `browser_{local,session}storage_{get,set,delete,list,clear}`, `browser_storage_state`/`browser_set_storage_state` (bulk save/restore) — all opt-in, all flat `read`/non-`read` | Nothing — Tepegoz has no storage-inspection or -mutation tool today                                                                                                                                                                                               | Real gap, but Playwright MCP's flat classification (cookie reads marked `read-only: true` like any other GET) is not safe to copy verbatim: a session cookie's **value** is credential-equivalent                    | **P3 (NEW)**                                                                      |
| 5   | `browser_pdf_save` (opt-in `pdf` cap) — export the current page to a PDF file                                                                                                                                                                | Phase 2c ships a PDF **viewer** (human-facing, reads existing PDFs); `browser_read_pdf` (agent reads an existing PDF) is already proposed in [`webbrain-agent-parity.md`](webbrain-agent-parity.md) P3-a                                                          | No export/print-to-PDF tool exists in either direction's proposal yet                                                                                                                                                | **P4 (NEW, small)**                                                               |
| 6   | Per-tool-call **generated, human-readable, re-runnable code** (`code:` field, language chosen by `--codegen`) + `--save-session` (dump the whole session to the output dir)                                                                  | `@tepegoz/notary`'s Replay Receipt (cryptographic, hash-chained, not human-readable or directly re-runnable) + `@tepegoz/recipe-compiler` (deterministic IR, but only for explicitly-authored/recorded recipes, not a byproduct of an ordinary Do-mode run)       | No deterministic, inspectable replay artifact is produced as a byproduct of a normal run today                                                                                                                       | **P5 (extends Phase 6/7 — gated behind Notary wiring, see Source)**               |
| 7   | Test-assertion family (`browser_verify_element_visible`/`verify_text_visible`/`verify_list_visible`/`verify_value`), opt-in `testing` cap — model-callable, client chooses to call them, not a completion gate                               | `CompletionEvidence` + deterministic downgrade (S4, a **gate**, not an opt-in tool) + `recipe-compiler`'s `assertion-evaluator.ts` (deterministic, not model-callable)                                                                                            | No named, model-callable assertion **primitives** exist as reusable building blocks distinct from the gate itself                                                                                                    | **P6 (sharpen S4/Phase 6)**                                                       |
| 8   | `browser_generate_locator` — emit a CSS/role locator string for use in a hand-authored test                                                                                                                                                  | None, and none proposed                                                                                                                                                                                                                                           | Category mismatch — test-authoring, not task-completion                                                                                                                                                              | **Rejected (Ground rules #6)**                                                    |
| 9   | `browser_evaluate` — arbitrary JS on the live page                                                                                                                                                                                           | `browser_analyze_page` (`code_exec_read` — network-severed, snapshot-only, hash-only-journaled)                                                                                                                                                                   | N/A — rejected; the safe version of the same underlying capability already ships                                                                                                                                     | **Rejected (Ground rules #1)**                                                    |
| 10  | `browser_run_code_unsafe` — arbitrary JS in the Playwright server process, its own docs say "RCE-equivalent"                                                                                                                                 | None, and none should exist                                                                                                                                                                                                                                       | N/A — rejected outright                                                                                                                                                                                              | **Rejected (Ground rules #1)**                                                    |
| 11  | `browser_route`/`browser_unroute`/`browser_route_list` — network response mocking/interception                                                                                                                                               | None                                                                                                                                                                                                                                                              | N/A — rejected; would let a run manufacture its own S4 evidence                                                                                                                                                      | **Rejected (Ground rules #2)**                                                    |
| 12  | `browser_network_state_set` — offline/online toggle only, no response rewriting                                                                                                                                                              | None                                                                                                                                                                                                                                                              | Small, safe subset of #11; real but low-value, no daily-driver pull shown                                                                                                                                            | **Backlog**                                                                       |
| 13  | `--allowed-origins`/`--blocked-origins` — browser-request origin allow/deny list, documented as not a security boundary and not covering redirects                                                                                           | `EgressFirewall` + pre-model `PolicyKernel` (the actual enforcement layer)                                                                                                                                                                                        | N/A — rejected; would be a decorative second mechanism next to a real one                                                                                                                                            | **Rejected (Ground rules #3)**                                                    |
| 14  | `--allowed-hosts` — DNS-rebinding protection for a bound HTTP transport (host-header check, distinct from the CORS-shaped origin list above)                                                                                                 | None — Tepegoz's MCP transport (server direction) is unbuilt                                                                                                                                                                                                      | Small, real, worth adopting when the transport is built                                                                                                                                                              | **P1 (small addendum)**                                                           |
| 15  | Capability-family opt-in (`core`/`storage`/`network`/`devtools`/`testing`/`vision`/`pdf`/`config`) gates which tools a `tools/list` call discloses at all                                                                                    | `AgentEndpointTokenSchema.allowedToolIds`/`allowedDangerClasses` (`@tepegoz/shared-types`, Phase 9, ADR-0035 — **landed as a schema, zero wiring**: no Capability Broker, no signing, no listening MCP surface, no minting UI)                                    | A named, documented **family taxonomy** for what a scoped token's `tools/list` response discloses — the schema exists, the family grouping on top of it doesn't                                                      | **P1 (sharpens ADR-0035/Phase 9 + `aipex-agent-parity.md` P1)**                   |
| 16  | The MCP server surface itself — any MCP client (Claude Desktop, Cursor, VS Code…) gets a full browser toolset                                                                                                                                | Phase 1b's unbuilt "tepegöz MCP server" DoD line + Phase 9's unwired Governed Agent Endpoint layer (ADR-0035/0039) + [`aipex-agent-parity.md`](aipex-agent-parity.md) P1 (a complete design: per-PEP re-pass, Bearer, rate-limit, unattended fail-safe-deny, CLI) | None new — already planned in more detail than this track would add                                                                                                                                                  | **Already planned (Phase 1b / Phase 9 / `aipex-agent-parity.md` P1)** — cite only |
| 17  | Coordinate-based fallback: 6 x/y mouse primitives, opt-in `vision` cap, no vision **model** attached — the calling client supplies coordinates                                                                                               | S10 (vision escalation — model-in-the-loop trigger, budgeted downscale, set-of-marks; ships inert — never wired, not flag-gated: `captureVision` has no production caller, correction dated 2026-09-02 in `phase-s10-vision-escalation.md`)                       | Tepegoz's planned design is a strict superset on paper (a model decides _when_, Playwright MCP's mode is opt-in-only, no trigger logic) — but Playwright MCP's fallback works today and Tepegoz's needs wiring first | **Already planned (S10)** — cite only                                             |
| 18  | Frame enumeration + shadow-DOM piercing (implicit — Playwright's locator engine already pierces both; no separate tool family needed on Playwright MCP's side)                                                                               | Light-DOM-only perception (ADR-0008/S2), already named as a gap                                                                                                                                                                                                   | None new                                                                                                                                                                                                             | **Already planned (`webbrain-agent-parity.md` P3-b)** — cite only                 |
| 19  | Three browser engines (Chromium/Firefox/WebKit) behind one interface; `--extension`/`--cdp-endpoint` attach to an already-running Chrome/Edge                                                                                                | Native Electron/Chromium only, by design                                                                                                                                                                                                                          | N/A — rejected                                                                                                                                                                                                       | **Rejected (Ground rules #4)**                                                    |
| 20  | Official headless-Chromium Docker image for CI/worker use                                                                                                                                                                                    | None, and none should exist for this product shape                                                                                                                                                                                                                | N/A — rejected                                                                                                                                                                                                       | **Rejected (Ground rules #5)**                                                    |
| 21  | `--device`/`--mobile` emulation                                                                                                                                                                                                              | None — ADR-0029 already records this as a named, un-exposed gap ("Device/mobile emulation is not exposed")                                                                                                                                                        | Real, but it is a DevTools daily-driver gap, not an agent-parity one                                                                                                                                                 | **Already named (ADR-0029 → Phase 2b/2c)** — cite only, not this track's to own   |
| 22  | `secrets` config — dotenv plaintext-value masking applied to tool **responses** after the fact, its own docs call it "a convenience and not a security feature"                                                                              | Credential Broker (S6) — the agent has **no shape a secret could arrive in at all**, ships inert pending an OS-auth gate                                                                                                                                          | None worth adding — a post-hoc masking fallback would be a _weaker_ mechanism sitting next to a stronger one not yet wired; wiring S6 is strictly better than adding this                                            | **Already planned (S6)** — cite only, explicitly do not add the weaker fallback   |

---

## P1 — MCP server: capability-family disclosure + transport hardening (sharpens Phase 1b / Phase 9 / `aipex-agent-parity.md` P1)

**Goal.** Playwright MCP's entire product is the thing Tepegoz's own MCP surface only has half of today
(ADR-0018: client) and has already named, in detail, the other half of — Phase 1b's DoD line ("tepegöz
MCP server is consumable from an external client... `MCP_Server_Design_Rules` compliant"), Phase 9's
Governed Agent Endpoint decision layer (ADR-0035, amended by ADR-0039), and
[`aipex-agent-parity.md`](aipex-agent-parity.md) P1's full design (per-PEP re-pass, Bearer token, rate
limit, unattended fail-safe-deny, a `tepegoz` CLI). This workstream does **not** re-derive that design. It
adds the two concrete details Playwright MCP's source surfaces that the existing material doesn't
explicitly have yet.

**Approach.**

- **Point at the schema that already exists instead of inventing a second one.**
  `AgentEndpointTokenSchema` (`@tepegoz/shared-types`, Phase 9, ADR-0035) already has `allowedToolIds`,
  `allowedDangerClasses`, `expiresAt`, and `rateLimitPerMinute` — exactly the "per-client Bearer token +
  per-token capability scope + rate ceiling" shape `aipex-agent-parity.md` P1 describes building. Today it
  is landed as a tested schema with **zero wiring** (no Capability Broker, no signing, no listening MCP
  surface, no minting UI, no journaling — stated plainly in Phase 9's own file). Whichever session opens
  Phase 1b's MCP server should mint tokens against this schema, not a parallel one.
- **A named capability-family taxonomy for `tools/list` disclosure**, the one piece of ergonomics
  Playwright MCP's `core`/`storage`/`network`/`devtools`/`testing`/`vision`/`pdf`/`config` grouping gets
  right: group the CapabilityRegistry's tool descriptors into named families so a scoped token's
  `allowedToolIds` can be granted "by family" in the Settings minting UI instead of one-tool-at-a-time,
  and so `tools/list` for a given token only ever discloses schemas the token could actually call — never
  the "here are 70 tools, but calling most of them will 403" experience Playwright MCP's own opt-in caps
  avoid by simply not listing an un-enabled tool at all. This is a UI/registry-query convenience on top of
  `allowedToolIds`, not a new enforcement mechanism.
- **DNS-rebinding host-check on any future bound HTTP transport**, matching `--allowed-hosts`'s actual
  mechanism (validate the `Host` header against an allow-list before serving) — real and worth copying,
  unlike the `--allowed-origins`/`--blocked-origins` pair this track explicitly declines (Ground rules
  #3). If Tepegoz's MCP server ever binds to more than loopback, this check is mandatory before that
  ships, not optional hardening.
- **What stays exactly as `aipex-agent-parity.md` P1 already designed:** every delegated call re-enters
  the one PEP unchanged; `isSensitiveSite` hard-denies at every autonomy level; an unattended call needing
  HITL returns a typed `AppError`, never an auto-approve; the transport is plumbing, not a second trust
  boundary.

**New/changed packages:** none beyond what `aipex-agent-parity.md` P1 already names
(`@tepegoz/mcp-server`, `@tepegoz/capability-plane` for the family-grouping metadata,
`extensions/ext-agent` + `@tepegoz/preferences` for the minting UI). This workstream's delta lives in
**how** those packages consume `AgentEndpointTokenSchema` and in the host-check detail, not in new
packages.

**ADR:** no new number. An addendum to **ADR-0035** (Governed Agent Endpoints) recording the
capability-family grouping and the `--allowed-hosts`-style host check; ADR-0018's own text already flags
the MCP-server ADR as owed when Phase 1b opens it.

**DoD shape (draft, for whichever session promotes this):**

- [ ] A minted token's `allowedToolIds` can be set by selecting one or more named families in Settings,
      not only by picking individual tool ids one at a time
- [ ] `tools/list` for a scoped token returns only schemas within that token's `allowedToolIds` — a tool
      outside the grant does not appear, does not merely 403 on call
- [ ] A bound HTTP transport (if/when one exists) rejects a request whose `Host` header is not on the
      configured allow-list, before any MCP handshake completes
- [ ] Everything `aipex-agent-parity.md` P1's own DoD already lists (same-shape audit entry, deny-by-
      default without a valid token, sensitive-site hard-deny, unattended fail-safe-deny, rate limit) —
      referenced, not restated
- [ ] Gated behind Phase 1b's MCP-server line being opened AND Phase 9's Governed Agent Endpoint layer
      reaching real wiring (per the anti-debt rule — this track does not open either unilaterally)

---

## P2 — Perception ergonomics: find-in-snapshot + snapshot shaping (extends S2)

**Goal.** Match the two perception-tooling conveniences Playwright MCP's own tool descriptions justify by
cost — "cheaper than capturing the whole snapshot when you only need to locate an element" — without
touching S2's existing identity-stable-ref/diff/elision design, which already solves a related but
different problem (avoiding a full re-snapshot **across turns**, not avoiding a full snapshot **within**
one call).

**Approach.**

- **A `browser_find`-equivalent search primitive.** `browser_get_elements`/`browser_analyze_page` today
  always return a scoped or full read; add a text/regex search over the current identity-stable
  accessibility model that returns matching nodes with a few lines of surrounding context and their tree
  path — same contract as Playwright MCP's own description, same reasoning (search cost is far below
  snapshot cost). `dangerClass: 'read'`, same `wrapUntrustedContent` treatment as any other page read.
- **Per-call shape controls**: a `depth` limit and an optional bounding-box annotation on the existing
  snapshot/elements tools, mirroring `--snapshot-boxes`'s viewport-relative `[box=x,y,width,height]`
  format. The box annotation is genuinely useful groundwork for S10's coordinate-fallback path (a
  vision-escalation step that needs to correlate a described element with a screen region) — sharpen S10's
  DoD with this detail rather than opening a new one.
- **What stays exactly as designed:** the diff/dedupe/elision cost model, `aria-labelledby`/`label[for]`
  resolution, and `browser_get_article` are untouched — this workstream adds two new low-level primitives
  next to them, it does not change how S2's existing ones behave.

**New/changed packages:** `@tepegoz/browser-tools` (the search tool + depth/box parameters on existing
tools), no `@tepegoz/security-policy` changes (both are `read`-class, same as today's perception tools).

**ADR:** none — this is squarely S2/S10 sharpening through the existing `docs/adding-a-tool.md` checklist.

**DoD shape (draft):**

- [ ] The find/search tool returns matching nodes + path + short context for a real fixture page, without
      capturing the full tree
- [ ] `depth` bounds the returned tree size measurably (token-count delta recorded, tying into S7)
- [ ] Bounding-box output is viewport-relative CSS pixels, fixture-asserted against `getBoundingClientRect`
- [ ] i18n: none needed — tool output is data, not UI copy; any new Settings toggle for box annotation
      (if surfaced) gets EN+TR parity

---

## P3 — Storage-inspection tools, classified as credential-adjacent (NEW)

**Goal.** Give the agent a legitimate, narrow reason to read/clear a site's client-side state ("what's in
this site's localStorage", "clear my session on this one site the user asked about") **without** copying
Playwright MCP's flat classification, where `browser_cookie_get`/`browser_cookie_list` are marked
`read-only: true` exactly like any other GET — appropriate for a tool server whose real authorization
boundary lives in the connecting client, wrong for a tool plane whose `PolicyKernel` decides pre-model.

**Approach.**

- **localStorage/sessionStorage CRUD is the safe half.** Page-readable-anyway, non-`httpOnly` data with
  no session-hijack shape. `dangerClass: 'read'` for get/list, `'state_changing'` for set/delete/clear —
  the same tier any other page-state mutation already gets, no new danger class needed.
  `wrapUntrustedContent` on any returned value, same as `browser_get_page`.
- **Cookie CRUD is the one that needs a floor above Playwright MCP's.** A cookie **value** can be a live
  session/auth token — reading it and letting it flow into a prompt sent to a cloud model is a
  session-hijack-adjacent exfiltration path a flat `read-only: true` classification does not defend
  against. `browser_cookie_get`/`browser_cookie_list` get `dangerClass: 'destructive'` at minimum (not
  `read`), and known session-cookie-shaped values (high-entropy, `httpOnly`-flagged, or name-pattern-
  matched against a short deny-list of common session-cookie names) are redacted before the result ever
  reaches the model — reusing `EgressFirewall`'s existing entropy-scoring logic on the **inbound** side
  for the first time, not just its outbound egress-scan role.
- **`storage_state`-equivalent bulk export/import is the highest tier.** Saving or restoring _all_
  cookies + storage for a profile is functionally "export/import my session" — treat it the way the
  Credential Broker treats a credential fill: gated behind the same OS-auth mechanism S6 already specifies
  (currently ships inert pending that gate), not merely `destructive`+HITL. This capability is explicitly
  **gated behind S6's OS-auth gate existing**, per the anti-debt rule — it does not ship ahead of the
  mechanism it depends on.
- **No flat `read-only: true` label anywhere in this family** — every tool's danger class is set by what
  the data _is_ (session-adjacent vs. not), not by whether the HTTP-verb-shaped operation is a GET.

**New/changed packages:** `@tepegoz/browser-tools` (the new tool family), `@tepegoz/security-policy` (the
redaction pass reusing `EgressFirewall`'s entropy scorer on inbound cookie reads; the `storage_state`
gate reusing S6's OS-auth precondition).

**ADR owed:** one new, short ADR — "storage-inspection tools: a cookie value is credential-equivalent, not
read-equivalent; danger class is set by data sensitivity, not by HTTP-verb shape; bulk session export/
import requires the same OS-auth gate as credential fill." Worth writing down precisely because Playwright
MCP's own precedent (flat `read-only`) is the wrong default to inherit by habit.

**DoD shape (draft):**

- [ ] localStorage/sessionStorage get/set/delete/list/clear ship at `read`/`state_changing` as appropriate,
      registered through the one `CapabilityRegistry`
- [ ] `browser_cookie_get`/`list` ship at `destructive`, not `read` — a test proves a `read`-tier autonomy
      grant cannot auto-approve a cookie read
- [ ] A high-entropy or session-name-pattern cookie value is redacted in the tool result before it would
      reach a model — a test asserts the redaction, not just that the field exists
- [ ] Bulk `storage_state` save/restore is denied until S6's OS-auth gate is live — explicitly stated as
      gated, not silently deferred
- [ ] i18n: EN+TR for any new HITL/grant copy this family's `destructive`/gated tiers surface

---

## P4 — `browser_read_page_as_pdf`-adjacent: PDF export (NEW, small)

**Goal.** Playwright MCP's `browser_pdf_save` is a small, single-tool capability Tepegoz has no analog of
in either direction proposed so far — [`webbrain-agent-parity.md`](webbrain-agent-parity.md) P3-a already
proposes **reading** an existing PDF; nothing proposes **producing** one from the current page.

**Approach.**

- A small `browser_save_page_as_pdf` (naming pending the `{domain}_{verb}_{noun}` convention) in
  `@tepegoz/browser-tools`, reusing whatever Electron/Chromium print-to-PDF surface Phase 2c's PDF work
  already touches. Output goes through the same `file_*` sandbox path any other agent-produced artifact
  already uses — no new file-write surface.
- `dangerClass: 'read'`-adjacent: it does not mutate the page or exfiltrate anything beyond what
  `browser_get_page` already could; classify it the same as `browser_get_screenshot`.

**New/changed packages:** `@tepegoz/browser-tools` only; no security-policy changes.

**ADR:** none — small tool addition through the existing checklist.

**DoD shape (draft):**

- [ ] Produces a valid PDF from the current page, saved through the existing `file_*` sandbox path
- [ ] Registered through the one `CapabilityRegistry`, same danger class as `browser_get_screenshot`
- [ ] i18n: none needed beyond the standard tool-description string (contributor-authored, not
      user-facing UI)

---

## P5 — A deterministic replay artifact as a run byproduct (extends Phase 6/7 — gated behind Notary wiring)

**Goal.** Playwright MCP's most distinctive accountability feature is that **every tool call returns
generated, human-readable, re-runnable code**, and a whole session can be dumped to the output directory
with `--save-session`. That is a genuinely good idea Tepegoz has no equivalent of — Notary gives
cryptographic tamper-evidence, but not something a person or a downstream tool can read and re-run without
the agent loop; `recipe-compiler` gives a re-runnable deterministic IR, but only for explicitly-authored/
recorded recipes, never as an automatic byproduct of an ordinary Do-mode run.

**This workstream is stated as gated, not as ready to build, for a specific reason.** `@tepegoz/notary` is
written and unit-tested — the hash-chain, the Ed25519 checkpoint signing, `buildReceipt`/`verifyReceipt`,
and the standalone `tepegoz-verify` CLI all exist and pass their own tests. **None of it is imported by
`apps/desktop`.** No running agent produces a Replay Receipt today; Phase 7's own file already records
this precisely ("NotaryService algorithmic core... landed, tested by running the built binary; not wired
into a live run"). Building a codegen/replay-artifact feature **on top of** an unwired foundation would be
exactly the anti-debt violation this program's own rule exists to catch — a new capability opened on a
phase that is not itself reachable yet.

**Approach (for when Notary is wired — not before).**

- **Reuse `@tepegoz/recipe-compiler`'s IR, not a new code-generation target.** Rather than emitting
  Playwright/TypeScript-shaped code (a new dependency and a new "what language" decision Playwright MCP
  needs and Tepegoz doesn't), capture each mutating tool call's normalized arguments into the same
  recipe-IR shape `recipe-compiler` already defines for explicitly-recorded recipes. A Do-mode run
  produces one incidentally, the same shape a macro-recording run produces deliberately.
- **Attach the IR to the Replay Receipt as a component, once Notary is live**, so a Receipt is both
  cryptographically verifiable (Notary's job) _and_ human-inspectable/re-runnable (this workstream's
  addition) — one artifact, two properties, instead of Playwright MCP's code-only and Notary's proof-only
  living in separate files a user has to reconcile themselves.
- **No live re-run inside Tepegoz itself in this workstream's scope** — re-running a captured recipe
  through `recipe-compiler`'s existing selector-healing/success-oracle path is already that package's job;
  this workstream only closes the gap of _capturing_ the IR automatically from an ordinary run, not
  building a new execution path.

**New/changed packages:** `@tepegoz/orchestrator` (capture normalized tool-call args into recipe-IR shape
during execution), `@tepegoz/notary` (Receipt component to carry the IR), `@tepegoz/recipe-compiler`
(no new execution logic — the IR shape is reused as-is).

**ADR:** an addendum to **ADR-0030** (Notary Service) recording the IR-as-Receipt-component decision —
written at the point a session actually wires Notary in, not now.

**DoD shape (draft, explicitly not startable yet):**

- [ ] **Precondition, checked first:** `@tepegoz/notary` is imported by `apps/desktop` and at least one
      live run produces a verifiable Replay Receipt — until this is true, no other box in this list is
      opened
- [ ] A completed run's mutating tool calls are captured as a recipe-IR sequence, attached to that run's
      Receipt
- [ ] The captured IR replays through `recipe-compiler`'s existing executor against the same fixture the
      original run used, with the same outcome
- [ ] i18n: none needed for the artifact itself (machine-readable); any new "download replay" UI affordance
      gets EN+TR parity

---

## P6 — Assertion primitives as named, model-callable tools (sharpen S4 / Phase 6)

**Goal.** Playwright MCP's `testing` capability gives the calling model four small, named assertion
primitives (`verify_element_visible`/`verify_text_visible`/`verify_list_visible`/`verify_value`) it can
choose to call mid-task. Tepegoz's equivalent mechanism — `CompletionEvidence` (S4) and
`recipe-compiler`'s `assertion-evaluator.ts` — is stronger in kind (a **gate** the model cannot talk its
way past, backed by trap fixtures) but does not expose the same small, reusable, model-callable building
blocks a task might want to call **before** the completion gate, e.g. "confirm this row actually appeared
in the table before I move on."

**Approach.**

- Expose the same four assertion shapes as small `dangerClass: 'read'` tools
  (`browser_check_element_visible`/`browser_check_text_visible`/`browser_check_list_visible`/
  `browser_check_value`, naming pending the verb-set convention) implemented **on top of**
  `recipe-compiler`'s existing `assertion-evaluator.ts` logic, not a parallel implementation — one
  assertion engine, two callers (the deterministic gate and the model-callable tool).
  - Note the deliberate framing: these are **read** tools that report a boolean/mismatch, not a
    completion-gate substitute — calling one and getting `true` does not let the model claim `done`;
    `CompletionEvidence`'s deterministic downgrade still runs regardless of what these tools reported,
    exactly as designed today. This is the one place this track is careful **not** to weaken S4 while
    adding something adjacent to it.
- No new package: these are thin tool wrappers in `@tepegoz/browser-tools` calling into
  `@tepegoz/recipe-compiler`'s exported evaluator.

**New/changed packages:** `@tepegoz/browser-tools` (four new thin tools), `@tepegoz/recipe-compiler`
(export the evaluator functions for external callers, if not already exported).

**ADR:** none — sharpens S4's existing DoD and reuses Phase 6's existing trust model; no new decision.

**DoD shape (draft):**

- [ ] Each of the four tools reuses `assertion-evaluator.ts`'s logic verbatim (no drift between the
      model-callable version and the deterministic gate's version) — a test asserts both call sites agree
      on the same fixture
- [ ] A test proves calling one of these tools and getting a positive result does **not** bypass
      `CompletionEvidence`'s own independent check — the gate still runs
- [ ] i18n: tool descriptions are contributor-authored (not user-facing UI); no new strings needed

---

## Backlog (named, not written up)

- **`network_state_set`-style offline/online toggle** — the safe subset of Ground rules #2's rejected
  route-mocking family. Real, low-conflict, but no daily-driver pull shown for this product; candidate
  home: a small addition to `@tepegoz/web-tools` whenever a session is already touching that package for
  another reason.
- **`browser_get_config`-equivalent introspection tool** — lets an external MCP caller see the resolved
  server config (which capabilities/families are enabled). Small, useful once P1's MCP server actually
  exists; not worth a standalone workstream before that.
- **`--output-dir`/`--output-max-size`-style bounded artifact eviction** — Playwright MCP evicts old
  output files past a size threshold. Tepegoz's screenshot/download artifact storage doesn't have an
  explicit eviction policy documented; worth a look whenever a session is already in `@tepegoz/screenshots`
  or `@tepegoz/downloads` for another reason, not a reason to open either package alone.
- **`browser_annotate`/`browser_highlight`/`browser_hide_highlight`** (Playwright Dashboard annotation
  mode, persistent highlight overlays) — a real, pleasant debugging aid, but squarely a DevTools-adjacent,
  human-facing feature (ADR-0029 territory: user-only), not an agent tool. Candidate home: Phase 2b
  whenever DevTools daily-driver work is active, not this track.
- **Trace/video/recording tools** (`start/stop_tracing`, `start/stop_video`, `video_chapter`,
  `show/hide_actions`, `start/stop_recording`, `browser_resume` step-debugging) — overlaps what the Agent
  Console's already-shipped scrollable replay timeline + evidence badges give a user today, and what P5
  would give once Notary is wired. No gap demonstrated beyond what those two already cover; revisit only
  if a concrete need surfaces after P5 lands.

---

## Routing — what this track does not own

Per the existing convention ([`../README.md`](../../phases/README.md#deferred--adoption-gated-backlog-from-the-beyond-phases-synthesis) /
[`ai-agent/README.md`](../../phases/ai-agent/README.md#routing--what-stays-out)), reference these, never
duplicate them:

| Stays with                                 | Material                                                                                                                                                            |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Phase 1b**                               | The base "tepegöz MCP server" build-out (transport, registry publication) — P1 sharpens detail onto it, does not open it                                            |
| **Phase 9 / ADR-0035 / ADR-0039**          | Governed Agent Endpoints — `AgentEndpointTokenSchema`, Bearer/rate-limit/scope, sensitive-category grant precondition                                               |
| **`aipex-agent-parity.md` P1**             | The complete governed-MCP-server design (per-PEP re-pass, unattended fail-safe-deny, `tepegoz` CLI) — P1 here adds only the family-taxonomy + host-check detail     |
| **`webbrain-agent-parity.md` P3-a / P3-b** | PDF **reading** (`browser_read_pdf`) and frames/shadow-DOM perception — not re-proposed here                                                                        |
| **S6**                                     | Credential Broker (the stronger answer to Playwright MCP's `secrets` masking) and its OS-auth gate — P3's `storage_state` tier depends on it, does not duplicate it |
| **S10**                                    | Vision escalation — Playwright MCP's coordinate-only `vision` cap is a strict subset of what S10 already plans                                                      |
| **ADR-0026 / ADR-0029**                    | `execute_js`/DevTools/live-process-JS boundary — Ground rules #1 works around it by pointing at the already-shipped safe alternative, does not reopen it            |
| **ADR-0008 / S2**                          | DOM/a11y-first perception — P2 adds two small primitives on top, does not redesign it                                                                               |
| **S4 / Phase 6**                           | `CompletionEvidence` + `assertion-evaluator.ts` — P6 exposes existing logic as tools, does not create a second assertion engine                                     |

## ADRs owed (numbers assigned when a session actually opens one of these)

- P1: addendum to **ADR-0035** (Governed Agent Endpoints) — capability-family grouping + host-header check
- P3: **one new ADR** — "storage-inspection tools: danger class set by data sensitivity, not HTTP-verb
  shape; cookie values are credential-equivalent; bulk session export/import requires the S6 OS-auth gate"
- P4: none — small tool addition through the existing checklist
- P5: addendum to **ADR-0030** (Notary Service) — the IR-as-Receipt-component decision, written only once
  Notary is actually wired into a live run, not before
- P6: none — sharpens S4's existing DoD, reuses Phase 6's existing trust model

No number is reserved here; per this repo's own multi-profile-track lesson
(`multi-profile-isolation.md` — an ADR-number collision from writing a plan too far ahead of when it's
actually opened), the number gets assigned at the point a session actually starts the work, not now.
