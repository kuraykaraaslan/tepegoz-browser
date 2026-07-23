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
| AI-1 | [phase-ai-1-eval-harness.md](phase-ai-1-eval-harness.md) | Real-result eval loop (golden set + live harness + held-out) | Phase 1a | 🟡 In progress (backbone + live tier + judge + nightly CI landed. **2026-07-24: the live tier now produces VALID numbers** — fixed five defects that made every prior `REPEAT>1` figure invalid (per-trial profile+output file, onboarding seed, `--user-data-dir` honoured, tab-ready bootstrap, cut-off vs. fail split; see the dated note below). First real live measurement captured. Remaining: broaden the live sweep + flaky/CI intervals) |
| AI-2 | [phase-ai-2-perception-buildtree.md](phase-ai-2-perception-buildtree.md) | Render-DOM perception (buildDomTree-style) replacing a11y-only | AI-1 | 🟡 In progress (PR1+PR2a+PR2b code landed: core perception + predicates + typed model + serialization + child-index→CDP click mapping + `href`/attrs + `*[n]` marking + cursor/viewport calibration + open-shadow/same-origin-iframe stitching; a11y fallback behind `TEPEGOZ_PERCEPTION`. Remaining: closed-shadow/cross-origin frames + on-harness measurement) |
| AI-3 | [phase-ai-3-agent-loop.md](phase-ai-3-agent-loop.md) | Planner-as-validator loop + progress memory + state-every-step | AI-1 | 🟡 In progress (PR1+PR2 landed: progress-brain fields + transient page-state; planner-as-validator completion authority + periodic done-check + fail-closed cap. PR3 landed (code): stale-ref/re-click-loop guard via a host-computed structural page-signature — shadow/iframe-piercing, scroll-aware — + a loop-detector recovery nudge with idempotent reads exempted; mechanism deviation from the planned branch-path-hash subset guard, recorded. Remaining: on-harness measurement) |
| AI-4 | [phase-ai-4-action-vocabulary.md](phase-ai-4-action-vocabulary.md) | Higher-level deterministic actions (scroll-to-text, dropdowns, form validation, …) | AI-2 | 🟡 In progress (PR1: `scroll_to_text` content-addressed reveal over the browser's native find; native dropdowns landed as `select_option`. **PR2 `s16` landed:** validation attributes captured end-to-end (`required`/`pattern`/`aria-invalid`/…) + the `browser_validate_form` pre-submit gate over a pure, ReDoS-safe `checkForm`, + a `form-validation` fixture. **2026-07-24 measured (gpt-4o, N=3): 0/3 → 1/3** — the agent now perceives + fills empty AND pre-filled fields and one trial completes end-to-end; remaining failures are model escape/loop behaviour (AI-3/AI-7), not the form layer. Remaining: page-quantized scroll + boundary detection, send-keys, tab auto-switch, typed-widget fill helpers) |
| AI-5 | [phase-ai-5-content-security.md](phase-ai-5-content-security.md) | Untrusted-content wrapping + injection/PII sanitizer | AI-2 | 🟡 In progress (PR1+PR2 landed: inbound content-guard — NFKC + injection redaction + forged-tag strip + threat taxonomy at the perception boundary; trusted-task fencing + security preamble; strict-mode PII redaction + GuardConfig. Remaining: strict-mode setting wiring + on-harness measurement) |
| AI-6 | [phase-ai-6-consolidation.md](phase-ai-6-consolidation.md) | Retire prose patches (once subsumed) + institutionalise the loop | AI-2, AI-3 | ⬜ Not started |
| AI-7 | [phase-ai-7-navigation-grounding.md](phase-ai-7-navigation-grounding.md) | Evidence-gated URLs + no escape-hatch (visible-nav-first; search/guess only after on-page route exhausted) | AI-2, AI-3, AI-4 | 🟡 In progress (PR1 code+unit-tests landed: pure candidate resolver + SSRF-safe sitemap/robots reader (same-origin construction, redirect-disabled) + `web_search_items` surfaced & gated as a steer + `s31` escape-rate metric + `escape-bait`/`url-hallucination-trap`/`sitemap-only-route` fixtures + the `/blog` blind-guess prose **removed** from reactor/planner. Remaining: the live N≥3 on-harness numbers — escape-rate down + traps flip to pass, held-out no-regress) |
| AI-8 | [phase-ai-8-beyond-the-port.md](phase-ai-8-beyond-the-port.md) | Net-new axes: real vision, network verification, table understanding, per-domain memory | AI-1, AI-2 | 🟡 In progress (**8A vanity flag cleared**: no prose steers the agent at the screenshot tool it is blind to, and the tool now says so itself — test-locked. The four capabilities themselves — vision pixels `s19`, network status `s10`, table structure `s17`, per-domain memory `s22` — remain unbuilt) |

Status legend: ⬜ Not started · 🟡 In progress · ✅ Done (DoD passed).

**Recommended order:** AI-1 → AI-2 → AI-3 (these three close most observed failures) → AI-4 / AI-5 → AI-6.
Each phase is one to two PRs.

## 2026-07-24 — first VALID live-harness measurement, and what it exposed

Driving the real app with a live model (openai gpt-4o) for the first time revealed that **neither the
harness nor the agent's page-interaction layer actually worked end-to-end** — every prior on-harness
number in this repo is suspect. Root causes found and fixed (all committed; each was a real product bug,
not an eval artifact — they bite any tab driven before its chrome lays out, or while its window is
unfocused):

1. **Perception blindness (0×0 content view).** The tab `WebContentsView` starts 0×0 and is sized only
   by a renderer IPC that doesn't exist until the `App` chrome mounts; a page loaded first got
   `innerWidth/innerHeight 0`, so render-DOM perception rejected EVERY element and returned a silent
   empty set. Fix: never lay a view out 0×0 (native-window fallback, sized at creation) + a bounded
   viewport-ready wait. Proven: `[perception] render-dom EMPTY w:0,h:0` → `count:7`.
2. **Fill typed into nothing.** In an unfocused/backgrounded window a synthetic click doesn't focus an
   input (and focus lands async). Fix: focus emulation on attach + poll-for-focus + DOM.focus fallback.
3. **Fill couldn't replace a pre-filled value.** Ctrl+A select-all is unreliable when unfocused. Fix:
   deterministic `el.select()`.
4. **One self-corrected error killed the run.** The reactor's recovery budget accumulated across the
   whole run; an agent that fumbled args, recovered, then hit one fresh error later was killed. Fix:
   a tool's success refreshes its recovery budget (regression-tested).
5. **Harness could not produce a valid N>1 number.** Trials shared one output file (trial 2 scored trial
   1's output and killed the app mid-run), shared the dev profile, and started behind the onboarding
   surface (which replaces the chrome, so no content bounds ever reported). Fixes: per-trial profile +
   output file, seed `onboardingCompleted`, honour `--user-data-dir`, tab-ready bootstrap, cut-off
   reported distinctly. **Consequence: every `REPEAT>1` figure recorded before today is invalid.**

**First honest numbers (openai gpt-4o, N=3, genuinely independent trials):**
- `form_validation_required` (AI-4): **0/3 → 1/3**. Before the fixes the agent was blind (0 elements);
  now it perceives, fills (empty AND pre-filled fields), and one trial completes the form end-to-end.
- The remaining failures are now **agent behaviour, not infrastructure**: after filling, the model
  (gpt-4o) sometimes escapes to a web search ("how do I confirm this saved?") or loops instead of
  clicking Save and reading the result. That is exactly the competence AI-3 (loop) and AI-7 (escape
  suppression) target — a real measured signal, no longer a blocked pipeline.
- `silent_api_failure` (AI-8B): the network recorder is confirmed working live (observes real responses);
  the scenario is gated by the same escape-after-fill behaviour, not by the AI-8B mechanism (whose
  end-to-end 507 capture was demonstrated earlier).

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
right after the audit): **1 done · 10 mostly · 14 partial · 6 not-addressed.** *(Update 2026-07-23: **AI-7 PR1**
landed the code for `s01` and `s31`, moving both to 🟢 (code + unit tests; on-harness live numbers still owed).)*

> **~~One vanity risk to fix now~~ — ✅ FIXED 2026-07-23.** `browser_get_screenshot` captures a real PNG but
> `CanonMessage.content` is string-only and no adapter carries images, so the model is **structurally blind**
> to it — yet seven places (strategy/planner/recovery/tool descriptions/loop-nudge) recommended it "as a
> visual fallback", and the tool's own text described *"this image"* to a model that never receives it. All
> steers now point at capabilities that actually work (scroll / `scroll_to_text` / reveal + re-read), the
> returned note states the pixels are NOT sent, and a unit test locks the honesty contract in.
> **Real vision (wiring the image through) remains owed** — see [AI-8](phase-ai-8-beyond-the-port.md).

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
| s01 | **URL-guessing fix: visible-nav-first, guess only if DOM/sitemap backs it** | 🟢 | **[AI-7](phase-ai-7-navigation-grounding.md)** — code landed: grounded candidate resolver + real sitemap/robots parsing; ungrounded origin+path never proposed; blind-guess prose removed. On-harness proof owed |
| s05 | Multi-layer element finding + fallback | 🟡 | [AI-2](phase-ai-2-perception-buildtree.md) — one address per ref; no cascade/alt-locator; no action-time occlusion re-check |
| s09 | Track page changes by diff, not whole DOM | 🟡 | [AI-2](phase-ai-2-perception-buildtree.md) — `*[n]` new-element marker only; full list still resent; token cut is collapse not diff |
| s07 | Split Planner/Executor/Verifier/Replanner | 🟡 | [AI-3](phase-ai-3-agent-loop.md) — Executor + goal-level Verifier live; no per-step verify, **no Replanner** |
| s15 | Structured working-state (not chat history) | 🟡 | [AI-3](phase-ai-3-agent-loop.md) — state is free-text `memory` in chat; structured checkpoint exists but journal-only |
| s14 | Loop detection via state hashes + replan | 🟡 | [AI-3](phase-ai-3-agent-loop.md) — action-signature loop-stop live; no run-level state-hash no-progress, no replan-after-N |
| s13 | Smart recovery (modal-close, tab-switch, re-login) | 🟡 | [AI-3](phase-ai-3-agent-loop.md) — re-analyse + scroll-into-view real; modal-close/auto-tab-switch/re-login absent |
| s18 | Tab/popup/iframe management | 🟡 | [AI-4](phase-ai-4-action-vocabulary.md) — same-origin iframe auto-entry done; tab-spawn detect/auto-switch + popup-return unbuilt |
| s16 | Validation-aware form-filling engine | 🟢 | [AI-4](phase-ai-4-action-vocabulary.md) — code landed: validation attrs (`required`/`pattern`/`aria-invalid`/…) captured end-to-end + a `browser_validate_form` pre-submit gate. Hardened by review: only required-empty BLOCKS (stale `aria-invalid`/error text is advisory, so it can't deadlock), coverage is reported honestly (whole-page snapshot via a new `viewportExpansionPx` seam; `partial` when truncated/attribute-less), and the report is injection-redacted + untrusted-fenced. Typed-widget fill helpers + on-harness proof owed |
| s21 | Site-specific skills vs general strategy | 🟡 | [Phase 2](../phase-2-adapters-safe-browsing.md) — capability-plane seam + web-tools ships; no per-site DOM adapter |
| s26 | Rich performance metrics | 🟡 | [AI-1](phase-ai-1-eval-harness.md) — success+tokens live; duration/first-attempt/avg-actions/$cost absent; recovery+intervention dead in live path |
| s28 | Adversarial test set | 🟡 | [AI-1](phase-ai-1-eval-harness.md) + [AI-5](phase-ai-5-content-security.md) — injection + same-name traps only; fake-download/scroll-hide/decoy missing |
| s20 | Approval gate; separate prepare from send | 🟡 | [Phase 9](../phase-9-safe-autonomy-delegation.md) — gate built+default-on; no prepare/send split, `financial` class unassigned, biometric unenforced |
| s19 | Combine visual understanding with DOM | 🟡 | **[AI-8A](phase-ai-8-beyond-the-port.md)** — **vanity flag cleared** (nothing now recommends the blind tool; its own text says the pixels are not sent, test-locked). The capability itself — pixels reaching the model via a `CanonMessage` image type + adapters — is still unbuilt |
| s10 | Observe the network layer (status codes/verify) | 🟡 | **[AI-8B](phase-ai-8-beyond-the-port.md)** (new) — Network enabled for idle-wait only; no status/response capture |
| s02 | Run each scenario ≥3× | 🟢 | [AI-1](phase-ai-1-eval-harness.md) — **landed** (`TEPEGOZ_EVAL_REPEAT`: majority verdict + k/N pass-frequency + mean); step-count/duration aggregation still owed |
| s27 | Flaky detection + confidence intervals | ⬜ | [AI-1](phase-ai-1-eval-harness.md) — point estimates only; needs s02 first |
| s17 | Table/list understanding layer | ⬜ | **[AI-8C](phase-ai-8-beyond-the-port.md)** (new) — tables readable only as flat text |
| s22 | Per-domain success memory (re-validated) | ⬜ | **[AI-8D](phase-ai-8-beyond-the-port.md)** (new) — nothing cached across runs |
| s31 | Constrain the `web_search`/URL escape hatch; steer to on-page persistence + measure | 🟢 | **[AI-7](phase-ai-7-navigation-grounding.md)** — code landed: search re-described + gated as a steer (not a block), grounded on-page candidate preferred, and an **escape-rate metric** + `escape-bait` fixture now measure it. Live before/after owed |

New phases added by this audit: **[AI-7](phase-ai-7-navigation-grounding.md)** (navigation grounding, `s01`)
and **[AI-8](phase-ai-8-beyond-the-port.md)** (net-new axes: `s19`/`s10`/`s17`/`s22`). Deepenings for
`s02`/`s26`/`s27`/`s03`/`s28`/`s04`/`s05`/`s23`/`s07`/`s14`/`s15`/`s16` are appended as **"Audited gaps"**
task blocks inside the existing AI-1..AI-5 docs. `s20`/`s30` (safe-autonomy) and `s21` (site adapters) are
routed to the main-roadmap [Phase 9](../phase-9-safe-autonomy-delegation.md) / [Phase 2](../phase-2-adapters-safe-browsing.md).
