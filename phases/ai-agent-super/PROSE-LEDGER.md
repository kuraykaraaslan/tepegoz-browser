# Prose Ledger — Consolidation as a DoD Rule (re-owned to S-phases)

Supersedes the v2 `phases/ai/PROSE-LEDGER.md`, which [S0](phase-s0-truth-and-repair.md) PR2 removed
(`git show 0eaafcd:phases/ai/PROSE-LEDGER.md`). The **rule** is unchanged (see [`constitution.md`](constitution.md#consolidation-as-a-dod-rule)):
every capability phase **deletes the prose steer it subsumes in the SAME PR** that proves the measured
delta, gated by a paired with/without sweep at pooled N with a pre-stated equivalence margin. Each line
ends **DELETED** (linking its proving sweep) or **RETAINED** (one-line justification). System-prompt
token count reported before/after each deletion.

## Precedent (proven pattern)

v1 AI-7 deleted the blind *"append `/blog` to the origin"* guidance from the reactor + planner in the
same change that landed the grounded candidate resolver — prompt-string tests updated, no regression.
Every line below follows that shape.

## The ledger (re-owned; homes unchanged)

The steers live in up to three homes each: the reactor strategy prompt
([`reactor-prompt.ts`](../../packages/orchestrator/src/reactor-prompt.ts)), the parallel planner prose
([`planner.ts`](../../packages/orchestrator/src/planner.ts)), and tool descriptions
([`browser-tools.ts`](../../packages/browser-tools/src/browser-tools.ts)). Deletion means all homes.

| # | Steer (paraphrased) | Homes | Owning S-phase | Status |
|---|---|---|---|---|
| 1 | Tab discipline — prefer the current tab; close tabs you opened | reactor prompt | [S3](phase-s3-reliability-actions.md) (tab-spawn world model) | RETAINED (pending S3's tab world model) |
| 2 | Reveal hidden navigation — links behind a menu/hamburger/drawer; click the toggle then re-read | reactor prompt + planner | [S3](phase-s3-reliability-actions.md) (obstructed pages) | RETAINED (partly code-backed by the structural-signature re-read; S3's paired sweep decides) |
| 3 | Conventional path only when a link/sitemap shows it | reactor prompt + planner | [S3](phase-s3-reliability-actions.md) (nav verbs / grounding residue) | RETAINED (hard anti-fabrication already code via navigation grounding; the residual prose is redundancy S3's sweep tests) |
| 4 | Leaving the page (`web_search` / off-site) is a LAST resort | reactor prompt + `web_search_items` description | [S3](phase-s3-reliability-actions.md) / [S7](phase-s7-speed.md) | RETAINED (the escape steer; the v2 C1 exit criterion — the DoD-model escape rate is already 0%, so S3's on-page competence sweep tests whether the prose is still load-bearing) |
| 5 | Call `browser_validate_form` before submitting; requiredEmpty blocks, rest advisory | reactor prompt | [S3](phase-s3-reliability-actions.md) (typed widgets / form completion) | RETAINED (typed-widget/form completion decides) |
| 6 | Read `networkWarning`; don't `web_search` to confirm your own save | reactor prompt | [S4](phase-s4-verified-outcomes.md) (verified outcomes) | RETAINED (subsumed when the validator consumes typed evidence) |
| 7 | `browser_get_elements` note (collapsed menus' links not listed until opened) | tool description | [S2](phase-s2-perception-v2.md) (perception economy) | RETAINED (diff/identity serialization decides) |

## What is intentionally NOT prose debt

The **security preamble** (`SECURITY_PREAMBLE`) and untrusted-content fencing are not steers — they are
part of the [S6](phase-s6-safety-control-plane.md)-measured security plane. General framing ("verify
after acting", "don't give up early") stays as the minimal open-ended strategy prompt.

## Program audit

The final audit of this ledger — every row moved to DELETED or a justified RETAINED — is an
[S11](phase-s11-benchmark-h2h.md) exit line. As of program start all seven rows are RETAINED (the v2
state); the target is that S2/S3/S4 convert rows 1–7 as their paired sweeps land.
