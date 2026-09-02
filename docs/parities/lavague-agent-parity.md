# Track — LaVague agent-capability parity

**Status:** 📋 **Proposed — not scheduled (2026-09-01).** No branch, no ADR number reserved, no owner
sign-off. This is a captured gap list in the shape of
[`browser-settings-feature-gap.md`](../tracks/browser-settings-feature-gap.md),
[`webbrain-agent-parity.md`](webbrain-agent-parity.md) and [`aipex-agent-parity.md`](aipex-agent-parity.md):
every row names its nearest existing Tepegöz behaviour and a suggested phase home, so a future session
can promote a row into a real `phase-*.md` task or an `ai-agent` PR without re-deriving the
comparison.

**Source:** a same-session deep read of [`docs/others/tepegoz-vs-lavague.md`](../versus/tepegoz-vs-lavague.md)
(Turkish, 2026-09-01) plus a direct re-read of `.junk/lavague` (`lavague` 1.1.19 / `lavague-core`
0.2.x, Apache-2.0, `Development Status :: 3 - Alpha`) against this repo's AI surface
(`phases/ai-agent/`, `packages/orchestrator|model-gateway|capability-plane|security-policy|
agent-runtime|browser-tools|web-tools|tool-executor|local-inference|model-catalog|mcp-client|
recipe-compiler|macro-engine|notary|credential-vault|human-input`, `extensions/ext-agent`). Claims from
the comparison doc were independently re-verified against source rather than trusted as written:
`lavague-core/lavague/core/agents.py` (`WebAgent.run`/`run_step`, `n_steps=10` default, `ShortTermMemory`,
`COMPLETE`/`SUCCESS` sentinels), `world_model.py` (per-step screenshot+HTML reasoning, `SCAN`/`SWITCH_TAB`
prompt vocabulary), `navigation.py` (`_verify_llm_reponse` → `HallucinatedException`/
`ElementOutOfContextException`, the `WAIT`/`BACK`/`SCAN`/`MAXIMIZE_WINDOW`/`SWITCH_TAB` control set),
`retrievers.py` (`InteractiveXPathRetriever` → `FromXPathNodesExpansionRetriever` → `SemanticRetriever`
pipeline), `python_engine.py` (RAG/OCR extraction — confirmed this is **not** an arbitrary-code-execution
path), `base_engine.py` (`ActionResult.code` — accumulated Selenium/Playwright source), `memory.py`
(the `"""TODO: Make this class generalizable"""` comment, verbatim), `token_counter.py` +
`evaluator.py` (`pricing_config.yaml`-driven `$` estimate; `RetrieverEvaluator`/`LLMEvaluator`
precision/recall), `utilities/telemetry.py` (`LAVAGUE_TELEMETRY` opt-out default, `requests.post` to
`telemetrylavague.mithrilsecurity.io`), `lavague-integrations/drivers/{selenium,playwright}/…/base.py`
(`--disable-web-security`/`--no-sandbox` default Chrome flags), `lavague-server/` +
`extension_chrome/README.md` (the WebSocket `AgentServer` bridge — a local Python process + an
`OPENAI_API_KEY`, not an MCP server), `lavague-qa/` (`.feature` files, `generator.py` — Gherkin → pytest),
`pyproject.toml` (Alpha classifier), and `git log` (last commit `9024bb8`, 2025-01-21 — no tags). A
repo-wide grep for `mcp`/MCP across `.junk/lavague` returns only `package-lock.json`/notebook noise, not
LaVague's own code — the comparison doc's "no MCP at all" claim holds.

## Why this track exists

The comparison lands on a different asymmetry than the other two tracks in this folder. LaVague is not
a live competitive threat the way WebBrain or AIPex are — it is a **Python framework, not a product**
(`pip install lavague`, embedded into the developer's own app), it is **~20 months stale** (last commit
2025-01-21, no tags, `Development Status :: 3 - Alpha`), and on nearly every axis the comparison checked
— prompt-injection defense, sanitization, checkpoint/rollback, autonomy/permission model, credential
handling, MCP, memory, Turkish/regional support, measurement culture — **Tepegöz is already ahead**,
often by a wide margin, and LaVague has **no mechanism at all**, not a weaker one. Genuine LaVague
strengths exist (a multimodal perception loop that actually runs today, a compiled-script output
artifact, a per-component `$` cost estimate, a separate Gherkin-to-pytest QA tool), but almost every one
of them is **either already a named Tepegöz seam** (S10 vision escalation, S7's cost readout,
`webbrain-agent-parity.md`'s provider-catalog and perception-reach workstreams) **or a different product
category this track explicitly declines to chase**: an embeddable SDK, a Gradio developer demo, a
Gherkin/pytest test generator, and LlamaIndex-ecosystem pluggability are LaVague's business, not a
browser's. Honestly: this track has **one real new/small workstream**, one already-half-planned detail
to fold into an existing DoD, and a short backlog — a thin track for a thin, unmaintained rival, written
because a captured "nothing much to take, and here is exactly why" is worth more than either an inflated
proposal or no record at all.

## How to read this

The one workstream below is written like an `ai-agent` phase section (Goal → Approach →
new/changed packages → ADR owed → DoD-shaped bullets) so it can be lifted into a real phase file with
minimal rewriting. **Nothing here is committed roadmap.** Most of the capability inventory below resolves
to "already planned — cite `webbrain-agent-parity.md` / `aipex-agent-parity.md` / an S-phase, do not
re-describe it here" or to "Tepegöz is already ahead, nothing to take." That is not a gap in the analysis
— it is the analysis's actual conclusion, and this track states it plainly rather than manufacturing
workstreams to fill a template.

## Ground rules — parity, not imitation

Three LaVague defaults are **deliberately not being matched**, because matching them would violate a
standing decision this repo already made (or its plain design ethos), or would copy a documented
security anti-pattern into a codebase that has spent real effort avoiding it. Naming them once so no
future session re-proposes them by accident:

1. **No default, every-step multimodal perception as the primary path.** LaVague's `WorldModel` collects
   a screenshot + full HTML on every `run_step` call and reasons over the image by default (`world_model.py`);
   `SCAN` additionally captures the whole page. `ai-agent`'s own "Never" list already forbids
   screenshots-every-step, and vision stays **escalation-only** (ADR-0008, owned by S10). LaVague's loop
   is a legitimate reference for "what a working vision fallback looks like once S10 is un-inerted" — it
   is not a reason to loosen the trigger.
2. **No default-on, opt-out vendor telemetry.** `LAVAGUE_TELEMETRY` is unset by default, which means
   every run posts objective text, chain-of-thought, generated actions, visited URLs, bounding boxes,
   and token costs to `telemetrylavague.mithrilsecurity.io` unless the user explicitly sets
   `LAVAGUE_TELEMETRY=NONE` (`utilities/telemetry.py`). Tepegöz's local-first design ethos and the
   Notary accountability model (ADR-0030) point the opposite direction — a **local**, cryptographically
   verifiable record the user controls, not a third-party phone-home default. (Notary is written and
   unit-tested but **not yet imported by `apps/desktop`** — today's app produces no live receipts either
   — but the intended destination for "how was this run accounted for" is a local Replay Receipt, never
   a vendor endpoint, opt-in or opt-out.)
3. **No `--disable-web-security --no-sandbox` (or equivalent) as a default browser launch flag.**
   LaVague's Selenium driver (`drivers/selenium/base.py`) and Playwright driver
   (`drivers/playwright/base.py`) both open Chrome with the same-origin policy and the OS sandbox
   disabled by default, specifically to make automation easier. Tepegöz's `createWindow()` factory and
   out-of-process CDP session never relax either guarantee to make a tool's job simpler — worth stating
   explicitly so a future session wiring a new CDP helper doesn't reach for the same shortcut under
   schedule pressure.

None of these are "LaVague did it wrong" in isolation — LaVague is a developer library with no native
process, no policy kernel, and (per its own age) little ongoing maintenance pressure to harden these
defaults. The point of naming them is that a future reader of this track shouldn't reopen a decision, or
copy an anti-pattern, that was already settled for a documented reason.

---

## Capability inventory

Legend for **Home**: an existing phase/ADR name (or a sibling track's workstream) means "already planned,
cite it, do not re-describe it here." **NEW** means no existing plan owns it and this track proposes one.
**n/a** means the comparison found Tepegöz already ahead on this axis with nothing worth importing.
**Ground rules #N** means deliberately not matched.

| #   | LaVague capability                                                                                                                                                                                                                                             | Nearest Tepegöz behaviour today                                                                                                                                                                                       | Gap                                                                                                                         | Home                                                                                                                                                                                                                           |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | LlamaIndex-mediated "any model" theoretical breadth; ~5 first-class Context packages (OpenAI/Anthropic/Gemini/Fireworks/Azure) + Cohere rerank; embedding defaults to OpenAI even in non-OpenAI contexts; no local-model context                               | 8 first-class provider adapters + `local` (node-llama-cpp), one `CanonRequest`/`CanonResponse` schema, `ModelRouter` capability→tier mapping                                                                          | breadth-via-plugin-ecosystem vs. breadth-via-catalog — exactly the gap already named elsewhere                              | **`webbrain-agent-parity.md` P1** (already proposed — no new work)                                                                                                                                                             |
| 2   | `WorldModel`: screenshot + full HTML + history every step, natural-language reasoning, genuinely runs today (verified in `world_model.py`)                                                                                                                     | S10 vision escalation exists but ships **inert** — never wired rather than flag-gated (Reactor's `captureVision?` callback has no production caller; correction dated 2026-09-02 in `phase-s10-vision-escalation.md`) | a usable fallback — un-inerting S10 means doing the wiring, not flipping a flag                                             | **S10 / Phase 1b** (already planned)                                                                                                                                                                                           |
| 3   | Navigation Engine 3-stage HTML retriever pipeline; `SCAN` full-page capture; recursive `switch_frame` for iframes                                                                                                                                              | DOM/a11y-first perception (ADR-0008) + identity-stable refs/diff/elision (S2); light-DOM-only, no iframe reach                                                                                                        | iframe/frame reach specifically                                                                                             | **`webbrain-agent-parity.md` P3-b / `aipex-agent-parity.md` P2** (already proposed)                                                                                                                                            |
| 4   | `_verify_llm_reponse` (`navigation.py`) — post-hoc check that a model-generated xpath is a member of the retrieved "authorized" set, else `HallucinatedException`/`ElementOutOfContextException`                                                               | Identity-stable **ref** arguments — an unknown ref-id fails zod `safeParse` before the PolicyKernel even runs (S2)                                                                                                    | none                                                                                                                        | **n/a — S2 is already structurally stronger** (schema-level rejection beats a runtime string-membership check)                                                                                                                 |
| 5   | Action repertoire: ~6 element verbs (`click`/`setValue`/`setValueAndEnter`/`dropdownSelect`/`hover`/`scroll`) + 7 nav controls                                                                                                                                 | ~30 tools behind one PEP (`browser_*`/`tab_*`/`web_*`/`file_*`/`clipboard_*`/`download_*`/`upload_*`/`task_*`)                                                                                                        | none                                                                                                                        | **n/a — Tepegöz already ahead**                                                                                                                                                                                                |
| 6   | `ActionResult.code` (`base_engine.py`) — every successful step accumulates real, runnable Selenium/Playwright source; a run leaves behind a reusable script                                                                                                    | `@tepegoz/recipe-compiler` (Recipe IR + `evaluateAssertion` oracle) + `@tepegoz/macro-engine` — both replay through Tepegöz's own deterministic interpreter, never raw exported code                                  | a portable, human/CI-runnable artifact for reuse **outside** Tepegöz                                                        | **P1 (NEW, small — extends Phase 6)**                                                                                                                                                                                          |
| 7   | Agent loop (`agents.py`): `WebAgent.run()`, `n_steps=10` default, `ShortTermMemory` (its own code carries `"""TODO: Make this class generalizable"""`), no replanner, no typed decision, only a `[FAILED]` string-prefix loop signal; source frozen ~20 months | Typed Planner→Executor→Reactor, typed `Decision`, no-progress replan + escape trigger (landed), `CompletionEvidence` (S4)                                                                                             | none                                                                                                                        | **n/a — Tepegöz already ahead architecturally** (both sides measurement-thin in absolute terms)                                                                                                                                |
| 8   | `Evaluator` module (`evaluator.py`): `RetrieverEvaluator`/`LLMEvaluator` — xpath-targeting precision/recall against the BigAction (250-row) dataset; **component-level**, not end-to-end                                                                       | `@tepegoz/agent-eval` — ground-truth-first, frozen fixture registries, statistical constitution, judge-calibration, refusable `bridgeClaim`                                                                           | a component-level (retrieval-specific) precision/recall harness — useful once a Tepegöz retrieval engine exists to evaluate | **Backlog** (gated behind Phase 8 actually starting — not opened now)                                                                                                                                                          |
| 9   | `TokenCounter` (`token_counter.py`): opt-in, per-component (World Model / Action Engine / embedding) token + `$` breakdown against `pricing_config.yaml` multipliers                                                                                           | `TokenLedger` — per-provider/model/capability usage + budget accounting, always-on (every `complete()` call has mandatory `maxTokens`/`timeoutMs`)                                                                    | a user-facing **`$`/task readout**, not the underlying accounting (which already exists)                                    | **S7** (already planned — its own DoD line already names "a per-run `$`/wall-clock readout" as a contingent UI surface; this row supplies the `pricing_config`-style multiplier-table shape as a reference, opens nothing new) |
| 10  | `AgentLogger` (in-memory pandas) + optional `LocalDBLogger` (SQLite) + **telemetry default-ON**, opt-out, to a vendor endpoint                                                                                                                                 | Notary — hash-chain + Ed25519 checkpoint + Replay Receipt + `tepegoz-verify` (**written and tested, not yet imported by `apps/desktop`** — no live receipts today either) + event-sourced local journal               | none to import — the opt-out default is rejected outright, not partially adopted                                            | **Ground rules #2** — n/a otherwise                                                                                                                                                                                            |
| 11  | `step_by_step=True` → a blocking `input("Press ENTER…")`; no risk tier, no sensitive-site awareness, default is unattended for all `n_steps`                                                                                                                   | `ask`/`act`/`auto` + hard sensitive-site deny at every autonomy level + two-stage HITL (ADR-0013) + biometric high-risk gates                                                                                         | none                                                                                                                        | **n/a — Tepegöz already ahead**                                                                                                                                                                                                |
| 12  | No secret/credential handling; README instructs users to keep PII out of objectives (because of telemetry); `user_data` is plaintext in memory and in prompts                                                                                                  | Credential Broker — the agent has no shape a secret could arrive in; **ships inert** pending an OS-auth gate (S6)                                                                                                     | none to import                                                                                                              | **n/a — Tepegöz's design is already ahead even while inert**                                                                                                                                                                   |
| 13  | `add_knowledge(file_path)` — injects few-shot examples from a file into the World Model prompt; the closest thing LaVague has to per-site guidance                                                                                                             | No site-adapter concept for the agent today                                                                                                                                                                           | already covered elsewhere                                                                                                   | **`webbrain-agent-parity.md` P4** (already proposed — cite, don't duplicate)                                                                                                                                                   |
| 14  | **LaVague QA** — a separate CLI (`lavague-qa/`) that turns Gherkin `.feature` specs into `pytest` (Page Object) test suites, "10x web testing"                                                                                                                 | `@tepegoz/recipe-compiler`'s `evaluateAssertion` oracle exists but produces no Gherkin/pytest artifact                                                                                                                | a genuinely different product (a QA test-authoring tool, not a browsing-agent capability)                                   | **Backlog** — different product category, no natural home in a browser (see "Why this track exists")                                                                                                                           |
| 15  | Chrome extension + a locally-run Python `AgentServer` (WebSocket, `lavague-server/`) + `agent.demo()` Gradio UI — developer-facing, needs a local Python process + `OPENAI_API_KEY`                                                                            | Agent Console (Chat/Do/Make/Tasks palette), plan preview, replay timeline, evidence badges, steer, background+tray, tab-group sessions                                                                                | none                                                                                                                        | **n/a — Tepegöz already ahead** (a shipped end-user surface vs. a developer demo harness)                                                                                                                                      |
| 16  | MCP (client or server)                                                                                                                                                                                                                                         | none at all — confirmed absent from `lavague-core`/`lavague-server`/`extension_chrome` source; only `package-lock.json`/notebook noise matches a repo-wide grep                                                       | Tepegöz has an MCP **client** (ADR-0018); the **server** direction is Phase 1b's own unbuilt line                           | **n/a — nothing LaVague-specific to route**; Phase 1b's MCP-server line is unrelated to this rival                                                                                                                             |
| 17  | Turkish/regional support: none (French team, English framework, `.fr` examples)                                                                                                                                                                                | EN+TR parity per package (ADR-0016), ≥10 Turkish-web H2H requirement, Phase 11 Kamu/e-Devlet track                                                                                                                    | none                                                                                                                        | **n/a — Tepegöz already ahead**                                                                                                                                                                                                |
| 18  | Driver defaults open Chrome with `--disable-web-security --no-sandbox` (Selenium and Playwright drivers both)                                                                                                                                                  | `createWindow()` factory + out-of-process CDP session never relax same-origin or process sandbox                                                                                                                      | none — the pattern is rejected, not adopted                                                                                 | **Ground rules #3** — n/a otherwise                                                                                                                                                                                            |

---

## P1 — Recipe export as a portable script artifact (NEW, small, extends Phase 6)

**Goal.** Give a successfully-replayed Tepegöz Recipe (`@tepegoz/recipe-compiler`) an optional,
explicitly-labeled **export** to a plain, human/CI-runnable Playwright script — matching the one
concretely useful artifact LaVague's compiled-script output produces (`ActionResult.code`, verified in
`base_engine.py`) — **without** making Tepegöz's own recipe replay depend on, or ever re-read, that
exported code. The export is a one-way, point-in-time snapshot for the user's own CI; it never becomes
an input to anything inside Tepegöz.

**Approach.**

- Recipe IR (already `@tepegoz/shared-types`-schema'd, already the source of truth
  `recipe-compiler`'s gates evaluate against) records each step's resolved locator, verb, and the golden
  assertion its _original_ successful run actually satisfied. Add a pure `exportPlaywrightScript(recipe)`
  function — in `@tepegoz/recipe-compiler` itself or a thin sibling if keeping the compiler
  model-free-and-export-free as a package boundary is preferred — that walks the IR and emits literal
  `page.click(...)`/`page.fill(...)`/`expect(...)` calls: a textual rendering of already-typed data, not
  a code generator that executes anything.
- The export is **inert output**: a `.spec.ts` file written to disk (or copied to clipboard) that the
  **user** then runs in their own Playwright/CI setup. Tepegöz's own replay path keeps using the
  deterministic Recipe-IR interpreter it already has (`evaluateAssertion`, `shouldHaltOnFailure`,
  `narrowToUnattended`) — the exported script is never read back in by anything.
- Label the artifact clearly as a **snapshot, not a live automation**: it will drift if the site changes,
  the same caveat LaVague's own `ActionResult.code` carries. (LaVague has no self-healing-selector
  answer to that drift; Tepegöz's locator-cascade work already exists independently in S3 and is not
  something to port here — it stays inside the agent's own replay, not inside the exported artifact.)
- No change to the trust model: ToolGateway, PolicyKernel, and the unattended-run narrowing
  (`narrowToUnattended`) are untouched — the export function only ever reads a Recipe that has already
  passed every gate `recipe-compiler` enforces today.

**New/changed packages:** `@tepegoz/recipe-compiler` (new pure export function, no new runtime
dependency) or a thin sibling package; wherever Recipes are surfaced in `extensions/ext-agent` today
gets an "Export as Playwright script" affordance.

**ADR:** no new number — an addendum to **ADR-0031** (recipe-compiler trust model), recording that
script export is one-way, output-only, and never re-ingested by anything inside Tepegöz.

**DoD shape (draft, for whichever session promotes this):**

- [ ] Export is a pure function over Recipe IR — no code execution, no network call, deterministic given
      the same Recipe input
- [ ] The exported script is never read back into any Tepegöz code path — a test asserts the export
      module has zero importers outside its own package boundary
- [ ] Exported output is labeled, both in its own header comment and in the UI affordance, as a
      point-in-time snapshot, not a live automation
- [ ] i18n: the export affordance's copy ships EN + TR parity in the same PR
- [ ] Explicitly gated behind Phase 6 actually being picked back up (⏸ frozen out of v1 today) — this
      track does not reopen Phase 6 unilaterally

---

## Backlog (named, not written up)

- **A component-level retrieval precision/recall evaluator** — LaVague's `RetrieverEvaluator`/
  `LLMEvaluator` (`evaluator.py`) measure xpath-targeting precision/recall against a frozen dataset,
  distinct from an end-to-end task-success oracle. `@tepegoz/agent-eval` already out-classes LaVague on
  the end-to-end axis, but a component-level evaluator would be genuinely useful **once Phase 8's**
  `HybridRetriever` **exists** to evaluate. Not opened now — Phase 8 has not started, and opening a
  measurement harness for a retrieval engine that doesn't exist yet would itself be an anti-debt
  violation. Revisit when Phase 8 lands its retriever.
- **LaVague QA-style Gherkin-to-pytest generation** — real, and LaVague's own `lavague-qa/` shows it
  works today. This is a **different product category** (a QA test-authoring tool for external CI, not a
  browsing-agent capability) with no natural home inside a browser. If Tepegöz's Phase 12 (developer
  platform & marketplace) ever ships a "Recipe → external test suite" exporter for third-party QA
  workflows, this is the closest reference shape — but no pull has been demonstrated, and this is a
  backlog note, not a proposal to build one.

---

## Routing — what this track does not own

Per the existing convention ([`../README.md`](../../phases/README.md#routing--what-stays-out) /
[`ai-agent/README.md`](../../phases/ai-agent/README.md#routing--what-stays-out)), reference these,
never duplicate them:

| Stays with                                    | Material                                                                                                                                                                |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Phase 1b**                                  | Vision fallback/split provider, MCP **server** surface — LaVague has neither; nothing LaVague-specific to route here beyond confirming Tepegöz is already ahead         |
| **Phase 6**                                   | Deterministic, model-free recipes/macros — P1 sharpens with an export detail, does not redefine the replay model                                                        |
| **Phase 8**                                   | A future component-level retrieval evaluator (Backlog item), the `HybridRetriever` it would evaluate                                                                    |
| **S2**                                        | Identity-stable refs — already structurally ahead of LaVague's xpath-membership check, nothing to change                                                                |
| **S7**                                        | The `$`/task cost readout — this track supplies a reference multiplier-table shape, does not open new scope                                                             |
| **S10**                                       | Escalation-only vision — LaVague's working-today multimodal loop is a reference for "what usable looks like" once S10 is un-inerted, not a reason to change the trigger |
| **`webbrain-agent-parity.md` P1 / P3-b / P4** | Provider-catalog breadth, iframe/shadow-DOM perception, site-guidance adapters — LaVague's versions of each map onto these exactly; cite, don't duplicate               |
| **`aipex-agent-parity.md` P2 / P3**           | Same perception-reach and provider-catalog rows, second citation source                                                                                                 |
| **ADR-0013 / ADR-0039**                       | Two-stage HITL + CAPTCHA/2FA handoff shape — LaVague's `step_by_step` blocking-ENTER prompt does not revisit this                                                       |

## ADRs owed (numbers assigned when a session actually opens one of these)

- **P1:** an addendum to **ADR-0031** (recipe-compiler trust model), recording script export as
  one-way/output-only/never-reingested. No new number.
- **Ground rules #2** (reject default-on telemetry): worth one line in whichever future ADR documents
  Notary actually being wired into a live run — not opened here, just named as the natural home when
  that wiring lands.
- No other ADRs owed. This track's ground rules restate existing ADR-0008/S10 policy and this repo's
  local-first design ethos rather than opening anything new.

No number is reserved here; per this repo's own multi-profile-track lesson
([`multi-profile-isolation.md`](../tracks/multi-profile-isolation.md) — an ADR-number collision from writing a plan
too far ahead of when it's actually opened), the number gets assigned at the point a session actually
starts the work, not now.
