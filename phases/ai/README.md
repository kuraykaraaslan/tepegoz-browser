# AI Agent Competence Track (`phases/ai/`)

A focused sub-track for making the **agent (Do mode)** genuinely capable on the real web —
**commercial-grade, measurable, honest** — rather than accreting one prompt sentence per failure.

> **Relationship to the main roadmap:** this is a deepening of the agent work in
> [Phase 1a](../phase-1a-walking-skeleton-mvp.md) / [Phase 1b](../phase-1b-agentic-deepening.md).
> It does **not** replace them; it sequences the competence upgrades those phases assume. Every
> cross-cutting compliance gate in [`../README.md`](../README.md) applies here too (zod boundary
> `safeParse`, `AppError`, per-package i18n, determinism-first, DoD coverage, no `apps/desktop` growth).
> **Artifacts are English-first** (this track included).

## Why this track exists (the problem)

Each real agent failure so far was met with a sentence added to the system prompt (open the menu, try
`/blog`, …). That does not scale to the thousands of shapes the real web takes, and it is **fragile**:
prose is the weakest, least-general lever. For a commercial product we need **real, verifiable results**,
not green tests that prove nothing.

## Guiding principles

1. **Encode competence in CODE, not prose.** Most "thousands of scenarios" are a handful of *systematic*
   gaps (perception, loop control, missing primitives). Fix the gap once in code and it generalises across
   every site. Prose is reserved for genuinely open-ended judgement, kept small and general.
2. **Measure with a REAL eval loop — no vanity.** The only evidence of competence is the **real product
   model** driving **real / representative pages** with **ground-truth scoring** and a **held-out set**
   (no overfitting the fix to the eval). Offline/scripted tests verify *plumbing/regression only* and are
   **never** presented as competence evidence.
3. **Turn every failure into a scenario.** failure → golden scenario → diagnose (systematic → code /
   open-ended → general heuristic) → prove pass-rate up on the real-model eval → green, no regression.

## Build vs. buy: `browser-use` and `nanobrowser`

We evaluated two mature open-source agents.

- **`browser-use`** — **learn from it, do NOT adopt as a runtime dependency.** It is Python (~99%) +
  Playwright: embedding it means a **separate Chromium** and a **Python sidecar**, which bypasses
  tepegoz's own embedded browser (WebContentsView + per-partition isolation), its security/policy/HITL/
  Egress-Firewall plane, and its i18n — a packaging, security, and architecture liability for a commercial
  product.
- **`nanobrowser`** — a **TypeScript/CDP port of browser-use's approach** (the `playwright-highlight-container`
  lineage gives it away). It is our **ready reference** for porting the same proven techniques into
  tepegoz's stack — no new runtime dependency, no second browser.

**Decision:** keep tepegoz's architecture and security posture; **port the proven techniques** (perception,
loop control, action vocabulary, content-security) into our own packages. Real-gesture human input
(see the human-input adapter) stays exactly as-is for clicking/typing.

### Port reference (nanobrowser, local checkout)
- Perception: `chrome-extension/public/buildDomTree.js`, `.../browser/dom/{service,clickable/service,views,raw_types}.ts`, `.../browser/page.ts`
- Loop: `.../agent/{executor,agents/base,agents/navigator,agents/planner,messages/service}.ts`
- Actions: `.../agent/actions/{schemas,builder}.ts`
- Content-security: `.../services/guardrails/{index,patterns,sanitizer,types}.ts`

## Phase index

| Phase | File | Goal | Depends on | Status |
|---|---|---|---|---|
| AI-1 | [phase-ai-1-eval-harness.md](phase-ai-1-eval-harness.md) | Real-result eval loop (golden set + live harness + held-out) | Phase 1a | 🟡 In progress (backbone + live tier + judge + nightly CI code landed; **e2e `pnpm eval` now runs green on-harness** — scripted tier PASS vs. the real app after fixing two launch blockers, `e9f7fee`; live-tier competence numbers owed) |
| AI-2 | [phase-ai-2-perception-buildtree.md](phase-ai-2-perception-buildtree.md) | Render-DOM perception (buildDomTree-style) replacing a11y-only | AI-1 | 🟡 In progress (PR1+PR2a+PR2b code landed: core perception + predicates + typed model + serialization + child-index→CDP click mapping + `href`/attrs + `*[n]` marking + cursor/viewport calibration + open-shadow/same-origin-iframe stitching; a11y fallback behind `TEPEGOZ_PERCEPTION`. Remaining: closed-shadow/cross-origin frames + on-harness measurement) |
| AI-3 | [phase-ai-3-agent-loop.md](phase-ai-3-agent-loop.md) | Planner-as-validator loop + progress memory + state-every-step | AI-1 | 🟡 In progress (PR1+PR2 landed: progress-brain fields + transient page-state; planner-as-validator completion authority + periodic done-check + fail-closed cap. PR3 landed (code): stale-ref/re-click-loop guard via a host-computed structural page-signature — shadow/iframe-piercing, scroll-aware — + a loop-detector recovery nudge with idempotent reads exempted; mechanism deviation from the planned branch-path-hash subset guard, recorded. Remaining: on-harness measurement) |
| AI-4 | [phase-ai-4-action-vocabulary.md](phase-ai-4-action-vocabulary.md) | Higher-level deterministic actions (scroll-to-text, dropdowns, …) | AI-2 | 🟡 In progress (PR1 landed (code): `scroll_to_text` content-addressed reveal as a `browser_update_page` variant, over the browser's native find (same-origin frames incl.); unit-tested. Remaining: native dropdowns, page-quantized scroll + boundary detection, web-search, send-keys, tab auto-switch + on-harness measurement) |
| AI-5 | [phase-ai-5-content-security.md](phase-ai-5-content-security.md) | Untrusted-content wrapping + injection/PII sanitizer | AI-2 | 🟡 In progress (PR1+PR2 landed: inbound content-guard — NFKC + injection redaction + forged-tag strip + threat taxonomy at the perception boundary; trusted-task fencing + security preamble; strict-mode PII redaction + GuardConfig. Remaining: strict-mode setting wiring + on-harness measurement) |
| AI-6 | [phase-ai-6-consolidation.md](phase-ai-6-consolidation.md) | Retire prose patches (once subsumed) + institutionalise the loop | AI-2, AI-3 | ⬜ Not started |
| AI-7 | [phase-ai-7-navigation-grounding.md](phase-ai-7-navigation-grounding.md) | Evidence-gated URLs + no escape-hatch (visible-nav-first; search/guess only after on-page route exhausted) | AI-2, AI-3, AI-4 | ⬜ Not started (external audit `s01`, `s31`) |
| AI-8 | [phase-ai-8-beyond-the-port.md](phase-ai-8-beyond-the-port.md) | Net-new axes: real vision, network verification, table understanding, per-domain memory | AI-1, AI-2 | ⬜ Not started (external audit `s19`/`s10`/`s17`/`s22`) |

Status legend: ⬜ Not started · 🟡 In progress · ✅ Done (DoD passed).

**Recommended order:** AI-1 → AI-2 → AI-3 (these three close most observed failures) → AI-4 / AI-5 → AI-6.
Each phase is one to two PRs.

## Interim state (to be retired in AI-6)

While the code capabilities land, the agent carries **hand-written prompt heuristics** as a stop-gap:
the "REVEAL hidden navigation / collapsed menu / try `/blog`" lines in the reactor `BROWSING_STRATEGY`
([`packages/orchestrator/src/reactor.ts`](../../packages/orchestrator/src/reactor.ts)), the parallel planner
prose, and the `browser_get_elements` description note. **These are intentionally temporary** — AI-6 removes
them **only after** the corresponding capability is proven (on the real-model eval) to subsume them.

## External suggestion audit (2026-07-10)

An external AI proposed ~30 improvements for the agent. We audited each against the **actual code** (an
8-cluster, 16-agent fan-out; every "done"/"mostly" independently re-checked to defeat vanity — *unit-tested
≠ done*, *prompt sentence ≠ code*, *off-by-default ≠ wired*). **Headline:** the systematic backbone the port
built — perception, the react loop + validator, the error taxonomy, the constrained tool vocabulary,
inbound content-security, and the HITL/handoff/egress plane — is **real, wired, and default-on**, not prose.
The gaps are a handful of coherent axes (mostly *net-new* capabilities the port never scoped), now tracked
in the phases below. Tally (30 original + `s31` added on review; `s02` landed via `TEPEGOZ_EVAL_REPEAT`
right after the audit): **1 done · 10 mostly · 14 partial · 6 not-addressed.**

> **One vanity risk to fix now:** `browser_get_screenshot` captures a real PNG, and the recovery/strategy
> prose *recommends* it "as a visual fallback" — but `CanonMessage.content` is string-only and no provider
> adapter carries images, so the model is **structurally blind** to the screenshot. Either wire the image
> through (AI-8A) or stop recommending a blind tool. See [AI-8](phase-ai-8-beyond-the-port.md).

Status: ✅ done · 🟢 mostly (wired, minor gaps) · 🟡 partial (some sub-points, or built-but-unwired/off-by-default/prompt-only) · ⬜ not-addressed.

| # | Suggestion | Status | Where it lands |
|---|---|:--:|---|
| s24 | Constrain action space to schema-validated tools (no raw JS) | ✅ | Already done — no eval/JS tool exists; zod at the ToolGateway PEP + reactor decision schema |
| s29 | Prompt-injection defence — page text is untrusted data | 🟢 | [AI-5](phase-ai-5-content-security.md) — strongest item; owes on-harness non-deviation run |
| s30 | Human handoff at the right moment, specific message | 🟢 | Built (CAPTCHA/2FA, no auto-solve, credit preserved). Resume + payment/irreversible triggers → [Phase 9](../phase-9-safe-autonomy-delegation.md) |
| s08 | Observe→Decide→Act→Verify→Update loop | 🟢 | [AI-3](phase-ai-3-agent-loop.md) — live; observe/verify are model-elected, staleness caught reactively |
| s06 | Pre/post-action state verification | 🟢 | [AI-3](phase-ai-3-agent-loop.md) — `pageChanged`/`sig` live; toast+network signals + click-time selection weaker |
| s12 | Error taxonomy with per-type recovery | 🟢 | [AI-3](phase-ai-3-agent-loop.md) — 11-kind taxonomy wired; ~3 requested classes not distinct |
| s11 | Condition-based waiting (no fixed sleep) | 🟢 | [AI-3](phase-ai-3-agent-loop.md) — network-idle + DOM-quiet live; no wait-until-element/response, no SPA/scroll split |
| s25 | Separate evaluator, not agent self-report | 🟢 | [AI-1](phase-ai-1-eval-harness.md) — ground-truth vs real page is the dominant path; `expectedValue` still reads the summary |
| s03 | Expand fixture/benchmark set | 🟢 | [AI-1](phase-ai-1-eval-harness.md) — 22 fixtures/23 scenarios; missing file-download + broken-HTML; live run owed |
| s04 | Prioritise a11y/role/semantic over CSS classes | 🟢 | [AI-2](phase-ai-2-perception-buildtree.md) — recognises by role/aria (not class); default path omits `aria-labelledby`/`label-for` |
| s23 | Short structured context + stable short IDs | 🟢 | [AI-2](phase-ai-2-perception-buildtree.md) — capped/structured/sanitized; no page summary; refs positional not identity-stable |
| s01 | **URL-guessing fix: visible-nav-first, guess only if DOM/sitemap backs it** | 🟡 | **[AI-7](phase-ai-7-navigation-grounding.md)** (new) — today prose-only and *contradicted*; no sitemap/robots parsing |
| s05 | Multi-layer element finding + fallback | 🟡 | [AI-2](phase-ai-2-perception-buildtree.md) — one address per ref; no cascade/alt-locator; no action-time occlusion re-check |
| s09 | Track page changes by diff, not whole DOM | 🟡 | [AI-2](phase-ai-2-perception-buildtree.md) — `*[n]` new-element marker only; full list still resent; token cut is collapse not diff |
| s07 | Split Planner/Executor/Verifier/Replanner | 🟡 | [AI-3](phase-ai-3-agent-loop.md) — Executor + goal-level Verifier live; no per-step verify, **no Replanner** |
| s15 | Structured working-state (not chat history) | 🟡 | [AI-3](phase-ai-3-agent-loop.md) — state is free-text `memory` in chat; structured checkpoint exists but journal-only |
| s14 | Loop detection via state hashes + replan | 🟡 | [AI-3](phase-ai-3-agent-loop.md) — action-signature loop-stop live; no run-level state-hash no-progress, no replan-after-N |
| s13 | Smart recovery (modal-close, tab-switch, re-login) | 🟡 | [AI-3](phase-ai-3-agent-loop.md) — re-analyse + scroll-into-view real; modal-close/auto-tab-switch/re-login absent |
| s18 | Tab/popup/iframe management | 🟡 | [AI-4](phase-ai-4-action-vocabulary.md) — same-origin iframe auto-entry done; tab-spawn detect/auto-switch + popup-return unbuilt |
| s16 | Validation-aware form-filling engine | 🟡 | [AI-4](phase-ai-4-action-vocabulary.md) — `<select>`+file wired; validation attrs not captured; no pre-submit check |
| s21 | Site-specific skills vs general strategy | 🟡 | [Phase 2](../phase-2-adapters-safe-browsing.md) — capability-plane seam + web-tools ships; no per-site DOM adapter |
| s26 | Rich performance metrics | 🟡 | [AI-1](phase-ai-1-eval-harness.md) — success+tokens live; duration/first-attempt/avg-actions/$cost absent; recovery+intervention dead in live path |
| s28 | Adversarial test set | 🟡 | [AI-1](phase-ai-1-eval-harness.md) + [AI-5](phase-ai-5-content-security.md) — injection + same-name traps only; fake-download/scroll-hide/decoy missing |
| s20 | Approval gate; separate prepare from send | 🟡 | [Phase 9](../phase-9-safe-autonomy-delegation.md) — gate built+default-on; no prepare/send split, `financial` class unassigned, biometric unenforced |
| s19 | Combine visual understanding with DOM | 🟡 | **[AI-8A](phase-ai-8-beyond-the-port.md)** (new) — screenshot captured but model is blind to pixels (vanity flag) |
| s10 | Observe the network layer (status codes/verify) | 🟡 | **[AI-8B](phase-ai-8-beyond-the-port.md)** (new) — Network enabled for idle-wait only; no status/response capture |
| s02 | Run each scenario ≥3× | 🟢 | [AI-1](phase-ai-1-eval-harness.md) — **landed** (`TEPEGOZ_EVAL_REPEAT`: majority verdict + k/N pass-frequency + mean); step-count/duration aggregation still owed |
| s27 | Flaky detection + confidence intervals | ⬜ | [AI-1](phase-ai-1-eval-harness.md) — point estimates only; needs s02 first |
| s17 | Table/list understanding layer | ⬜ | **[AI-8C](phase-ai-8-beyond-the-port.md)** (new) — tables readable only as flat text |
| s22 | Per-domain success memory (re-validated) | ⬜ | **[AI-8D](phase-ai-8-beyond-the-port.md)** (new) — nothing cached across runs |
| s31 | Constrain the `web_search`/URL escape hatch; steer to on-page persistence + measure | ⬜ | **[AI-7](phase-ai-7-navigation-grounding.md)** — un-gated search tool; **empirically the top anti-pattern** (live-run finding #4) |

New phases added by this audit: **[AI-7](phase-ai-7-navigation-grounding.md)** (navigation grounding, `s01`)
and **[AI-8](phase-ai-8-beyond-the-port.md)** (net-new axes: `s19`/`s10`/`s17`/`s22`). Deepenings for
`s02`/`s26`/`s27`/`s03`/`s28`/`s04`/`s05`/`s23`/`s07`/`s14`/`s15`/`s16` are appended as **"Audited gaps"**
task blocks inside the existing AI-1..AI-5 docs. `s20`/`s30` (safe-autonomy) and `s21` (site adapters) are
routed to the main-roadmap [Phase 9](../phase-9-safe-autonomy-delegation.md) / [Phase 2](../phase-2-adapters-safe-browsing.md).
