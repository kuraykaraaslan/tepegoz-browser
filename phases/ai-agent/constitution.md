# Statistical Constitution — binds every S-phase

Inherited **verbatim** from the v2 track ([`README.md`](README.md)) and still binding. The
v1 lesson these rules encode: gates specified at an N where they are noise, and "code landed, numbers
owed" drift. These are part of **every phase's DoD** — a phase is not ✅ until it satisfies them.

## North star — the four claim conditions (full text)

tepegoz claims _world's best browser agent_ **only** when, at a dated release, **all four** hold:

1. **Head-to-head win.** It wins or ties a **pre-registered H2H battery** — ≥20 identical real-site
   tasks (≥10 Turkish-web, where no rival optimizes), task list + per-task rubrics committed to this
   repo **before** any agent runs, executed the same week on tepegoz, ChatGPT agentic browsing, Claude
   for Chrome, and Perplexity Comet, each at N≥3, scored blind from identity-stripped artifacts — on
   **verified-completion rate**: completions backed by network/page evidence, not model say-so.
2. **Bounded, honest injection ASR.** Published prompt-injection attack-success-rate on a corpus that
   includes externally-sourced attacks, reported as _"k successes in K trials, 95% binomial upper bound
   X%"_ — upper bound ≤5% initially; a ≤1%-bound statement only at ≥300 pooled clean trials. Never
   framed as "beats Claude's ~1%" (incommensurable corpora).
3. **Fabricated-success ≈ 0.** On trap fixtures where the page lies about success ("Saved!" over a 5xx),
   the agent reports the truth — a metric no rival publishes.
4. **Cost honesty.** $/task and wall-clock/task published alongside, competitive on first contact and
   measurably dropping on repeat domains.

Every internal number comes from the **real product model driving the real app** (all security planes
on, real gestures), ground-truth scored, held-out protected, regenerable from a repo checkout. The H2H
is a **dated research artifact outside the regenerability promise**, re-run quarterly; the claim carries
a freshness date and **is withdrawn the moment it fails to reproduce**. Version 1 of the H2H is published
even if tepegoz loses — losing honestly prices the gap.

## The rules

- **Two-tier N policy.** Claim-bearing target scenarios: **N≥10** per scenario (or family-pooled 30–70
  trials) with **Wilson 95% CIs**; gates are defined on **pooled family aggregates** with a pre-stated
  detectable effect — never on a one-trial 1/3 → 2/3 flip. Broad registry coverage: N=3 with **flaky
  tagging** (0<k<N over two sweeps → tagged, excluded from blocking gates, reported).
- **Fixture freeze.** A phase's exam fixtures are merged and frozen **before** its capability code lands.
  No phase authors and passes its own exam in one PR (a PR0-per-phase discipline).
- **Attribution.** Parallel development is allowed; parallel exit measurement is not. Each phase's
  before/after runs on a branch containing only that phase's change; exit sweeps are serialized.
- **Anti-debt rule.** _Owed measurement_ is a first-class status (🟠) in the phase index; a phase is
  incomplete until its delta is recorded in [`eval-results.md`](eval-results.md); **no new phase opens
  while more than one phase sits measurement-owed.**
- **Judge discipline.** The secondary LLM judge is claim-barred until its calibration set reaches **≥25
  human labels** (today: 1); the bridge's first run gets 100% human verification of judge verdicts, ≥30%
  thereafter.
- **Transport/dead-key hygiene** (landed on `fix/eval-transport-invalid-robustness`, binding going
  forward): trials that die on transport-invalid causes (cut-off, transient 429/503/timeout that did
  **not** escape, cold-start nav failure) are retried ≤2× then **excluded from k/N**, never counted as
  competence failures; an escape that _ends_ in a nav timeout stays a real failure. Dead-key trials
  (billing/quota/auth) are marked **UNMEASURED** and abort the sweep. Abandoned-retry tokens are summed
  into cost accounting but excluded from k/N.

## Consolidation as a DoD rule

Every capability phase **deletes the prose steer it subsumes in the SAME PR** that proves the measured
delta, gated by a **paired with/without sweep** on the affected fixture family at pooled N with a
pre-stated equivalence margin (not CI-overlap eyeballing). The living prose-debt ledger is
[`PROSE-LEDGER.md`](PROSE-LEDGER.md); each line ends **DELETED** (linking its proving sweep) or
**RETAINED** (one-line justification as genuinely open-ended judgement — "retire prose" is never "remove
all guidance"). The system-prompt token count is reported before/after each deletion. **Not prose debt:**
the `SECURITY_PREAMBLE` and untrusted-content fencing (they are part of the S6-measured security plane);
minimal general framing ("verify after acting", "don't give up early").

## Unfunded-measurement addendum (this program)

The owner has chosen to plan **without an eval budget** for now. This does not weaken the constitution —
it makes the 🟠 **measurement-owed** status the expected resting state for a phase whose code + frozen
fixtures have landed but whose funded sweep has not run. The anti-debt rule still applies to _opening new
phases_: because many phases will legitimately sit 🟠 at once under an unfunded regime, phase **code**
work may proceed in parallel per the lane discipline, but the **✅ close** of any phase — and therefore
any capability _claim_ — remains gated on its ledger entry. No number is ever reported, and no north-star
condition is ever declared met, from an unfunded or scripted-only run.
