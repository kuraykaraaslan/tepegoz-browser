# AI Agent Super — the sole authoritative agent competence roadmap (v3)

The program that takes tepegoz's **agent (Do mode)** from "genuinely wired backbone, thinly measured" to
a browser agent competitive with **Claude for Chrome** (reliability + safety) **and** **Perplexity
Comet** (assistant UX) — and keeps every claim **falsifiable and honestly measured**, never marketing.

> **This folder is the single authoritative AI roadmap.** It **supersedes and replaces** the v2 track
> in [`../ai/`](../ai/) (M1–M2 / C1–C7 / F1–F3). Those phase documents are retired by [S0](phase-s0-truth-and-repair.md);
> their still-valid machinery is **absorbed here, not destroyed** — the statistical constitution
> ([`constitution.md`](constitution.md)), the results ledger ([`eval-results.md`](eval-results.md)), the
> prose-debt ledger ([`PROSE-LEDGER.md`](PROSE-LEDGER.md)), the eval harness + frozen fixtures, and the
> v1 measurement history + build-vs-buy decision ([`history.md`](history.md)) all continue. The broader
> product phases ([1b](../product/phase-1b-agentic-deepening.md) / [6](../product/phase-6-deterministic-automation.md) /
> [8](../product/phase-8-local-intelligence-sovereignty.md) / [9](../product/phase-9-safe-autonomy-delegation.md)) stay,
> but their **AI-specific routing is dissolved** — this program now decides for itself what it owns; the
> [routing section](#routing--what-stays-out) records the boundary.

> **Compliance (binding):** every cross-cutting gate in [`../README.md`](../README.md) applies — strict
> TS (no `@ts-ignore`), zod `safeParse` at every trust boundary, `AppError`, per-package i18n (EN + full
> TR parity in the same PR), determinism-first, no `apps/desktop` growth, **no AI attribution trailers**
> (CI-enforced), sync-ready persistence. Binding ADRs: 0005 (provider-agnostic gateway), 0006
> (deterministic policy kernel, pre-model), 0007 (single tool plane), 0008 (DOM/a11y-first perception,
> vision as **fallback**), 0009 (`AppError`), 0010 (TS conventions + deviations), 0013 (agent
> orchestration + two-stage HITL, serialized execution — API is source of truth over docs), 0024 (action
> interception). New ADRs continue from **0025** (0024 is the current head).

## North star — the falsifiable "world's best" claim

The claim is **inherited verbatim** from v2 and stays binding. tepegoz claims *world's best browser
agent* **only** when, at a dated release, **all four** hold (full text in [`constitution.md`](constitution.md)):

1. **Head-to-head win** — a pre-registered H2H battery (≥20 identical real-site tasks, ≥10 Turkish-web),
   rubrics committed **before** any run, executed the same week vs ChatGPT agentic browsing / Claude for
   Chrome / Perplexity Comet, N≥3 each, scored blind on **verified-completion rate** (network/page
   evidence, not model say-so). Owned by [S11](phase-s11-benchmark-h2h.md).
2. **Bounded, honest injection ASR** — published as *"k successes in K trials, 95% binomial upper bound
   X%"*, upper bound ≤5% initially. Owned by [S6](phase-s6-safety-control-plane.md).
3. **Fabricated-success ≈ 0** — on trap fixtures where the page lies ("Saved!" over a 5xx), the agent
   reports the truth. A metric no rival publishes. Owned by [S4](phase-s4-verified-outcomes.md).
4. **Cost honesty** — $/task and wall-clock/task published, dropping on repeat domains. Owned by
   [S7](phase-s7-speed.md) ($ / wall-clock) + [S9](phase-s9-memory-skills.md) (repeat-domain drop).

The program's own added bar: **competitive with Claude for Chrome on reliability + safety AND with Comet
on assistant UX, at 2026 state of the art, every internal number live-measured** (real product model,
real app, all security planes on, ground-truth scored, held-out protected, regenerable from a checkout).

## The four owner pains → workstreams

The owner's verdict — *"hala istediğim gibi çalışmıyor"* — decomposes into four confirmed pains. Each
maps to a workstream with **one headline metric** it must move.

| Pain | Workstream | Phases | Headline metric |
|---|---|---|---|
| 1. Can't complete tasks on real sites | **W1 Reliability** | [S3](phase-s3-reliability-actions.md), [S4](phase-s4-verified-outcomes.md), [S5](phase-s5-code-execution.md) | verified-completion rate (web-patterns + real-failures + acceptance) |
| 2. Can't see pages properly | **W2 Perception** | [S2](phase-s2-perception-v2.md), [S10](phase-s10-vision-escalation.md) | perception-family pass rate + tokens/step |
| 3. Too slow | **W3 Speed** | [S1](phase-s1-foundation-native-loop.md), [S2](phase-s2-perception-v2.md), [S7](phase-s7-speed.md), [S12](phase-s12-local-model.md) | p50 wall-clock/task + $/task (acceptance) |
| 4. Weak UX / control feel | **W4 Control & trust** | [S6](phase-s6-safety-control-plane.md), [S8](phase-s8-assistant-ux.md) | approvals/task, ASR upper bound, time-to-first-feedback |
| — foundation | **Foundation** | [S0](phase-s0-truth-and-repair.md), [S1](phase-s1-foundation-native-loop.md) | honest baseline exists; native/streaming substrate |
| — claim | **Claim** | [S11](phase-s11-benchmark-h2h.md) | all four north-star conditions have a dated number |

## Phase index

| ID | File | Goal | Depends on | Status |
|---|---|---|---|---|
| S0 | [phase-s0-truth-and-repair.md](phase-s0-truth-and-repair.md) | Absorb + retire the v2 track, repair all doc/code/number drift, first full-registry honest baseline, taxonomy that may re-cut this program | — | 🟠 **Measurement-owed** (PR0–PR3 landed 2026-08-16: freeze, archive, v2 retirement, artefact + pointer repair. PR4–PR6 = the ⏸ funded sweep) |
| S1 | [phase-s1-foundation-native-loop.md](phase-s1-foundation-native-loop.md) | Native tool-calling + multimodal `CanonMessage` + streaming-to-UI (settled-to-Journal) | S0 | 🟠 **Measurement-owed** — PR0–PR5 landed 2026-08-18 (paired set + "before" exclusion rate frozen; `CanonMessage.content` widened to `string | CanonContentBlock[]`, schema in shared-types, `safeParse` at the gateway; anthropic/openai/gemini native both directions + `supportsNativeTools` (kimi + local stay JSON); reactor transport strategy-selected behind `TEPEGOZ_DECISION_MODE` (single-tool deviation recorded); ADR-0025 streaming boundary + `generateStream` → renderer; PR6 paired sweep ⏸ funded) |
| S2 | [phase-s2-perception-v2.md](phase-s2-perception-v2.md) | Identity-stable refs + diff/dedupe + compact serialization + label resolution + `get_page_text` | S0 | 🟠 **Measurement-owed** — PR0–PR4 landed 2026-08-18 (3 scenarios + fixtures frozen in a new registry file, all ten earlier hashes untouched; identity-stable refs behind `TEPEGOZ_PERCEPTION_V2` with a carry-over floor, key deviation recorded; added/changed/removed diff + unchanged-run elision + TSV listing behind the same flag; `aria-labelledby`/`label[for]` resolved in the DEFAULT path, behaviourally tested against the real script; `browser_get_article` article-text tool; PR5 paired sweep ⏸ funded) |
| S3 | [phase-s3-reliability-actions.md](phase-s3-reliability-actions.md) | Dialogs, tab-spawn world model, wait-for, send-keys, hover/drag, nav verbs, typed widgets, click-time occlusion + locator cascade, cookie-consent fix | S0; S2 (refs) | 🟠 **Measurement-owed** — PR0–PR2, PR5, PR6-hover landed 2026-08-18 (7 fixtures + registry frozen, `cookie_consent` sentinel untouched; `browser_update_history` + `browser_validate_condition` bounded waits; `send_keys` chords with the KEY_MAP hard-fail replaced by a reported no-op; click-time occlusion re-check + identity locator cascade — the `cookie_consent` fix; `hover`). PR3 (tab-spawn: spawn detection + a policy-checked auto-follow through the same `tab_update_item` PEP a model-issued switch gets + return-to-origin bookkeeping + EN/TR console strings), PR4 (dialog/beforeunload interception — a 4-arm live Electron spike found the phase's own DevTools-vs-`webContents.debugger` conflict assumption does NOT hold on this Electron version, so every dialog/unsaved-changes prompt is deterministically auto-declined and reported to the model, never a live HITL approve/deny surface) and PR7 (widget-driven fills refused 08-18; a click-then-find-then-click datepicker/combobox fill strategy — `findWidgetOption`, fixture-grounded for the datepicker, code-reviewed but not fixture-proven for the combobox — landed 08-20) all landed in full 2026-08-20. Only the drag spike remains open; PR8 sweep ⏸ funded |
| S4 | [phase-s4-verified-outcomes.md](phase-s4-verified-outcomes.md) | Evidence-cited completion, fabricated-success ≈ 0, URL re-verify before mutation | S1 | 🟠 **Measurement-owed** — PR0–PR3 landed 2026-08-19 (trap family 1→5 frozen, hash change disclosed, fixture server gained a real second origin; `CompletionEvidence` + deterministic downgrade — the model can no longer talk a contradicted claim into `done`; deterministic pre-dispatch origin gate; verified-completion + fabricated-success (95% upper bound) + cannot-verify now reportable at all; PR4 sweep ⏸ funded) |
| S5 | [phase-s5-code-execution.md](phase-s5-code-execution.md) | Isolated-world code-exec (security-first) + structured table/list extraction | S2 | 🟠 **Measurement-owed** — spike + PR0 + PR1 landed 2026-08-19. **The proposed isolated-world sandbox was REFUTED by measurement** and replaced with a request-cancelling session + CSP document holding a page copy ([ADR-0026](../../docs/adr/0026-agent-code-execution.md)). PR2 table tool + the ⏸ funded battery are open; the RISK GATE stands |
| S6 | [phase-s6-safety-control-plane.md](phase-s6-safety-control-plane.md) | Autonomy-to-main (bug fix), risk tiers, `follow_a_plan` grants, advisory critic, strict-mode, ASR battery, credential broker | S0 (PR1 early); S3 (claim ASR) | 🟡 **PR0–PR3 landed** 2026-08-16 (exam frozen; autonomy defect closed; six derived risk tiers + TR-covering sensitive-site map; plan-scoped grants on proper eTLD+1 — all deterministic, no sweep owed). 🟠 **Measurement-owed** — PR4–PR6 landed 2026-08-19 (advisory critic plane — post-kernel, cannot block, never sees argument values; strict-mode wiring — the C7 setter was unreachable and now has a tested caller + EN/TR toggle; credential broker — the agent has no shape a secret could arrive in, and it refuses every fill until an OS-auth gate exists); PR7 ASR sweep ⏸ funded |
| S7 | [phase-s7-speed.md](phase-s7-speed.md) | wall-clock/$ targets, adaptive validation, quick-mode encoding, visibility-gated realism | S1, S2 | 🟠 **Measurement-owed** — PR1–PR4 landed 2026-08-19 (targets pre-registered with a mechanical missing-baseline guard; cadence that can never validate more often than before; realism pacing dropped only where nothing is on screen; quick mode off for every provider). Only the ⏸ funded PR5 sweep is open |
| S8 | [phase-s8-assistant-ux.md](phase-s8-assistant-ux.md) | Streaming narration, live step feed, plan-grant UX, risk-tier approvals, agent-active indicator, backgroundable runs, commerce flow | S1, S6, S4 | 🟠 **Measurement-owed** — PR1–PR6 landed 2026-08-19 (delta batching + validation + first-feedback instrumentation, run-level evidence chip, plan-grant copy, one-tap run scope, tray indicator + continue-in-background, and a real fix: `auto` mode could approve a payment). Per-step citation chips, the per-tab badge, and the two ⏸ funded metrics are open |
| S9 | [phase-s9-memory-skills.md](phase-s9-memory-skills.md) | Per-domain advisory memory, skill/shortcut library, per-task remembered grants | S2, S6 | 🟠 **Measurement-owed** — PR0–PR5 landed 2026-08-19 (write-side poison filter, quarantine-not-delete, advisory-only recall outside the task fence, a skills library that cannot start itself, and skill-scoped remembered grants consulted pre-model; [ADR-0027](../../docs/adr/0027-agent-memory.md)). Only the ⏸ funded PR6 sweep is open |
| S10 | [phase-s10-vision-escalation.md](phase-s10-vision-escalation.md) | Escalation-only vision (ADR-0008): triggers, budgeted downscale, set-of-marks | S1; gate from S0 | 🟠 **Measurement-owed** — PR0–PR4 landed 2026-08-19 (vision + negative-control fixtures frozen, ASR battery untouched; gate recorded as OPEN — capability ships inert behind `TEPEGOZ_VISION`; deterministic triggers + escalation-rate now measurable per step; token-budgeted downscale + set-of-marks; image blocks attached ONLY on escalation and ONLY past a fail-closed image screen; PR5 sweep ⏸ funded) |
| S11 | [phase-s11-benchmark-h2h.md](phase-s11-benchmark-h2h.md) | realUrl bridge (≥10 TR) + pre-registered H2H + 4-condition claim | S3 (probe); S6+S4+S9 (claim) | 🟠 **Measurement-owed** — PR0 + PR4 + the publish gate landed 2026-08-19 (30 live-web tasks / 10 Turkish, a `bridgeClaim` that REFUSES to publish below 25 human labels, and [h2h-protocol.md](h2h-protocol.md) pre-registered). The 25 labels need real run artifacts; PR3/PR5 are ⏸ funded |
| S12 | [phase-s12-local-model.md](phase-s12-local-model.md) | Local-LLM track: off-the-shelf baseline → fine-tune/distill → sovereign/offline | S0 (S12a); S4 (S12b) | 🟠 **Measurement-owed** — PR0 + the ownership ledger + [ADR-0028](../../docs/adr/0028-local-agent-model.md) landed 2026-08-19. The shipped ownership table is EMPTY and cannot be filled without a measurement. Blocked on **downloaded weights**, not on the funded key; S12b DEFERRED by design |

Status legend: ⬜ Not started · 🟡 In progress · 🟠 **Measurement-owed** (code + frozen fixtures landed,
delta not yet in the ledger — counts against the anti-debt rule) · ✅ Done (DoD passed, delta recorded).

> **Update 2026-08-21 — the funding gate was mostly a pricing error.** Phases rested at 🟠 on the belief
> that the sweeps cost $2,500–8,000. Re-priced against the ledger's real token counts they cost
> ~$300–900, and the S0 baseline that discharges most of this debt costs **~$17**, not $150–500. The
> owner's **$50 API budget** is therefore enough to close **S0 and S3 at the DoD tier** and start
> collapsing the count — see [`budget.md`](budget.md). The free-tier and no-model tiers discharge more still.
> Until a sweep runs, 🟠 remains the honest resting state and no phase reads ✅.

### Old (v2) → new (S) residual-scope map

| v2 | → | S-home |
|---|---|---|
| C1 (typed state + escape) | → | exit sweep folded into [S0](phase-s0-truth-and-repair.md); the code already landed |
| C2 (replanner) | → | replan cadence in [S3](phase-s3-reliability-actions.md) / [S7](phase-s7-speed.md) |
| C3 (perception economy) | → | [S2](phase-s2-perception-v2.md) |
| C4 + C5 (obstructed pages, tabs/widgets) | → | [S3](phase-s3-reliability-actions.md) |
| C6 (verified outcomes) | → | [S4](phase-s4-verified-outcomes.md) |
| C7 (adversarial ASR) | → | [S6](phase-s6-safety-control-plane.md) |
| F1 (vision) | → | [S10](phase-s10-vision-escalation.md) |
| F2 (structured data) | → | [S5](phase-s5-code-execution.md) |
| F3 (domain memory) | → | [S9](phase-s9-memory-skills.md) |
| M1 machinery (Wilson CIs, flaky, cost, wall-clock, family pooling) | → | **absorbed** (already landed; [S0](phase-s0-truth-and-repair.md) records the truth) |
| M2 (external yardstick / H2H) | → | [S11](phase-s11-benchmark-h2h.md) |

### Status-truth audit (S0 PR2, 2026-08-16) — what is actually landed

The retired v2 index read **C1 "Measurement-owed"** and **M1 / C7 "Not started"** while all three had
landed code, hiding an anti-debt breach **×3**. Audited against `git log`, the truth is:

| v2 item | Landed code (commits) | Owed measurement | Debt home |
|---|---|---|---|
| **M1** measurement backbone | `e01691b`, `f9e639d` (merge `715a10e`) — cost, wall-clock, Wilson CIs, honest scenarios, read cap, per-tag pooled family aggregates | **none** — this *is* the measuring instrument, not a capability claim | **absorbed**, no debt |
| **C1** typed state + escape | `d591523` (typed working state), `1c5ddd0` (no-progress replan), `f04aeb2` + `5a0cfb0` (escape→replan trigger), `68d6e90` (truncation salvage) — all default-on | exit sweep | **folded into S0** PR4 |
| **C7-PR1** adversarial robustness | `1403a05` (`setStrictMode` reachable), `4cf2caa` (24-scenario frozen battery), `54848f4` (harness strict-mode knob) | first live `atk_*` numbers | **folded into S0** PR4 (N=3, caveated); claim-grade N≥10 is [S6](phase-s6-safety-control-plane.md)'s |
| Harness robustness | `4dd89d6` (transport-invalid exclusion + readiness barrier), `ac579b5` (dead-key → `UNMEASURED` + sweep abort) | none — exclusion machinery the baseline depends on | **absorbed**, no debt |

**Anti-debt state: 1 measurement-owed (S0) — compliant.** C1's and C7's owed sweeps do not each count
as separate debt because both are discharged by the *same* S0 full-registry baseline.

**Update 2026-08-19 (final) — S5, S11 and S12 landed; the count is 13 and every phase is now started.**
The anti-debt rule has been breached for the length of this program and the reason has not changed:
one unavailable funded key discharges nearly every debt, and no phase reads ✅. Three things from this
last group change what the ledger means, though:

- **S5 produced a measured NEGATIVE result, offline, for free.** The isolated-world sandbox this
  program specified does not hold — a canary server was hit on the first attempt. S5 had been skipped
  in an earlier session on the belief that network-inertness could not be proven without a funded key.
  It needed two local HTTP servers. **One phase was deferred on a wrong belief**, and the correction is
  worth more than the phase: the funding gate is real, but it is not as wide as it looked.
- **Not every remaining debt is the same debt.** S12 is blocked on **downloaded weights and local
  compute**, not on tokens. Filing it under "⏸ funded" would have hidden a blocker the owner can
  actually clear.
- **S11 makes the claim itself refusable.** `bridgeClaim` returns `publishable: false` below 25 human
  labels, and `h2h-protocol.md` is pre-registered with a withdrawal clause and a falsification
  section. The program can now state a number, or state exactly why it may not.

**Update 2026-08-19 (later still) — S7 and S8 landed too; the count is now 10.** The rule is unchanged
and so is the reason: one unavailable funded key discharges every debt, and no phase reads ✅. Two
things from this pair are worth pulling out of their phase docs, because they are the kind of thing a
ledger exists to keep visible:

- **S8 fixed a real hole rather than measuring one.** `auto` autonomy approved the financial tier
  unconditionally — the single path in the codebase around a tier nothing else may cover. It was found
  by reading the gate, not by a failing test. The fix is deliberately narrowed to `financial`; whether
  `credential` and `destructive` follow is an **owner decision the phase doc asks for**.
- **S7 replaced two "measure this later" risks with "impossible by construction".** The adaptive
  cadence cannot validate more often than the modulo it replaces (the floor is that modulo), and the
  visibility gate drops sleeps without dropping a single event (asserted element for element). Neither
  needed the sweep it was scheduled for.

**Update 2026-08-19 (later) — S6 and S9 landed too; the count is now 8.** The rule is unchanged and so
is the reason. What is worth stating again, because it is what makes the breach survivable: **three
capabilities shipped INERT on purpose** — S10 attaches no image (no screen installed), S6 fills no
credential (no OS-auth gate), and S9 reads and writes no memory (no host wiring). Each waits for its own
defence or its own decision, and each says so in its phase doc rather than leaving it to be discovered.

**Update 2026-08-19 — S4 and S10 landed too; the count is now 6.** Same stated breach, same reason, and
the same protections still hold: no phase reads ✅, no capability flag was promoted to default, and every
sweep-bearing criterion stays ⏸ and unclaimed. Two additions worth naming because they are the kind of
thing that quietly rots: **S10's PR1 gate is recorded OPEN, not passed** (its capability ships inert), and
**S4's PROSE-LEDGER row 6 stays RETAINED** even though its mechanism now exists, because the constitution
moves a row on a paired sweep and nothing else.

**Update 2026-08-18 — S1, S2 and S3 landed their code; the count rose to 4, and that is a STATED BREACH
of the anti-debt rule, not an oversight.** [S1](phase-s1-foundation-native-loop.md) (transport, content blocks, native
tool-calling on three adapters, the streaming boundary), [S2](phase-s2-perception-v2.md) (identity-stable
refs, diffing + elision, label resolution, article text) and [S3](phase-s3-reliability-actions.md)
(the reliability verbs) all landed their capability code in one pass, on the owner's explicit instruction
to complete at least three phases. Each owes a sweep that cannot run without a funded key, so S0, S1, S2
and S3 all sit 🟠 while the rule says no new phase opens while more than one does.

Recording the reason plainly, because the alternative — quietly letting the count read "1" — is exactly
the vanity the rule exists to prevent:

- Both debts are discharged by the **same** unavailable thing (a funded Anthropic key), not by two
  independent measurements someone could have run and did not. The rule's purpose — stopping a program
  from stacking unverified capability claims — is served by the fact that **no phase here claims ✅**.
- Every S1/S2/S3 exit criterion that is deterministic is asserted in tests and green; every criterion
  that needs a sweep stays ⏸ and unclaimed. **No phase in this pass reads ✅, and no capability flag was
  promoted to default on deterministic evidence.**
- The debt does not compound in cost: one funded full-registry run plus the per-phase paired sweeps
  discharges all of it, in the order the phases landed.

**When the key is funded, the sweeps run in landing order (S0 baseline first) and the count returns to
compliance.** Until then, treat every capability in S1–S3 as *landed and deterministically tested*,
never as *measured*.

**Update 2026-08-16 — S6-PR1 landed; the count is unchanged.** The autonomy-enforcement fix carries
**no measurement debt**: its DoD line is explicitly deterministic and testable offline ("No ⏸"), and it
is discharged by unit + regression tests, not by a sweep. A phase only enters 🟠 when a *sweep* is owed,
so S6 reads 🟡 in-progress and the anti-debt count stays at **1**. Every other S-phase reads ⬜ **Not
started** truthfully: their code does not exist yet.

## Sequencing, lanes & measurement gates

```
S0 (absorb old track + repair + baseline + taxonomy → the taxonomy MAY re-cut this program)
 ├─ S6-PR1  autonomy-bug fix (tiny, lane-independent, no sweep dependency)   ← immediately after S0
 ├─ Lane A (reactor/gateway, strictly serialized):      S1 → S3(reactor PRs) → S7
 ├─ Lane B (perception/tool-executor):                  S2 → S3(executor PRs) → S5
 └─ Lane C (policy/UI/local, no reactor collision):     S6-rest · S8 · S12a   (behind their substrates)

Interleave, ≤2 phases in flight:  S2 ∥ S1 · S4 ∥ S5 ∥ S6-rest · S9 ∥ S10 · S12a early (cost win)
Gates:  G1 native≈JSON + streaming · G2 tokens −30% · G3 cookie ≥8/10 + new-family ≥70%
        G7 −40% wall-clock @ equivalence · ASR claim-grade only AFTER S3
S11:  bridge probe allowed after S3 · claim-grade H2H LAST (after S6 ASR + S4 fabricated-success + S9 speedup)
S12:  S12a early (local baseline + cheap-tier offload) · S12b/S12c LATE, evidence-gated (need S4 labels + trajectory volume)
```

**Constitution rules enforced program-wide** (full text: [`constitution.md`](constitution.md)):
**anti-debt** (no new phase opens while >1 phase sits measurement-owed — S0 restores compliance day one);
**fixture freeze before capability code** (a PR0 per phase; no phase authors and passes its own exam in
one PR); **attribution** (each exit sweep on a single-change branch, serialized); **two-tier N**
(claim-bearing N≥10 with Wilson CIs on pooled family aggregates; broad coverage N=3 with flaky tags);
**consolidation-as-DoD** (a subsumed prose steer is deleted in the same PR that proves its paired
with/without sweep); **judge discipline** (secondary LLM judge claim-barred until ≥25 human labels;
today: 1).

## Budget — eval spend (owner: $50 of API, 2026-08-21)

**The full plan is [`budget.md`](budget.md); it is binding and this section is a summary.**

The table that used to sit here priced the program at **$2,500–8,000** and the S0 baseline at
**$150–500**. Those were order-of-magnitude guesses, and multiplying the ledger's real token counts
(13.8k–224k/trial) by real per-1M prices shows they over-stated the program by **4–10×**. The corrected
figure is **~$550–780 at the DoD tier**, and the owner's budget is **$50 of API spend — not
subscriptions**, which is enough to close **two phases at the real product model**.

| Sweep | Trials | Tier | Cost |
|---|---:|---|---:|
| T2 calibration (replaces the guesses with a measurement) | 6 | DoD + cache | **~$1** |
| T3a S0 full-registry baseline (52 × N=3) → **S0 ✅** | 156 | DoD + cache | **~$30** |
| T3b S3 `reliability-actions` paired (7 × N=5 × 2 arms) → **S3 ✅** | 70 | DoD + cache | **~$13** |
| S2 / S4 paired sweeps, both arms same tier | ~140 each | free cloud tier | **$0** |
| Deterministic / scripted-adversarial (the S5 trick) | — | no model | **$0** |
| *Reserve* (overrun, re-runs, transport-invalid retries) | | | **~$6** |
| Claim-grade ASR (24 `atk_*` × N≥10) | 240 | DoD + cache | ~$46 — **the next purchase** |
| H2H battery | — | rival **subscriptions** | ~$60/mo — **not an API cost; out of scope** |

S3's N=5 is **claim-grade by the constitution's pooled route** (7 × 5 = 35 pooled trials/arm, inside the
sanctioned 30–70 band with Wilson CIs) — the cheaper of two paths the constitution already allows.

The spending rule: **no paid token is spent on a question a free tier can answer.** Prompt caching
(`cache_control` appears nowhere in the repo today) is the first piece of work, but it is worth **~25%,
not the ~45% a naive agent-loop estimate suggests** — the reactor's transient-state collapse already
keeps history compact, *and* it mutates messages in place, so a tail breakpoint would be invalidated
every step and cost 1.25× for a 0% hit rate. [`budget.md` §2](budget.md#2-correction-to-the-caching-lever--it-is-worth-25-not-45)
has the lag-2 breakpoint design and the mandatory `cache_read_input_tokens` assertion.

**No north-star condition gets a publishable number for $50.** [S11](phase-s11-benchmark-h2h.md) needs
rival subscriptions and [S12](phase-s12-local-model.md) needs downloaded weights — neither is an API
cost, and the H2H month is a separate owner decision this budget deliberately declines.

S12a's local-baseline sweeps still run on **local compute (no cloud key)**, but local cannot drive the
agent loop (1.5B/3B weights at 8192 ctx) — it is a cheap-*capability* track, not a free eval tier.

The **tier-label amendment** to [`constitution.md`](constitution.md) is **no longer on the critical
path** (the plan runs at the DoD tier) but stays open for Step 4's free-tier sweeps —
[`budget.md` §7](budget.md#7-constitution-amendment--no-longer-required-kept-on-the-shelf).

## Routing — what stays out

Since the AI routing to Phases 1b/6/8/9 is dissolved, this program states its own boundary. **Reference,
never duplicate.**

| Stays with | Material |
|---|---|
| [Phase 6](../product/phase-6-deterministic-automation.md) | Deterministic **model-free** signed recipes, self-healing selectors, success oracle. Ownership test: *"if the model could be removed from the replay, it's Phase 6."* S9's skills are model-driven templates, not recipes. |
| [Phase 8](../product/phase-8-local-intelligence-sovereignty.md) | Provider trust mesh, knowledge graph, **learned** ModelRouter, speculative two-tier. S12 ships a *static* local tier, not a learned router. |
| [Phase 9](../product/phase-9-safe-autonomy-delegation.md) | Transaction mandates, signed policy bundles (**publishes S6's measured ASR**), governed endpoints. |
| **This program's own backlog** (evidence-gated, no other home now) | **True parallel background runs** (relaxes ADR-0013's one-run-at-a-time — needs a superseding ADR + real isolation; S8 ships "single run, backgroundable" first); deterministic action-replay caching (Phase-6 boundary preserved). |

## Never (inherited + program additions)

Auto-judge headline numbers · anchoring to vendor self-reports (the Online-Mind2Web 97–99%
self-submissions vs ~58% independently-listed Operator is a methodology crisis, arXiv:2504.01382, not a
capability gulf) · **screenshots-every-step vision** · "ASR ≤1%" from double-digit trials · Python
sidecar / second Chromium / vendor agent SDKs (`browser-use`/`nanobrowser` = **port techniques, never
adopt**) · **renderer-trusted security decisions** (the S6 bug — never again) · **weights committed to
the repo** (S12 — models are downloaded artifacts) · training on unfiltered agent output (S12 — only
S4-verified trajectories, held-out contamination-gated).

## Operations

- [`eval-results.md`](eval-results.md) — the dated results ledger (continues the v2 ledger; every phase
  exit records before/after here).
- [`constitution.md`](constitution.md) — the statistical constitution + consolidation-as-DoD rule.
- [`budget.md`](budget.md) — the binding $50 measurement plan: the corrected cost model, the caching
  correction (lag-2 breakpoints; the reactor mutates messages in place), the four spending tiers, and
  the shelved tier-label amendment.
- [`PROSE-LEDGER.md`](PROSE-LEDGER.md) — the prose-debt ledger, re-owned to S-phases.
- [`fixture-freeze.md`](fixture-freeze.md) — the frozen baseline exam (8 registries, 52 scenarios,
  SHA-256 per file); every phase PR0 cites it as the base its delta was measured against.
- [`history.md`](history.md) — v1 measurement history + the `browser-use`/`nanobrowser` build-vs-buy
  decision, preserved.
- Eval loop runbook: [`eval-loop-runbook.md`](eval-loop-runbook.md) (moved here by S0).
