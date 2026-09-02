# Track — Amazon Nova Act agent-capability parity

**Status:** 📋 **Proposed — not scheduled (2026-09-02).** No branch, no ADR number reserved, no owner
sign-off. This is a captured gap list in the shape of
[`browser-settings-feature-gap.md`](../tracks/browser-settings-feature-gap.md),
[`omnibox-competitive-parity.md`](omnibox-competitive-parity.md),
[`webbrain-agent-parity.md`](webbrain-agent-parity.md) and
[`aipex-agent-parity.md`](aipex-agent-parity.md): every row names its nearest existing Tepegöz
behaviour and a suggested phase home, so a future session can promote a row into a real `phase-*.md`
task or an `ai-agent` PR without re-deriving the comparison.

**Source:** a same-session deep read of `.junk/nova-act` (Amazon Nova Act — AWS's hosted "production
UI-workflow agent fleets" service; the repo ships only the Apache-2.0 **Python SDK**, v3.4.187.0, ~41k
lines / 345 files, no tests in-repo) against this repo's AI surface (`phases/ai-agent/`,
`packages/orchestrator|model-gateway|capability-plane|security-policy|agent-runtime|browser-tools|
web-tools|tool-executor|local-inference|model-catalog|mcp-client|recipe-compiler|macro-engine|notary|
credential-vault|human-input|tasks`, `extensions/ext-agent`, `docs/adr/*`). The prose comparison this
track distills is [`docs/others/tepegoz-vs-nova-act.md`](../versus/tepegoz-vs-nova-act.md)
(Turkish, 2026-09-01), which itself separates source-verified claims (action set, observation shape,
client-side loop, `SecurityOptions`, HITL tool signatures, session-persistence providers, auth/telemetry,
trace generation, the CLI command list, the _absence_ of any injection defense in the SDK) from
unverifiable ones (the closed `act` model, server-side RAI guardrails, benchmark numbers) — this track
inherits that same discipline and does not upgrade a "documented" claim to a "verified" one. A second
input, [`docs/research-computer-use-agents.md`](../research/research-computer-use-agents.md), already
distilled four concrete Nova Act lessons (two named HITL patterns, a 4-class error taxonomy, the
"actuator lock" idea, and a session-persistence-provider abstraction) in an earlier pass across several
partial-open agent SDKs; this track **links to that document and to each lesson's phase/ADR home
instead of re-deriving them** — see the relevant rows in the Capability inventory below.

## Why this track exists

The comparison landed on an asymmetry that runs the **opposite direction** from `webbrain` and `aipex`:
those two are more _capable_ today; Nova Act is more _finished_ today, and finished in a way that is
mostly not portable. It is a **shipping, paid, GA AWS service** — real parallel sessions, a model trained
specifically for screen actuation, a shipped visual-trace-plus-video observability chain, a 41-command
CLI, an IDE plugin, a playground — bought by accepting three lock-ins Tepegöz's own architecture exists
to avoid: one vendor, one model, and a per-step screenshot sent to a closed cloud service (the vendor's
own disclosure says those screenshots are collected "to develop and improve our services"). The
comparison's own closing note says this plainly: Nova Act's SDK is, structurally, _exactly_ the
"Python sidecar + second-Chromium actuation (via Playwright) + closed vendor model" shape
`ai-agent`'s own "Never" list already names and rejects — so a large share of what makes Nova Act
work today is not something this track can adopt without abandoning a standing decision, not a gap this
track can close. What legitimately transfers is narrower: one shipped, generally useful pattern
(a self-contained, human-readable per-run visual trace) that has a real seam in Tepegöz's own roadmap and
doesn't yet have a workstream behind it, plus a handful of small sharpening notes on phases that already
own the relevant ground. This track is deliberately thin **because that is the honest finding**, not
because the comparison was shallow — the comparison itself is exhaustive (27 dimensions, source-verified
where the repo allows it) and its own tally has Tepegöz ahead on architecture in most of them already.

## How to read this

The one real workstream below is written like an `ai-agent` phase section (Goal → Approach →
new/changed packages → ADR → DoD-shaped bullets) so it can be lifted into a real phase file with minimal
rewriting. **Nothing here is committed roadmap.** Per the "Already planned — do NOT re-propose" rule in
[`../README.md`](../../phases/README.md#deferred--adoption-gated-backlog-from-the-beyond-phases-synthesis) and
`ai-agent`'s own [routing table](../../phases/ai-agent/README.md#routing--what-stays-out): local-SLM /
vision fallback / MCP server are **Phase 1b**; **true parallel background runs** are `ai-agent`'s
**own named backlog item** (not Phase 1b's parallel-DAG — a different concurrency shape, see the
Capability inventory); structured extraction is **S5**; the CAPTCHA/2FA handoff shape is **ADR-0039**.
Several rows below are "sharpen an existing phase with this detail," not "add a phase," and a few are
"this phase or track already names the exact lesson — cite `docs/research-computer-use-agents.md`, do
not re-derive it here."

## Ground rules — parity, not imitation

Five Nova Act design choices are **deliberately not being matched**, because matching them would violate
a standing decision this repo already made after deliberation. Naming them here once, so no future
session re-proposes them by accident:

1. **No delegating a danger-class or HITL-trigger decision to the model.** Nova Act's `state_guardrail`
   is deterministic and pre-model — a genuinely good idea — but its **entire input is one field**,
   `GuardrailInputState(browser_url: str)`; it cannot see the action, the target element, or whether the
   step is a financial transfer. The actual "should I ask a human" decision is made by two
   **model-callable** tools, `human_Approve`/`human_UiTakeover`, whose trained description tells the model
   to call them "when the task requires it" — and the default implementation (`DefaultHumanInputCallbacks`)
   raises `NoHumanInputToolAvailable`, i.e. **HITL is fail-open unless a developer wired it themselves.**
   Nova Act's MCP integration (via Strands) has the same shape one layer up: tool schemas go to the
   server, and **the closed server-side model** decides whether to call them, with no local policy gate.
   ADR-0006 already chose the opposite architecture for exactly this reason — danger class
   (`read`/`state_changing`/`destructive`/`financial`) + taint + target site is evaluated by a
   **model-_before_** `PolicyKernel`, autonomy can only skip the _prompt_ the kernel already decided to
   ask, never the deny itself, and `@tepegoz/agent-runtime`'s two-stage HITL is fail-**safe** (no response
   = deny) by explicit design. ADR-0018 keeps the same rule for MCP: an external tool re-enters the one
   PEP, it does not get a server-side bypass. Keep the kernel-before-model ordering; do not adopt a
   model-callable approval gate. (Nova Act's `human_UiTakeover` naming — a live, synchronous hand-back of
   full control, distinct from an asynchronous approval prompt — is a useful **UX vocabulary** worth
   keeping; `docs/research-computer-use-agents.md` already captured it as a note for
   [S8](../../phases/ai-agent/phase-s8-assistant-ux.md) — see the Capability inventory row below. The naming
   is worth keeping; the _trigger_ (the model decides when to invoke it) is not.)
2. **No vendor agent SDK, no Python-sidecar-plus-second-browser-actuation shape.** This is the master
   rejection the comparison's own closing note calls out: Nova Act's SDK is a Python process that drives
   a **separate Playwright-controlled Chromium** under a **closed** model, and the action set is `@final`
   — "Ensures that function signatures / descriptions are never modified during override and exactly
   match the model's expected format," i.e. the surface is locked to what the closed model was trained
   on. `ai-agent`'s own ["Never" list](../../phases/ai-agent/README.md#never-inherited--program-additions)
   already names this exact class and its verdict is explicit: "Python sidecar / second Chromium / vendor
   agent SDKs (`browser-use`/`nanobrowser` = **port techniques, never adopt**)." Nova Act is that class,
   even though its packaging (a hosted AWS service, not an open-source extension) is different from
   `browser-use`/`nanobrowser`. The typed `Planner→Executor→Reactor` with a typed `Decision`
   (ADR-0013) stays; no sidecar, no second browser process, no closed-model actuation loop.
3. **No `execute_js`-class CLI convenience, no silently-permissive network default.** `act browser`'s
   `evaluate` command runs arbitrary JavaScript in the page, and `--ignore-https-errors` ships **on by
   default** — both listed as warnings in Nova Act's own CLI README, not hidden, but still shipped as
   defaults. ADR-0026 already measured an isolated-world code-exec sandbox for exactly this class of
   capability and the sandbox was **refuted** by measurement (not merely deferred); ADR-0029 draws the
   line that DevTools-class capability is user-only, never an agent tool. ADR-0044's Site Info /
   connection-security surface exists specifically so a TLS problem is _shown_, never silently accepted.
   Do not add an `execute_js` tool or a default that swallows a certificate warning.
4. **No screenshot-every-step-to-cloud perception, no "collect screenshots to improve the service"
   default.** Nova Act's `takeObservation` sends a full-page screenshot on **every** step to a closed
   service, and its own Disclosure #4 states the API-key tier "collect[s] information on interactions
   with Nova Act, **including in-browser screenshots**, to develop and improve our services." This is
   simultaneously the exact shape `ai-agent`'s "Never" list forbids ("**screenshots-every-step**
   vision") and a direct conflict with ADR-0008 (DOM/a11y-first perception, vision **escalation-only**)
   and this repo's local-first/sovereignty stance (Phase 8, Phase 11 — a Türkiye-based, KVKK-conscious
   product does not default to sending every screen to `us-east-1` for vendor model improvement). Vision
   stays escalation-only and, as recorded honestly below, **ships inert today** — that is a bug to fix by
   wiring the existing S10 mechanism, not a reason to reach for Nova Act's always-on screenshot model.
5. **No chasing seed/temperature reproducibility as a substitute for statistical evaluation.** Nova Act
   exposes `model_temperature`/`model_top_k`/`model_seed` so a run can be repeated bit-for-bit. Tepegöz's
   `constitution.md` already made a different, considered choice for the same underlying problem (model
   output is not deterministic): Wilson confidence intervals over pooled family aggregates, flaky-result
   tagging, and a claim-bearing N≥10 rule, rather than trying to pin the model's sampling. A seed knob is
   not a rejection of anything ADR-numbered, but it is worth naming here so a future session doesn't treat
   "add a seed parameter" as a fix for eval flakiness the constitution already has a real answer for — see
   the Backlog entry below if a debug-only passthrough is ever wanted for its own sake.

None of these are "Nova Act did it wrong." Nova Act is a hosted, single-vendor, single-model product
aimed at engineering teams running fleets of scripted workflows at scale — a different product, for a
different buyer, that reasoned about the same trade-offs (the CLI README's own security warnings, the
"monitor Nova Act and review its actions" prompt-injection disclosure) and, having no native process and
no policy kernel of its own, chose to put the safety burden on the developer instead. The point of naming
these here is that a future reader of this track shouldn't reopen a decision that was already made for a
documented reason.

---

## Capability inventory

Legend for **Home**: an existing phase/ADR/track name means "already planned or already the site of the
decision — this row sharpens it or reinforces it, no new work opens here." **NEW** means no existing plan
owns it and this track proposes one. **Ground rules #N** means deliberately not matched. **n/a** means
the row is a reinforcement of an existing decision (evidence _for_ it), not an action item.

| #   | Nova Act capability                                                                                                                                                                                                                                                                                                                                                                                                   | Nearest Tepegöz behaviour today                                                                                                                                                                                                                                                                                                                                          | Gap                                                                                                                                                                                             | Home                                                                                                                                                                                                                                            |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Single supported model, no swap (FAQ: _"The SDK only works with the Nova Act model"_) — the vendor lock-in ADR-0005 was written to prevent                                                                                                                                                                                                                                                                            | 8 providers + `local`, one `CanonRequest`/`CanonResponse` schema, `ModelRouter` capability→tier mapping, BYO-key vault                                                                                                                                                                                                                                                   | — (Nova Act's constraint, not a capability to adopt)                                                                                                                                            | **n/a** — the clearest live counter-example for why ADR-0005 exists                                                                                                                                                                             |
| 2   | `model_temperature`/`model_top_k`/`model_seed` for bit-for-bit repeatable runs                                                                                                                                                                                                                                                                                                                                        | No sampling-determinism knobs in `CanonRequest`; nondeterminism handled statistically (Wilson CIs, flaky tags, N≥10)                                                                                                                                                                                                                                                     | A debug-only passthrough could exist, but doesn't replace evaluation                                                                                                                            | **Ground rules #5**; optional passthrough → **Backlog**                                                                                                                                                                                         |
| 3   | Screen actuation from a model trained specifically for it; ScreenSpot/GroundUI Web numbers claimed in a blog post, **not verifiable from the repo**                                                                                                                                                                                                                                                                   | General-purpose provider models + DOM/a11y-first perception; no screen-actuation benchmark of our own                                                                                                                                                                                                                                                                    | Unknown, possibly real — cannot be turned into a workstream from an unverifiable claim                                                                                                          | **n/a** — no action without independent measurement                                                                                                                                                                                             |
| 4   | `takeObservation`: screenshot + `simplifiedDOM` (fixed attribute allowlist, `nova-act-id`) + `idToBboxMap`, model answers in 0–1000-normalized bbox coordinates                                                                                                                                                                                                                                                       | DOM/a11y-first refs (ADR-0008) + diff/dedupe/elision; vision escalation-only, **ships inert today** — `captureVision` has no production caller (no `TEPEGOZ_VISION` flag was ever implemented; see the 2026-09-02 correction in [`phase-s10-vision-escalation.md`](../../phases/ai-agent/phase-s10-vision-escalation.md))                                                | Nova Act's path works and is shipped; Tepegöz's architecture is sounder but unwired                                                                                                             | **S10** (already planned — this row restates the "inert, not just gated" fact, adds no new scope)                                                                                                                                               |
| 5   | 11 actions, all `@final` (locked to the model's trained format); no tab/download/upload/clipboard/file tool — escape to raw Playwright                                                                                                                                                                                                                                                                                | ~30 tools through one PEP (`browser_*`/`tab_*`/`web_*`/`file_*`/`clipboard_*`/`download_*`/`upload_*`/`task_*`)                                                                                                                                                                                                                                                          | — (deliberately opposite trade-offs; Tepegöz already broader)                                                                                                                                   | **n/a** — confirms ADR-0007's single-tool-plane approach, nothing to port                                                                                                                                                                       |
| 6   | `state_guardrail` (deterministic, pre-model, but input = URL only) + model-callable `human_Approve`/`human_UiTakeover`, fail-open if unimplemented                                                                                                                                                                                                                                                                    | Model-**before** deterministic `PolicyKernel` (danger class + taint + site), `isSensitiveSite` hard-deny at every autonomy level, fail-**safe** two-stage HITL                                                                                                                                                                                                           | — (Nova Act's shape is the one being rejected)                                                                                                                                                  | **Ground rules #1**                                                                                                                                                                                                                             |
| 7   | `human_UiTakeover` naming: a live, synchronous full-control hand-back, distinct from an async approval prompt                                                                                                                                                                                                                                                                                                         | Human Handoff Controller (CAPTCHA/2FA → hand back, ADR-0039); today's handoff is "stop and wait," not a live takeover-then-resume flow                                                                                                                                                                                                                                   | A named second HITL pattern for the UX layer                                                                                                                                                    | **S8** (sharpen — vocabulary already captured in [`docs/research-computer-use-agents.md`](../research/research-computer-use-agents.md) lesson 1; not re-derived here)                                                                           |
| 8   | 4-class error taxonomy (`ActAgentError`/`ActExecutionError`/`ActClientError`/`ActServerError`), cut along "who can retry"                                                                                                                                                                                                                                                                                             | Reactor's typed `Decision` (continue/retry/replan/stop) + the retry/recovery taxonomy (policy denial / stale selector / page change / nav timeout / auth handoff / transient / malformed output), cut along "what should happen"                                                                                                                                         | A cross-check, not a rebuild — two orthogonal cuts over the same failures                                                                                                                       | **S3 Reactor** (sharpen — already captured in [`docs/research-computer-use-agents.md`](../research/research-computer-use-agents.md) lesson 3; not re-derived here)                                                                              |
| 9   | `requires_unlocked_actuator_context` — a custom tool that needs to drive the browser directly gets a temporary, auto-reverting lock/unlock of the agent's own driving hooks                                                                                                                                                                                                                                           | No tool drives the browser directly outside the PEP today; not yet a live scenario                                                                                                                                                                                                                                                                                       | A clean boundary _if_ a future MCP or custom tool ever needs direct driving                                                                                                                     | **ADR-0018 / ToolGateway PEP** (backlog note — captured in [`docs/research-computer-use-agents.md`](../research/research-computer-use-agents.md) lesson 2; relevant only if that scenario is ever built, not now)                               |
| 10  | 4 session-persistence providers (local JSON 0600 **unencrypted**, S3 SSE-KMS, AgentCore profiles, Chromium profile) + an OWASP/NIST-cited cookie-vs-localStorage-vs-IndexedDB risk table; localStorage restore **opt-in**, off by default                                                                                                                                                                             | Native browser profile/session model; no equivalent per-profile risk write-up yet                                                                                                                                                                                                                                                                                        | The specific hygiene decision (localStorage restore off by default) and the risk table shape                                                                                                    | **`multi-profile-isolation.md`** (sharpen — already the proposed home for per-profile session/cookie isolation; lesson also named in [`docs/research-computer-use-agents.md`](../research/research-computer-use-agents.md) lesson 4)            |
| 11  | Real concurrent browser sessions — multiple `NovaAct` instances run in parallel in-process (thread-based; not multi-process, boto3 sessions don't pickle)                                                                                                                                                                                                                                                             | **Single run at a time** (ADR-0013); durable resume / parallel DAG not shipped                                                                                                                                                                                                                                                                                           | Genuine, shipped concurrency                                                                                                                                                                    | **`ai-agent`'s own backlog** — "True parallel background runs" (relaxes ADR-0013, needs a superseding ADR + real isolation), see [routing table](../../phases/ai-agent/README.md#routing--what-stays-out) — already named, not re-proposed here |
| 12  | `act_get()` — response validated against a caller-supplied JSON Schema (`ActInvalidModelGenerationError` on mismatch); format validation only, no claim-vs-page verification                                                                                                                                                                                                                                          | `CompletionEvidence` + deterministic downgrade (a claim the page contradicts cannot become `done`) + trap fixtures + Checked/Unconfirmed/Contradicted badges; S5's own goal already names "structured table/list extraction"                                                                                                                                             | The specific shape — schema-validated structured _GET_, distinct from S4's claim verification                                                                                                   | **S5** (sharpen — add JSON-Schema-validated extraction to its existing DoD, do not open a new phase)                                                                                                                                            |
| 13  | Act-scoped, self-contained **HTML visual trace** (step-by-step screenshots with drawn bboxes + tool calls/results) + `_traces.json`, optional full-session **video**, serializable `Trajectory` (`active_url`+`image`+`simplified_dom`+`program` per step), `S3Writer` artifact upload, CloudWatch+OTel when deployed to AgentCore, an honestly-caveated `time_worked` metric ("approximate, do not use for billing") | Replay timeline UI in `ext-agent` (already shipped) + event-sourced Journal + `journal_search_events`; **Notary** (ADR-0030) is written and tested but **not wired into a live run** — `@tepegoz/notary` has no importer in `apps/desktop`, no migration adds chain columns, no signing key exists in `safeStorage`; "none of it is wired" per Phase 7's own status note | A portable, human-readable, exportable "what happened in this run" artifact — distinct from Notary's cryptographic proof (which today produces nothing) and from a third-party integration hook | **NEW — P1**, extends Phase 7 / ADR-0030, sibling to [`skyvern-agent-parity.md`](skyvern-agent-parity.md)'s already-proposed P1 (signed webhooks + optional OTel hook) — two different consumers of the same Journal stream                     |
| 14  | `@tool` decorator (Python function → model tool) + Strands `MCPClient` for external tools; tool-call decision made **server-side, by the closed model**, no local policy re-check                                                                                                                                                                                                                                     | `@tepegoz/mcp-client` (ADR-0018): external MCP tools enter `CapabilityRegistry` and pass the **same PEP** every built-in tool does; `McpSupervisor` reconnect + `MAX_TOOLS_PER_SERVER`; `dangerClassFor` defaults an unknown annotation to the most restrictive class                                                                                                    | — (Nova Act's shape is the one being rejected)                                                                                                                                                  | **Ground rules #1** (extension — MCP tool-call authority stays local, not server-side)                                                                                                                                                          |
| 15  | 41-command `act browser` CLI (19 navigation / 10 extraction / 8 session / 4 setup), IDE plugin (chat-to-script, step debugging), hosted playground, `devtoolsFrontendUrl` live headless inspection                                                                                                                                                                                                                    | Agent Console (in-product UX only); no developer CLI/IDE/playground surface                                                                                                                                                                                                                                                                                              | A whole developer-tooling category                                                                                                                                                              | **Out of category** (Routing) — Tepegöz is a consumer browser, not a developer automation library; no analogous surface is planned                                                                                                              |
| 16  | Gherkin `.feature` → CLI-plan compiler (`qa-plan`), steps needing login/CAPTCHA/OTP auto-tagged `requires: human_auth`                                                                                                                                                                                                                                                                                                | Planner-produced DAG + plan preview; `@tepegoz/recipe-compiler` (Phase 6) for deterministic, signed, model-free replay                                                                                                                                                                                                                                                   | An alternate _authoring format_ for a developer-facing QA tool, not an end-user capability                                                                                                      | **Out of category** (Routing) — cite Phase 6 as the nearest concept if ever revisited, no work opened                                                                                                                                           |
| 17  | `Workflow` context manager / `@workflow` decorator — iteration/branching/retry written directly in Python around sequential `act()` calls                                                                                                                                                                                                                                                                             | Planner→Executor→Reactor DAG + `@tepegoz/tasks` saved triggers + `@tepegoz/recipe-compiler`                                                                                                                                                                                                                                                                              | — (a developer-library authoring model vs. an end-user product's own orchestration)                                                                                                             | **Out of category** (Routing) — nothing to port                                                                                                                                                                                                 |
| 18  | `--ignore-https-errors` default-on, `evaluate` arbitrary JS in the CLI (both self-flagged as risky in Nova Act's own README)                                                                                                                                                                                                                                                                                          | ADR-0026 (isolated-world sandbox refuted), ADR-0029 (DevTools user-only), ADR-0044 (connection-security surfaced, never silenced)                                                                                                                                                                                                                                        | — (rejected, not a gap)                                                                                                                                                                         | **Ground rules #3**                                                                                                                                                                                                                             |
| 19  | `takeObservation` sends a full screenshot every step to a closed cloud service; API-key tier collects those screenshots "to develop and improve our services" (Disclosure #4)                                                                                                                                                                                                                                         | Diff/elision-first perception; vision escalation-only (today inert); no screenshot leaves the device except on an explicit, budgeted escalation                                                                                                                                                                                                                          | — (rejected, not a gap)                                                                                                                                                                         | **Ground rules #4**                                                                                                                                                                                                                             |
| 20  | No offline mode — structurally impossible; every step round-trips to Amazon; service region is `us-east-1` only                                                                                                                                                                                                                                                                                                       | `@tepegoz/local-inference` (node-llama-cpp) + sha256-verified GGUF catalog; weak today but _possible_, unlike Nova Act                                                                                                                                                                                                                                                   | — (the comparison's own framing: this is a possibility gap, not a maturity gap)                                                                                                                 | **n/a** — confirms Phase 8/S12's sovereignty bet; no new action, existing phases already own it                                                                                                                                                 |
| 21  | English only (_"Note: Nova Act supports English"_); no i18n in the source tree at all                                                                                                                                                                                                                                                                                                                                 | Per-package EN+TR parity enforced in the same PR (ADR-0016); ≥10 Turkish-web tasks required in the H2H protocol (S11)                                                                                                                                                                                                                                                    | — (no contest)                                                                                                                                                                                  | **n/a** — confirms ADR-0016, nothing to adopt                                                                                                                                                                                                   |
| 22  | Site-per-site guidance is left to the developer's own prompt text; no adapters shipped                                                                                                                                                                                                                                                                                                                                | No agent site-adapter system either (Phase 2's adapters are official-API integrations, a different concept)                                                                                                                                                                                                                                                              | Both absent                                                                                                                                                                                     | **n/a** — draw; if ever picked up, [`webbrain-agent-parity.md`](webbrain-agent-parity.md) **P4** already proposes the Tepegöz-conformant shape, not re-proposed here                                                                            |
| 23  | Known Limitations section, CLI security warnings, an honestly-caveated `time_worked` metric — an unusually candid operational-honesty culture for a commercial SDK                                                                                                                                                                                                                                                    | `agent-eval` ground-truth harness + statistical constitution + PROSE-LEDGER + anti-debt rule + refusable north-star claim (`bridgeClaim`)                                                                                                                                                                                                                                | — (both honest, different apparatus, nothing to port)                                                                                                                                           | **n/a**                                                                                                                                                                                                                                         |

---

## P1 — Portable session trace export (NEW, extends Phase 7 / ADR-0030)

**Goal.** Give a person a **human-readable, exportable, single-artifact record of what an agent run
actually did** — the thing Nova Act genuinely ships and Tepegöz doesn't yet, in any form. This is
explicitly **not** a re-ask of Notary (which answers "can a third party cryptographically verify this
run happened as claimed," and today answers nothing, because it isn't wired into a live run) and
**not** a re-ask of [`skyvern-agent-parity.md`](skyvern-agent-parity.md)'s already-proposed P1 (signed
outbound webhooks + an optional OpenTelemetry hook, which answers "can an external system be notified and
plug in its own tracing"). All three are legitimate, different consumers of the **same** append-only
Journal event stream, and this workstream is the third one: **a local, self-contained visual export for
a human looking at their own run**, the direct answer to Nova Act's shipped HTML trace + `_traces.json` +
`Trajectory` serialization.

**What Nova Act actually built (verified).** Every `act()` call produces a self-contained HTML file with
per-step screenshots (bounding boxes drawn over the acted-on element), the tool call and its result, and
a companion `_traces.json`; `replayable=True` additionally serializes a `Trajectory` — `active_url` +
`image` + `simplified_dom` + `program` per step — as a portable, inspectable record; `record_video=True`
captures the full session; an `S3Writer` stop-hook uploads artifacts to the caller's own bucket
(SSE-KMS); a `time_worked` metric is reported with an explicit, honest caveat ("approximate — human
wait-time subtracted; do not use for billing").

**Approach.**

- **Reuse what already captures the evidence — do not build a second capture path.** `ext-agent`'s
  replay timeline and the event-sourced Journal already record every step (tool call, arguments, result,
  approval decision); `browser_get_screenshot`/S10's escalation path is the existing screenshot source.
  This workstream is a **packaging/export layer** on top of data already collected, not a new observation
  mechanism — mirrors the "artifact export, not a new event source" framing
  [`skyvern-agent-parity.md`](skyvern-agent-parity.md) P1 already used for its own webhook workstream.
- **A single "Export run" action** on a completed or failed run in `ext-agent`, producing one
  self-contained file (or a small self-contained bundle: HTML + referenced local images) covering: the
  step sequence, each step's tool call/result, any screenshot already captured for that step (drawn
  bounding box included where the step targeted an element, reusing whatever coordinate data the
  perception layer already resolved), the plan-preview decision, and any HITL prompt/response —
  Nova Act's HTML-trace shape is worth copying closely, since it is a solved, legible UX for this exact
  problem.
- **Video is explicitly out of scope for a first DoD.** Nova Act's video export assumes a session
  recording capability Tepegöz does not have today; rather than build a new recording subsystem to match
  it, this workstream ships the screenshot+journal export first and names a full-session recording as a
  clearly separate, larger follow-up (see Backlog).
- **`time_worked`-style honesty, if a duration is shown at all:** if the export surfaces any wall-clock or
  cost figure, it must carry the same kind of caveat Nova Act's own docs give it — Tepegöz's own
  cost/wall-clock discipline ([S7](../../phases/ai-agent/phase-s7-speed.md)) already has the real numbers;
  this workstream should read from there, not invent a parallel estimate.
- **Trust boundary:** the export is a **read** of already-collected, already-redacted Journal/screenshot
  data — no new secret-handling surface, no new egress path (the file is saved locally, not
  auto-uploaded; an `S3Writer`-equivalent cloud-upload option is explicitly **not** part of this
  workstream's DoD and would need its own review if ever proposed).

**New/changed packages:** a small export module inside `extensions/ext-agent` (consumes the existing
Journal + replay-timeline data) or a sibling package to `@tepegoz/notary` if the packaging logic is
judged reusable enough to be Electron-free and shared; no changes to `@tepegoz/notary` itself, no changes
to the PolicyKernel or ToolGateway.

**ADR:** an addendum to **ADR-0030** (NotaryService / Phase 7), explicitly distinguishing three consumers
of the same Journal stream in one place — **(a)** Notary's cryptographic Replay Receipt (proof, currently
unwired), **(b)** Skyvern-track P1's signed webhook + optional OTel hook (third-party notification/
integration), **(c)** this workstream's local human-readable export (a person looking at their own run) —
so a future contributor reads all three together and doesn't rebuild one as the others.

**DoD shape (draft, for whichever session promotes this):**

- [ ] "Export run" on a completed or failed run produces one self-contained artifact viewable with no
      Tepegöz install (plain HTML + local image references, opened in any browser) — matching Nova Act's
      own "no special viewer needed" property
- [ ] The export contains only data already in the Journal/replay-timeline/screenshot store for that run
      — a test asserts no new capture path was added and no field is fabricated at export time
- [ ] Any screenshot included in the export was captured through the existing S10 escalation path (or is
      absent) — the export does not become a backdoor reason to screenshot more often
- [ ] Any wall-clock/cost figure shown in the export is sourced from S7's existing measurement, carrying
      the same accuracy caveats S7 already states, not a new estimate
- [ ] The export never includes a raw secret or an unredacted credential-adjacent value — same redaction
      discipline the Journal already applies
- [ ] i18n: the "Export run" action, any in-export labels, and the honesty caveat text get EN+TR parity
      in the owning package's dict (ADR-0016)
- [ ] Full-session video capture is explicitly **out of this DoD** — named in Backlog, not silently
      dropped

---

## Backlog (named, not written up)

- **Debug-only per-call temperature/seed passthrough** — a small `CanonRequest` extension so a developer
  reproducing a bug can pin sampling on providers that support it. Real, but explicitly **not** a
  substitute for the constitution's statistical machinery (Ground rules #5); worth doing only if a
  concrete debugging need shows up, not proactively.
- **Full-session video recording of an agent run** — the natural follow-up to P1 once a recording
  subsystem exists for some other reason (e.g. if Phase 10's daily-driver work ever adds screen/tab
  recording); do not build a bespoke recorder just for this.
- **A written session-persistence risk note inside `multi-profile-isolation.md`** — Nova Act's OWASP/
  NIST-cited cookie-vs-localStorage-vs-IndexedDB table and its "localStorage restore is opt-in, off by
  default" decision are worth citing verbatim the next time that track is picked up; small, folds into an
  existing proposed track rather than opening a new one.

---

## Routing — what this track does not own

Per the existing convention ([`../README.md`](../../phases/README.md#deferred--adoption-gated-backlog-from-the-beyond-phases-synthesis)
/ [`ai-agent/README.md`](../../phases/ai-agent/README.md#routing--what-stays-out)), reference these,
never duplicate them:

| Stays with                                 | Material                                                                                                                                              |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Phase 1b**                               | MCP server surface, vision fallback, local-SLM — not touched by this track                                                                            |
| **`ai-agent`'s own backlog**               | **True parallel background runs** (relaxes ADR-0013) — Nova Act's concurrency win maps here, not to Phase 1b's DAG                                    |
| **S5**                                     | Structured table/list extraction — this track adds only "schema-validated GET" as a detail                                                            |
| **S8**                                     | Assistant UX / HITL patterns — the `human_UiTakeover` naming is a note here, not a new subsystem                                                      |
| **S10**                                    | Vision escalation — already recorded as shipping inert; this track adds no new scope, only restates the fact                                          |
| **`multi-profile-isolation.md`**           | Per-profile session/cookie isolation — the session-persistence hygiene note folds in there                                                            |
| **ADR-0005 / ADR-0016**                    | Provider-agnostic gateway, per-package i18n — reinforced, not extended                                                                                |
| **ADR-0006 / ADR-0018**                    | Pre-model Policy Kernel, MCP client — the boundary this track's Ground rules #1 defends                                                               |
| **ADR-0026 / ADR-0029 / ADR-0044**         | `execute_js`/DevTools boundary, connection-security surfacing — not reopened (Ground rules #3)                                                        |
| **`webbrain-agent-parity.md` P4**          | Site-guidance adapters — cited, not re-proposed (row 22)                                                                                              |
| **`skyvern-agent-parity.md` P1**           | Signed webhooks + OTel hook — this track's P1 is its sibling, not its duplicate                                                                       |
| **`docs/research-computer-use-agents.md`** | HITL-pattern naming, error-taxonomy cross-check, "actuator lock," session-provider abstraction — linked from the Capability inventory, not re-derived |

## ADRs owed (no number reserved)

- **P1:** addendum to **ADR-0030** (NotaryService / Phase 7) — records the three-consumer split (Notary
  proof / Skyvern-track webhook+OTel / this track's human-readable export) over the same Journal stream.

No number is reserved here; per this repo's own multi-profile-track lesson
([`multi-profile-isolation.md`](../tracks/multi-profile-isolation.md) — an ADR-number collision from writing a plan
too far ahead of when it's actually opened), the number gets assigned at the point a session actually
starts the work, not now.
