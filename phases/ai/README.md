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
| AI-1 | [phase-ai-1-eval-harness.md](phase-ai-1-eval-harness.md) | Real-result eval loop (golden set + live harness + held-out) | Phase 1a | 🟡 In progress (backbone + live tier + judge + nightly CI code landed; e2e `pnpm eval` run pending Electron-ABI env) |
| AI-2 | [phase-ai-2-perception-buildtree.md](phase-ai-2-perception-buildtree.md) | Render-DOM perception (buildDomTree-style) replacing a11y-only | AI-1 | 🟡 In progress (PR1+PR2a+PR2b code landed: core perception + predicates + typed model + serialization + child-index→CDP click mapping + `href`/attrs + `*[n]` marking + cursor/viewport calibration + open-shadow/same-origin-iframe stitching; a11y fallback behind `TEPEGOZ_PERCEPTION`. Remaining: closed-shadow/cross-origin frames + on-harness measurement) |
| AI-3 | [phase-ai-3-agent-loop.md](phase-ai-3-agent-loop.md) | Planner-as-validator loop + progress memory + state-every-step | AI-1 | 🟡 In progress (PR1+PR2 landed: progress-brain fields + transient page-state; planner-as-validator completion authority + periodic done-check + fail-closed cap. PR3: stale-DOM guard + on-harness measurement) |
| AI-4 | [phase-ai-4-action-vocabulary.md](phase-ai-4-action-vocabulary.md) | Higher-level deterministic actions (scroll-to-text, dropdowns, …) | AI-2 | ⬜ Not started |
| AI-5 | [phase-ai-5-content-security.md](phase-ai-5-content-security.md) | Untrusted-content wrapping + injection/PII sanitizer | AI-2 | 🟡 In progress (PR1+PR2 landed: inbound content-guard — NFKC + injection redaction + forged-tag strip + threat taxonomy at the perception boundary; trusted-task fencing + security preamble; strict-mode PII redaction + GuardConfig. Remaining: strict-mode setting wiring + on-harness measurement) |
| AI-6 | [phase-ai-6-consolidation.md](phase-ai-6-consolidation.md) | Retire prose patches (once subsumed) + institutionalise the loop | AI-2, AI-3 | ⬜ Not started |

Status legend: ⬜ Not started · 🟡 In progress · ✅ Done (DoD passed).

**Recommended order:** AI-1 → AI-2 → AI-3 (these three close most observed failures) → AI-4 / AI-5 → AI-6.
Each phase is one to two PRs.

## Interim state (to be retired in AI-6)

While the code capabilities land, the agent carries **hand-written prompt heuristics** as a stop-gap:
the "REVEAL hidden navigation / collapsed menu / try `/blog`" lines in the reactor `BROWSING_STRATEGY`
([`packages/orchestrator/src/reactor.ts`](../../packages/orchestrator/src/reactor.ts)), the parallel planner
prose, and the `browser_get_elements` description note. **These are intentionally temporary** — AI-6 removes
them **only after** the corresponding capability is proven (on the real-model eval) to subsume them.
