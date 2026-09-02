# Track — UI-TARS Desktop agent-capability parity

**Status:** 📋 **Proposed — not scheduled (2026-09-01).** No branch, no ADR number reserved, no owner
sign-off. This is a captured gap list in the shape of
[`webbrain-agent-parity.md`](webbrain-agent-parity.md) and [`aipex-agent-parity.md`](aipex-agent-parity.md):
every row names its nearest existing Tepegöz behaviour and a suggested phase home, so a future session
can promote a row into a real `phase-*.md` task or an `ai-agent` PR without re-deriving the
comparison.

**Source:** a same-session deep read of `.junk/ui-tars-desktop` (ByteDance's Apache-2.0 **UI-TARS
Desktop** — a shipping GUI/computer-use agent driven by the UI-TARS vision-language model, plus **Agent
TARS**, a general multimodal agent living in the same monorepo) against this repo's AI surface
(`phases/ai-agent/`, `packages/orchestrator|model-gateway|capability-plane|security-policy|
agent-runtime|browser-tools|web-tools|tool-executor|local-inference|model-catalog|mcp-client|
recipe-compiler|macro-engine|notary|credential-vault|human-input`, `extensions/ext-agent`). The prose
comparison this track distills is
[`docs/others/tepegoz-vs-ui-tars-desktop.md`](../versus/tepegoz-vs-ui-tars-desktop.md) (Turkish,
2026-09-01); this file is the durable English track artifact. Key claims were re-verified against
source, not taken on the comparison doc's word: `packages/ui-tars/sdk/src/GUIAgent.ts` (the
`while(true)` loop, `asyncRetry`, `MAX_LOOP_COUNT`/`MAX_SNAPSHOT_ERR_CNT`), `packages/ui-tars/sdk/src/
constants.ts` (the ~15-line system prompt, the 10-action space, `MAX_PIXELS`/`DEFAULT_FACTORS`),
`packages/ui-tars/operators/browser-operator/src/browser-operator.ts` (screenshot-only perception —
"highlight clickable elements, then screenshot," never a DOM read), `apps/ui-tars/src/main/ipcRoutes/
permission.ts` (non-macOS returns `{screenCapture:true, accessibility:true}` unconditionally — no real
permission gate at all off macOS), and `packages/agent-infra/browser-use/README.md` (its own
acknowledgement of browser-use/nanobrowser/puppeteer as technical references for Agent TARS's DOM-side
browser tools).

**A correction to this repo's own AI-surface summary, made explicit here because this track leans on
Phase 7 below:** `@tepegoz/notary` is written and unit-tested, but **`apps/desktop` does not import it.**
The only occurrence of the string "notary" anywhere under `apps/desktop/src` is a doc-comment in
`browser-host.electron.ts`; there is no `@tepegoz/notary` import, and `apps/desktop/package.json` does
not depend on the package. No run today produces a real Replay Receipt. Say "written but not wired," not
"Tepegöz has Notary" — `phases/README.md`'s own Phase 7 row already says this correctly ("landed... not
wired into a live run"); this track's P3 below inherits that exact constraint.

## Why this track exists

The comparison lands on an asymmetry sharper than the other rival tracks: **UI-TARS Desktop is not
mainly a browser agent competing on the same axis as Tepegöz — it is a shipping, model-centric GUI/
computer-use agent (screenshot in, pixel coordinate out) that happens to also drive a browser, sitting
next to Agent TARS, a separate general multimodal agent (terminal + code + browser + MCP) in the same
monorepo.** Most of what makes UI-TARS Desktop _look_ ahead — computer-wide OS control, a published VLM
with a peer-reviewed paper and HF weights, a code/terminal sandbox — is either a different product
category Tepegöz is not building, or a capability this repo's own ADRs already rejected after
deliberation (screenshot-every-step vision, unconstrained code execution). What survives that filter is
thin, which is the honest outcome for a category-mismatched rival, not an oversight: this track's job is
to say, for the few UI-TARS/Agent TARS capabilities that are genuinely good, on-axis, and missing, _does
Tepegöz already have a seam for this, and if not, what would the Tepegöz-conformant version look like_ —
never "port the JS," always "re-derive the capability inside the existing kernel/PEP/i18n/coverage
discipline."

## How to read this

Each workstream below is written like an `ai-agent` phase section (Goal → Approach → new/changed
packages → ADR → DoD-shaped bullets) so it can be lifted into a real phase file with minimal rewriting.
**Nothing here is committed roadmap.** Where a capability already has a named home in an existing phase,
ADR, or a sibling track ([`webbrain-agent-parity.md`](webbrain-agent-parity.md) /
[`aipex-agent-parity.md`](aipex-agent-parity.md)), this file cites it and does **not** re-describe it.
Per the "Already planned — do NOT re-propose" rule in
[`../README.md`](../../phases/README.md#deferred--adoption-gated-backlog-from-the-beyond-phases-synthesis) and the
sibling tracks already covering it in depth, provider-catalog breadth is `webbrain` P1 / `aipex` P3, and
the MCP **server** direction is Phase 1b / `aipex` P1 — several rows below just point there.

## Ground rules — parity, not imitation

Six UI-TARS Desktop / Agent TARS design choices are **deliberately not being matched**, because matching
them would violate a standing decision this repo already made after deliberation, or fall outside the
product category Tepegöz is building. Naming them here once, so no future session re-proposes them by
accident:

1. **No screenshot-every-step, vision-coordinate perception as the primary path.** UI-TARS Desktop's
   entire perception model is "take a screenshot, feed the last 5 frames to a VLM, parse
   `click(start_box='[x1,y1,x2,y2]')`, drive the mouse to a normalized coordinate" — verified in
   `GUIAgent.ts` and `constants.ts`. Even its **browser** operator never reads the DOM: it highlights
   clickable elements, then screenshots (`browser-operator.ts`, `highlightClickableElements` →
   `screenshot()`). Tepegöz already decided this the other way: DOM/a11y-first perception (ADR-0008),
   vision **escalation-only** (owned by S10), and `ai-agent`'s own "Never" list forbids
   screenshots-every-step outright. Every row below that touches vision sharpens S10's existing
   escalation design; none of them make vision the default path.
2. **No immediate, no-consent action execution.** UI-TARS Desktop drives the real mouse and keyboard the
   moment a task starts — there is no pre-action policy gate, only `pause()`/`stop()` after the fact and
   the model's own `call_user()` if it decides it is stuck. `apps/ui-tars/src/main/ipcRoutes/
permission.ts` confirms the "permission" story is thinner still: on Windows/Linux it returns
   `{ screenCapture: true, accessibility: true }` unconditionally, no OS check at all. ADR-0006
   (deterministic Policy Kernel, pre-model) and ADR-0013 (two-stage, fail-safe HITL) already chose the
   opposite: every state-changing tool call passes `policy → HITL → execute`, and non-response is a deny,
   not a proceed. Not adopted.
3. **No raw-instruction telemetry to a vendor server.** UI-TARS Desktop's optional **UTIO** channel
   reports `appLaunched`/`sendInstruction` (the literal task text) /`shareReport` to a ByteDance-operated
   endpoint. Tepegöz's local-first design and its Journal redaction discipline exist precisely to keep
   task content — which routinely contains PII, credentials-adjacent context, or business-sensitive
   intent — off a third party by default. Not adopted, opt-in or not.
4. **No computer-wide OS GUI control.** UI-TARS Desktop's `nut-js`-backed `LocalComputer` operator drives
   _any_ desktop application — VS Code, OS settings, games — not just the browser. This is a category
   difference (Tepegöz is a browser, not an OS agent), and it is not a gap Tepegöz should close even in
   principle: the Policy Kernel's `requiredHosts`/origin model has nothing to gate an OS-level action
   against — there is no origin. Out of scope, structurally, not just by product choice.
5. **No `execute_js` / terminal / code-editor tool.** Agent TARS's `omni-tars` composition ships
   `ExecuteBash`, `JupyterCI`, `StrReplaceEditor`, and website-deploy tools as MCP-backed capabilities.
   ADR-0026 already measured this path for Tepegöz (isolated-world sandbox **refuted**) and ADR-0029
   already drew the DevTools-class-capability line at user-only, never an agent tool. Not adopted — same
   ground rule the `webbrain` and `aipex` tracks already state.
6. **No vendor agent framework, and no adopting the browser-use/nanobrowser lineage a second time.**
   Agent TARS's loop runs on "Tarko," a bespoke framework — not itself a third-party vendor SDK — but
   its own `packages/agent-infra/browser-use/README.md` explicitly credits **browser-use** and
   **nanobrowser** as technical references for its DOM-side browser tools. `ai-agent`'s "Never"
   list already states the rule this repo follows for that lineage: _port techniques, never adopt the
   SDK._ Tepegöz's typed Planner→Executor→Reactor stays; nothing here reopens that choice.

None of these are "UI-TARS did it wrong." UI-TARS Desktop is optimized for a different bet entirely — a
published, benchmark-validated VLM driving an entire desktop with no native process and no policy kernel
in the way — and Agent TARS's own composable, multi-strategy design shows a team that reasoned carefully
about trade-offs Tepegöz reasoned about differently. The point of naming them is that a future reader of
this track shouldn't reopen a decision that was already made for a documented reason.

---

## Capability inventory

Legend for **Home**: an existing phase/ADR name (or a sibling track's workstream) means "already planned
or already covered, this row cites it, no new work needed here." **NEW** means no existing plan owns it
and this track proposes one. **Ground rules #N** means deliberately not matched.

| #   | UI-TARS Desktop / Agent TARS capability                                                                                                                                                                | Nearest Tepegöz behaviour today                                                                                                                                                       | Gap                                                                                          | Home                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 1   | Screenshot-every-step, pixel-coordinate perception as the primary (only, for UI-TARS Desktop) path                                                                                                     | DOM/a11y-first perception (ADR-0008); vision escalation-only (S10, ships inert)                                                                                                       | — (deliberately not matched)                                                                 | **Ground rules #1**                                                                                         |
| 2   | No pre-action consent — the agent drives the real mouse/keyboard immediately; permission check hardcoded true off macOS                                                                                | Deterministic Policy Kernel pre-model (ADR-0006) + two-stage fail-safe HITL (ADR-0013)                                                                                                | — (deliberately not matched)                                                                 | **Ground rules #2**                                                                                         |
| 3   | UTIO telemetry — optional, sends the raw task instruction to a ByteDance endpoint                                                                                                                      | Journal redaction discipline; no task-content telemetry                                                                                                                               | — (deliberately not matched)                                                                 | **Ground rules #3**                                                                                         |
| 4   | Computer-wide OS GUI control (`nut-js` `LocalComputer` — VS Code, OS settings, arbitrary apps)                                                                                                         | Browser-only; Policy Kernel is origin-scoped                                                                                                                                          | — (category exclusion)                                                                       | **Ground rules #4**                                                                                         |
| 5   | Agent TARS `omni-tars`: `ExecuteBash`/`JupyterCI`/`StrReplaceEditor`/deploy tools                                                                                                                      | `execute_js`/terminal/code-editor tools do **not** exist (ADR-0026 refuted; ADR-0029 DevTools user-only)                                                                              | — (deliberately not matched)                                                                 | **Ground rules #5**                                                                                         |
| 6   | Tarko agent framework; Agent TARS's own credited browser-use/nanobrowser lineage                                                                                                                       | Typed Planner→Executor→Reactor (own design)                                                                                                                                           | — (deliberately not matched)                                                                 | **Ground rules #6**                                                                                         |
| 7   | Agent TARS ~13–14 model providers (openai/anthropic/gemini/mistral/groq/perplexity/openrouter/azure-openai/ollama/lm-studio/volcengine/deepseek), mostly normalized to one OpenAI-compatible interface | 8 hand-written adapters (`AIProvider` union) + `local`                                                                                                                                | Breadth + a generic OpenAI-compatible adapter                                                | **`webbrain` P1 / `aipex` P3** (already planned)                                                            |
| 8   | UI-TARS Desktop's own documented path to self-host the VLM (HF weights / vLLM / Ollama, OpenAI-compatible endpoint) so screen data never leaves the machine                                            | `@tepegoz/local-inference` (node-llama-cpp) + `@tepegoz/model-catalog`; S10 vision escalation has no documented local/self-hosted backend                                             | A local/self-hosted endpoint option specifically for the (currently inert) vision tier       | **P1 (NEW, small — extends S10, reuses `webbrain` P1's HTTP-engine-variant pattern)**                       |
| 9   | Agent TARS: MCP client **and** server, in-process core MCP servers (browser/filesystem/commands)                                                                                                       | MCP **client** only (ADR-0018); no server surface                                                                                                                                     | The opposite direction — already named, already detailed                                     | **Phase 1b / `aipex` P1** (already planned, DoD already drafted there)                                      |
| 10  | Free click-to-run Remote Computer / Remote Browser operators (partly being sunset)                                                                                                                     | BYO-key only; no zero-setup default                                                                                                                                                   | Managed, key-free default                                                                    | **Phase 3** (already planned)                                                                               |
| 11  | Per-failure-class retry matrix (`async-retry`: model 5, screenshot 5, execute 1) + `MAX_SNAPSHOT_ERR_CNT=10` global abort counter                                                                      | `reactor-progress.ts`'s per-`(failure.kind, tool)` `recoveryCounts` (resets on that tool's next success) + the no-progress stall/replan tracker + the identical-read streak guard     | — (Tepegoz's is more finely scoped: per tool _and_ per failure kind, not one global counter) | n/a — **Tepegöz already ahead**, verified in `packages/orchestrator/src/reactor.ts` / `reactor-progress.ts` |
| 12  | `pause()`/`resume()`/`stop()` + `AbortSignal`; UI reflects a live run that can keep going unattended                                                                                                   | Backgroundable runs + tray continuation (S8, shipped)                                                                                                                                 | —                                                                                            | **S8** (already shipped)                                                                                    |
| 13  | `maxLoopCount` user-configurable in Settings (default 100, range 25–200)                                                                                                                               | `maxSteps` hard cap in the reactor (default 25) — exists, not user-visible or user-configurable                                                                                       | A visible, adjustable step budget + "N steps left" affordance                                | **P2-a (sharpen S8, small)**                                                                                |
| 14  | Agent TARS's Event Stream Viewer — per-tool-call timing/latency stats alongside the run's event log, for debugging                                                                                     | Replay timeline ships (`extensions/ext-agent`) with evidence badges, but no per-call timing surfaced                                                                                  | Timing/latency stats on the existing timeline                                                | **P2-b (sharpen S8, small — extends the shipped replay timeline)**                                          |
| 15  | "Export as HTML" / Share — a standalone, human-readable run report anyone can open without the app                                                                                                     | Notary (ADR-0030): hash-chain + Ed25519-signed checkpoint + Replay Receipt + `tepegoz-verify` CLI — **written and tested, not imported by `apps/desktop`, no run produces one today** | A human-readable, shareable export view once Notary is actually wired to a live run          | **P3 (sharpen Phase 7 — explicitly GATED behind Notary reaching wired-in, per anti-debt)**                  |
| 16  | SoM overlay / click-position marker / "water flow" visual effect during actions                                                                                                                        | `@tepegoz/human-input` (Catmull-Rom curves, Gaussian jitter — anti-bot motion, not user-facing feedback)                                                                              | A user-visible "the agent is acting here" affordance                                         | **Backlog** (S8 delight; converges with `aipex-agent-parity.md`'s "fake-mouse" backlog item)                |
| 17  | `@ui-tars/sdk` — a cross-platform SDK for third parties to build their _own_ GUI-agent operators (mobile/ADB/browserbase)                                                                              | n/a — Tepegöz ships a product, not an agent-building SDK                                                                                                                              | — (different product genre)                                                                  | **Not applicable** — no action                                                                              |
| 18  | `omni-tars` — a composable single agent combining code + GUI + MCP tool families                                                                                                                       | Single orchestrator, no multi-agent composition                                                                                                                                       | Multi-agent / composable agent                                                               | **`phases/README.md` deferred backlog — "multi-agent crews"** (already named, second-order enrichment)      |

---

## P1 — Local/self-hosted endpoint for the vision-escalation tier (NEW, small; extends S10)

**Goal.** UI-TARS Desktop's one genuinely portable, on-axis idea for Tepegöz is not its vision-coordinate
_paradigm_ (rejected, Ground rules #1) but the fact that it has a **documented, working path to run the
VLM itself locally** — point the app at a self-hosted HF/vLLM/Ollama endpoint and screenshots never leave
the machine. Tepegöz's vision-escalation tier (S10) exists and is architecturally more disciplined
(deterministic triggers, token-budgeted downscale, set-of-marks over identity-stable refs rather than raw
pixel coordinates — see `phase-s10-vision-escalation.md` PR3) but it ships **inert** because it was never
wired into production — Reactor's `captureVision?` callback is optional and no production caller passes
it; there is no `TEPEGOZ_VISION` flag (correction dated 2026-09-02 in `phase-s10-vision-escalation.md`) —
and it has no documented local/self-hosted backend option once it _is_ wired up.
This closes that one specific gap without touching S10's trigger design or its mark-based (not
coordinate-based) output contract — Tepegoz's vision path stays escalation-only and ref-grounded; only
_which server answers the escalation call_ gains a local option.

**Approach.**

- Reuse `webbrain-agent-parity.md` P1's planned `OpenAICompatibleProvider` + HTTP-engine-variant work
  (Ollama `/api/`, llama.cpp `/v1/`, LM Studio `/v1/`) rather than building a second local-transport
  layer — add a **vision-capable** local endpoint as one more catalog entry the vision-escalation call
  site (S10) can select, the same way `ModelRouter`'s capability→tier mapping already selects between
  cloud and `local` for the text tiers.
- Vision-model detection stays a catalog property (a `visionCapable`/`visionRegex` flag on the entry),
  not a hardcoded per-provider branch — same pattern `webbrain` P1 already proposes for chat providers.
- S10's own downscale/set-of-marks pipeline (`packages/screenshots`) is untouched: the image still gets
  the same token-budgeted downscale and the same ref-id overlay before it reaches _any_ provider, local
  or cloud. This workstream only adds a transport, never a new image-encoding contract.
- Document, as UI-TARS Desktop's own settings UI does, that a local vision endpoint is **BYO** — not
  bundled, not downloaded by `@tepegoz/model-catalog` on the user's behalf — matching the existing
  "we don't manage the proxy" stance `webbrain` P1 already states for the chat-tier equivalent.

**New/changed packages:** `@tepegoz/model-gateway` (a `visionCapable` catalog flag, shared with
`webbrain` P1's catalog work), `@tepegoz/local-inference` (the HTTP-engine-variant `webbrain` P1 already
proposes, reused here rather than duplicated). No change to `packages/screenshots` or S10's trigger logic.

**ADR:** an addendum to **ADR-0005** (provider-agnostic gateway) — the same addendum
`webbrain-agent-parity.md` P1 already proposes; this row adds the vision-capability flag to it, no new
number.

**DoD shape (draft):**

- [ ] A local vision-capable endpoint (e.g. a self-hosted Ollama multimodal model) can be selected as the
      backend for an S10 escalation call, end-to-end, with no change to the trigger/downscale/set-of-marks
      pipeline
- [ ] `maxTokens`/`timeoutMs` remain mandatory for the local vision call (the `ModelGateway.complete()`
      invariant is not relaxed for a local backend)
- [ ] Explicitly **gated behind S10's own gate being open** (S10's capability ships inert today because
      it was never wired — `captureVision` has no production caller — not because a flag is switched off,
      so that wiring work is still owed) — this workstream adds a backend option, it does not itself open
      the gate or do the wiring
- [ ] i18n: the local vision-endpoint form in Settings gets EN + TR parity

---

## P2 — Small assistant-UX sharpens (extends S8)

### P2-a — Visible, adjustable step budget

The reactor already hard-caps a run at `maxSteps` (default 25, `packages/orchestrator/src/reactor.ts`) —
UI-TARS Desktop's contribution here is not the cap itself (Tepegöz already has one) but making it a
**user-visible, user-adjustable** Settings value with a live "N steps left" affordance in the Agent
Console, the way UI-TARS Desktop exposes `maxLoopCount` (25–200) in its settings panel. Small, additive:
surface the existing cap, do not change its default or its fail-closed behavior at the limit.

### P2-b — Per-tool-call timing on the existing replay timeline

Agent TARS's Event Stream Viewer pairs each tool call with its latency in a debug view. Tepegöz's replay
timeline (`extensions/ext-agent`, already shipped) shows steps and evidence badges but not per-call
timing. Add a timing/latency column to the existing component — no new subsystem, no new data path (the
audit journal already timestamps every tool call).

**New/changed packages:** `extensions/ext-agent` (Settings-surfaced step budget + live counter; a timing
column on the replay timeline), `@tepegoz/agent-runtime` (surface the existing `maxSteps` value to the
renderer if not already exposed).

**DoD shape (draft, both sub-items):**

- [ ] The Agent Console shows the configured step budget and a live remaining-steps count during a run
- [ ] Changing the step budget in Settings changes the reactor's `maxSteps` for the next run (bounded to a
      sane range, e.g. 10–100 — Tepegoz's own ceiling, not a copy of UI-TARS's 200)
- [ ] The replay timeline shows each step's tool-call latency, sourced from the existing audit-journal
      timestamps — no new instrumentation
- [ ] i18n: EN + TR for the step-budget label, the remaining-steps affordance, and the timing column header

---

## P3 — Human-readable, shareable run-report export (sharpen Phase 7 — Notary)

**Goal.** UI-TARS Desktop's "Export as HTML" / Share gives a user a standalone report anyone can open
without the app installed — no cryptography, no verification, just a readable record of what happened.
Tepegöz's answer to "prove what happened" is architecturally stronger — Notary's hash-chained,
Ed25519-signed checkpoints + portable Replay Receipt + independent `tepegoz-verify` CLI — but **that
answer does not exist in a running app today.** `@tepegoz/notary` is fully written and unit-tested
(`canonical-json.ts`, `checkpoint.ts`, `hash-chain.ts`, `receipt-schema.ts`, `replay-receipt.ts`, `cli.ts`
— all with co-located tests) and `phases/README.md`'s own Phase 7 row already says it plainly: "landed...
not wired into a live run." Verified again for this track: the only mention of "notary" anywhere under
`apps/desktop/src` is a doc-comment, not an import, and `apps/desktop/package.json` carries no
`@tepegoz/notary` dependency. **No run today produces a Replay Receipt of any kind**, human-readable or
otherwise. This workstream is explicitly _not_ "add an HTML export" as a standalone feature — it is "once
a future session wires Notary into a live run (Phase 7's own remaining DoD work, not this track's), add a
human-readable rendered view of the Replay Receipt it produces" — a UI layer on Phase 7's existing,
already-designed data shape, not a new report format invented from scratch.

**Approach.**

- No new report schema. The rendered HTML view is a presentation of the **existing** `ReplayReceipt`
  shape (`packages/notary/src/receipt-schema.ts`) — steps, evidence, hash chain, signature — not a
  parallel, less-rigorous export path. Where UI-TARS Desktop's HTML report is the _only_ record of a run,
  Tepegöz's version is a _view onto_ the cryptographically verifiable one; the receipt itself remains the
  source of truth, `tepegoz-verify` remains the independent check.
- Render locally (no server round-trip, matching this repo's local-first default) into a static,
  self-contained HTML file a user can send to anyone — the same "no app required to view it" property
  UI-TARS Desktop's export has, gained without losing verifiability, since the underlying receipt/signature
  data can still be checked by `tepegoz-verify` independently of the pretty view.
- **Do not build the sharing/telemetry side.** UI-TARS Desktop's report flow includes a "report storage
  server" and UTIO integration; per Ground rules #3, Tepegoz's version stays a local file export with no
  default upload path.

**New/changed packages:** a small rendering module inside `@tepegoz/notary` or a thin consumer in
`extensions/ext-agent` (whichever session does the wiring should decide based on where the live receipt
actually lands first) — no change to `packages/notary`'s existing hash-chain/signature/schema code.

**ADR:** an addendum to **ADR-0030** (Notary Service), recording the human-readable export view as a
Phase 7 DoD detail. It does **not** relax or substitute for Phase 7's actual remaining work — wiring
`@tepegoz/notary` into `apps/desktop` so a live run produces a receipt at all.

**DoD shape (draft):**

- [ ] **Explicitly gated behind Phase 7 wiring `@tepegoz/notary` into a live run first** (per the
      anti-debt rule — this workstream does not open while the capability it renders a view of does not
      yet exist in the running app)
- [ ] The exported HTML is a rendering of the real `ReplayReceipt`, not a second, independently-generated
      summary — a test proves the rendered content matches `tepegoz-verify`'s own parsed view of the same
      receipt
- [ ] No network call is made by the export itself (local file only, no default upload — Ground rules #3)
- [ ] i18n: the export affordance and the rendered report's own chrome (labels, evidence badges) get EN +
      TR parity

---

## Backlog (named, not written up)

- **"Agent is acting here" on-screen action indicator** — UI-TARS Desktop's click-position marker /
  water-flow effect gives the user live visual confirmation of where the agent is about to act, distinct
  in purpose from `@tepegoz/human-input`'s Catmull-Rom motion curves (anti-bot realism, not user
  feedback). Converges with `aipex-agent-parity.md`'s "fake-mouse" backlog item — fold into whichever
  session next does S8 delight work rather than opening two near-identical items.
- **`@ui-tars/sdk`-style third-party operator SDK** — a different product genre (a toolkit for building
  new GUI agents, not a capability of Tepegöz's own agent). No daily-driver pull for this product; not
  pursued.
- **`omni-tars` composable multi-agent** — already named in `phases/README.md`'s deferred backlog
  ("multi-agent crews," a second-order enrichment riding a parent phase). No new entry needed here.

---

## Routing — what this track does not own

Per the existing convention ([`../README.md`](../../phases/README.md#routing--what-stays-out) /
[`ai-agent/README.md`](../../phases/ai-agent/README.md#routing--what-stays-out)), reference these,
never duplicate them:

| Stays with                                           | Material                                                                                                                                                             |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Phase 1b**                                         | MCP **server** surface — `aipex-agent-parity.md` P1 already carries the detailed DoD (Bearer + rate-limit + PEP re-pass); this track adds nothing new to that design |
| **Phase 3**                                          | The managed, key-free zero-setup cloud default — UI-TARS Desktop's free Remote Computer/Browser operators are the closest analog                                     |
| **`webbrain-agent-parity.md` P1**                    | `OpenAICompatibleProvider` + provider catalog + the local HTTP-engine-variant pattern — P1 here reuses it for the vision tier, does not redefine it                  |
| **S10 (`phase-s10-vision-escalation.md`)**           | Escalation triggers, token-budgeted downscale, set-of-marks — all untouched; P1 here only adds a transport option once the gate is open                              |
| **S8 (`phase-s8-assistant-ux.md`)**                  | Backgroundable runs, the replay timeline itself, evidence badges — P2 only adds a budget display and a timing column to what already ships                           |
| **Phase 7 (`phase-7-verifiable-accountability.md`)** | The Notary hash-chain/signature/receipt mechanism itself — P3 only adds a rendered view once wiring lands, and does not substitute for that wiring                   |
| **ADR-0026 / ADR-0029**                              | The `execute_js` / code-execution / DevTools boundary — Ground rules #5 keeps it closed                                                                              |
| **`ai-agent/README.md` "Never" list**                | screenshot-every-step vision, vendor agent SDKs / `browser-use`-`nanobrowser` lineage — Ground rules #1 / #6                                                         |
| **`phases/README.md` deferred backlog**              | multi-agent crews (the `omni-tars` analog)                                                                                                                           |

## ADRs owed (numbers assigned when a session actually opens one of these)

- **P1:** the **ADR-0005 addendum** `webbrain-agent-parity.md` P1 already proposes — this track adds a
  `visionCapable` catalog flag to the same addendum, no new number.
- **P2:** none — pure Settings/UI work through the existing `docs/adding-a-tool.md`-adjacent i18n
  discipline, no Policy Kernel or PEP change.
- **P3:** an **ADR-0030 addendum** (Notary Service) recording the human-readable export view as a Phase 7
  DoD detail — written only once Phase 7's own wiring work is scheduled, not before.

No number is reserved here; per this repo's own multi-profile-track lesson
([`multi-profile-isolation.md`](../tracks/multi-profile-isolation.md) — an ADR-number collision from writing a plan
too far ahead of when it's actually opened), the number gets assigned at the point a session actually
starts the work, not now.
