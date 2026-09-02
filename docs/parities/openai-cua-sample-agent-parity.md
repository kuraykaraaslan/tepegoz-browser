# Track — OpenAI CUA Sample agent-capability parity

**Status:** 📋 **Proposed — not scheduled (2026-09-02).** No branch, no ADR number reserved, no owner
sign-off. This is a captured gap list in the shape of
[`browser-settings-feature-gap.md`](../tracks/browser-settings-feature-gap.md) and
[`webbrain-agent-parity.md`](webbrain-agent-parity.md): every row names its nearest existing Tepegöz
behaviour and a suggested phase home, so a future session can promote a row into a real `phase-*.md` task
or an `ai-agent` PR without re-deriving the comparison.

**Source:** a same-session deep read of
[`docs/others/tepegoz-vs-openai-cua-sample.md`](../versus/tepegoz-vs-openai-cua-sample.md) (the
full "who does what better" comparison against `.junk/openai-cua-sample` — OpenAI's own MIT-adjacent
`gpt-5.4` computer-use sample app: a Next.js operator console + Fastify runner over three synthetic local
labs) plus this repo's AI surface, **and** [`docs/research-computer-use-agents.md`](../research/research-computer-use-agents.md)
(a companion note on "SDK-open, service-closed" agent samples that names the specific patterns worth
mining from this one: `packages/replay-schema`'s artifact contracts, the "readable even if the runner
crashed" principle, the scenario-manifest + goal-state-verification pattern, and the `native`-vs-`code`
execution-mode split). This session additionally re-verified the comparison's claims directly against
source rather than trusting the write-up alone: `.junk/openai-cua-sample`'s `README.md`,
`docs/architecture.md`, `docs/scenarios.md`, `packages/replay-schema/src/index.ts`,
`packages/scenario-kit/src/scenarios.ts`, and `packages/runner-core/src/{errors,responses-loop}.ts` on the
rival side; `packages/agent-eval/src/{scenario-registry,scorer}.ts`,
`packages/shared-types/src/eval-scenario.ts`, `docs/adr/0030-notary-service.md`, and
`phases/ai-agent/phase-s10-vision-escalation.md` on this repo's side (confirming, among other things,
that no `package.json` other than `packages/notary`'s own declares `@tepegoz/notary` as a dependency, and
that `captureVision` in `packages/orchestrator/src/{reactor-types,reactor}.ts` is an optional callback with
no production caller).

## Why this track exists

Unlike the WebBrain comparison, this one is **not** an asymmetry of capability breadth — the comparison's
own framing calls it a category mismatch: OpenAI CUA Sample App is a vendor reference implementation for a
closed, single-vendor computer-use model (`gpt-5.4` + the Responses API `computer` tool), running three
synthetic local labs, versioned `0.0.0`, built from private packages, with a README that states outright
"[the public scenarios] are not intended as proofs of general web autonomy." Architecturally, the
comparison finds Tepegöz ahead almost everywhere that is actually comparable: provider-agnosticism (8
providers + local vs. one hard-wired vendor), tool repertoire and typing (~49 typed tools behind one PEP
vs. 9 coordinate primitives or one all-powerful `exec_js`), where security lives (a deterministic
Policy Kernel _before_ the model vs. a post-hoc, unimplemented `pending_safety_checks` acknowledgement),
autonomy/HITL, sandboxing, MCP, memory/skills, and Turkish/i18n. The two places the sample is ahead
**today** are about **execution, not design**: it actually produces a replay artifact on every run (while
Tepegöz's considerably stronger design — Notary's hash-chained, Ed25519-signed Replay Receipt — is real,
tested code that `apps/desktop` has never wired in), and its three narrow verifiers actually run and pass
(while most of Tepegöz's own measurement debt sits unswept, which is `ai-agent`'s problem to close,
not this track's). This track is deliberately **narrower than the WebBrain one**: it names the few
genuinely-adoptable execution-discipline lessons, credits what the sample gets right as independent
validation of decisions Tepegöz already made, and explicitly rejects — with the ADR that already settled
it — the parts a future reader should not be tempted to copy.

## How to read this

Each workstream below is written like an `ai-agent` phase section (Goal → Approach → new/changed
packages → ADR → DoD-shaped bullets) so it can be lifted into a real phase file with minimal rewriting.
**Nothing here is committed roadmap.** This track carries only **two** workstreams, on purpose — the
comparison's own conclusion is that most of what the sample does well is already superseded by an existing
Tepegöz design, and most of what looks unfinished on the Tepegöz side is a measurement gap `ai-agent`
already owns, not a missing capability this track should re-propose.

## Ground rules — parity, not imitation

Four things the sample app does are **deliberately not being matched**, because matching them would
violate — or, in one case, quietly undermine — a standing decision this repo already made. Naming them
here once, so no future session re-proposes them by accident:

1. **No `code` mode / `exec_js` Playwright REPL.** The sample's `code` execution mode gives the model a
   persistent JavaScript REPL with real `browser`/`context`/`page` handles inside the runner's own Node
   process — `vm.createContext` is a global-scope separator, not a security boundary, and the model can
   `page.goto` anywhere and carry state across turns via `globalThis`. ADR-0026 already measured this
   shape of thing for Tepegöz and **refuted** the isolated-world sandbox it originally specified; ADR-0029
   already drew the line that DevTools-class capability is user-only, never an agent tool. `browser_analyze_page`
   (`code_exec_read`, a read-only page **copy** under `default-src 'none'` CSP) stays the sanctioned analog;
   nothing gains a live-page execution tool.
2. **No pixel-coordinate vision as the primary (only) perception channel.** The sample's `native` mode
   sends a full-resolution screenshot on every turn and drives the browser purely off model-produced pixel
   coordinates against a fixed 1440×900 viewport — no DOM, no accessibility tree, no element reference.
   `ai-agent`'s own "Never" list already forbids screenshot-every-step vision, and ADR-0008 already
   bet the other way: DOM/a11y-first perception, vision as **escalation only**. This bet is not proven —
   S10 currently ships **inert** (`captureVision` is an optional callback with no production caller,
   confirmed this session in `reactor-types.ts`/`reactor.ts`) — but the fix is wiring S10's existing
   trigger machinery, not adopting coordinate-vision as the default channel.
3. **No model-declared, post-hoc safety gate.** The Responses API's `pending_safety_checks` contract asks
   the _client_ to show a risky action to the operator and relay back an acknowledgement — and in this
   sample the gate is not even implemented (`unsupported_safety_acknowledgement`), while the code that
   _would_ implement it runs the click/type/drag actions **first** and only inspects `pending_safety_checks`
   afterward, in `buildComputerCallOutput`. Even a fully-implemented version of this pattern would still be
   backwards: the thing it's meant to stop has already happened by the time it fires. ADR-0006 already
   chose the opposite ordering — the Policy Kernel runs **before** the model and **before** dispatch, `deny`
   is absolute, and autonomy can never flip it. Nothing about this pattern gets adopted, in any order.
4. **No optional / default-off verification.** `runner-manager.ts` defaults `verificationEnabled` to
   `false`, and the console's own help text says to "leave this off to treat the model's completed action
   loop as the success condition." S4's `CompletionEvidence` + deterministic downgrade exists precisely so
   this can't happen by construction — an agent cannot talk a contradicted claim into `done`, and there is
   no toggle that lets it. Fabricated-success ≈ 0 is one of the program's four north-star conditions
   ([`ai-agent/README.md`](../../phases/ai-agent/README.md)); a togglable verifier would be a regression
   against it, not a feature to match.

None of these are "the sample did it wrong" in isolation — it's an unauthenticated demo pointed at three
synthetic labs, and its own README says plainly not to point it at anything real. The point of naming them
is that a future reader of this track, seeing a clean, working reference implementation, shouldn't reach
for the pattern without noticing it was already considered and rejected for a written reason.

---

## Capability inventory

Legend for **Home**: an existing phase/ADR name means "already planned or already the same shape, this
row sharpens or confirms it, no new work needed here." **NEW** means this track proposes a small addition.
A **Ground rules** reference means the capability is deliberately not being matched.

| #   | OpenAI CUA Sample capability                                                                                                                                                                                                 | Nearest Tepegöz behaviour today                                                                                                                                                                                                                                         | Gap                                                                                                                                                                                                                                       | Home                                                                                                                        |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 1   | Per-run replay bundle: workspace-scoped `events.jsonl` (append-only) + numbered screenshots + a `replay.json`, produced on **every** run, readable even if the runner is offline                                             | Event-sourced Journal (ADR-0004, append-only at the DB layer) + `AgentRunCheckpoint`/`resumeCheckpoint()` (written, never read back) + `@tepegoz/notary`'s already-written but unimported receipt shapes                                                                | Nothing today assembles a single, portable, human-shareable artifact per run — Notary's signed version is real but unwired (confirmed: no `package.json` besides its own depends on it), and no unsigned artifact fills the gap meanwhile | **P1 (sharpens Phase 7's owed wiring; addendum to ADR-0030)**                                                               |
| 2   | Field-by-field ground-truth comparison, expected values parsed from named fields in the operator prompt (`readPromptField`, `assertBookingOutcome`)                                                                          | `EvalSuccessSchema` (`domAssertion` / `expectedValue`, single-string case-insensitive substring checks only, per `scorer.ts`)                                                                                                                                           | No structured multi-field record assertion — a scenario needing "hotel AND guest AND email AND dates all correct" has no first-class way to say so without a fragile concatenated string                                                  | **P2 (NEW, small — extends `@tepegoz/agent-eval`)**                                                                         |
| 3   | Scenario manifest (zod-schema'd, data-driven registry) feeding one verification pipeline regardless of execution mode ("verification is the same either way because it reads the final lab state, not the agent transcript") | `EvalScenarioFileSchema`-driven JSON registry (`scenario-registry.ts`) + ground-truth-first `scorer.ts`, already mode-agnostic; the paired with/without-arm sweep methodology in `ai-agent/constitution.md` is the same "one fixture, one verifier, compare arms" shape | None — already the same design                                                                                                                                                                                                            | **Already covered** (cite `@tepegoz/agent-eval`)                                                                            |
| 4   | `code` mode: live-page `exec_js` Playwright REPL                                                                                                                                                                             | `browser_analyze_page` (`code_exec_read`, read-only page-copy sandbox)                                                                                                                                                                                                  | N/A — deliberately not matched                                                                                                                                                                                                            | **Ground rules #1 — ADR-0026/ADR-0029**                                                                                     |
| 5   | `native` mode: pixel-coordinate vision as the only perception channel                                                                                                                                                        | DOM/a11y-first perception (ADR-0008) + escalation-only vision (S10, currently inert)                                                                                                                                                                                    | N/A — deliberately not matched                                                                                                                                                                                                            | **Ground rules #2 — ADR-0008/S10**                                                                                          |
| 6   | `pending_safety_checks`: model-declared, post-hoc, unimplemented safety acknowledgement                                                                                                                                      | Deterministic Policy Kernel, pre-model, pre-dispatch (ADR-0006)                                                                                                                                                                                                         | N/A — deliberately not matched                                                                                                                                                                                                            | **Ground rules #3 — ADR-0006**                                                                                              |
| 7   | `verificationEnabled` defaults off; model's own completion claim is the fallback success condition                                                                                                                           | `CompletionEvidence` + deterministic downgrade (S4), no toggle exists                                                                                                                                                                                                   | N/A — deliberately not matched                                                                                                                                                                                                            | **Ground rules #4 — S4**                                                                                                    |
| 8   | Six configurable knobs (model, turn budget, mode, headless/headful, verification, `CUA_RESPONSES_MODE`), single vendor, `effort` hard-coded                                                                                  | 5 effort levels + `ModelRouter` capability→tier + 8 cloud providers + `local`, mandatory `maxTokens`/`timeoutMs` per call                                                                                                                                               | None — Tepegöz already ahead                                                                                                                                                                                                              | **Already covered** (cite ADR-0005)                                                                                         |
| 9   | `RunnerCoreError{code, hint, statusCode}`, console maps codes to actionable titles, stays legible when the runner is offline                                                                                                 | code-claude Faz 5 retry/recovery taxonomy (policy denial / stale selector / page change / nav timeout / auth handoff / transient / malformed model output) — already folded into Phase 1a/1b                                                                            | None — already the same shape                                                                                                                                                                                                             | **Already covered** (cite [`../README.md`](../../phases/README.md#completed-hardening-track-folded-into-phases-1a--1b--2c)) |

---

## P1 — Run replay bundle: a concrete, unsigned precursor to Notary's wiring (sharpens Phase 7)

**Goal.** Give every agent run one portable, human-readable artifact — even before Notary's signed chain
is wired in — using the sample's shipped pattern as the concrete reference for what "wired" should
eventually look like. Tepegöz's own answer to this problem is real, tested, and considerably stronger by
design (`hash-chain.ts`, `checkpoint.ts`, `replay-receipt.ts`, `tepegoz-verify` CLI), but ADR-0030 states
in writing that none of it is connected: no migration adds chain columns to the `events` table,
`EventJournal.append` computes no `selfHash`, and no key is generated via `safeStorage`. Confirmed again
this session — `packages/notary` is the only `package.json` in the repo that depends on `@tepegoz/notary`.

**Approach.**

- Borrow the **shape**, not the trust model. The sample's `runId`-scoped mutable workspace + append-only
  `events.jsonl` + numbered `screenshot-NNN.png` files + a single `replay.json` (run record + scenario +
  full event list + artifact paths) is a genuinely well-designed, boring format for exactly the property
  `docs/research-computer-use-agents.md` names as worth copying: it stays readable even if the runner
  crashes mid-write, because JSONL survives a crash mid-append in a way a single mutable JSON object does
  not. Tepegöz's event-sourced Journal (ADR-0004) already has the append-only property at the storage
  layer; what's missing is an **export** step that walks one run's journal rows into a self-contained
  bundle.
- Label it honestly as a **debug/support artifact, not a proof**. It carries no hash chain and no
  signature, and the export UI must say so explicitly — this is the whole reason it stays a small addition
  rather than a redesign: it must never be mistaken for, or quietly substitute for, the Replay Receipt
  Notary exists to produce. Ground rules #4 above is the same discipline applied to a different axis
  (verification, not accountability) — don't let a lesser artifact pass as the real one.
- The natural implementation seam is the diagnostic-bundle export already shipping in `extensions/ext-agent`
  (`exportLog`, cited in the WebBrain track's inventory row 20) — extend its shape toward the sample's
  rather than building a second exporter: bundle = run record + ordered event list + referenced screenshot
  files (already captured by `@tepegoz/screenshots` on vision-escalation or `browser_get_screenshot` calls)
  - the final `CompletionEvidence`.
- If and when Phase 7 resumes and Notary gets wired, this same bundle shape becomes the payload the hash
  chain covers — building it now is not wasted work if that lands later, and is a strict improvement over
  today's nothing if it doesn't.

**New/changed packages:** `extensions/ext-agent` (extend the existing `exportLog` path). No changes to
`@tepegoz/notary` itself — its algorithmic core stays exactly as designed for whenever Phase 7's own owed
wiring work is picked up.

**ADR:** addendum to ADR-0030 — record explicitly that an unsigned debug bundle is a separate, lesser
artifact from the Replay Receipt, so a future contributor doesn't conflate "we export something" with "we
proved something."

**DoD shape (draft):**

- [ ] Export produces one self-contained file per run — run metadata, full ordered event list, screenshot
      references — openable without the app running
- [ ] The exported file and its UI are labeled unsigned/debug-grade; no copy anywhere calls it a "proof" or
      "receipt"
- [ ] Explicitly gated behind Phase 7's own status: this is captured detail for whenever a session resumes
      Phase 7 (currently **frozen out of v1** per `phases/README.md`'s ship line) — not a call to open
      Phase 7 now, per the anti-debt rule
- [ ] i18n: any new export label/warning text ships EN+TR in `ext-agent`'s own `src/i18n/{en,tr,index}.ts`

---

## P2 — Structured, multi-field ground-truth assertions (NEW, small — extends `@tepegoz/agent-eval`)

**Goal.** Close a narrow authoring gap this session found by comparing source directly: the sample's
booking verifier parses the operator prompt into named fields (`hotel`, `check_in`, `guest_name`, …) and
compares the live confirmation record **field-by-field**, so a failure says exactly which field was wrong.
Tepegöz's `EvalSuccessSchema` (`packages/shared-types/src/eval-scenario.ts`) supports only a single
`domAssertion` substring check and/or a single `expectedValue` substring check, both matched by
case-insensitive inclusion (`scorer.ts`). A scenario whose success genuinely depends on several
independent fields matching — a filled form, a multi-field confirmation record — has no first-class way to
say so today: it either concatenates expectations into one long string (fragile — field order or
formatting in the rendered page can break the check for reasons that have nothing to do with the agent's
competence) or is split into several scenarios that no longer share one run.

**Approach.**

- Add an optional structured field map alongside the existing `domAssertion`/`expectedValue` in
  `EvalSuccessSchema` — additive, not a replacement; every existing scenario file keeps parsing and scoring
  unchanged.
- `scorer.ts` gains one more check: when the field map is present, every named field's expected substring
  must independently appear in the finalPageText, and each field is reported as its **own** pass/fail line
  in the score result — mirroring the sample's per-field comparison, which is what makes its failures
  diagnosable rather than one opaque "assertion failed."
- Ground-truth-first design stays intact: this is a sharper **string** check, not a new judge or a new
  success channel — `judgeRubric` remains the LLM-judge fallback it already is, untouched.
- Worth remembering, not required for this DoD: the sample derives its expected field values by
  **mechanically parsing** them out of the same prompt text handed to the model (`readPromptField`), which
  is what keeps its prompt and its assertion from silently drifting apart. A future session could let a
  scenario's field values reference named placeholders already present in its own `task` string so a lint
  step could catch drift — noted here so it isn't lost, not designed now.

**New/changed packages:** `@tepegoz/shared-types` (`EvalSuccessSchema` extension), `@tepegoz/agent-eval`
(`scorer.ts` field-check).

**ADR:** none. This is a scenario-schema and tooling change inside a dev-only package that is never
shipped with the app (`@tepegoz/agent-eval` is `private`), governed by the eval harness's own
`constitution.md`/`fixture-freeze.md`, not by an architecture ADR.

**DoD shape (draft):**

- [ ] The new field map is optional and fully backward-compatible — every existing scenario file parses
      and scores exactly as before
- [ ] A scenario with 2+ fields reports each field's pass/fail independently in the score result, not one
      merged boolean
- [ ] At least one existing (or one new) multi-field scenario is migrated to the field map as a worked
      example
- [ ] Unit-tested in `scorer.test.ts`; no sweep owed — this is deterministic string-matching, the same tier
      as the checks it extends

---

## Backlog (named, not written up)

- **User-adjustable step/turn budget per run.** The sample exposes a 4–50 turn slider next to its other
  advanced-settings controls. Tepegöz's orchestrator has an internal step ceiling but nothing surfaced to
  the user in `extensions/ext-agent` today (checked this session — no `maxSteps`/`turnBudget` string
  anywhere in the extension's source). Small, real, not urgent; fold into whichever session next touches
  Agent Console settings rather than opening a phase for it alone.

---

## Routing — what this track does not own

Per the existing convention ([`../README.md`](../../phases/README.md#routing--what-stays-out) /
[`ai-agent/README.md`](../../phases/ai-agent/README.md#routing--what-stays-out)), reference these, never
duplicate them:

| Stays with                                       | Material                                                                                                                                                                                                                     |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Phase 7**                                      | NotaryService wiring (the signed Replay Receipt) — P1 sharpens its DoD with a concrete precursor shape, does not schedule or reopen it; Phase 7 stays frozen out of v1                                                       |
| **S4**                                           | `CompletionEvidence` / fabricated-success ≈ 0 — already the correct-by-construction answer to the sample's optional-verification anti-pattern (Ground rules #4)                                                              |
| **ADR-0006**                                     | Model-before-not-inside Policy Kernel — not revisited (Ground rules #3)                                                                                                                                                      |
| **ADR-0008 / S10**                               | DOM/a11y-first perception, escalation-only vision — not revisited (Ground rules #2); S10 stays measurement-owed and ships inert regardless of this track                                                                     |
| **ADR-0026 / ADR-0029**                          | `execute_js`/DevTools boundary — not revisited (Ground rules #1)                                                                                                                                                             |
| **`@tepegoz/agent-eval`'s existing methodology** | Data-driven scenario registry, ground-truth-first scoring, paired with/without-arm sweeps — already the same shape as the sample's manifest + verifier pattern; P2 sharpens one schema detail, does not redesign the harness |

## ADRs owed (numbers assigned when a session actually opens one of these)

- P1: addendum to **ADR-0030** (an unsigned debug bundle is explicitly not the Replay Receipt)
- P2: none — a scenario-schema change inside a dev-only, never-shipped package, governed by
  `ai-agent/constitution.md`, not an architecture ADR

No number is reserved here; per this repo's own multi-profile-track lesson (`multi-profile-isolation.md`
— an ADR-number collision from writing a plan too far ahead of when it's actually opened), the number gets
assigned at the point a session actually starts the work, not now.
