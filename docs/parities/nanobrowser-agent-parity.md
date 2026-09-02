# Track — Nanobrowser agent-capability parity

**Status:** 📋 **Proposed — not scheduled (2026-09-01).** No branch, no ADR number reserved, no owner
sign-off. This is a captured gap list in the shape of
[`browser-settings-feature-gap.md`](../tracks/browser-settings-feature-gap.md),
[`omnibox-competitive-parity.md`](omnibox-competitive-parity.md),
[`webbrain-agent-parity.md`](webbrain-agent-parity.md) and
[`aipex-agent-parity.md`](aipex-agent-parity.md): every row names its nearest existing Tepegöz
behaviour and a suggested phase home, so a future session can promote a row into a real `phase-*.md`
task or an `ai-agent` PR without re-deriving the comparison.

**Source:** a same-session deep read of `.junk/nanobrowser` (a shipping, Apache-2.0 Chrome/Edge MV3
side-panel multi-agent (Planner+Navigator) web-automation extension, v0.1.13) against this repo's AI
surface (`phases/ai-agent/`, `packages/orchestrator|model-gateway|capability-plane|
security-policy|agent-runtime|browser-tools|web-tools|tool-executor|local-inference|model-catalog|
mcp-client|recipe-compiler|macro-engine|notary|credential-vault|human-input`, `extensions/ext-agent`).
The prose comparison this track distills is
[`docs/others/tepegoz-vs-nanobrowser.md`](../versus/tepegoz-vs-nanobrowser.md) (Turkish,
2026-09-01); this file is the durable English track artifact. Every claim used to shape a workstream or
a Ground rule below was re-verified against source in this session, not taken on the comparison's word:
`chrome-extension/src/background/browser/util.ts` (`isUrlAllowed`'s dangerous-scheme list),
`packages/storage/lib/settings/{llmProviders,firewall}.ts`, `chrome-extension/src/background/agent/
{executor,agents/{base,navigator,planner},actions/{builder,schemas}}.ts`, `services/{analytics,
speechToText}.ts`, `chrome-extension/src/background/index.ts` (`port.onDisconnect`) — against this
repo's `packages/navigation/src/navigation-url.ts` (`isWebUrl`/`toNavigationUrl`), `packages/
model-gateway/src/{gateway,model-router,models}.ts`, `packages/security-policy/src/egress-firewall.ts`,
`packages/orchestrator/src/reactor-decision.ts`, `extensions/ext-agent/src/{types,panel-modals}.tsx`,
`packages/shared-types/src/{providers,agent-working-state}.ts`, and `phases/ai-agent/history.md`.

## Why this track exists

Nanobrowser is not an ordinary rival for this repo — it is Tepegöz's own agent's **ancestor**. The
comparison this track distills opens by saying so plainly: Tepegöz's v1 AI roadmap (AI-1…AI-8) was
formally named _"the browser-use/nanobrowser port,"_ [`history.md`](../../phases/ai-agent/history.md)
records a **file-level port-reference table** (perception, loop, actions, content-security), and the
`ai-agent` "Never" list names nanobrowser by name as the example of _"port techniques, never
adopt."_ `tepegoz-vs-nanobrowser.md`'s own header goes further and says a dedicated parity track for
nanobrowser **shouldn't be needed**, because the porting already happened and
[`webbrain-agent-parity.md`](webbrain-agent-parity.md) is where "match everything a rival does" lives.

That note is correct about the big picture and still leaves three narrow, concrete things worth writing
down, which is this track's actual job:

1. **Confirm what was actually ported, with today's source cited**, not the comparison's prose alone —
   several claims below (the URL-scheme guard, the loop/stale-page defenses) turned out to already be
   _equal or stricter_ on Tepegöz's side than the comparison credited, and that is worth recording so a
   future session doesn't reopen a solved question.
2. **Name the one or two capabilities nanobrowser genuinely still has that Tepegöz doesn't** — the
   comparison's own conclusion is that nanobrowser is narrower than WebBrain on almost every axis (22
   actions vs WebBrain's 62, no CAPTCHA/upload/download/DevTools/site-adapters/MCP/skills), so this list
   is short by construction, not by neglect. It comes down to one real, well-scoped feature: **per-role
   manual model assignment** — nanobrowser's signature "Planner=Sonnet, Navigator=Haiku" UX, which the
   comparison calls nanobrowser's one dimension where _"bütün mesele bu ve işliyor"_ (the whole point,
   and it works) — plus a small live-narration detail that reuses data Tepegöz's Reactor already
   computes but doesn't yet surface during a run.
3. **Set explicit guardrails against re-adopting the vendor pattern now that the ancestor is being read
   again.** Looking closely at nanobrowser a second time creates exactly the temptation the "Never" list
   exists to block — wrapping `LangChain.js` for provider breadth, or trading S4's deterministic
   completion evidence for nanobrowser's cheaper "ask a second LLM call" validator. The Ground rules
   section below names these once so a future session under time pressure doesn't reach for the
   ancestor's shortcuts.

## How to read this

Each workstream below is written like an `ai-agent` phase section (Goal → Approach → new/changed
packages → ADR → DoD-shaped bullets) so it can be lifted into a real phase file with minimal rewriting.
**Nothing here is committed roadmap.** Where a capability already has a named home in an existing phase,
an ADR, or a sibling track ([`webbrain-agent-parity.md`](webbrain-agent-parity.md) /
[`aipex-agent-parity.md`](aipex-agent-parity.md)), this track says so explicitly and does **not**
re-describe it — most of the table below is exactly that: citations, not new asks. Per the "Already
planned — do NOT re-propose" rule in
[`../README.md`](../../phases/README.md#deferred--adoption-gated-backlog-from-the-beyond-phases-synthesis),
provider-catalog breadth and the local HTTP-server engine variant are **`webbrain` P1**; the MCP server
direction is **Phase 1b**; site-guidance adapters are **`webbrain` P4**; voice input is **Phase 10b**
(already named in both sibling tracks' backlogs) — this track adds no new claim on any of those, it
only cites them.

## Ground rules — parity, not imitation

Four nanobrowser patterns are **deliberately not being adopted**, because adopting them would either
violate a standing decision this repo already made, or quietly regress a capability Tepegöz already
built that is _better_ than the ancestor's. Naming them here once, so a future session reading
nanobrowser a second time doesn't reach for the shortcut:

1. **No `LangChain.js` (or any vendor agent-framework) as the provider abstraction.** Nanobrowser's
   `createChatModel()` is built directly on LangChain.js's `BaseChatModel`, which is precisely what gives
   it its ~11 named provider types "for free." `ai-agent`'s own "Never" list forbids this by name:
   _"Python sidecar / second Chromium / vendor agent SDKs (`browser-use`/`nanobrowser` = port techniques,
   never adopt")_ — and [`history.md`](../../phases/ai-agent/history.md)'s build-vs-buy decision is the same
   ruling for this exact repo. Tepegöz's `CanonRequest`/`CanonResponse` single schema + mandatory
   `maxTokens`/`timeoutMs` + `TokenLedger` are the reason a call is capped, timed and cost-tracked no
   matter which of the 8 adapters serves it — a wrapped `BaseChatModel` would not carry any of that
   through the same choke point. Provider breadth (`webbrain` P1's `OpenAICompatibleProvider` + catalog)
   gets nanobrowser's practical reach a different way: one adapter class, N catalog entries, still behind
   the gateway's invariants.
2. **No screenshot-every-step vision, including as an opt-in toggle.** Nanobrowser's `useVision` defaults
   off, but when a user turns it on, a full JPEG screenshot is attached to the state message on **every**
   step with no escalation trigger and no budgeted downscale. `ai-agent`'s "Never" list already
   forbids this outright, and [`webbrain-agent-parity.md`](webbrain-agent-parity.md)'s Ground rules #3
   already rejects the same pattern read from WebBrain. Vision stays **escalation-only**
   (ADR-0008, owned by S10) no matter which rival's toggle makes it look like a one-line win.
3. **No regressing S4's deterministic completion evidence to a "second LLM opinion."** Nanobrowser's
   `checkTaskCompletion` is the Planner re-reading the message history on its own periodic cadence and
   judging `done` by model say-so — an improvement over raw browser-use, but still no deterministic
   evidence check, no trap-fixture defense, no origin-reverify-before-mutation. Tepegöz's
   `CompletionEvidence` + deterministic downgrade (S4) is a measured step past that pattern, not a
   parallel option to trade against it for engineering speed. (Nanobrowser's periodic-cadence _idea_ —
   re-checking on a fixed interval as a belt-and-suspenders addition alongside the Reactor's
   trigger-based replan — is a legitimate small addition; see Backlog. The rejection here is specifically
   "replace the evidence gate with a model opinion," not "never re-check periodically.")
4. **No panel/tab-lifecycle-bound run cancellation.** Nanobrowser's `port.onDisconnect` calls
   `currentExecutor?.cancel()` — closing the side panel kills the running task. Tepegöz already does the
   opposite on purpose (S8's backgroundable runs + tray continuation); this is a place where the
   ancestor's constraint (an extension side panel has no persistent background process the way a native
   app's main process does) should not be read as a feature worth copying.

None of these are "nanobrowser did it wrong" — nanobrowser is a browser extension with no native process
and no policy kernel, and the same file-level port-reference table in `history.md` shows Tepegöz already
took what was worth taking from this exact codebase once. The point of naming them again is that a
future reader shouldn't reopen a decision this repo made about this exact ancestor, twice.

---

## Capability inventory

Legend for **Home**: an existing phase/ADR name (or a sibling track's workstream) means "already
planned or already landed, this row only cites it, no new phase needed." **NEW** means no existing plan
owns it and this track proposes one. **Ground rules #N** means deliberately not adopted.

| #   | Nanobrowser capability                                                                                                                                                                                                                                                                                                                 | Nearest Tepegöz behaviour today                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Gap                                                                                                                         | Home                                                                                                                                                                                                                       |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | ~11 named provider types (openai/anthropic/deepseek/gemini/grok/ollama/azure_openai/openrouter/groq/cerebras/llama) + `custom_openai` (any OpenAI-compatible base URL)                                                                                                                                                                 | 8 hand-written adapters (`AI_PROVIDERS`); no generic OpenAI-compatible card                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Breadth + a generic card                                                                                                    | **`webbrain` P1** (already planned — `OpenAICompatibleProvider` + catalog); this row adds Azure OpenAI's distinct auth mode as a card variant worth including in that catalog, cited in **P1** below, not a new workstream |
| 2   | **Per-agent-role manual model assignment** — Planner and Navigator each pick their own provider+model independently (nanobrowser's signature, comparison calls it _"the whole point, and it works"_)                                                                                                                                   | `ModelRouter` auto-maps capability→tier→model per provider (`PROVIDER_MODELS`, hardcoded); `ModelGateway.modelOverride` is a single **run-wide** pin applied to plan/exec/classify alike (verified: `gateway.ts` line 282-286)                                                                                                                                                                                                                                                                                                  | No way to independently choose the plan-tier vs exec-tier model/provider for one run                                        | **P1 (NEW, small — extends `ModelRouter`/`ModelGateway`, addendum to ADR-0005)**                                                                                                                                           |
| 3   | LangChain.js `BaseChatModel` provider abstraction                                                                                                                                                                                                                                                                                      | Single `CanonRequest`/`CanonResponse` schema, mandatory `maxTokens`+`timeoutMs`, `TokenLedger`                                                                                                                                                                                                                                                                                                                                                                                                                                  | — (Tepegöz's is the safer shape; nanobrowser's gets breadth cheaper)                                                        | **Ground rules #1** — not adopted                                                                                                                                                                                          |
| 4   | Ollama / LM Studio / custom OpenAI-compatible local endpoint                                                                                                                                                                                                                                                                           | `local-inference` seam is `node-llama-cpp` only; no HTTP-server transport                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Local endpoints as an alternate transport                                                                                   | **`webbrain` P1** (already planned — local HTTP-server engine variant)                                                                                                                                                     |
| 5   | Planner+Navigator (Validator folded into Planner; no Replanner authority)                                                                                                                                                                                                                                                              | Planner→Executor→Reactor with a typed `Decision` (continue/retry/replan/stop) and explicit Replanner authority                                                                                                                                                                                                                                                                                                                                                                                                                  | — (Tepegöz's is the structural upgrade `history.md`'s port table already routes: nanobrowser's _missing_ Replanner → S3/S7) | **S3/S7** (already landed code, measurement-owed — not this track's debt to open)                                                                                                                                          |
| 6   | Periodic re-planning cadence (`planningInterval`, default 3 steps) + `doMultiAction` mid-batch DOM recheck that cuts a batch short when new elements appear                                                                                                                                                                            | Reactor replans on trigger conditions (no-progress, escape — S0/C1); click-time occlusion re-check + identity locator cascade (S3) already cover the mid-batch-recheck concern                                                                                                                                                                                                                                                                                                                                                  | A **fixed-interval** safety net alongside the existing trigger-based replan                                                 | **Backlog** (small, defense-in-depth; not written up as a workstream — see below)                                                                                                                                          |
| 7   | No loop detector; no mid-run compaction (`MessageManager` only trims the last message); side-panel-close cancels the run                                                                                                                                                                                                               | Loop detector (read-exempt, S0/C1); `cache-window.ts` lag-2 breakpoints; backgroundable runs (S8)                                                                                                                                                                                                                                                                                                                                                                                                                               | — (Tepegöz already ahead on all three)                                                                                      | **Ground rules #4** for the cancel-on-close pattern specifically; S0/S1/S8 otherwise, no gap                                                                                                                               |
| 8   | `buildDomTree` perception (shared origin with Tepegöz's own) — shadow DOM + cross-origin iframe stitching, `playwright-highlight-container` overlay; `extract_content`/readability plumbing present but disabled in code                                                                                                               | `build-dom-tree-script.ts` (ported, isolated world) + identity-stable refs, diff/dedupe/elision, `aria-labelledby`/`label[for]` resolution, `browser_get_article` (wired)                                                                                                                                                                                                                                                                                                                                                       | — (already ported and extended — `history.md` port table row 1)                                                             | **S2** (already landed, measurement-owed)                                                                                                                                                                                  |
| 9   | ~22 actions; no CAPTCHA/upload/download/DevTools/iframe-promote/fetch/clipboard; `extract_content` disabled                                                                                                                                                                                                                            | ~30 tools + full sandboxed `file_*`, `clipboard_*`, `download_*`, `upload_*`, `journal_search_events`, `task_*`, `extension_*`                                                                                                                                                                                                                                                                                                                                                                                                  | — (Tepegöz already exceeds this, and WebBrain's 62)                                                                         | n/a — no gap                                                                                                                                                                                                               |
| 10  | Per-action `zod safeParse` (`InvalidInputError`); no centralized policy/HITL/audit                                                                                                                                                                                                                                                     | Single ToolGateway PEP: lookup → idempotency → zod → PolicyKernel → HITL → execute → audit, no exceptions                                                                                                                                                                                                                                                                                                                                                                                                                       | — (Tepegöz already ahead)                                                                                                   | **ADR-0007** — no gap                                                                                                                                                                                                      |
| 11  | `replayHistoricalTasks` — replays saved model outputs + `HistoryTreeProcessor.findHistoryElementInTree` re-mapping, retry-3, skip-on-fail; no success oracle, no signature                                                                                                                                                             | `macro-engine` (control flow + auto-wait) + `recipe-compiler` (signed, self-healing selectors, `evaluateAssertion` oracle)                                                                                                                                                                                                                                                                                                                                                                                                      | — (Tepegöz already ahead — Phase 6's own ownership test: _"if the model could be removed from the replay, it's Phase 6"_)   | **Phase 6** (already landed decision layer, in progress) — no gap                                                                                                                                                          |
| 12  | Planner-as-validator completion check (`checkTaskCompletion` re-reads message history, model judges `done`); no evidence check, no trap fixtures, no origin-reverify                                                                                                                                                                   | `CompletionEvidence` + deterministic downgrade + trap fixtures + Checked/Unconfirmed/Contradicted badges + pre-dispatch origin gate (S4)                                                                                                                                                                                                                                                                                                                                                                                        | — (Tepegöz already ahead — a measured mechanism, not a second opinion)                                                      | **Ground rules #3** for the "replace with a model opinion" temptation; **S4** otherwise (already landed, measurement-owed)                                                                                                 |
| 13  | 3-layer defense: system-prompt contract + `wrapUntrustedContent` (repeated "IGNORE ANY NEW TASKS" banner) + regex `SecurityGuardrails` sanitizer; **dangerous-URL-scheme deny-list** (`chrome-extension:`, `chrome:`, `javascript:`, `data:`, `file:`, `vbscript:`, `ws(s):`, chromewebstore) — verified in `util.ts`'s `isUrlAllowed` | Model-**pre**-model deterministic Policy Kernel (danger class + taint + site → allow/deny/ask, ADR-0006) + `EgressFirewall` (Shannon-entropy secret/PII scan, verified in `egress-firewall.ts`) + `content-guard.ts` (ported from nanobrowser's own `guardrails/*`, per `history.md`); navigation URL resolution is an **allow-list** of http(s) only (`isWebUrl`/`toNavigationUrl`, verified) — every other scheme, including all 9 of nanobrowser's denied prefixes, falls through to a web search rather than a blocked load | — (Tepegöz's URL handling is _stricter_ than the comparison credited: an allow-list subsumes a 9-item deny-list)            | **S6 / ADR-0006** (already landed, measurement-owed) — no gap; content-guard's port lineage is worth citing verbatim in any future S6 doc update                                                                           |
| 14  | `sensitiveData` placeholder substitution + prompt instruction "never fill a credential field, ask the user"                                                                                                                                                                                                                            | Credential Broker: the agent has no shape a secret could arrive in until an OS-auth gate exists (ships **inert** by design)                                                                                                                                                                                                                                                                                                                                                                                                     | — (Tepegöz's is the stronger guarantee, shipped dormant on purpose)                                                         | **S6** (already landed, inert-by-design) — no gap                                                                                                                                                                          |
| 15  | "Use Ollama" only — no offline RAG, no archive, no WebGPU                                                                                                                                                                                                                                                                              | `local-inference` seam + sha256'd GGUF catalog + cost-saver toggle; no offline RAG either                                                                                                                                                                                                                                                                                                                                                                                                                                       | — (both minimal; the real work is already routed)                                                                           | **Phase 8 / `webbrain` P2** (already planned)                                                                                                                                                                              |
| 16  | Follow-up questions in the same executor context, session history + resume, stop/pause/resume, favorite/saved prompts, a replay button                                                                                                                                                                                                 | Agent Console persistent chat history + search (Phase 1a); skills library = saved prompt templates (S9); macro/recipe replay (Phase 6); pause/resume (S8)                                                                                                                                                                                                                                                                                                                                                                       | — (already shipped equivalents)                                                                                             | **Phase 1a / S9 / Phase 6 / S8** — no gap                                                                                                                                                                                  |
| 17  | Speech-to-text — mic → Gemini transcription endpoint, requires a Gemini key, exposed as a side-panel mic button                                                                                                                                                                                                                        | Nothing                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Real but niche                                                                                                              | **Phase 10b** (already named in `webbrain`/`aipex` backlogs — this row cites, does not re-add)                                                                                                                             |
| 18  | Live actor status (SYSTEM/PLANNER/NAVIGATOR shown per event) + a per-action `intent` string surfaced live in the panel while the step runs                                                                                                                                                                                             | Reactor's typed `Decision.rationale` is computed and zod-validated for **every** step, but only reaches the UI in the pre-run `AgentPlanPreview` modal (`panel-modals.tsx`, verified) — the live `AgentEvent` stream (`step_start`/`step_ok`/`step_error`) carries `message`/`detail` only, not `rationale`, and no capability/tier tag                                                                                                                                                                                         | The data already exists end-to-end; it stops one hop short of the live feed                                                 | **P2 (NEW, small — sharpens S8)**                                                                                                                                                                                          |
| 19  | MCP — none (neither client nor server)                                                                                                                                                                                                                                                                                                 | MCP **client** (ADR-0018)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | — (Tepegöz already ahead; nanobrowser has nothing to close)                                                                 | **ADR-0018 / Phase 1b** — no gap                                                                                                                                                                                           |
| 20  | Site adapters — none                                                                                                                                                                                                                                                                                                                   | Site adapters — none                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | — (equal; the real ask already lives elsewhere)                                                                             | **`webbrain` P4** (already planned)                                                                                                                                                                                        |
| 21  | i18n: en / pt_BR / zh_TW repo locales, no Turkish locale JSON, only a community `README-tr.md`                                                                                                                                                                                                                                         | EN+TR parity enforced per package (ADR-0016), ≥10 Turkish-web H2H tasks required (S11)                                                                                                                                                                                                                                                                                                                                                                                                                                          | — (Tepegöz already far ahead)                                                                                               | n/a — no gap                                                                                                                                                                                                               |
| 22  | PostHog task_started/completed/failed/cancelled + domain_visited; no token/cost tracking                                                                                                                                                                                                                                               | `TokenLedger` cost/usage recording on every call                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | — (Tepegöz already ahead)                                                                                                   | n/a — no gap                                                                                                                                                                                                               |
| 23  | Ships in the Chrome Web Store, real users, self-correcting Planner+Navigator loop working on real sites today                                                                                                                                                                                                                          | All 13 `ai-agent` S-phases sit 🟠 measurement-owed; nothing reads ✅                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Not a capability gap — a measurement/funding gap                                                                            | **`ai-agent`'s own budget/anti-debt tracking** — out of this track's scope entirely                                                                                                                                        |

---

## P1 — Per-capability model & provider override (NEW, small — extends `ModelRouter`/`ModelGateway`, addendum to ADR-0005)

**Goal.** Let a user assign a _different_ provider+model to the plan / exec / classify tiers
independently within one run — nanobrowser's one clearly-good, clearly-missing idea (Planner on a
capable model, Navigator on a cheap one, chosen by the user, not just by the router's fixed defaults) —
without touching the two invariants `ModelGateway` already enforces for every call: mandatory
`maxTokens`/`timeoutMs`, and normalization through the single `CanonRequest`/`CanonResponse` schema.

**What's actually there today (verified).** `ModelRouter.route()` (`model-router.ts`) already resolves
`capability → tier (plan|exec|classify) → model` per provider via `PROVIDER_MODELS`, and `models.ts`
hardcodes each provider's three tier ids as source-level "tunable defaults" (e.g.
`ANTHROPIC_MODEL = { plan: 'claude-opus-5', exec: 'claude-sonnet-5', classify: 'claude-haiku-4-5' }`) —
not user-configurable. `ModelGateway.modelOverride` (`gateway.ts`) is the one _live, user-settable_
knob, wired from the Agent panel's model dropdown through `ipc-agent-config.ts`
(`ModelGateway.setModelOverride`), but it is a single `{provider, model}` pin applied — per its own
docblock — to "EVERY request this run makes — plan, exec, and cheap classify alike." `CanonRequest`
already carries `capability` (used today only for `TokenLedger.record`), so the gateway already knows,
at the point it would apply an override, which tier a given call belongs to — the plumbing to make the
override tier-aware is a small, local change, not new infrastructure.

**Approach.**

- Widen `ModelGateway.modelOverride` from a single `{provider, model} | null` to an optional per-tier map
  — e.g. `Partial<Record<ModelTier, { provider: AIProvider; model: string }>>` — with the existing flat
  pin remaining a valid shorthand (set the same override for all three tiers) so today's "pin the whole
  run to one model" UX keeps working unchanged.
- In `dispatch()`, resolve the request's tier from `req.capability` (export or replicate `tierFor()` from
  `model-router.ts`, which already exists and is the single source of truth `ModelRouter.route()` uses)
  and look up that tier's entry in the override map; fall through to the router's own per-tier default
  when a tier has no override, exactly like today's self-healing "stale/cross-provider pin" fallback.
- `TIER_EFFORT` (`plan: 'xhigh', exec: 'high', classify: 'low'`) stays keyed to the **tier**, not the
  chosen provider — overriding which model serves a tier does not change how hard that tier is asked to
  think; a user picking a cheap model for `exec` still gets `exec`'s effort level sent, and a provider
  that ignores effort simply ignores it, same as today.
- Settings/Agent-panel UX: extend the existing per-key model-pin affordance
  (`ProvidersSection`/`KeyModelMenu` in `settings-ai-panels-providers.tsx`, already "the model is pinned
  PER KEY, from the gear on the key's own row") with a tier selector, or add a small three-row picker
  (Plan / Exec / Classify) next to the Agent panel's existing model dropdown — implementation detail for
  whichever session builds this; either way it is UI over the widened override, not a new subsystem.
- **What stays exactly as designed:** `CanonRequest`/`CanonResponse`, mandatory `maxTokens`+`timeoutMs`,
  `TokenLedger` recording, and the Egress Firewall inspection path are all untouched — a tier override is
  just a different leaf `{provider, model}` the same `dispatch()` call resolves to.

**New/changed packages:** `@tepegoz/model-gateway` (`gateway.ts` override shape + `dispatch()` tier
resolution; `model-router.ts` — export `tierFor`), `extensions/ext-agent` /
`apps/desktop/src/renderer` (`settings-ai-panels-providers.tsx` / Agent panel model UI), `apps/desktop/
src/main/ipc/ipc-agent-config.ts` (the `setModelOverride` IPC handler's arg shape).

**ADR:** extends **ADR-0005** (provider-agnostic gateway) — the same addendum
[`webbrain-agent-parity.md`](webbrain-agent-parity.md) P1 already proposes for the provider catalog; this
row adds the per-tier override clause to it, no new number.

**DoD shape (draft, for whichever session promotes this):**

- [ ] A run with `plan` overridden to provider A and `exec` overridden to provider B produces calls that
      actually land on A and B respectively — a test drives one full plan→exec→classify cycle and asserts
      the provider/model on each dispatched request
- [ ] A tier with no override falls back to `ModelRouter`'s default for that tier, unchanged from today
- [ ] Setting only a flat (non-tiered) override reproduces today's exact behavior (regression test on the
      existing single-pin path)
- [ ] A stale/unregistered provider in one tier's override self-heals to that tier's router default,
      matching the existing single-pin fallback behavior, without failing the other tiers' overrides
- [ ] `maxTokens`/`timeoutMs`/`TokenLedger` recording are unchanged for an overridden call
- [ ] i18n: the tier-picker UI (labels, "using X for planning / Y for actions" copy) gets EN+TR parity
      in the owning package's dict (ADR-0016)

---

## P2 — Live-run actor & rationale narration (NEW, small — sharpens S8)

**Goal.** Give the live step feed nanobrowser's one genuinely useful UX detail — a per-step reason the
user can read while the run is happening, and which part of the system produced it — using data
Tepegöz's Reactor **already computes**, rather than inventing new model output.

**What's actually there today (verified).** Every Reactor `Decision` already carries a `rationale:
z.string().max(500).default('')` field (`reactor-decision.ts`). It is threaded through to
`AgentPlanStep.rationale` and rendered in the **pre-run** plan-preview modal
(`panel-modals.tsx`: `{step.rationale.length > 0 && <span>— {step.rationale}</span>}`). The **live**
event stream a run actually emits while executing (`AgentEvent`, kinds `step_start`/`step_ok`/
`step_error`/…) carries only `message`/`detail` — `rationale` does not reach it. Separately,
`CanonRequest.capability` (already used for `TokenLedger.record`) tells the gateway which tier
(`plan`/`exec`/`classify`) issued a given call — the same tag nanobrowser's SYSTEM/PLANNER/NAVIGATOR
actor label conveys, already computed, not surfaced to the panel.

**Approach.**

- Thread the Reactor's per-step `rationale` (already validated, already bounded to 500 chars) into the
  `step_start`/`step_ok` `AgentEvent`s the live feed already renders — either as the event's `detail` or
  a new optional `rationale` field on `AgentEvent`, whichever keeps `panel-modals.tsx`'s existing
  plan-preview rendering and the live step-feed rendering sharing one field name and one i18n string.
- Tag each live event with the tier that produced it (`plan`/`exec`/`classify`, from the same
  `req.capability` → `tierFor()` mapping P1 needs anyway) and render a short label — "Planning" /
  "Acting" / "Checking" or similar, localized — next to the step, the same information nanobrowser's
  SYSTEM/PLANNER/NAVIGATOR actor tag gives the user, without adding a second agent role to the
  architecture.
- No new model call, no new schema field the model has to be prompted to emit — everything this needs is
  already produced by the existing Planner→Executor→Reactor loop; this is wiring the last hop into the
  UI that S8's PR2 (live step feed, `step_*` events) already built.

**New/changed packages:** `extensions/ext-agent` (`types.ts` `AgentEvent` shape, the live step-feed
component, i18n strings for the tier labels), `packages/orchestrator` (thread `rationale` + tier into the
emitted event, if not already reachable from where events are raised) — no changes to
`@tepegoz/security-policy`, `@tepegoz/capability-plane`, or the PEP.

**ADR:** none — this is a sharpening of S8's already-landed live-step-feed DoD (per-step status), not a
new decision; no security or policy surface changes.

**DoD shape (draft):**

- [ ] A running step's live feed entry shows the same `rationale` text the pre-run plan preview showed
      for that step (when the step came from a plan) or the Reactor's per-decision rationale (when it
      didn't) — one field, one rendering path, not two divergent copies
- [ ] Each live step is labeled with the tier that produced it (plan/exec/classify), reusing the existing
      `req.capability` → tier mapping — no new model-facing field
- [ ] Adding the tag does not change `step_*` event ordering, S4 evidence-chip resolution, or anything
      else S8's PR2 already ships
- [ ] i18n: the tier labels and any new step-feed copy get EN+TR parity in `extensions/ext-agent`'s dict

---

## Backlog (named, not written up)

- **Fixed-interval periodic re-plan, alongside the existing trigger-based replan** — nanobrowser's
  `planningInterval` (re-plan every N steps regardless of whether anything looks wrong) is a
  belt-and-suspenders idea worth having _in addition to_ the Reactor's no-progress/escape triggers
  (S0/C1), not instead of them (see Ground rules #3). Small, additive to `packages/orchestrator`'s
  reactor cadence logic; worth doing only if S3/S7's own measurement sweep ever shows the trigger-based
  replan misses a real case a periodic check would have caught — no evidence of that yet, so this stays a
  backlog note, not a workstream.
- **Azure OpenAI / OpenRouter / Cerebras as catalog entries** — nanobrowser names these as distinct
  provider types; OpenRouter and Cerebras are both plain OpenAI-Chat-Completions-compatible and fold
  directly into `webbrain-agent-parity.md` P1's generic `OpenAICompatibleProvider` catalog with no new
  code. Azure OpenAI's auth shape (deployment-scoped URL + `api-key` header, not a bearer token) is
  slightly different and worth a named catalog **auth mode** variant when that catalog is actually built
  — a data addition to `webbrain` P1, not a separate workstream here.
- **Speech-to-text (mic → transcription)** — real, but already named as a Phase 10b candidate in both
  [`webbrain-agent-parity.md`](webbrain-agent-parity.md) and
  [`aipex-agent-parity.md`](aipex-agent-parity.md)'s own backlogs. Nanobrowser's concrete implementation
  (MediaRecorder → Gemini transcription endpoint, gated on a Gemini key) is worth citing as a reference
  when that phase is actually opened; not re-added as a third backlog entry for the same feature.

---

## Routing — what this track does not own

Per the existing convention ([`../README.md`](../../phases/README.md#routing--what-stays-out) /
[`ai-agent/README.md`](../../phases/ai-agent/README.md#routing--what-stays-out)), reference these,
never duplicate them:

| Stays with                                                        | Material                                                                                                                                                                                           |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`webbrain-agent-parity.md` P1**                                 | Provider-catalog breadth, the generic `OpenAICompatibleProvider`, the local HTTP-server engine variant — this track's P1 adds only the per-tier override, not the catalog itself                   |
| **`webbrain-agent-parity.md` P4**                                 | Site-guidance adapters — nanobrowser has none either, nothing to add                                                                                                                               |
| **`webbrain-agent-parity.md` / `aipex-agent-parity.md` backlogs** | Voice input / speech-to-text (Phase 10b candidate)                                                                                                                                                 |
| **Phase 1b**                                                      | The MCP **server** direction — nanobrowser has neither client nor server, nothing this track adds                                                                                                  |
| **Phase 6**                                                       | Deterministic, model-free replay — nanobrowser's `replayHistoricalTasks` is the closer analog than WebBrain's, and it's already behind `macro-engine`/`recipe-compiler` by the same ownership test |
| **Phase 8**                                                       | Offline/local-knowledge work — both products ship essentially nothing here today                                                                                                                   |
| **S0–S4, S6, S9**                                                 | Loop control, perception, verified outcomes, safety plane, memory/skills — all already landed code, all measurement-owed; this track adds no new capability debt on top of them                    |
| **S8**                                                            | Live step feed, streaming narration, backgroundable runs — P2 sharpens its existing DoD with one detail, does not reopen it                                                                        |
| **ADR-0005 / ADR-0006 / ADR-0007 / ADR-0008 / ADR-0018**          | Provider gateway, Policy Kernel, single tool plane, perception, MCP client — all already the settled shape; nothing here revisits them                                                             |
| **`ai-agent`'s own budget/anti-debt ledger**                      | The "works today vs measurement-owed" gap (inventory row 23) is a funding/measurement question, not a capability this track can close                                                              |

## ADRs owed (numbers assigned when a session actually opens one of these)

- **P1:** the **ADR-0005 addendum** [`webbrain-agent-parity.md`](webbrain-agent-parity.md) P1 already
  proposes — this track adds the per-tier-override clause to the same addendum, no new number.
- **P2:** none — a sharpening of S8's already-landed live-step-feed DoD, no policy or security surface
  touched.

No number is reserved here; per this repo's own multi-profile-track lesson
([`multi-profile-isolation.md`](../tracks/multi-profile-isolation.md) — an ADR-number collision from writing a
plan too far ahead of when it's actually opened), the number gets assigned at the point a session
actually starts the work, not now.
