# Phase S10 — Vision, Escalation-Only (W2 Perception)

**Status:** 🟡 In progress (PR0–PR1 landed 2026-08-19) · **Depends on:** [S1](phase-s1-foundation-native-loop.md) (multimodal `CanonMessage` image blocks) · gate threshold pre-registered in [S0](phase-s0-truth-and-repair.md) · **Track:** [AI Agent Super](README.md)

**Goal:** Add vision as an **escalation fallback** per [ADR-0008](../../docs/adr/) — never every step — for the pages the DOM/a11y path structurally cannot see: canvas/webgl surfaces, closed shadow roots, cross-origin iframes, and image-only controls. Deterministic triggers in the reactor decide when a step is blind; only then does a **token-budgeted, downscaled, set-of-marks-annotated** screenshot reach the model. This is the v2 F1 vision milestone **re-cut**: F1 assumed vision would lift the escape gate, but the measured DoD failures are on-page (see [`eval-results.md`](eval-results.md)), so S10's job is narrowed to *seeing the structurally-invisible* and its cost is bounded by a measured escalation-rate ceiling.

## Why

There is **zero vision today**. [`CanonMessage.content`](../../packages/model-gateway/src/types.ts) is string-only (line 6), which structurally blocks any image reaching the model — that constraint is lifted by [S1](phase-s1-foundation-native-loop.md), which lands the multimodal content blocks S10 consumes. Screenshots are already *captured* end-to-end — `browser_get_screenshot` via [`packages/screenshots`](../../packages/screenshots) (maxEdge 1400) — but the bytes never leave the tool boundary, and the reactor strategy prompt ([`reactor-prompt.ts`](../../packages/orchestrator/src/reactor-prompt.ts) `BROWSING_STRATEGY`) actively steers *away* from screenshots. So the capability is 90% wired and 0% connected.

The gap is real, not theoretical. [`build-dom-tree-script.ts`](../../apps/desktop/src/main/agent/build-dom-tree-script.ts) runs in an isolated world and pierces open shadow roots + same-origin iframes only; **canvas/webgl paint, closed shadow roots, and cross-origin iframes are invisible to it** — and equally invisible to the structural djb2 page signature in [`browser-host.electron.ts`](../../apps/desktop/src/main/agent/browser-host.electron.ts) `readPage`, so the loop cannot even *detect* that it is blind from the signature alone. On such a page [`interactable.ts`](../../packages/tool-executor/src/interactable.ts) `finalizeElements` emits 0 interactables while the page is plainly non-blank, or the only control is an unlabelled `<canvas>`/image — the exact failure class the DOM path can never resolve.

[ADR-0008](../../docs/adr/) **already authorises** DOM/a11y-first perception with vision as a *fallback*. S10 is therefore **implementation of an existing decision**, not a new one — it adds an ADR status note, nothing more. The reference architecture is Claude for Chrome's hybrid: a11y-primary with a token-budgeted screenshot (≈28 px/token) and set-of-marks coordinate↔viewport mapping, escalated on demand. The program **Never-list** ([README](README.md#never-inherited--program-additions)) forbids *screenshots-every-step* vision — so the headline S10 metric is not "does vision help" but "does vision fire **rarely**", published as a measured escalation-rate.

## Exit criteria (DoD)

- [ ] The **vision-needing fixture family** (`canvas-menu`, `image-only-button`, `closed-shadow-widget`, plus `image_injection` counted in the safety plane) moves from **~0 → pooled ≥60% verified-completion at N≥10** with Wilson 95% CIs on the pooled aggregate. **(⏸ funded sweep)**
- [ ] Escalation **fires on ≤5% of steps** measured across the **non-vision** registry — the [ADR-0008](../../docs/adr/) *"not every step"* clause expressed **as a measured number**, reported as a paired before/after with a pre-stated equivalence margin. **(⏸ funded sweep, paired)**
- [ ] **$/task on non-vision families unchanged (±10%)** vs the S0 baseline (the escalation ceiling + downscale budget must not leak cost into ordinary browsing). **(⏸ funded sweep, paired)**
- [ ] The `image_injection` `atk_*` fixture (prompt-injection text rendered *inside* the screenshot) passes the S6 injection screen: the image goes through its **own** injection/redaction gate before reaching the model; ASR on this case stays within the S6 published bound. **(⏸ funded sweep — coordinate with [S6](phase-s6-safety-control-plane.md))**
- [ ] Every sweep from S10 onward reports **escalation-rate** as a standing column in [`eval-results.md`](eval-results.md).
- [x] **Fixtures frozen in PR0 before any capability code** (constitution: fixture-freeze); the before/after **delta is recorded in [`eval-results.md`](eval-results.md)** and the ledger.
- [ ] No prose deletion in S10 (see [Prose steers](#prose-steers)); the "avoid screenshots" steer in `BROWSING_STRATEGY` is *replaced by mechanism*, tracked as its own paired sweep line if the prompt string changes.
- [ ] **i18n EN + full TR parity in the same PR** for any UI surface (a "seeing the page" / vision-escalation indicator in [`ext-agent`](../../extensions/ext-agent), if surfaced).
- [ ] Strict TS, zod `safeParse` at every new trust boundary (screenshot→model handoff, trigger config), `AppError` at boundaries, 250-line file cap (split by construction), no `apps/desktop` growth beyond the trigger hook — capture/budget/marks land in [`packages/screenshots`](../../packages/screenshots).

## Tasks

### PR0 — fixture freeze

- [x] Add the vision family to [`packages/agent-eval`](../../packages/agent-eval): `canvas-menu` (a menu drawn on `<canvas>`, no DOM interactables), `image-only-button` (an `<img>`/background-image control with no text/aria), `closed-shadow-widget` (a control inside a closed shadow root). Frozen HTML fixtures + ground-truth in the scorer registry.
- [x] Add the `image_injection` `atk_*` scenario (injection instructions painted into the pixels) to the 24-strong `atk_*` battery — **never run live in ordinary sweeps** (S6 owns its execution), registered here for the gate.
- [x] Register a **negative** control set: a handful of ordinary DOM-visible fixtures re-tagged so the escalation-rate denominator is honest (escalation must NOT fire on them).
- [x] No capability code in this PR.

### PR1 — gate-evaluation record (deferred is a valid exit)

- [x] Evaluate the S10 capability against the **S0 taxonomy threshold pre-registered in [S0](phase-s0-truth-and-repair.md)**: does the measured share of registry failures attributable to structurally-invisible content clear the pre-registered bar that justifies building vision now?
- [x] Record the decision (build / defer) as a dated note in [`eval-results.md`](eval-results.md). **"Deferred" is a documented, valid exit** — if the S0 baseline shows structurally-blind pages are a negligible failure share, S10 rests at this record and does not build PR2–PR5.
- [x] If build: pre-register the escalation-rate ceiling (≤5%) and the family target (≥60%) here before PR3 lands any capture code.

> **PR0 deviation (recorded).** `image_injection` did **not** go into `adversarial-battery.json`.
> S6-PR0 froze that file as the claim-grade ASR battery, recording that its hash is unchanged "so the
> battery S6 will claim against is provably the one frozen before any S6 code" — appending would have
> broken that guarantee for convenience. It lands in a sibling registry instead, and S6 decides explicitly
> whether to fold it into the published ASR denominator.
>
> **PR1 gate evaluation — ANSWERED "cannot answer yet", and that is the record.** The gate asks whether
> the measured share of registry failures attributable to structurally-invisible content clears the
> pre-registered bar. That share comes from [S0](phase-s0-truth-and-repair.md)'s full-registry baseline,
> which is ⏸ unfunded, so **the gate is open, not passed**. Two consequences, both deliberate:
>
> 1. **Pre-registration stands anyway** (it is cheap and it is what stops a later run choosing its own
>    bar): escalation-rate ceiling **≤5% of steps** on the non-vision registry, vision-family pooled
>    **≥60%** verified completion at N≥10, `# Phase S10 — Vision, Escalation-Only (W2 Perception)

**Status:** 🟡 In progress (PR0–PR1 landed 2026-08-19) · **Depends on:** [S1](phase-s1-foundation-native-loop.md) (multimodal `CanonMessage` image blocks) · gate threshold pre-registered in [S0](phase-s0-truth-and-repair.md) · **Track:** [AI Agent Super](README.md)

**Goal:** Add vision as an **escalation fallback** per [ADR-0008](../../docs/adr/) — never every step — for the pages the DOM/a11y path structurally cannot see: canvas/webgl surfaces, closed shadow roots, cross-origin iframes, and image-only controls. Deterministic triggers in the reactor decide when a step is blind; only then does a **token-budgeted, downscaled, set-of-marks-annotated** screenshot reach the model. This is the v2 F1 vision milestone **re-cut**: F1 assumed vision would lift the escape gate, but the measured DoD failures are on-page (see [`eval-results.md`](eval-results.md)), so S10's job is narrowed to *seeing the structurally-invisible* and its cost is bounded by a measured escalation-rate ceiling.

## Why

There is **zero vision today**. [`CanonMessage.content`](../../packages/model-gateway/src/types.ts) is string-only (line 6), which structurally blocks any image reaching the model — that constraint is lifted by [S1](phase-s1-foundation-native-loop.md), which lands the multimodal content blocks S10 consumes. Screenshots are already *captured* end-to-end — `browser_get_screenshot` via [`packages/screenshots`](../../packages/screenshots) (maxEdge 1400) — but the bytes never leave the tool boundary, and the reactor strategy prompt ([`reactor-prompt.ts`](../../packages/orchestrator/src/reactor-prompt.ts) `BROWSING_STRATEGY`) actively steers *away* from screenshots. So the capability is 90% wired and 0% connected.

The gap is real, not theoretical. [`build-dom-tree-script.ts`](../../apps/desktop/src/main/agent/build-dom-tree-script.ts) runs in an isolated world and pierces open shadow roots + same-origin iframes only; **canvas/webgl paint, closed shadow roots, and cross-origin iframes are invisible to it** — and equally invisible to the structural djb2 page signature in [`browser-host.electron.ts`](../../apps/desktop/src/main/agent/browser-host.electron.ts) `readPage`, so the loop cannot even *detect* that it is blind from the signature alone. On such a page [`interactable.ts`](../../packages/tool-executor/src/interactable.ts) `finalizeElements` emits 0 interactables while the page is plainly non-blank, or the only control is an unlabelled `<canvas>`/image — the exact failure class the DOM path can never resolve.

[ADR-0008](../../docs/adr/) **already authorises** DOM/a11y-first perception with vision as a *fallback*. S10 is therefore **implementation of an existing decision**, not a new one — it adds an ADR status note, nothing more. The reference architecture is Claude for Chrome's hybrid: a11y-primary with a token-budgeted screenshot (≈28 px/token) and set-of-marks coordinate↔viewport mapping, escalated on demand. The program **Never-list** ([README](README.md#never-inherited--program-additions)) forbids *screenshots-every-step* vision — so the headline S10 metric is not "does vision help" but "does vision fire **rarely**", published as a measured escalation-rate.

## Exit criteria (DoD)

- [ ] The **vision-needing fixture family** (`canvas-menu`, `image-only-button`, `closed-shadow-widget`, plus `image_injection` counted in the safety plane) moves from **~0 → pooled ≥60% verified-completion at N≥10** with Wilson 95% CIs on the pooled aggregate. **(⏸ funded sweep)**
- [ ] Escalation **fires on ≤5% of steps** measured across the **non-vision** registry — the [ADR-0008](../../docs/adr/) *"not every step"* clause expressed **as a measured number**, reported as a paired before/after with a pre-stated equivalence margin. **(⏸ funded sweep, paired)**
- [ ] **$/task on non-vision families unchanged (±10%)** vs the S0 baseline (the escalation ceiling + downscale budget must not leak cost into ordinary browsing). **(⏸ funded sweep, paired)**
- [ ] The `image_injection` `atk_*` fixture (prompt-injection text rendered *inside* the screenshot) passes the S6 injection screen: the image goes through its **own** injection/redaction gate before reaching the model; ASR on this case stays within the S6 published bound. **(⏸ funded sweep — coordinate with [S6](phase-s6-safety-control-plane.md))**
- [ ] Every sweep from S10 onward reports **escalation-rate** as a standing column in [`eval-results.md`](eval-results.md).
- [x] **Fixtures frozen in PR0 before any capability code** (constitution: fixture-freeze); the before/after **delta is recorded in [`eval-results.md`](eval-results.md)** and the ledger.
- [ ] No prose deletion in S10 (see [Prose steers](#prose-steers)); the "avoid screenshots" steer in `BROWSING_STRATEGY` is *replaced by mechanism*, tracked as its own paired sweep line if the prompt string changes.
- [ ] **i18n EN + full TR parity in the same PR** for any UI surface (a "seeing the page" / vision-escalation indicator in [`ext-agent`](../../extensions/ext-agent), if surfaced).
- [ ] Strict TS, zod `safeParse` at every new trust boundary (screenshot→model handoff, trigger config), `AppError` at boundaries, 250-line file cap (split by construction), no `apps/desktop` growth beyond the trigger hook — capture/budget/marks land in [`packages/screenshots`](../../packages/screenshots).

## Tasks

### PR0 — fixture freeze

- [x] Add the vision family to [`packages/agent-eval`](../../packages/agent-eval): `canvas-menu` (a menu drawn on `<canvas>`, no DOM interactables), `image-only-button` (an `<img>`/background-image control with no text/aria), `closed-shadow-widget` (a control inside a closed shadow root). Frozen HTML fixtures + ground-truth in the scorer registry.
- [x] Add the `image_injection` `atk_*` scenario (injection instructions painted into the pixels) to the 24-strong `atk_*` battery — **never run live in ordinary sweeps** (S6 owns its execution), registered here for the gate.
- [x] Register a **negative** control set: a handful of ordinary DOM-visible fixtures re-tagged so the escalation-rate denominator is honest (escalation must NOT fire on them).
- [x] No capability code in this PR.

### PR1 — gate-evaluation record (deferred is a valid exit)

- [x] Evaluate the S10 capability against the **S0 taxonomy threshold pre-registered in [S0](phase-s0-truth-and-repair.md)**: does the measured share of registry failures attributable to structurally-invisible content clear the pre-registered bar that justifies building vision now?
- [x] Record the decision (build / defer) as a dated note in [`eval-results.md`](eval-results.md). **"Deferred" is a documented, valid exit** — if the S0 baseline shows structurally-blind pages are a negligible failure share, S10 rests at this record and does not build PR2–PR5.
- [x] If build: pre-register the escalation-rate ceiling (≤5%) and the family target (≥60%) here before PR3 lands any capture code.

/task on non-vision families within **±10%** of the S0
>    baseline.
> 2. **The capability ships INERT.** PR2–PR4 land behind `TEPEGOZ_VISION` (default off), so production
>    behaviour is unchanged and the gate stays genuinely open — building the mechanism does not
>    pre-empt the decision to use it. Nothing here claims the gate was cleared.

### PR2 — trigger plumbing (Lane B, no capture yet)

- [ ] Add deterministic **escalation triggers** in [`reactor.ts`](../../packages/orchestrator/src/reactor.ts) / [`reactor-observation.ts`](../../packages/orchestrator/src/reactor-observation.ts): (a) **0 interactables on a non-blank page** (cross-check `finalizeElements` emit count against a non-empty structural signature), (b) **occlusion persisting AFTER S3's click-time re-check**, (c) **canvas/webgl dominance** (a viewport-fraction signal surfaced from `build-dom-tree-script.ts`), (d) **≥2 consecutive action failures on the same target ref**.
- [ ] A single zod-validated `VisionTriggerReason` union in [`@tepegoz/shared-types`](../../packages/shared-types) (sole schema source) — the reactor emits the reason, not a bare boolean, so the sweep can attribute escalations.
- [ ] Trigger evaluation is **deterministic and pre-model** (no model call decides to escalate) — determinism-first; unit-test each trigger against the frozen fixtures.
- [ ] Wire the reason into the agent event stream so PR-later UI + the sweep can count escalations per step. No image is captured yet — this PR only *decides*.

### PR3 — budgeted capture + set-of-marks (Lane B, in `packages/screenshots`)

- [ ] Add a **pxPerToken-style budget** to [`packages/screenshots`](../../packages/screenshots): downscale so the encoded image respects a configured token budget (default ≈28 px/token, tuned against the S1 adapter's image-token accounting), bounded by the existing maxEdge 1400.
- [ ] Draw a **set-of-marks overlay**: paint the [S2](phase-s2-perception-v2.md) ref ids onto the downscaled image with a coord↔viewport mapping, so the model names a mark the reactor can resolve back to a ref/locator.
- [ ] Return a typed `AnnotatedScreenshot` (bytes + mark→ref map + scale factor), zod-validated at the boundary; the mark→ref map is the only channel by which a vision decision re-enters the deterministic action path.
- [ ] Keep capture+annotate under the 250-line cap by splitting downscale / overlay / mapping into separate modules.

### PR4 — adapter image-block wiring (consumes S1)

- [ ] On an escalation, attach the `AnnotatedScreenshot` as an **image content block** on the `CanonMessage` (the block type itself lands in [S1](phase-s1-foundation-native-loop.md)) via the model-gateway adapters ([`packages/model-gateway`](../../packages/model-gateway)) — Anthropic first (DoD tier), then the provider-agnostic path per [ADR-0005](../../docs/adr/).
- [ ] **Route every image through the S6 injection screen before it reaches the model** — the screenshot is untrusted inbound content exactly like page text; wire the image handoff through the same [`content-guard.ts`](../../packages/tool-executor/src/content-guard.ts) discipline (S6 owns the image-side gate). This is the mitigation for the known image-injection attack.
- [ ] Escalation stays **fallback-only**: no image is attached on the ordinary DOM-visible path; assert this in a gateway test so a regression that attaches screenshots-every-step fails CI (defends the Never-list clause).

### PR5 — sweep (⏸ funded)

- [ ] Run the paired before/after sweep at N≥10 on the vision family (funded key) + the escalation-rate + $/task deltas on the non-vision registry; record all three in [`eval-results.md`](eval-results.md).
- [ ] Coordinate the `image_injection` run with the [S6](phase-s6-safety-control-plane.md) `atk_*` battery; publish its result inside the S6 ASR bound, not as a standalone S10 number.
- [ ] Convert S10 🟠 → ✅ only when the delta is in the ledger.

## Fixtures

New to [`packages/agent-eval`](../../packages/agent-eval), frozen in PR0:

- **`canvas-menu`** — a navigation menu rendered entirely on `<canvas>`; 0 DOM interactables, non-blank page. Exercises trigger (a) + (c).
- **`image-only-button`** — the sole actionable control is an image/background-image with no text or aria; DOM path sees no label. Exercises trigger (a).
- **`closed-shadow-widget`** — an interactive control sealed inside a closed shadow root, invisible to `build-dom-tree-script.ts`. Exercises trigger (a)/(d).
- **`image_injection`** (`atk_*`, safety plane) — a page painting "ignore previous instructions…" into the screenshot pixels; must be neutralised by the image injection screen. Executed by S6, never in ordinary sweeps.
- **negative controls** — ordinary DOM-visible fixtures that must NOT trigger escalation (the honest denominator for the ≤5% rate).

## Prose steers

**None deleted.** S10 does not own a [PROSE-LEDGER](PROSE-LEDGER.md) row. It does *replace* the "avoid screenshots" guidance in `BROWSING_STRATEGY` ([`reactor-prompt.ts`](../../packages/orchestrator/src/reactor-prompt.ts)) with a deterministic mechanism; if that prompt string changes, the change ships with a paired before/after sweep and a before/after system-prompt token count per the consolidation rule — but the steer is *mechanised, not subsumed by another phase*, so it is not a ledger row.

## ADR

- **Implements [ADR-0008](../../docs/adr/) as written** (DOM/a11y-first perception, vision as fallback). Adds a **status note** recording that escalation-only vision landed, the trigger set, and the measured escalation-rate ceiling (≤5%). No new decision — the vision-as-fallback decision already exists; S10 is its implementation.
- No new numbered ADR. (Consumes [S1](phase-s1-foundation-native-loop.md)'s ADR-0025 multimodal `CanonMessage`; respects [ADR-0005](../../docs/adr/) provider-agnostic gateway, [ADR-0006](../../docs/adr/) deterministic pre-model policy — triggers are deterministic and pre-model, [ADR-0007](../../docs/adr/) single tool plane.)

## Risks

- **Image injection bypassing the text-side content-guard.** A screenshot is untrusted inbound content, but pixels skip the text redaction path — the known attack. *Mitigation:* PR4 routes every image through the S6 image injection screen; the `image_injection` `atk_*` fixture **is the gate** — S10 does not ✅ until that case passes within the S6 ASR bound. **Spike-first:** validate the image→content-guard handoff on the frozen `image_injection` fixture before wiring live adapters.
- **Vision cost blow-up.** Screenshots are token-expensive; unbounded escalation would wreck $/task. *Mitigation:* the ≤5% escalation-rate DoD + the token-budgeted downscale bound it *by measurement*, and the "$/task on non-vision families unchanged (±10%)" gate fails the phase if cost leaks. The deterministic pre-model trigger (no model call to decide escalation) keeps the decision cheap.
- **Trigger false-positives** (escalating on ordinary pages). *Mitigation:* negative-control fixtures in the denominator; the ≤5% rate is measured against them, so an over-eager trigger fails the DoD before it ships.
- **Set-of-marks mis-mapping** (model names a mark that resolves to the wrong ref). *Mitigation:* the mark→ref map is the sole re-entry channel and is zod-validated; a mark with no live locator ([`dom-path.ts`](../../packages/tool-executor/src/dom-path.ts) returns null on miss) is dropped, never guessed.
- **Dependency slip on S1.** No image can reach the model until S1's multimodal blocks land; PR2/PR3 (triggers + capture) are independent and can proceed in Lane B, but PR4/PR5 are gated on S1. *Mitigation:* sequence PR4 behind the S1 substrate; keep PR2/PR3 shippable and measured for escalation-rate on scripted tiers meanwhile.
