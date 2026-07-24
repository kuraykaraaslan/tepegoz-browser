# Prose Ledger — Consolidation as a DoD Rule

v1's AI-6 ("retire prose once subsumed") is not a phase in v2 — it is a **standing rule** stamped into
every capability phase's DoD, and this file is its living ledger.

## The rule

Every capability phase **deletes the prose steer it subsumes in the SAME PR** that proves the measured
delta, gated by a **paired with/without sweep** on the affected fixture family at pooled N with a
pre-stated equivalence margin (not CI-overlap eyeballing — vacuous at small N). Each ledger line ends
**DELETED** (linking its proving sweep) or **RETAINED** (one-line justification as genuinely open-ended
judgement — "retire prose" is never "remove all guidance"). The system-prompt token count is reported
before/after each deletion. The final audit of this ledger is an
[M2](phase-ai-m2-external-yardstick.md) exit line.

## Precedent (proven pattern)

v1 [AI-7](archive/phase-ai-7-navigation-grounding.md) deleted the blind *"append `/blog` to the
origin"* guidance from the reactor + planner in the same change that landed the grounded candidate
resolver — prompt-string tests updated, no regression. That is the shape every line below follows.

## The ledger (inventory as of 2026-07-24)

The steers live in up to three homes each: the reactor strategy prompt
([`reactor-prompt.ts`](../../packages/orchestrator/src/reactor-prompt.ts)), the parallel planner prose
([`planner.ts`](../../packages/orchestrator/src/planner.ts)), and tool descriptions
([`browser-tools.ts`](../../packages/browser-tools/src/browser-tools.ts)). Deletion means all homes.

| # | Steer (paraphrased) | Homes | Owning phase | Status |
|---|---|---|---|---|
| 1 | Tab discipline — prefer the current tab; close tabs you opened | reactor prompt | [C5](phase-ai-c5-tabs-popups-widgets.md) | RETAINED (pending C5's tab world model) |
| 2 | Reveal hidden navigation — links are behind a menu/hamburger/drawer; click the toggle then re-read | reactor prompt + planner | [C4](phase-ai-c4-obstructed-pages.md) | RETAINED (partly code-backed by the structural-signature re-read note; C4's paired sweep decides) |
| 3 | Conventional path only when a link/sitemap shows it | reactor prompt + planner | [C1](phase-ai-c1-structured-state-replan.md) | RETAINED (the hard anti-fabrication is already code — navigation grounding; the residual prose is redundancy C1's sweep tests) |
| 4 | Leaving the page (`web_search` / off-site) is a LAST resort | reactor prompt + `web_search_items` description | [C1](phase-ai-c1-structured-state-replan.md) | RETAINED (the C1 exit criterion) |
| 5 | Call `browser_validate_form` before submitting; requiredEmpty blocks, rest advisory | reactor prompt | [C5](phase-ai-c5-tabs-popups-widgets.md) | RETAINED (typed-widget/form completion decides) |
| 6 | Read `networkWarning`; don't `web_search` to confirm your own save | reactor prompt | [C6](phase-ai-c6-verified-outcomes.md) | RETAINED (subsumed when the validator consumes typed evidence) |
| 7 | `browser_get_elements` description note (collapsed menus' links not listed until opened) | tool description | [C3](phase-ai-c3-perception-economy.md) | RETAINED (diff/identity serialization decides) |

> Note: rows 3–6 describe the **feature-branch** state
> (`feat/ai-8b-network-verification`, where AI-7's deletion and the AI-8B steer landed); until that
> branch merges, `main` still carries the older `/blog` wording. The ledger tracks the target state.

## What is intentionally NOT prose debt

The **security preamble** (`SECURITY_PREAMBLE`) and the untrusted-content fencing are not steers —
they are part of the [C7](phase-ai-c7-adversarial-robustness.md)-measured security plane. General
framing ("verify after acting", "don't give up early") stays as the minimal open-ended strategy prompt
per the rule above.
